const express = require('express');
const router = express.Router();
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const { requireOrgPermission } = require('../middlewares/orgPermissions');
const { clean, isProfane } = require('../services/profanityFilterService');
const { parseMessageContent } = require('../utilities/messageParser');
const NotificationService = require('../services/notificationService');

/**
 * Helper function to determine user's relationship to org
 */
async function getUserRelationship(userId, orgId, OrgMember, OrgFollower) {
    const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
    if (member) return 'member';
    
    const follower = await OrgFollower.findOne({ org_id: orgId, user_id: userId });
    if (follower) return 'follower';
    
    return 'public';
}

/**
 * Helper function to check if user can post messages
 */
function canUserPost(userRole, postingPermissions) {
    if (!postingPermissions || postingPermissions.length === 0) {
        return true; // Default: all can post if no restrictions
    }
    return postingPermissions.includes(userRole);
}

/**
 * Ensure message has mentioned event data populated.
 * If missing but content contains mentions, re-parse and update.
 */
async function ensureMessageMentionData(message, orgId, Event) {
    if (!message || !Event) {
        return message;
    }

    const hasMentionData = Array.isArray(message.mentionedEvents) && message.mentionedEvents.length > 0;
    const contentHasMention = typeof message.content === 'string' && /@event:[a-fA-F0-9]{24}/i.test(message.content);

    if (hasMentionData || !contentHasMention) {
        return message;
    }

    try {
        const parsed = await parseMessageContent(message.content, Event, orgId);
        if (parsed.eventIds && parsed.eventIds.length > 0) {
            message.mentionedEvents = parsed.eventIds;
            if (parsed.links) {
                message.links = parsed.links;
            }
            if (typeof message.save === 'function') {
                if (typeof message.markModified === 'function') {
                    message.markModified('mentionedEvents');
                    message.markModified('links');
                }
                await message.save();
                if (typeof message.populate === 'function') {
                    await message.populate('mentionedEvents', 'name start_time location image previewImage type');
                }
            }
        }
    } catch (err) {
        console.error('Error ensuring message mention data:', err);
    }

    return message;
}

/**
 * POST /:orgId/messages
 * Create a new message
 */
