const getModels = require('./getModelService');
const mongoose = require('mongoose');
const axios = require('axios');

class NotificationService {
    constructor(models = null) {
        this.models = models;
    }

    /**
     * Create service instance with models
     */
    static withModels(models) {
        return new NotificationService(models);
    }

    /**
     * Get models - throws error if not provided
     */
    getModels() {
        if (!this.models) {
            throw new Error('Models not provided to NotificationService');
        }
        return this.models;
    }
    /**
     * Create a single notification
     */
    async createNotification(notificationData) {
        try {
            const { Notification } = this.getModels();
            const notification = new Notification(notificationData);
            await notification.save();
            
            // Trigger delivery if not scheduled
            if (!notification.scheduledFor || notification.scheduledFor <= new Date()) {
                await this.deliverNotification(notification);
            }
            
            return notification;
        } catch (error) {
            throw new Error(`Failed to create notification: ${error.message}`);
        }
    }

    /**
     * Create multiple notifications in batch
     */
    async createBatchNotifications(notificationsData) {
        try {
            const { Notification } = this.getModels();
            const notifications = await Notification.createBatch(notificationsData);
            
            // Deliver notifications that aren't scheduled
            const immediateNotifications = notifications.filter(
                n => !n.scheduledFor || n.scheduledFor <= new Date()
            );
            
            for (const notification of immediateNotifications) {
                await this.deliverNotification(notification);
            }
            
            return notifications;
        } catch (error) {
            throw new Error(`Failed to create batch notifications: ${error.message}`);
        }
    }

    /**
     * Send notification to multiple recipients
     */
    async sendToMultipleRecipients(recipients, notificationData) {
        try {
            const notifications = recipients.map(recipient => ({
                ...notificationData,
                recipient: recipient.id,
                recipientModel: recipient.model
            }));
            
            return await this.createBatchNotifications(notifications);
        } catch (error) {
            throw new Error(`Failed to send to multiple recipients: ${error.message}`);
        }
    }

    /**
     * Send notification to all users in an organization
     */
    async sendToOrgMembers(orgId, notificationData, options = {}) {
        try {
            const { Org } = this.getModels();
            const org = await Org.findById(orgId).populate('members');
            if (!org) {
                throw new Error('Organization not found');
            }

            let members = org.members || [];
            
            // Filter by role if specified
            if (options.roles) {
                members = members.filter(member => 
                    options.roles.includes(member.role)
                );
            }

            const notifications = members.map(member => ({
                ...notificationData,
                recipient: member.userId,
                recipientModel: 'User',
                metadata: {
                    ...notificationData.metadata,
                    orgId: orgId,
                    memberRole: member.role
                }
            }));

            return await this.createBatchNotifications(notifications);
        } catch (error) {
            throw new Error(`Failed to send to org members: ${error.message}`);
        }
    }

    /**
     * Deliver notification through specified channels
     */
    async deliverNotification(notification) {
        try {
            notification.deliveryAttempts += 1;
            notification.lastDeliveryAttempt = new Date();
            
            const deliveryPromises = notification.channels.map(channel => 
                this.deliverToChannel(notification, channel)
            );
            
            await Promise.allSettled(deliveryPromises);
            
            // Update delivery status based on results
            notification.deliveryStatus = 'sent';
            await notification.save();
            
        } catch (error) {
            notification.deliveryStatus = 'failed';
            await notification.save();
            throw new Error(`Failed to deliver notification: ${error.message}`);
        }
    }

    /**
     * Deliver notification to a specific channel
     */
    async deliverToChannel(notification, channel) {
        switch (channel) {
            case 'in_app':
                // In-app notifications are already "delivered" when created
                return Promise.resolve();
                
            case 'email':
                return this.sendEmailNotification(notification);
                
            case 'push':
                return this.sendPushNotification(notification);
                
            case 'sms':
                return this.sendSMSNotification(notification);
                
            case 'webhook':
                return this.sendWebhookNotification(notification);
                
            default:
                throw new Error(`Unsupported channel: ${channel}`);
        }
    }

