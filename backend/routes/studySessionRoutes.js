const express = require('express');
const { verifyToken, verifyTokenOptional, authorizeRoles } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const StudySessionService = require('../services/studySessionService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Middleware to attach service
const withStudySessionService = (req, res, next) => {
    req.studySessionService = new StudySessionService(req);
    next();
};

// ============ STUDY SESSIONS ============

// Get user's study sessions
router.get('/', verifyToken, withStudySessionService, async (req, res) => {
    try {
        const { status = 'all', limit = 100, skip = 0 } = req.query;
        const { StudySession, AvailabilityPoll } = getModels(req, 'StudySession', 'AvailabilityPoll');
        
        // If creator param is provided, filter by creator
        const query = {};

        query.$or = [
            { creator: req.user.userId },
            // { 'participants.user': req.user.userId }
        ];
        
        if (status !== 'all') {
            query.status = status;
        }
        
        // Use Mongoose populate for efficient querying with nested populations
        const sessions = await StudySession.find(query)
            .populate('relatedEvent', 'start_time end_time location name')
            .populate('creator', 'name email picture')
            .populate({
                path: 'availabilityPoll',
                populate: {
                    path: 'responses.user',
                    select: '_id name username picture'
                }
            })
            // .populate({
            //     path: 'participants.user',
            //     select: 'name picture'
            // })
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));
        
        console.log(`GET: /study-sessions for user ${req.user.userId}`);
        res.json({
            success: true,
            sessions: sessions,
            pagination: {
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: sessions.length === parseInt(limit)
            }
        });
    } catch (error) {
        console.error('GET /study-sessions failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new study session
// Are these error messages rational? alot of this should be handled on the frontend, though backend confirmation is fine too
router.post('/', [
    verifyToken,
    // body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title is required (max 100 characters)'),
    // body('course').trim().isLength({ min: 1, max: 100 }).withMessage('Course is required (max 100 characters)'),
    // body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long (max 1000 characters)'),
    // body('visibility').isIn(['public', 'private']).withMessage('Visibility must be public or private'),
    // body('startTime').isISO8601().withMessage('Valid start time required'),
    // body('endTime').isISO8601().withMessage('Valid end time required'),
    // body('location').trim().isLength({ min: 1 }).withMessage('Location is required')
], withStudySessionService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const sessionData = req.body;
        
        // Handle polling mode (no event, no time required)
        if (sessionData.mode === 'poll') {
            const { studySession, event } = await req.studySessionService.createStudySessionForPolling(
                sessionData,
                req.user.userId
            );

            // Handle invited users if provided
            if (sessionData.invitedUsers && Array.isArray(sessionData.invitedUsers) && sessionData.invitedUsers.length > 0) {
                const { StudySession } = getModels(req, 'StudySession');
                const updatedSession = await StudySession.findById(studySession._id);
                
                const newInvites = sessionData.invitedUsers.filter(id => 
                    !updatedSession.invitedUsers.some(existingId => existingId.toString() === id.toString())
                );
                updatedSession.invitedUsers.push(...newInvites);
                await updatedSession.save();
                
                studySession.invitedUsers = updatedSession.invitedUsers;
            }

            console.log(`POST: /study-sessions - Created polling session ${studySession._id}`);
            return res.status(201).json({
                success: true,
                data: {
                    studySession,
                    event: null
                },
                message: 'Study session created for availability polling'
            });
        }

        // Schedule mode: require time and create event
        if (!sessionData.startTime || !sessionData.endTime) {
            return res.status(400).json({
                success: false,
                message: 'Start time and end time are required for scheduled sessions'
            });
        }

        // Validate time order
        if (new Date(sessionData.startTime) >= new Date(sessionData.endTime)) {
            return res.status(400).json({
                success: false,
                message: 'Start time must be before end time'
            });
        }

        // Validate future time
        if (new Date(sessionData.startTime) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Session must be scheduled for the future'
            });
        }

        // Check room availability
        const availability = await req.studySessionService.checkRoomAvailability(
            sessionData.startTime,
            sessionData.endTime,
            sessionData.location
        );

        if (!availability.isAvailable) {
            return res.status(409).json({
                success: false,
                message: availability.reason,
                conflicts: availability.conflicts
            });
        }

        const { studySession, event } = await req.studySessionService.createStudySession(
            sessionData,
            req.user.userId
        );

        // Handle invited users if provided
        if (sessionData.invitedUsers && Array.isArray(sessionData.invitedUsers) && sessionData.invitedUsers.length > 0) {
            const { StudySession } = getModels(req, 'StudySession');
            const updatedSession = await StudySession.findById(studySession._id);
            
            // Add invited users (avoid duplicates)
            const newInvites = sessionData.invitedUsers.filter(id => 
                !updatedSession.invitedUsers.some(existingId => existingId.toString() === id.toString())
            );
            updatedSession.invitedUsers.push(...newInvites);
            await updatedSession.save();
            
            // Update the studySession object for response
            studySession.invitedUsers = updatedSession.invitedUsers;
        }

        console.log(`POST: /study-sessions - Created session ${studySession._id}`);
        res.status(201).json({
            success: true,
            data: {
                studySession,
                event
            },
            message: 'Study session created successfully'
        });

    } catch (error) {
        console.error('POST /study-sessions failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get specific study session
router.get('/:id', verifyTokenOptional, withStudySessionService, async (req, res) => {
    try {
        const { StudySession } = getModels(req, 'StudySession');
        const session = await StudySession.findById(req.params.id)
            .populate('relatedEvent', 'start_time end_time location')
            .populate('creator', 'name email picture')
            .populate('participants.user', 'name picture')
            .populate('invitedUsers', 'name email');

        if (!session) {
            return res.status(404).json({ success: false, message: 'Study session not found' });
        }

        // Check access permissions
        const userId = req.user?.userId;
        const isCreator = session.isCreator(userId);
        const isParticipant = session.participants.some(p => p.user._id.toString() === userId);
        const isInvited = session.invitedUsers.some(u => u._id.toString() === userId);
        
        if (session.visibility === 'private' && !isCreator && !isParticipant && !isInvited) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Get poll link if available
        let pollLink = null;
        if (session.availabilityPoll) {
            const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
            const poll = await AvailabilityPoll.findById(session.availabilityPoll);
            if (poll) {
                const baseUrl = process.env.NODE_ENV === 'production' 
                    ? `https://${req.school}.meridian.study` 
                    : 'http://localhost:3000';
                pollLink = `${baseUrl}/study-session-callback?id=${poll._id}`;
            }
        }

        console.log(`GET: /study-sessions/${req.params.id}`);
        res.json({
            success: true,
            data: {
                ...session.toObject(),
                pollLink: pollLink
            },
            userPermissions: {
                canEdit: isCreator && session.status === 'scheduled',
                canRsvp: userId && !isCreator,
                canInvite: isCreator,
                canViewResponses: isCreator && session.availabilityPoll
            }
        });

    } catch (error) {
        console.error(`GET /study-sessions/${req.params.id} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update study session
router.put('/:id', [
    verifyToken,
    body('title').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('startTime').optional().isISO8601(),
    body('endTime').optional().isISO8601(),
    body('location').optional().trim().isLength({ min: 1 })
], withStudySessionService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const updateData = req.body;
        
        // Validate time order if both provided
        if (updateData.startTime && updateData.endTime) {
            if (new Date(updateData.startTime) >= new Date(updateData.endTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'Start time must be before end time'
                });
            }
        }

        // Check room availability if time or location changed
        if (updateData.startTime || updateData.endTime || updateData.location) {
            const { StudySession } = getModels(req, 'StudySession');
            const currentSession = await StudySession.findById(req.params.id).populate('relatedEvent');
            
            const startTime = updateData.startTime || currentSession.relatedEvent.start_time;
            const endTime = updateData.endTime || currentSession.relatedEvent.end_time;
            const location = updateData.location || currentSession.relatedEvent.location;

            const availability = await req.studySessionService.checkRoomAvailability(
                startTime,
                endTime,
                location
            );

            if (!availability.isAvailable) {
                return res.status(409).json({
                    success: false,
                    message: availability.reason,
                    conflicts: availability.conflicts
                });
            }
        }

        const session = await req.studySessionService.updateStudySession(
            req.params.id,
            updateData,
            req.user.userId
        );

        console.log(`PUT: /study-sessions/${req.params.id} - Updated by ${req.user.userId}`);
        res.json({
            success: true,
            data: session,
            message: 'Study session updated successfully'
        });

    } catch (error) {
        console.error(`PUT /study-sessions/${req.params.id} failed:`, error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Only the creator') || error.message.includes('Can only update')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cancel/Delete study session
router.delete('/:id', verifyToken, withStudySessionService, async (req, res) => {
    try {
        const session = await req.studySessionService.cancelStudySession(
            req.params.id,
            req.user.userId
        );

        console.log(`DELETE: /study-sessions/${req.params.id} - Cancelled by ${req.user.userId}`);
        res.json({
            success: true,
            data: session,
            message: 'Study session cancelled successfully'
        });

    } catch (error) {
        console.error(`DELETE /study-sessions/${req.params.id} failed:`, error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Only the creator')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ DISCOVERY ============

// Discover public study sessions
router.get('/discover', verifyTokenOptional, withStudySessionService, async (req, res) => {
    try {
        const { course, limit = 20, skip = 0 } = req.query;
        
        const options = {
            limit: parseInt(limit),
            skip: parseInt(skip)
        };

        if (course) options.course = course;

        const sessions = await req.studySessionService.discoverStudySessions(options);

        console.log(`GET: /study-sessions/discover - Found ${sessions.length} sessions`);
        res.json({
            success: true,
            data: sessions,
            pagination: {
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: sessions.length === parseInt(limit)
            }
        });

    } catch (error) {
        console.error('GET /study-sessions/discover failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Discover sessions by course
router.get('/discover/:course', verifyTokenOptional, withStudySessionService, async (req, res) => {
    try {
        const { course } = req.params;
        const { limit = 20, skip = 0 } = req.query;

        const sessions = await req.studySessionService.discoverStudySessions({
            course,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });

        console.log(`GET: /study-sessions/discover/${course} - Found ${sessions.length} sessions`);
        res.json({
            success: true,
            data: sessions,
            course: course,
            pagination: {
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: sessions.length === parseInt(limit)
            }
        });

    } catch (error) {
        console.error(`GET /study-sessions/discover/${req.params.course} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ PARTICIPATION ============

// RSVP to study session
router.post('/:id/rsvp', [
    verifyToken,
    body('status').isIn(['going', 'maybe', 'not-going']).withMessage('Status must be going, maybe, or not-going')
], withStudySessionService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { status } = req.body;
        const session = await req.studySessionService.rsvpToSession(
            req.params.id,
            req.user.userId,
            status
        );

        console.log(`POST: /study-sessions/${req.params.id}/rsvp - User ${req.user.userId} RSVP'd ${status}`);
        res.json({
            success: true,
            data: session,
            message: `RSVP updated to ${status}`
        });

    } catch (error) {
        console.error(`POST /study-sessions/${req.params.id}/rsvp failed:`, error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Cannot RSVP') || error.message.includes('maximum capacity')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
});

// Invite users to study session
router.post('/:id/invite', [
    verifyToken,
    body('userIds').isArray().withMessage('User IDs must be an array'),
    body('userIds.*').isMongoId().withMessage('Invalid user ID format')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { StudySession } = getModels(req, 'StudySession');
        const { userIds } = req.body;

        const session = await StudySession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Study session not found' });
        }

        if (!session.isCreator(req.user.userId)) {
            return res.status(403).json({ success: false, message: 'Only the creator can invite users' });
        }

        // Add new invited users (avoid duplicates)
        const newInvites = userIds.filter(id => !session.invitedUsers.includes(id));
        session.invitedUsers.push(...newInvites);
        await session.save();

        // TODO: Send invitation notifications

        console.log(`POST: /study-sessions/${req.params.id}/invite - Invited ${newInvites.length} users`);
        res.json({
            success: true,
            data: session,
            message: `Invited ${newInvites.length} users to the study session`
        });

    } catch (error) {
        console.error(`POST /study-sessions/${req.params.id}/invite failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ AVAILABILITY POLLING ============

// Create availability poll for study session (with time windows and invites)
router.post('/:id/create-availability-poll', [
    verifyToken,
    body('timeWindows').isArray().withMessage('Time windows must be an array'),
    body('timeWindows.*.start').isISO8601().withMessage('Each time window must have a valid start date'),
    body('timeWindows.*.end').isISO8601().withMessage('Each time window must have a valid end date'),
    body('invitedFriendIds').optional().isArray().withMessage('Invited friend IDs must be an array'),
    body('expiresAt').isISO8601().withMessage('Expiration date is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { StudySession, AvailabilityPoll, User } = getModels(req, 'StudySession', 'AvailabilityPoll', 'User');
        const { timeWindows, invitedFriendIds, expiresAt } = req.body;

        const session = await StudySession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Study session not found' });
        }

        if (!session.isCreator(req.user.userId)) {
            return res.status(403).json({ success: false, message: 'Only the creator can create availability polls' });
        }

        // Validate time windows
        for (const window of timeWindows) {
            if (new Date(window.start) >= new Date(window.end)) {
                return res.status(400).json({
                    success: false,
                    message: 'Start time must be before end time for each window'
                });
            }
        }

        // Validate expiration is in the future
        if (new Date(expiresAt) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiration date must be in the future'
            });
        }

        // Verify invited friends exist
        let invitedUsers = [];
        if (invitedFriendIds && invitedFriendIds.length > 0) {
            invitedUsers = await User.find({ _id: { $in: invitedFriendIds } });
            if (invitedUsers.length !== invitedFriendIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more friend IDs are invalid'
                });
            }
        }

        // Create availability poll
        const poll = new AvailabilityPoll({
            parentType: 'StudySession',
            parentId: session._id,
            creatorType: 'User',
            creatorId: req.user.userId,
            timeSlotOptions: timeWindows.map((w, index) => ({
                label: `Option ${index + 1}`,
                startTime: new Date(w.start),
                endTime: new Date(w.end)
            })),
            invitedUsers: invitedUsers.map(u => u._id),
            expiresAt: new Date(expiresAt),
            allowAnonymous: false
        });

        await poll.save();

        // Link poll to study session
        session.availabilityPoll = poll._id;
        await session.save();

        // Generate shareable link
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? `https://${req.school}.meridian.study` 
            : 'http://localhost:3000';
        const pollLink = `${baseUrl}/study-session-callback?id=${poll._id}`;

        console.log(`POST: /study-sessions/${req.params.id}/create-availability-poll - Created poll ${poll._id}`);
        res.status(201).json({
            success: true,
            data: poll,
            message: 'Availability poll created successfully',
            pollLink: pollLink,
            shareableLink: pollLink
        });

    } catch (error) {
        console.error(`POST /study-sessions/${req.params.id}/create-availability-poll failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get availability poll for study session (by session ID or poll token)
router.get('/availability-poll/:id', verifyTokenOptional, async (req, res) => {
    try {
        const { StudySession, AvailabilityPoll, User } = getModels(req, 'StudySession', 'AvailabilityPoll', 'User');
        const { id } = req.params;
        const userId = req.user?.userId;

        // Try to find by poll ID first
        let poll = await AvailabilityPoll.findById(id)
            .populate('creatorId', 'username name picture email')
            .populate('invitedUsers', 'username name picture email');

        // If not found, try to find by study session ID
        if (!poll) {
            const session = await StudySession.findById(id);
            if (session && session.availabilityPoll) {
                poll = await AvailabilityPoll.findById(session.availabilityPoll)
                    .populate('creatorId', 'username name picture email')
                    .populate('invitedUsers', 'username name picture email');
            }
        }

        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found'
            });
        }

        // Check access
        if (!poll.canAccess(userId)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this availability poll'
            });
        }

        // Get study session info
        const session = await StudySession.findOne({ availabilityPoll: poll._id })
            .populate('creator', 'username name picture');

        const response = {
            success: true,
            studySession: {
                _id: session?._id,
                title: session?.title,
                subject: session?.course,
                description: session?.description,
                visible: session?.visibility === 'public',
                timeWindows: poll.timeSlotOptions.map(opt => ({
                    start: opt.startTime,
                    end: opt.endTime
                })),
                creator: session?.creator ? {
                    _id: session.creator._id,
                    username: session.creator.username,
                    name: session.creator.name,
                    picture: session.creator.picture
                } : null
            },
            poll: {
                _id: poll._id,
                expiresAt: poll.expiresAt,
                isFinalized: poll.isFinalized,
                finalizedChoice: poll.finalizedChoice
            }
        };

        // Add user's existing response if they've replied
        if (userId) {
            const userResponse = poll.getUserResponse(userId);
            if (userResponse) {
                response.userResponse = {
                    selectedBlocks: userResponse.selectedBlocks,
                    submittedAt: userResponse.submittedAt
                };
            }
        }

        // Add shareable link to response
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? `https://${req.school}.meridian.study` 
            : 'http://localhost:3000';
        response.pollLink = `${baseUrl}/study-session-callback?id=${poll._id}`;
        response.shareableLink = response.pollLink;

        res.json(response);

    } catch (error) {
        console.error('GET /study-sessions/availability-poll/:id failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching availability poll',
            error: error.message
        });
    }
});

// Submit availability reply
router.post('/availability-poll/:id/reply', [
    verifyToken,
    body('availableTimeSlots').isArray().withMessage('Available time slots must be an array'),
    body('availableTimeSlots.*.start').isISO8601().withMessage('Each slot must have a valid start date'),
    body('availableTimeSlots.*.end').isISO8601().withMessage('Each slot must have a valid end date')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll, StudySession } = getModels(req, 'AvailabilityPoll', 'StudySession');
        const { id } = req.params;
        const { availableTimeSlots } = req.body;
        const userId = req.user.userId;

        // Find poll by ID or session ID
        let poll = await AvailabilityPoll.findById(id);
        
        if (!poll) {
            const session = await StudySession.findById(id);
            if (session && session.availabilityPoll) {
                poll = await AvailabilityPoll.findById(session.availabilityPoll);
            }
        }

        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found'
            });
        }

        // Check access
        if (!poll.canAccess(userId)) {
            return res.status(403).json({
                success: false,
                message: 'You are not invited to this availability poll'
            });
        }

        // Check if poll is expired
        if (poll.isExpired()) {
            return res.status(400).json({
                success: false,
                message: 'This availability poll has expired'
            });
        }

        // Validate time slots are within available options
        const validSlots = availableTimeSlots.filter(slot => {
            return poll.timeSlotOptions.some(option => {
                const slotStart = new Date(slot.start);
                const slotEnd = new Date(slot.end);
                const optionStart = new Date(option.startTime);
                const optionEnd = new Date(option.endTime);
                
                return slotStart >= optionStart && slotEnd <= optionEnd;
            });
        });

        if (validSlots.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Selected time slots must be within the available time windows'
            });
        }

        // Check if user already submitted
        const existingResponse = poll.getUserResponse(userId);
        
        if (existingResponse) {
            // Update existing response
            existingResponse.selectedBlocks = validSlots.map(slot => ({
                startTime: new Date(slot.start),
                endTime: new Date(slot.end)
            }));
            existingResponse.submittedAt = new Date();
        } else {
            // Add new response
            const user = await getModels(req, 'User').User.findById(userId);
            poll.responses.push({
                user: userId,
                displayName: user?.name || user?.username,
                selectedBlocks: validSlots.map(slot => ({
                    startTime: new Date(slot.start),
                    endTime: new Date(slot.end)
                })),
                submittedAt: new Date()
            });
        }

        await poll.save();

        res.json({
            success: true,
            message: 'Availability submitted successfully',
            poll: {
                _id: poll._id
            }
        });

    } catch (error) {
        console.error('POST /study-sessions/availability-poll/:id/reply failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting availability',
            error: error.message
        });
    }
});