router.post('/:orgId/messages', verifyToken, async (req, res) => {
    const { OrgMessage, Org, OrgMember, Event, OrgManagementConfig } = getModels(req, 'OrgMessage', 'Org', 'OrgMember', 'Event', 'OrgManagementConfig');
    const { orgId } = req.params;
    const { content, visibility, parentMessageId } = req.body;
    const userId = req.user.userId;

    try {
        // Get org and check if messaging is enabled
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if messaging is enabled for this org
        if (!org.messageSettings || !org.messageSettings.enabled) {
            return res.status(403).json({
                success: false,
                message: 'Messaging is not enabled for this organization'
            });
        }

        // Check if user is a member
        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
        if (!member) {
            return res.status(403).json({
                success: false,
                message: 'You must be a member of this organization to post messages'
            });
        }

        // Check posting permissions
        const userRole = member.role;
        const postingPermissions = org.messageSettings.postingPermissions || ['owner', 'admin', 'officer'];
        if (!canUserPost(userRole, postingPermissions)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to post messages'
            });
        }

        // Validate content
        if (!content || !content.trim()) {
            console.log('Message content is required');
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Get system config for character limits
        const systemConfig = await OrgManagementConfig.findOne();
        const maxLimit = systemConfig?.messaging?.maxCharacterLimit || 2000;
        const minLimit = systemConfig?.messaging?.minCharacterLimit || 100;
        const orgLimit = org.messageSettings.characterLimit || 500;
        const characterLimit = Math.min(orgLimit, maxLimit);

        if (content.length > characterLimit) {
            console.log('Message exceeds character limit');
            return res.status(400).json({
                success: false,
                message: `Message exceeds character limit of ${characterLimit}`
            });
        }

        if (content.length < minLimit) {
            console.log(`Message must be at least ${minLimit} characters`);
            return res.status(400).json({
                success: false,
                message: `Message must be at least ${minLimit} characters`
            });
        }

        // Check profanity if required
        const requireProfanityFilter = systemConfig?.messaging?.requireProfanityFilter !== false;
        if (requireProfanityFilter && isProfane(content)) {
            console.log('Message contains inappropriate language');
            return res.status(400).json({
                success: false,
                message: 'Message contains inappropriate language'
            });
        }

        // Clean content
        const cleanContent = requireProfanityFilter ? clean(content) : content;

        // Parse content for mentions and links
        const parsed = await parseMessageContent(cleanContent, Event, orgId);

        // Determine visibility
        const messageVisibility = visibility || org.messageSettings.visibility || 'members_and_followers';

        // Create message
        const message = new OrgMessage({
            orgId: orgId,
            authorId: userId,
            content: cleanContent,
            visibility: messageVisibility,
            mentionedEvents: parsed.eventIds,
            links: parsed.links,
            parentMessageId: parentMessageId || null,
            likes: [],
            likeCount: 0,
            replyCount: 0
        });

        await message.save();

        // Update parent message reply count if this is a reply
        if (parentMessageId) {
            await OrgMessage.findByIdAndUpdate(parentMessageId, { $inc: { replyCount: 1 } });
        }

        // Populate author for response
        await message.populate('authorId', 'name username picture');
        if (parsed.eventIds.length > 0) {
            await message.populate('mentionedEvents', 'name start_time location image previewImage type');
        }

        // Send notifications if enabled
        const notificationSettings = systemConfig?.messaging?.notificationSettings;
        if (notificationSettings?.notifyOnNewMessage) {
            try {
                const { Notification, OrgFollower } = getModels(req, 'Notification', 'OrgFollower');
                const notificationService = NotificationService.withModels({ Notification });
                
                const recipients = [];
                
                // Add members if visibility allows
                if (messageVisibility === 'members_only' || messageVisibility === 'members_and_followers') {
                    const members = await OrgMember.find({ org_id: orgId, status: 'active' });
                    members.forEach(m => {
                        if (m.user_id.toString() !== userId.toString()) {
                            recipients.push({ id: m.user_id, model: 'User' });
                        }
                    });
                }
                
                // Add followers if visibility allows
                if (messageVisibility === 'members_and_followers' || messageVisibility === 'public') {
                    const followers = await OrgFollower.find({ org_id: orgId });
                    followers.forEach(f => {
                        if (f.user_id.toString() !== userId.toString()) {
                            recipients.push({ id: f.user_id, model: 'User' });
                        }
                    });
                }

                if (recipients.length > 0) {
                    await notificationService.createBatchTemplateNotification(recipients, 'org_message_new', {
                        orgName: org.org_name,
                        authorName: message.authorId.name || message.authorId.username,
                        messagePreview: cleanContent.substring(0, 100),
                        orgId: orgId,
                        messageId: message._id
                    });
                }
            } catch (notifError) {
                console.error('Error sending notifications:', notifError);
                // Don't fail the request if notifications fail
            }
        }

        // Send notifications for event mentions
        if (parsed.eventIds.length > 0 && notificationSettings?.notifyOnMention) {
            try {
                const { Notification, Event } = getModels(req, 'Notification', 'Event');
                const notificationService = NotificationService.withModels({ Notification });
                
                const events = await Event.find({ _id: { $in: parsed.eventIds } });
                const recipients = [];
                
                events.forEach(event => {
                    // Notify event creator/host
                    if (event.hostingType === 'User' && event.hostingId) {
                        recipients.push({ id: event.hostingId, model: 'User' });
                    } else if (event.hostingType === 'Org') {
                        // Could notify org admins, but for now just notify creator if available
                        if (event.createdBy) {
                            recipients.push({ id: event.createdBy, model: 'User' });
                        }
                    }
                });

                if (recipients.length > 0) {
                    await notificationService.createBatchTemplateNotification(recipients, 'org_message_event_mention', {
                        orgName: org.org_name,
                        authorName: message.authorId.name || message.authorId.username,
                        eventNames: events.map(e => e.name).join(', '),
                        orgId: orgId,
                        messageId: message._id
                    });
                }
            } catch (notifError) {
                console.error('Error sending mention notifications:', notifError);
            }
        }

        console.log(`POST: /${orgId}/messages - Message created`);
        res.status(201).json({
            success: true,
            message: 'Message created successfully',
            data: message
        });
    } catch (error) {
        console.error(`POST: /${orgId}/messages failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error creating message',
            error: error.message
        });
    }
});

/**
 * GET /:orgId/messages
 * Get messages for an organization with pagination
 */
router.get('/:orgId/messages', verifyToken, async (req, res) => {
    const { OrgMessage, Org, OrgMember, OrgFollower, Event } = getModels(req, 'OrgMessage', 'Org', 'OrgMember', 'OrgFollower', 'Event');
    const { orgId } = req.params;
    const { page = 1, limit = 20, includeReplies = false } = req.query;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Determine user's relationship to org
        const relationship = await getUserRelationship(userId, orgId, OrgMember, OrgFollower);

        // Get messages
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const options = { skip, limit: parseInt(limit) };

        let messages;
        if (includeReplies === 'true') {
            // Get all messages including replies
            messages = await OrgMessage.find({
                orgId: orgId,
                isDeleted: false
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('authorId', 'name username picture')
            .populate('mentionedEvents', 'name start_time location image previewImage type');
        } else {
            // Use static method for visibility filtering
            messages = await OrgMessage.findByOrg(orgId, relationship, options);
        }

        if (Array.isArray(messages) && messages.length > 0) {
            await Promise.all(messages.map(message => ensureMessageMentionData(message, orgId, Event)));
        }

        // Attach role information to each message
        const messagesWithRoles = await Promise.all(messages.map(async (message) => {
            const messageObj = message.toObject ? message.toObject() : message;
            // Get the author's role in this org
            const authorId = messageObj.authorId?._id || messageObj.authorId;
            const member = await OrgMember.findOne({
                org_id: orgId,
                user_id: authorId,
                status: 'active'
            });
            
            if (member) {
                // Get role display name from org positions
                const roleData = org.positions.find(pos => pos.name === member.role);
                messageObj.authorRole = member.role;
                messageObj.authorRoleDisplayName = roleData?.displayName || member.role;
            } else {
                // Check if author is the owner
                if (org.owner.toString() === authorId.toString()) {
                    const ownerRole = org.positions.find(pos => pos.name === 'owner');
                    messageObj.authorRole = 'owner';
                    messageObj.authorRoleDisplayName = ownerRole?.displayName || 'Owner';
                }
            }
            
            return messageObj;
        }));

        // Get total count for pagination
        const totalQuery = {
            orgId: orgId,
            isDeleted: false,
            parentMessageId: null
        };

        // Apply visibility filter for count
        if (relationship === 'follower') {
            totalQuery.visibility = { $in: ['members_and_followers', 'public'] };
        } else if (relationship === 'public') {
            totalQuery.visibility = 'public';
        }

        const total = await OrgMessage.countDocuments(totalQuery);

        console.log(`GET: /${orgId}/messages`);
        res.json({
            success: true,
            messages: messagesWithRoles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error(`GET: /${orgId}/messages failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving messages',
            error: error.message
        });
    }
});