    /**
     * Send email notification via Resend. Resolves recipient email when recipientModel is User.
     */
    async sendEmailNotification(notification) {
        try {
            const { User } = this.getModels();
            const recipientId = notification.recipient?._id || notification.recipient;
            const recipientModel = notification.recipientModel || 'User';
            let emailTo = null;
            if (recipientModel === 'User') {
                const user = await User.findById(recipientId).select('email').lean();
                emailTo = user?.email;
            }
            if (!emailTo) {
                console.warn(`No email for notification ${notification._id} recipient ${recipientId}`);
                return Promise.resolve();
            }
            const resend = require('./resendClient').getResend();
            if (!resend) {
                console.warn('Resend client not configured; skipping email');
                return Promise.resolve();
            }
            const stripHtml = (html) => (html && typeof html === 'string')
                ? html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
                : '';
            const textBody = stripHtml(notification.message) || notification.message || '';
            await resend.emails.send({
                from: process.env.RESEND_FROM || 'Meridian <support@meridian.study>',
                to: [emailTo],
                subject: notification.title || 'Notification',
                html: notification.message || textBody,
                text: textBody
            });
        } catch (err) {
            console.error('Error sending email notification:', err);
            throw err;
        }
    }

    /**
     * Send push notification via Expo Push Notification API
     */
    async sendPushNotification(notification) {
        try {
            const { User } = this.getModels();
            
            // Get recipient user to fetch push token
            let recipient;
            const recipientId = notification.recipient?._id || notification.recipient;
            const recipientModel = notification.recipientModel;
            
            if (recipientModel === 'User') {
                recipient = await User.findById(recipientId);
            } else {
                // For other recipient types, we might need to handle differently
                console.warn(`Push notifications not supported for recipient model: ${recipientModel}`);
                return Promise.resolve(); // Don't fail, just skip
            }

            if (!recipient) {
                console.warn(`Recipient not found for notification ${notification._id}`);
                return Promise.resolve(); // Don't fail, just skip
            }

            if (!recipient.pushToken) {
                console.warn(`User ${recipient._id} does not have a push token registered`);
                return Promise.resolve(); // Don't fail, just skip
            }

            // Strip HTML tags from message for push notification body
            const stripHtml = (html) => {
                if (!html) return '';
                return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            };

            // Build navigation instructions from notification
            const navigationInstructions = this.buildNavigationInstructions(notification);
            console.log(`📱 [PushNotification] Building navigation for notification ${notification._id}:`, {
                notificationType: notification.type,
                hasMetadataNavigation: !!(notification.metadata && notification.metadata.navigation),
                builtNavigation: navigationInstructions,
                metadata: notification.metadata
            });

            // Prepare notification payload for Expo
            const expoPushMessage = {
                to: recipient.pushToken,
                sound: 'default',
                title: notification.title || 'Notification',
                body: stripHtml(notification.message) || '',
                data: {
                    notificationId: notification._id?.toString() || notification._id,
                    type: notification.type || 'system',
                    navigation: navigationInstructions, // Backend-controlled navigation
                    ...(notification.metadata || {}),
                    ...(notification.actions ? { actions: notification.actions } : {})
                },
                badge: notification.priority === 'high' || notification.priority === 'urgent' ? 1 : undefined,
                priority: notification.priority === 'urgent' ? 'high' : 'default',
                channelId: 'default'
            };

            // Send to Expo Push Notification API
            const expoPushUrl = 'https://exp.host/--/api/v2/push/send';
            const response = await axios.post(expoPushUrl, expoPushMessage, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate'
                }
            });

            // Check response for errors
            if (response.data && response.data.data) {
                const result = response.data.data;
                if (result.status === 'error') {
                    console.error('Expo push notification error:', result.message);
                    // Handle specific error cases
                    if (result.message && result.message.includes('InvalidCredentials')) {
                        console.error('Invalid Expo push token - user may need to re-register');
                    }
                    return Promise.resolve(); // Don't throw - allow other channels to still work
                }
            }