// Get shareable link for availability poll
router.get('/availability-poll/:id/share-link', verifyTokenOptional, async (req, res) => {
    try {
        const { AvailabilityPoll, StudySession } = getModels(req, 'AvailabilityPoll', 'StudySession');
        const { id } = req.params;
        const userId = req.user?.userId;

        // Find poll
        let poll = await AvailabilityPoll.findById(id);
        
        if (!poll) {
            const session = await StudySession.findById(id);
            if (session && session.availabilityPoll) {
                poll = await AvailabilityPoll.findById(session.availabilityPoll);
            }
        }

        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found'
            });
        }

        // Check access (creator or invited user can get link)
        if (userId && !poll.isCreator(userId) && !poll.invitedUsers.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this poll'
            });
        }

        const baseUrl = process.env.NODE_ENV === 'production' 
            ? `https://${req.school}.meridian.study` 
            : 'http://localhost:3000';
        const pollLink = `${baseUrl}/study-session-callback?id=${poll._id}`;

        res.json({
            success: true,
            pollLink: pollLink,
            shareableLink: pollLink,
            pollId: poll._id
        });

    } catch (error) {
        console.error('GET /study-sessions/availability-poll/:id/share-link failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting shareable link',
            error: error.message
        });
    }
});

// Get poll responses (creator only)
router.get('/:id/availability-poll/responses', verifyToken, async (req, res) => {
    try {
        const { AvailabilityPoll, StudySession, User } = getModels(req, 'AvailabilityPoll', 'StudySession', 'User');
        const { id } = req.params;
        const userId = req.user.userId;

        // Find study session
        const session = await StudySession.findById(id);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Study session not found'
            });
        }

        // Verify user is creator
        if (!session.isCreator(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Only the creator can view poll responses'
            });
        }

        // Find poll
        let poll = null;
        if (session.availabilityPoll) {
            poll = await AvailabilityPoll.findById(session.availabilityPoll);
        }

        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found for this study session'
            });
        }

        // Populate responses with user data
        const populatedPoll = await AvailabilityPoll.findById(poll._id)
            .populate('responses.user', 'name username picture email');

        const responses = populatedPoll.responses.map(response => ({
            user: response.user,
            selectedBlocks: response.selectedBlocks,
            submittedAt: response.submittedAt
        }));

        res.json({
            success: true,
            poll: {
                _id: poll._id,
                timeSlotOptions: poll.timeSlotOptions,
                expiresAt: poll.expiresAt,
                isFinalized: poll.isFinalized,
                finalizedChoice: poll.finalizedChoice
            },
            responses: responses
        });

    } catch (error) {
        console.error('GET /study-sessions/:id/availability-poll/responses failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching poll responses',
            error: error.message
        });
    }
});