/**
 * GET /:orgId/messages/:messageId
 * Get a single message with its replies
 */
router.get('/:orgId/messages/:messageId', verifyToken, async (req, res) => {
    const { OrgMessage, Org, OrgMember, OrgFollower, Event } = getModels(req, 'OrgMessage', 'Org', 'OrgMember', 'OrgFollower', 'Event');
    const { orgId, messageId } = req.params;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Get message
        const message = await OrgMessage.findOne({
            _id: messageId,
            orgId: orgId,
            isDeleted: false
        })
        .populate('authorId', 'name username picture')
        .populate('mentionedEvents', 'name start_time location image previewImage type');

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        await ensureMessageMentionData(message, orgId, Event);

        // Check visibility
        const relationship = await getUserRelationship(userId, orgId, OrgMember, OrgFollower);
        if (message.visibility === 'members_only' && relationship !== 'member') {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this message'
            });
        }
        if (message.visibility === 'members_and_followers' && relationship === 'public') {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this message'
            });
        }

        // Get replies
        const replies = await OrgMessage.findReplies(messageId, { limit: 100 });
        if (Array.isArray(replies) && replies.length > 0) {
            await Promise.all(replies.map(reply => ensureMessageMentionData(reply, orgId, Event)));
        }

        // Attach role information to message and replies
        const messageObj = message.toObject();
        const member = await OrgMember.findOne({
            org_id: orgId,
            user_id: message.authorId._id,
            status: 'active'
        });
        
        if (member) {
            const roleData = org.positions.find(pos => pos.name === member.role);
            messageObj.authorRole = member.role;
            messageObj.authorRoleDisplayName = roleData?.displayName || member.role;
        } else if (org.owner.toString() === message.authorId._id.toString()) {
            const ownerRole = org.positions.find(pos => pos.name === 'owner');
            messageObj.authorRole = 'owner';
            messageObj.authorRoleDisplayName = ownerRole?.displayName || 'Owner';
        }

        // Attach roles to replies
        const repliesWithRoles = await Promise.all(replies.map(async (reply) => {
            const replyObj = reply.toObject();
            const replyMember = await OrgMember.findOne({
                org_id: orgId,
                user_id: reply.authorId._id,
                status: 'active'
            });
            
            if (replyMember) {
                const roleData = org.positions.find(pos => pos.name === replyMember.role);
                replyObj.authorRole = replyMember.role;
                replyObj.authorRoleDisplayName = roleData?.displayName || replyMember.role;
            } else if (org.owner.toString() === reply.authorId._id.toString()) {
                const ownerRole = org.positions.find(pos => pos.name === 'owner');
                replyObj.authorRole = 'owner';
                replyObj.authorRoleDisplayName = ownerRole?.displayName || 'Owner';
            }
            
            return replyObj;
        }));

        console.log(`GET: /${orgId}/messages/${messageId}`);
        res.json({
            success: true,
            message: messageObj,
            replies: repliesWithRoles
        });
    } catch (error) {
        console.error(`GET: /${orgId}/messages/${messageId} failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving message',
            error: error.message
        });
    }
});

/**
 * POST /:orgId/messages/:messageId/like
 * Like or unlike a message
 */
router.post('/:orgId/messages/:messageId/like', verifyToken, async (req, res) => {
    const { OrgMessage, Org } = getModels(req, 'OrgMessage', 'Org');
    const { orgId, messageId } = req.params;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if likes are allowed
        if (org.messageSettings && org.messageSettings.allowLikes === false) {
            return res.status(403).json({
                success: false,
                message: 'Likes are not allowed for this organization'
            });
        }

        const message = await OrgMessage.findOne({
            _id: messageId,
            orgId: orgId,
            isDeleted: false
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const userIdStr = userId.toString();
        const isLiked = message.likes.some(likeId => likeId.toString() === userIdStr);

        if (isLiked) {
            // Unlike
            message.likes = message.likes.filter(likeId => likeId.toString() !== userIdStr);
            message.likeCount = Math.max(0, message.likeCount - 1);
        } else {
            // Like
            message.likes.push(userId);
            message.likeCount = message.likes.length;
        }

        await message.save();

        console.log(`POST: /${orgId}/messages/${messageId}/like`);
        res.json({
            success: true,
            liked: !isLiked,
            likeCount: message.likeCount
        });
    } catch (error) {
        console.error(`POST: /${orgId}/messages/${messageId}/like failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error updating like',
            error: error.message
        });
    }
});