            console.log(`Push notification sent successfully to ${recipient._id}`);
            return Promise.resolve();
        } catch (error) {
            console.error('Error sending push notification:', error);
            // Don't throw - allow other channels to still work
            return Promise.resolve();
        }
    }

    /**
     * Build navigation instructions for mobile app from notification
     * This allows the backend to control what happens when a notification is tapped
     */
    buildNavigationInstructions(notification) {
        console.log(`🧭 [Backend] buildNavigationInstructions called for notification:`, {
            notificationId: notification._id,
            notificationType: notification.type,
            hasMetadata: !!notification.metadata,
            metadataNavigation: notification.metadata?.navigation,
        });
        
        // If navigation is explicitly set in metadata, use it
        if (notification.metadata && notification.metadata.navigation) {
            console.log(`🧭 [Backend] Using explicit navigation from metadata:`, notification.metadata.navigation);
            return notification.metadata.navigation;
        }
        
        console.log(`🧭 [Backend] Building navigation from notification type:`, notification.type);

        // Otherwise, build navigation based on notification type and metadata
        const navigation = {
            type: 'navigate', // 'navigate', 'deep_link', 'api_call', or 'none'
            route: null,
            params: {},
            deepLink: null
        };

        // Build navigation based on notification type
        switch (notification.type) {
            case 'event':
            case 'event_reminder':
            case 'event_update':
                if (notification.metadata && notification.metadata.eventId) {
                    navigation.route = 'EventDetails';
                    navigation.params = { eventId: notification.metadata.eventId };
                    navigation.deepLink = `meridian://event/${notification.metadata.eventId}`;
                }
                break;

            case 'org':
            case 'membership':
                if (notification.metadata && notification.metadata.orgId) {
                    navigation.route = 'OrganizationProfile';
                    navigation.params = { orgId: notification.metadata.orgId };
                    navigation.deepLink = `meridian://organization/${notification.metadata.orgId}`;
                }
                break;

            case 'friend_request':
                navigation.route = 'MainTabs';
                navigation.params = { 
                    screen: 'Friends',
                    params: { initialTab: 'requests' }
                };
                navigation.deepLink = 'meridian://friends/requests';
                console.log(`🧭 [Backend] Built friend_request navigation:`, navigation);
                break;

            case 'friend_accepted':
            case 'friend_activity':
                navigation.route = 'MainTabs';
                navigation.params = { 
                    screen: 'Friends'
                };
                navigation.deepLink = 'meridian://friends';
                break;

            case 'room':
            case 'room_availability':
                if (notification.metadata && notification.metadata.roomId) {
                    navigation.route = 'RoomDetails';
                    navigation.params = { roomId: notification.metadata.roomId };
                    navigation.deepLink = `meridian://room/${notification.metadata.roomId}`;
                }
                break;

            case 'system':
            case 'system_update':
                if (notification.metadata && notification.metadata.settings) {
                    navigation.route = 'Profile';
                    navigation.params = { screen: 'Settings' };
                    navigation.deepLink = 'meridian://settings';
                }
                break;

            default:
                // Default to home/events screen
                navigation.route = 'Events';
                navigation.deepLink = 'meridian://';
        }

        return navigation;
    }

    /**
     * Send SMS notification
     */
    async sendSMSNotification(notification) {
        // TODO: Implement SMS service
        console.log(`Sending SMS notification: ${notification.title}`);
        return Promise.resolve();
    }

    /**
     * Send webhook notification
     */
    async sendWebhookNotification(notification) {
        // TODO: Implement webhook delivery
        console.log(`Sending webhook notification: ${notification.title}`);
        return Promise.resolve();
    }

    /**
     * Get notifications for a recipient
     */
    async getNotifications(recipientId, recipientModel, options = {}) {
        try {
            const { Notification } = this.getModels();
            const queryOptions = {
                limit: options.limit || 20,
                skip: options.skip || 0
            };
            
            if (options.status) {
                queryOptions.status = options.status;
            }
            
            if (options.type) {
                queryOptions.type = options.type;
            }
            
            return await Notification.findByRecipient(recipientId, recipientModel, queryOptions).populate('sender');
        } catch (error) {
            throw new Error(`Failed to get notifications: ${error.message}`);
        }
    }

    /**
     * Get unread notification count
     */
    async getUnreadCount(recipientId, recipientModel) {
        try {
            const { Notification } = this.getModels();
            return await Notification.countDocuments({
                recipient: recipientId,
                recipientModel: recipientModel,
                status: 'unread'
            });
        } catch (error) {
            throw new Error(`Failed to get unread count: ${error.message}`);
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId, recipientId) {
        try {
            const { Notification } = this.getModels();
            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: recipientId
            });
            
            if (!notification) {
                throw new Error('Notification not found');
            }
            
            return await notification.markAsRead();
        } catch (error) {
            throw new Error(`Failed to mark as read: ${error.message}`);
        }
    }

    /**
     * Mark multiple notifications as read
     */
    async markMultipleAsRead(notificationIds, recipientId) {
        try {
            const { Notification } = this.getModels();
            return await Notification.updateMany(
                {
                    _id: { $in: notificationIds },
                    recipient: recipientId
                },
                {
                    status: 'read',
                    readAt: new Date()
                }
            );
        } catch (error) {
            throw new Error(`Failed to mark multiple as read: ${error.message}`);
        }
    }

    /**
     * Mark all notifications as read for a recipient
     */
    async markAllAsRead(recipientId, recipientModel, options = {}) {
        try {
            const { Notification } = this.getModels();
            const query = {
                recipient: recipientId,
                recipientModel: recipientModel,
                status: 'unread'
            };
            
            if (options.type) {
                query.type = options.type;
            }
            
            return await Notification.updateMany(
                query,
                {
                    status: 'read',
                    readAt: new Date()
                }
            );
        } catch (error) {
            throw new Error(`Failed to mark all as read: ${error.message}`);
        }
    }

    /**
     * Acknowledge notification
     */
    async acknowledgeNotification(notificationId, recipientId) {
        try {
            const { Notification } = this.getModels();
            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: recipientId
            });
            
            if (!notification) {
                throw new Error('Notification not found');
            }
            
            return await notification.acknowledge();
        } catch (error) {
            throw new Error(`Failed to acknowledge notification: ${error.message}`);
        }
    }

    /**
     * Archive notification
     */
    async archiveNotification(notificationId, recipientId) {
        try {
            const { Notification } = this.getModels();
            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: recipientId
            });
            
            if (!notification) {
                throw new Error('Notification not found');
            }
            
            return await notification.archive();
        } catch (error) {
            throw new Error(`Failed to archive notification: ${error.message}`);
        }
    }

    /**
     * Delete notification (soft delete)
     */
    async deleteNotification(notificationId, recipientId) {
        try {
            const { Notification } = this.getModels();
            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: recipientId
            });
            
            if (!notification) {
                throw new Error('Notification not found');
            }
            
            return await notification.softDelete();
        } catch (error) {
            throw new Error(`Failed to delete notification: ${error.message}`);
        }
    }

    /**
     * Execute notification action
     */
    async executeAction(notificationId, actionId, recipientId, additionalData = {}, req = null) {
        try {
            const { Notification } = this.getModels();
            const notification = await Notification.findOne({
                _id: notificationId,
                recipient: recipientId
            });
            
            if (!notification) {
                throw new Error('Notification not found');
            }
            
            const action = notification.actions.find(a => a.id === actionId);
            if (!action) {
                throw new Error('Action not found');
            }
            
            // Execute action based on type
            switch (action.type) {
                case 'api_call':
                    const result =  await this.executeApiCall(action, additionalData, req); // pass req
                    notification.actionResult = result;
                    await notification.save();
                    return result;
                case 'link':
                    return { type: 'redirect', url: action.url };
                case 'form':
                    return { type: 'form', action: action };
                default:
                    return { type: 'button', action: action };
            }
        } catch (error) {
            console.error('Error executing action:', error);
            throw new Error(`Failed to execute action: ${error.message}`);
        }
    }

    /**
     * Execute API call action
     */
    async executeApiCall(action, additionalData, req = null) {
        // If req is provided, forward cookies for internal calls
        const headers = {};
        let url = action.url;
        if (req && req.headers && req.headers.cookie && url && url.startsWith('/')) {
            headers.Cookie = req.headers.cookie;
            const baseUrl = process.env.NODE_ENV === 'production' ? `https://${req.school}.meridian.study` : 'http://localhost:5001';
            url = baseUrl + url;
        }
        // Optionally, add more headers (user-agent, etc.)
        const response = await require('axios')({
            method: action.method,
            url,
            data: additionalData,
            headers,
        });
        return { type: 'api_call', success: true, data: response.data };
    }

    /**
     * Interpolate all string fields in an object/array
     */
    interpolateObject(obj, variables) {
        if (typeof obj === 'string') {
            return this.interpolateTemplate(obj, variables);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.interpolateObject(item, variables));
        } else if (typeof obj === 'object' && obj !== null) {
            const result = {};
            for (const key in obj) {
                result[key] = this.interpolateObject(obj[key], variables);
            }
            return result;
        }
        return obj;
    }

    /**
     * Create system notification
     */
    async createSystemNotification(recipientId, recipientModel, templateName, variables = {}) {
        try {
            // TODO: Load template from database or file system
            const template = await this.loadTemplate(templateName);
            
            const notificationData = {
                recipient: recipientId,
                recipientModel: recipientModel,
                type: 'system',
                title: this.interpolateTemplate(template.title, variables),
                message: this.interpolateTemplate(template.message, variables),
                template: {
                    name: templateName,
                    version: template.version,
                    variables: variables
                },
                actions: template.actions ? this.interpolateObject(template.actions, variables) : [],
                priority: template.priority || 'normal',
                channels: template.channels || ['in_app'],
                metadata: {
                    ...(template.navigation ? { navigation: this.interpolateObject(template.navigation, variables) } : {}),
                    ...(variables.metadata || {})
                }
            };
            
            // Add sender fields if they exist in the template
            if (template.sender) {
                notificationData.sender = this.interpolateTemplate(template.sender, variables);
            }
            if (template.senderModel) {
                notificationData.senderModel = template.senderModel;
            }
            
            return await this.createNotification(notificationData);
        } catch (error) {
            throw new Error(`Failed to create system notification: ${error.message}`);
        }
    }

    /**
     * Load notification template
     */
    async loadTemplate(templateName) {
        // TODO: Implement template loading from database
        const templates = {
            'welcome': {
                title: 'Welcome to Study Compass!',
                message: 'Hi {{name|capitalize}}, welcome to Study Compass! We\'re excited to have you on board.',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'complete_profile',
                        label: 'Complete Profile',
                        type: 'link',
                        url: '/profile/complete',
                        style: 'primary'
                    }
                ]
            },
            'org_invitation': {
                title: 'Organization Invitation',
                message: 'You have been invited to join <strong>{{orgName}}</strong> as <em>{{role|capitalize}}</em>.',
                version: '1.0',
                priority: 'high',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'accept_invitation',
                        label: 'Accept',
                        type: 'api_call',
                        url: '/org-invites/{{invitationId}}/accept',
                        method: 'POST',
                        payload: { invitationId: '{{invitationId}}' },
                        style: 'success'
                    },
                    {
                        id: 'decline_invitation',
                        label: 'Decline',
                        type: 'api_call',
                        url: '/org-invites/{{invitationId}}/decline',
                        method: 'POST',
                        payload: { invitationId: '{{invitationId}}' },
                        style: 'secondary'
                    }
                ]
            },
            'friend_request': {
                title: 'New Friend Request',
                message: '<strong>{{senderName|capitalize}}</strong> has sent you a friend request.',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'push'],
                sender: '{{sender}}',
                senderModel: 'User',
                // Backend-controlled navigation: navigate to MainTabs -> Friends screen with requests tab
                navigation: {
                    type: 'navigate',
                    route: 'MainTabs',
                    params: {
                        screen: 'Friends',
                        params: { initialTab: 'requests' }
                    },
                    deepLink: 'meridian://friends/requests'
                },
                actions: [
                    {
                        id: 'accept_friend_request',
                        label: 'Accept',
                        type: 'api_call',
                        url: '/friend-request/accept/{{friendshipId}}',
                        method: 'POST',
                        style: 'success',
                        icon: 'material-symbols:person-check-rounded'
                    },
                    {
                        id: 'reject_friend_request',
                        label: 'Reject',
                        type: 'api_call',
                        url: '/friend-request/reject/{{friendshipId}}',
                        method: 'POST',
                        style: 'danger',
                        icon: 'material-symbols:person-cancel-rounded'
                    }
                ]
            },
            'org_message_new':{
                title: '{{orgName}} has posted a new announcement',
                message: '{{messagePreview}}',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'push'],
                // Backend-controlled navigation: navigate to organization profile
                // Note: orgId should be provided in variables when creating notification
                navigation: {
                    type: 'navigate',
                    route: 'OrganizationProfile',
                    params: { orgId: '{{orgId}}' },
                    deepLink: 'meridian://organization/{{orgId}}'
                },
                actions: [
                    {
                        id: 'view_announcement',
                        label: 'View Announcement',
                        type: 'link',
                        url: 'meridian://organization/{{orgId}}',
                        style: 'primary'
                    }
                ]
            },
            'org_member_applied': {
                title: 'New Member Applied',
                message: '<strong>{{senderName|capitalize}}</strong> has applied to join <strong>{{orgName}}</strong>.',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'push'],
                sender: '{{sender}}',
                senderModel: 'User',
                // Backend-controlled navigation: navigate to organization profile
                // Note: orgId should be provided in variables when creating notification
                navigation: {
                    type: 'navigate',
                    route: 'OrganizationProfile',
                    params: { orgId: '{{orgId}}' },
                    deepLink: 'meridian://organization/{{orgId}}'
                },
                actions: [
                    {
                        id: 'go_to_application',
                        label: 'Go to Application',
                        type: 'link',
                        url: '/club-dashboard/{{orgName}}?page=2',
                        style: 'primary'
                    }   
                ]
            },
            'org_approval_needed': {
                title: 'Organization Needs Approval',
                message: 'A new organization <strong>{{orgName}}</strong> is pending approval.',
                version: '1.0',
                priority: 'high',
                channels: ['in_app', 'push'],
                navigation: {
                    type: 'navigate',
                    route: 'OrganizationProfile',
                    params: { orgId: '{{orgId}}' },
                    deepLink: 'meridian://organization/{{orgId}}'
                },
                actions: [
                    {
                        id: 'review_approval',
                        label: 'Review and Approve',
                        type: 'link',
                        url: '/org-management',
                        style: 'primary'
                    }
                ]
            },
            'event_reminder': {
                title: 'Event Reminder',
                message: 'Your event <strong>{{eventName}}</strong> starts in <em>{{timeUntil}}</em> at {{startTime|time}}.',
                version: '1.0',
                priority: 'high',
                channels: ['in_app', 'push'],
                // Backend-controlled navigation: navigate to event details
                navigation: {
                    type: 'navigate',
                    route: 'Events',
                    params: {
                        screen: 'EventDetails',
                        params: { eventId: '{{eventId}}' }
                    },
                    deepLink: 'meridian://events/{{eventId}}'
                },
                actions: [
                    {
                        id: 'view_event',
                        label: 'View Event',
                        type: 'link',
                        url: '/events/{{eventId}}',
                        style: 'primary'
                    },
                    {
                        id: 'join_now',
                        label: 'Join Now',
                        type: 'link',
                        url: '/events/{{eventId}}/join',
                        style: 'success'
                    }
                ]
            },
            'achievement_unlocked': {
                title: 'Achievement Unlocked! 🏆',
                message: 'Congratulations! You\'ve earned the <strong>{{badgeName}}</strong> badge for {{achievementDescription|short}}.',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'view_badge',
                        label: 'View Badge',
                        type: 'link',
                        url: '/badges/{{badgeId}}',
                        style: 'success'
                    },
                    {
                        id: 'share_achievement',
                        label: 'Share',
                        type: 'api_call',
                        url: '/api/achievements/share',
                        method: 'POST',
                        payload: { badgeId: '{{badgeId}}' },
                        style: 'info'
                    }
                ]
            },
            'payment_received': {
                title: 'Payment Received',
                message: 'You received <strong>{{amount|currency}}</strong> from <em>{{senderName|capitalize}}</em> on {{paymentDate|date}}.',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'view_transaction',
                        label: 'View Details',
                        type: 'link',
                        url: '/transactions/{{transactionId}}',
                        style: 'primary'
                    }
                ]
            },
            'admin_outreach_message': {
                title: '{{title}}',
                message: '{{messagePreview}}',
                version: '1.0',
                priority: 'normal',
                channels: ['in_app', 'email'],
                navigation: {
                    type: 'navigate',
                    route: 'OutreachMessage',
                    params: { messageId: '{{outreachMessageId}}' },
                    deepLink: 'meridian://outreach/{{outreachMessageId}}'
                },
                actions: [
                    {
                        id: 'view_outreach',
                        label: 'View Message',
                        type: 'link',
                        url: 'meridian://outreach/{{outreachMessageId}}',
                        style: 'primary'
                    }
                ]
            }
        };
        
        return templates[templateName] || templates['welcome'];
    }

    /**
     * Interpolate template variables with validation and formatting
     */
    interpolateTemplate(template, variables) {
        if (!template || typeof template !== 'string') {
            return template;
        }

        // Remove console.log statements
        return template.replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, (match, key, format) => {
            const value = variables[key];
            
            // Handle missing variables
            if (value === undefined || value === null) {
                console.warn(`Missing template variable: ${key}`);
                return `[${key}]`; // Show placeholder instead of raw {{key}}
            }
            
            // Apply formatting if specified
            if (format) {
                return this.formatValue(value, format);
            }
            
            return value;
        });
    }

    /**
     * Format values based on type
     */
    formatValue(value, format) {
        switch (format) {
            case 'date':
                return new Date(value).toLocaleDateString();
            case 'time':
                return new Date(value).toLocaleTimeString();
            case 'datetime':
                return new Date(value).toLocaleString();
            case 'capitalize':
                return typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : value;
            case 'uppercase':
                return typeof value === 'string' ? value.toUpperCase() : value;
            case 'lowercase':
                return typeof value === 'string' ? value.toLowerCase() : value;
            case 'number':
                return typeof value === 'number' ? value.toLocaleString() : value;
            case 'currency':
                return typeof value === 'number' ? `$${value.toFixed(2)}` : value;
            case 'short':
                return typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value;
            default:
                return value;
        }
    }

    /**
     * Cleanup expired notifications
     */
    async cleanupExpired() {
        try {
            const { Notification } = this.getModels();
            return await Notification.cleanupExpired();
        } catch (error) {
            throw new Error(`Failed to cleanup expired notifications: ${error.message}`);
        }
    }

    /**
     * Get notification statistics
     */
    async getStatistics(recipientId, recipientModel) {
        try {
            const { Notification } = this.getModels();
            const stats = await Notification.aggregate([
                {
                    $match: {
                        recipient: new mongoose.Types.ObjectId(recipientId),
                        recipientModel: recipientModel
                    }
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            const result = {
                total: 0,
                unread: 0,
                read: 0,
                acknowledged: 0,
                archived: 0
            };
            
            stats.forEach(stat => {
                result[stat._id] = stat.count;
                result.total += stat.count;
            });
            
            return result;
        } catch (error) {
            throw new Error(`Failed to get statistics: ${error.message}`);
        }
    }
    //batch template notification
    async createBatchTemplateNotification(recipients, templateName, variables = {}) {
        const template = await this.loadTemplate(templateName);
        const notifications = recipients.map(recipient => {
            const notificationData = {
                recipient: recipient.id,
                recipientModel: recipient.model,
                type: 'system',
                title: this.interpolateTemplate(template.title, variables),
                message: this.interpolateTemplate(template.message, variables),
                template: {
                    name: templateName,
                    version: template.version,
                    variables: variables
                },
                actions: template.actions ? this.interpolateObject(template.actions, variables) : [],
                priority: template.priority || 'normal',
                channels: template.channels || ['in_app'],
                metadata: {
                    ...(template.navigation ? { navigation: this.interpolateObject(template.navigation, variables) } : {}),
                    ...(variables.metadata || {})
                }
            };
            
            // Add sender fields if they exist in the template
            if (template.sender) {
                console.log("sender", template.sender);
                notificationData.sender = this.interpolateTemplate(template.sender, variables);
            }
            if (template.senderModel) {
                notificationData.senderModel = template.senderModel;
            }
            
            return notificationData;
        });
        return await this.createBatchNotifications(notifications);
    }
    
    /**
     * Create system notification with advanced template support
     */
    async createAdvancedSystemNotification(recipientId, recipientModel, templateName, variables = {}) {
        try {
            const template = await this.loadAdvancedTemplate(templateName);
            
            // Process template with conditional logic
            const processedTemplate = this.processAdvancedTemplate(template, variables);
            
            const notificationData = {
                recipient: recipientId,
                recipientModel: recipientModel,
                type: 'system',
                title: processedTemplate.title,
                message: processedTemplate.message,
                template: {
                    name: templateName,
                    version: template.version,
                    variables: variables,
                    processed: true
                },
                actions: processedTemplate.actions || [],
                priority: processedTemplate.priority || 'normal',
                channels: processedTemplate.channels || ['in_app'],
                metadata: {
                    ...processedTemplate.metadata,
                    templateType: 'advanced'
                }
            };
            
            // Add sender fields if they exist in the template
            if (processedTemplate.sender) {
                notificationData.sender = processedTemplate.sender;
            }
            if (processedTemplate.senderModel) {
                notificationData.senderModel = processedTemplate.senderModel;
            }
            
            return await this.createNotification(notificationData);
        } catch (error) {
            throw new Error(`Failed to create advanced system notification: ${error.message}`);
        }
    }

    /**
     * Load advanced notification template with conditional logic
     */
    async loadAdvancedTemplate(templateName) {
        const advancedTemplates = {
            'dynamic_welcome': {
                title: 'Welcome to Study Compass!',
                message: {
                    type: 'conditional',
                    conditions: [
                        {
                            if: '{{hasProfile}}',
                            then: 'Welcome back, {{name|capitalize}}! Your profile is complete.',
                            else: 'Hi {{name|capitalize}}, welcome to Study Compass! Please complete your profile.'
                        }
                    ],
                    default: 'Welcome to Study Compass!'
                },
                version: '2.0',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: {
                    type: 'conditional',
                    conditions: [
                        {
                            if: '!{{hasProfile}}',
                            then: [
                                {
                                    id: 'complete_profile',
                                    label: 'Complete Profile',
                                    type: 'link',
                                    url: '/profile/complete',
                                    style: 'primary'
                                }
                            ]
                        }
                    ],
                    default: [
                        {
                            id: 'explore',
                            label: 'Explore',
                            type: 'link',
                            url: '/dashboard',
                            style: 'secondary'
                        }
                    ]
                }
            },
            'smart_event_reminder': {
                title: 'Event Reminder',
                message: {
                    type: 'conditional',
                    conditions: [
                        {
                            if: '{{isUrgent}}',
                            then: '🚨 URGENT: Your event <strong>{{eventName}}</strong> starts in <em>{{timeUntil}}</em>!',
                            else: 'Your event <strong>{{eventName}}</strong> starts in <em>{{timeUntil}}</em> at {{startTime|time}}.'
                        }
                    ]
                },
                version: '2.0',
                priority: {
                    type: 'conditional',
                    conditions: [
                        { if: '{{isUrgent}}', then: 'urgent' },
                        { if: '{{isToday}}', then: 'high' }
                    ],
                    default: 'normal'
                },
                channels: {
                    type: 'conditional',
                    conditions: [
                        { if: '{{isUrgent}}', then: ['in_app', 'push', 'email'] },
                        { if: '{{isToday}}', then: ['in_app', 'push'] }
                    ],
                    default: ['in_app']
                },
                actions: [
                    {
                        id: 'view_event',
                        label: 'View Event',
                        type: 'link',
                        url: '/events/{{eventId}}',
                        style: 'primary'
                    },
                    {
                        id: 'join_now',
                        label: 'Join Now',
                        type: 'link',
                        url: '/events/{{eventId}}/join',
                        style: 'success',
                        condition: '{{canJoin}}'
                    }
                ]
            }
        };
        
        return advancedTemplates[templateName] || advancedTemplates['dynamic_welcome'];
    }

    /**
     * Process advanced template with conditional logic
     */
    processAdvancedTemplate(template, variables) {
        const result = { ...template };
        
        // Process title
        if (typeof result.title === 'object' && result.title.type === 'conditional') {
            result.title = this.processConditionalField(result.title, variables);
        } else if (typeof result.title === 'string') {
            result.title = this.interpolateTemplate(result.title, variables);
        }
        
        // Process message
        if (typeof result.message === 'object' && result.message.type === 'conditional') {
            result.message = this.processConditionalField(result.message, variables);
        } else if (typeof result.message === 'string') {
            result.message = this.interpolateTemplate(result.message, variables);
        }
        
        // Process priority
        if (typeof result.priority === 'object' && result.priority.type === 'conditional') {
            result.priority = this.processConditionalField(result.priority, variables);
        }
        
        // Process channels
        if (typeof result.channels === 'object' && result.channels.type === 'conditional') {
            result.channels = this.processConditionalField(result.channels, variables);
        }
        
        // Process actions
        if (typeof result.actions === 'object' && result.actions.type === 'conditional') {
            result.actions = this.processConditionalField(result.actions, variables);
        } else if (Array.isArray(result.actions)) {
            result.actions = result.actions.filter(action => {
                if (action.condition) {
                    return this.evaluateCondition(action.condition, variables);
                }
                return true;
            }).map(action => {
                const processedAction = { ...action };
                if (action.url) {
                    processedAction.url = this.interpolateTemplate(action.url, variables);
                }
                if (action.payload) {
                    processedAction.payload = this.interpolateObject(action.payload, variables);
                }
                return processedAction;
            });
        }
        
        // Process sender fields
        if (result.sender) {
            result.sender = this.interpolateTemplate(result.sender, variables);
        }
        if (result.senderModel) {
            // senderModel is typically static, but could be conditional in the future
            result.senderModel = result.senderModel;
        }
        
        return result;
    }

    /**
     * Process conditional field
     */
    processConditionalField(field, variables) {
        if (!field.conditions || !Array.isArray(field.conditions)) {
            return field.default || '';
        }
        
        for (const condition of field.conditions) {
            if (this.evaluateCondition(condition.if, variables)) {
                if (typeof condition.then === 'string') {
                    return this.interpolateTemplate(condition.then, variables);
                }
                return condition.then;
            }
        }
        
        if (typeof field.default === 'string') {
            return this.interpolateTemplate(field.default, variables);
        }
        return field.default || '';
    }

    /**
     * Evaluate condition string
     */
    evaluateCondition(condition, variables) {
        // Simple condition evaluation
        // Supports: {{variable}}, !{{variable}}, {{variable}} == value, etc.
        
        // Handle negation
        if (condition.startsWith('!')) {
            const varName = condition.substring(2, condition.length - 2);
            return !variables[varName];
        }
        
        // Handle equality
        if (condition.includes(' == ')) {
            const [varPart, valuePart] = condition.split(' == ');
            const varName = varPart.replace(/\{\{|\}\}/g, '');
            const value = valuePart.replace(/['"]/g, '');
            return variables[varName] == value;
        }
        
        // Handle simple variable existence
        const varName = condition.replace(/\{\{|\}\}/g, '');
        return Boolean(variables[varName]);
    }
    
}

module.exports = NotificationService; 