// Finalize poll time (creator only)
router.post('/availability-poll/:id/finalize', [
    verifyToken,
    body('startTime').isISO8601().withMessage('Valid start time is required'),
    body('endTime').isISO8601().withMessage('Valid end time is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll, StudySession } = getModels(req, 'AvailabilityPoll', 'StudySession');
        const { id } = req.params;
        const { startTime, endTime } = req.body;
        const userId = req.user.userId;

        // Find poll
        let poll = await AvailabilityPoll.findById(id);
        
        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found'
            });
        }

        // Verify user is creator
        if (!poll.isCreator(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Only the creator can finalize the poll time'
            });
        }

        if (poll.isFinalized) {
            return res.status(400).json({
                success: false,
                message: 'Poll has already been finalized'
            });
        }

        // Validate time is within poll options
        const timeInOptions = poll.timeSlotOptions.some(option => {
            const optionStart = new Date(option.startTime);
            const optionEnd = new Date(option.endTime);
            const selectedStart = new Date(startTime);
            const selectedEnd = new Date(endTime);
            
            return selectedStart >= optionStart && selectedEnd <= optionEnd;
        });

        if (!timeInOptions) {
            return res.status(400).json({
                success: false,
                message: 'Selected time must be within the poll time options'
            });
        }

        // Finalize the poll
        poll.isFinalized = true;
        poll.finalizedChoice = {
            startTime: new Date(startTime),
            endTime: new Date(endTime)
        };
        await poll.save();

        // Find associated study session
        const session = await StudySession.findOne({ availabilityPoll: poll._id });
        
        if (session) {
            // Update study session with finalized time
            session.startTime = new Date(startTime);
            session.endTime = new Date(endTime);
            await session.save();

            // Create event for the study session
            const StudySessionService = require('../services/studySessionService').StudySessionService;
            const { Event } = getModels(req, 'Event');
            const service = new StudySessionService(req);

            try {
                const { event } = await service.createEventForStudySession(session._id, userId);
                
                // Send notifications to all participants who haven't declined
                const NotificationService = require('../services/notificationService');
                const { Notification, User: NotificationUser } = getModels(req, 'Notification', 'User');
                const notificationService = new NotificationService({ Notification, User: NotificationUser });
                
                const baseUrl = process.env.NODE_ENV === 'production' 
                    ? `https://${req.school}.meridian.study` 
                    : 'http://localhost:3000';
                
                // Get all users who responded (and haven't declined)
                const participants = poll.responses.map(r => r.user).filter(Boolean);
                
                for (const participantId of participants) {
                    await notificationService.createNotification({
                        recipient: participantId,
                        recipientModel: 'User',
                        sender: userId,
                        senderModel: 'User',
                        title: `Study Session Time Finalized: ${session.title}`,
                        message: `The study session time has been finalized. Check your events for details.`,
                        type: 'event',
                        priority: 'normal',
                        channels: ['in_app', 'email'],
                        actions: [
                            {
                                id: 'view_event',
                                label: 'View Event',
                                type: 'link',
                                url: `${baseUrl}/events-dashboard`,
                                style: 'primary',
                                order: 1
                            }
                        ],
                        metadata: {
                            studySessionId: session._id.toString(),
                            eventId: event?._id?.toString()
                        }
                    });
                }
            } catch (eventError) {
                console.error('Error creating event or sending notifications:', eventError);
                // Don't fail the finalization if event creation fails
            }
        }

        res.json({
            success: true,
            message: 'Poll time finalized successfully',
            poll: {
                _id: poll._id,
                isFinalized: poll.isFinalized,
                finalizedChoice: poll.finalizedChoice
            }
        });

    } catch (error) {
        console.error('POST /study-sessions/availability-poll/:id/finalize failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error finalizing poll time',
            error: error.message
        });
    }
});