/**
 * POST /:orgId/messages/:messageId/reply
 * Reply to a message
 */
router.post('/:orgId/messages/:messageId/reply', verifyToken, async (req, res) => {
    const { OrgMessage, Org, OrgMember, Event, OrgManagementConfig } = getModels(req, 'OrgMessage', 'Org', 'OrgMember', 'Event', 'OrgManagementConfig');
    const { orgId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if replies are allowed
        if (org.messageSettings && org.messageSettings.allowReplies === false) {
            return res.status(403).json({
                success: false,
                message: 'Replies are not allowed for this organization'
            });
        }

        // Check if user is a member
        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
        if (!member) {
            return res.status(403).json({
                success: false,
                message: 'You must be a member of this organization to reply'
            });
        }

        // Get parent message
        const parentMessage = await OrgMessage.findOne({
            _id: messageId,
            orgId: orgId,
            isDeleted: false
        });

        if (!parentMessage) {
            return res.status(404).json({
                success: false,
                message: 'Parent message not found'
            });
        }

        // Validate content
        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Reply content is required'
            });
        }

        // Get system config for character limits
        const systemConfig = await OrgManagementConfig.findOne();
        const maxLimit = systemConfig?.messaging?.maxCharacterLimit || 2000;
        const orgLimit = org.messageSettings.characterLimit || 500;
        const characterLimit = Math.min(orgLimit, maxLimit);

        if (content.length > characterLimit) {
            return res.status(400).json({
                success: false,
                message: `Reply exceeds character limit of ${characterLimit}`
            });
        }

        // Check profanity if required
        const requireProfanityFilter = systemConfig?.messaging?.requireProfanityFilter !== false;
        if (requireProfanityFilter && isProfane(content)) {
            return res.status(400).json({
                success: false,
                message: 'Reply contains inappropriate language'
            });
        }

        // Clean content
        const cleanContent = requireProfanityFilter ? clean(content) : content;

        // Parse content for mentions and links
        const parsed = await parseMessageContent(cleanContent, Event, orgId);

        // Create reply
        const reply = new OrgMessage({
            orgId: orgId,
            authorId: userId,
            content: cleanContent,
            visibility: parentMessage.visibility, // Replies inherit parent visibility
            mentionedEvents: parsed.eventIds,
            links: parsed.links,
            parentMessageId: messageId,
            likes: [],
            likeCount: 0,
            replyCount: 0
        });

        await reply.save();

        // Update parent message reply count
        await OrgMessage.findByIdAndUpdate(messageId, { $inc: { replyCount: 1 } });

        // Populate author for response
        await reply.populate('authorId', 'name username picture');
        if (parsed.eventIds.length > 0) {
            await reply.populate('mentionedEvents', 'name start_time location image previewImage type');
        }

        // Attach role information
        const replyObj = reply.toObject();
        const authorMember = await OrgMember.findOne({
            org_id: orgId,
            user_id: userId,
            status: 'active'
        });
        
        if (authorMember) {
            const roleData = org.positions.find(pos => pos.name === authorMember.role);
            replyObj.authorRole = authorMember.role;
            replyObj.authorRoleDisplayName = roleData?.displayName || authorMember.role;
        } else if (org.owner.toString() === userId.toString()) {
            const ownerRole = org.positions.find(pos => pos.name === 'owner');
            replyObj.authorRole = 'owner';
            replyObj.authorRoleDisplayName = ownerRole?.displayName || 'Owner';
        }

        // Send notification to parent message author
        const notificationSettings = systemConfig?.messaging?.notificationSettings;
        if (notificationSettings?.notifyOnReply && parentMessage.authorId.toString() !== userId.toString()) {
            try {
                const { Notification } = getModels(req, 'Notification');
                const notificationService = NotificationService.withModels({ Notification });
                
                await notificationService.createBatchTemplateNotification(
                    [{ id: parentMessage.authorId, model: 'User' }],
                    'org_message_reply',
                    {
                        orgName: org.org_name,
                        authorName: reply.authorId.name || reply.authorId.username,
                        messagePreview: cleanContent.substring(0, 100),
                        orgId: orgId,
                        messageId: messageId,
                        replyId: reply._id
                    }
                );
            } catch (notifError) {
                console.error('Error sending reply notification:', notifError);
            }
        }

        console.log(`POST: /${orgId}/messages/${messageId}/reply`);
        res.status(201).json({
            success: true,
            message: 'Reply created successfully',
            data: replyObj
        });
    } catch (error) {
        console.error(`POST: /${orgId}/messages/${messageId}/reply failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error creating reply',
            error: error.message
        });
    }
});

/**
 * PUT /:orgId/messages/:messageId
 * Edit a message (author only, within 15 minutes)
 */
router.put('/:orgId/messages/:messageId', verifyToken, async (req, res) => {
    const { OrgMessage, Org, Event, OrgManagementConfig } = getModels(req, 'OrgMessage', 'Org', 'Event', 'OrgManagementConfig');
    const { orgId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const message = await OrgMessage.findOne({
            _id: messageId,
            orgId: orgId,
            authorId: userId,
            isDeleted: false
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found or you are not the author'
            });
        }

        // Check edit time limit (15 minutes)
        const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds
        const timeSinceCreation = Date.now() - message.createdAt.getTime();
        if (timeSinceCreation > editTimeLimit) {
            return res.status(403).json({
                success: false,
                message: 'Message can only be edited within 15 minutes of creation'
            });
        }

        // Validate content
        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Get system config for character limits
        const systemConfig = await OrgManagementConfig.findOne();
        const maxLimit = systemConfig?.messaging?.maxCharacterLimit || 2000;
        const orgLimit = org.messageSettings.characterLimit || 500;
        const characterLimit = Math.min(orgLimit, maxLimit);

        if (content.length > characterLimit) {
            return res.status(400).json({
                success: false,
                message: `Message exceeds character limit of ${characterLimit}`
            });
        }

        // Check profanity if required
        const requireProfanityFilter = systemConfig?.messaging?.requireProfanityFilter !== false;
        if (requireProfanityFilter && isProfane(content)) {
            return res.status(400).json({
                success: false,
                message: 'Message contains inappropriate language'
            });
        }

        // Clean content
        const cleanContent = requireProfanityFilter ? clean(content) : content;

        // Parse content for mentions and links
        const parsed = await parseMessageContent(cleanContent, Event, orgId);

        // Update message
        message.content = cleanContent;
        message.mentionedEvents = parsed.eventIds;
        message.links = parsed.links;

        await message.save();

        // Populate for response
        await message.populate('authorId', 'name username picture');
        if (parsed.eventIds.length > 0) {
            await message.populate('mentionedEvents', 'name start_time location image previewImage type');
        }

        // Attach role information
        const messageObj = message.toObject();
        const authorMember = await OrgMember.findOne({
            org_id: orgId,
            user_id: userId,
            status: 'active'
        });
        
        if (authorMember) {
            const roleData = org.positions.find(pos => pos.name === authorMember.role);
            messageObj.authorRole = authorMember.role;
            messageObj.authorRoleDisplayName = roleData?.displayName || authorMember.role;
        } else if (org.owner.toString() === userId.toString()) {
            const ownerRole = org.positions.find(pos => pos.name === 'owner');
            messageObj.authorRole = 'owner';
            messageObj.authorRoleDisplayName = ownerRole?.displayName || 'Owner';
        }

        console.log(`PUT: /${orgId}/messages/${messageId}`);
        res.json({
            success: true,
            message: 'Message updated successfully',
            data: messageObj
        });
    } catch (error) {
        console.error(`PUT: /${orgId}/messages/${messageId} failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error updating message',
            error: error.message
        });
    }
});