// Send invites for availability poll (with email and notifications)
router.post('/availability-poll/:id/send-invites', verifyToken, async (req, res) => {
    try {
        const { AvailabilityPoll, StudySession, User } = getModels(req, 'AvailabilityPoll', 'StudySession', 'User');
        const NotificationService = require('../services/notificationService');
        const { id } = req.params;
        const userId = req.user.userId;

        // Find poll
        let poll = await AvailabilityPoll.findById(id);
        
        if (!poll) {
            const session = await StudySession.findById(id);
            if (session && session.availabilityPoll) {
                poll = await AvailabilityPoll.findById(session.availabilityPoll);
            }
        }

        if (!poll) {
            return res.status(404).json({
                success: false,
                message: 'Availability poll not found'
            });
        }

        // Verify user is creator
        if (!poll.isCreator(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Only the creator can send invites'
            });
        }

        if (poll.invitedUsers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No users invited to this poll'
            });
        }

        // Get study session info
        const session = await StudySession.findOne({ availabilityPoll: poll._id })
            .populate('creator', 'username name');

        const { Notification, User: NotificationUser } = getModels(req, 'Notification', 'User');
        const notificationService = new NotificationService({ Notification, User: NotificationUser });
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? `https://${req.school}.meridian.study` 
            : 'http://localhost:3000';
        
        // Send notifications to each invited user
        const notifications = [];
        const pollLink = `${baseUrl}/study-session-callback?id=${poll._id}`;
        
        for (const invitedUserId of poll.invitedUsers) {
            const notification = await notificationService.createNotification({
                recipient: invitedUserId,
                recipientModel: 'User',
                sender: userId,
                senderModel: 'User',
                title: `Study Session Availability: ${session?.title || 'New Study Session'}`,
                message: `${session?.creator?.name || 'Someone'} invited you to fill out your availability for a study session. Click to select your available times.\n\nShare this link: ${pollLink}`,
                type: 'event',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'reply_availability',
                        label: 'Fill Availability',
                        type: 'link',
                        url: pollLink,
                        style: 'primary',
                        order: 1
                    },
                    {
                        id: 'share_poll',
                        label: 'Share Link',
                        type: 'link',
                        url: pollLink,
                        style: 'secondary',
                        order: 2
                    }
                ],
                metadata: {
                    studySessionId: session?._id?.toString(),
                    pollId: poll._id.toString(),
                    pollLink: pollLink,
                    title: session?.title,
                    shareableLink: pollLink
                }
            });
            
            notifications.push(notification);
        }

        res.json({
            success: true,
            message: `Invites sent to ${notifications.length} users`,
            notificationsSent: notifications.length,
            pollLink: pollLink,
            shareableLink: pollLink
        });

    } catch (error) {
        console.error('POST /study-sessions/availability-poll/:id/send-invites failed:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending invites',
            error: error.message
        });
    }
});