/**
 * DELETE /:orgId/messages/:messageId
 * Delete a message (author or org admin/owner)
 */
router.delete('/:orgId/messages/:messageId', verifyToken, async (req, res) => {
    const { OrgMessage, Org, OrgMember } = getModels(req, 'OrgMessage', 'Org', 'OrgMember');
    const { orgId, messageId } = req.params;
    const userId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const message = await OrgMessage.findOne({
            _id: messageId,
            orgId: orgId,
            isDeleted: false
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Check if user is author or has admin permissions
        const isAuthor = message.authorId.toString() === userId.toString();
        let canDelete = isAuthor;

        if (!canDelete) {
            // Check if user is org owner or admin
            const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
            if (member) {
                const userRole = member.role;
                canDelete = userRole === 'owner' || userRole === 'admin';
            }
        }

        if (!canDelete) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this message'
            });
        }

        // Soft delete
        await message.softDelete();

        // If this is a top-level message, also soft delete all replies
        if (!message.parentMessageId) {
            await OrgMessage.updateMany(
                { parentMessageId: messageId },
                { $set: { isDeleted: true, deletedAt: new Date() } }
            );
        } else {
            // If this is a reply, decrement parent reply count
            await OrgMessage.findByIdAndUpdate(message.parentMessageId, { $inc: { replyCount: -1 } });
        }

        console.log(`DELETE: /${orgId}/messages/${messageId}`);
        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error(`DELETE: /${orgId}/messages/${messageId} failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message',
            error: error.message
        });
    }
});

module.exports = router;