// ============ ROOM AVAILABILITY ============

// Check room availability
router.post('/check-availability', [
    verifyToken,
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').isISO8601().withMessage('Valid end time required'),
    body('roomName').trim().isLength({ min: 1 }).withMessage('Room name is required')
], withStudySessionService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { startTime, endTime, roomName } = req.body;
        
        const availability = await req.studySessionService.checkRoomAvailability(
            startTime,
            endTime,
            roomName
        );

        console.log(`POST: /study-sessions/check-availability - Room ${roomName}: ${availability.isAvailable}`);
        res.json({
            success: true,
            data: availability
        });

    } catch (error) {
        console.error('POST /study-sessions/check-availability failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get suggested rooms
router.get('/suggested-rooms', [
    verifyToken,
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').isISO8601().withMessage('Valid end time required')
], withStudySessionService, async (req, res) => {
    try {
        const { startTime, endTime } = req.query;
        
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Start time and end time are required'
            });
        }

        const rooms = await req.studySessionService.getSuggestedRooms(startTime, endTime);

        console.log(`GET: /study-sessions/suggested-rooms - Found ${rooms.length} available rooms`);
        res.json({
            success: true,
            data: rooms
        });

    } catch (error) {
        console.error('GET /study-sessions/suggested-rooms failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ FEEDBACK (Combined) ============

// Get feedback form configuration
router.get('/:id/feedback-config', verifyToken, withStudySessionService, async (req, res) => {
    try {
        const form = await req.studySessionService.getFeedbackForm();
        
        if (!form) {
            return res.status(404).json({
                success: false,
                message: 'No feedback form configured for study sessions'
            });
        }

        // Check if user has already submitted feedback
        const hasSubmitted = await req.studySessionService.hasUserSubmittedFeedback(
            req.user.userId,
            req.params.id
        );

        console.log(`GET: /study-sessions/${req.params.id}/feedback-config - User ${req.user.userId}`);
        res.json({
            success: true,
            data: {
                form,
                hasSubmitted
            }
        });

    } catch (error) {
        console.error(`GET /study-sessions/${req.params.id}/feedback-config failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit feedback response for study session
router.post('/:id/submit-feedback', [
    verifyToken,
    body('responses').isObject().withMessage('Responses must be an object'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
], withStudySessionService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { responses, metadata = {} } = req.body;

        const feedback = await req.studySessionService.submitFeedback(
            req.params.id,
            req.user.userId,
            responses,
            metadata
        );

        console.log(`POST: /study-sessions/${req.params.id}/submit-feedback - User ${req.user.userId} submitted feedback`);
        res.json({
            success: true,
            data: feedback,
            message: 'Feedback submitted successfully'
        });

    } catch (error) {
        console.error(`POST /study-sessions/${req.params.id}/submit-feedback failed:`, error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Can only provide feedback') || error.message.includes('Validation errors')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get feedback results for study session (admin only)
router.get('/:id/feedback-results', [
    verifyToken,
    authorizeRoles('admin', 'root')
], withStudySessionService, async (req, res) => {
    try {
        const stats = await req.studySessionService.getFeedbackStats(req.params.id);
        
        if (!stats) {
            return res.status(404).json({
                success: false,
                message: 'No feedback found for this session'
            });
        }

        console.log(`GET: /study-sessions/${req.params.id}/feedback-results - Admin ${req.user.userId} viewed feedback`);
        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error(`GET /study-sessions/${req.params.id}/feedback-results failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get aggregate feedback analytics (admin only)
router.get('/feedback-analytics', [
    verifyToken,
    authorizeRoles('admin', 'root')
], withStudySessionService, async (req, res) => {
    try {
        const stats = await req.studySessionService.feedbackService.getFeedbackStats('studySession');

        console.log(`GET: /study-sessions/feedback-analytics - Admin ${req.user.userId} viewed analytics`);
        res.json({
            success: true,
            data: stats || []
        });

    } catch (error) {
        console.error('GET /study-sessions/feedback-analytics failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
