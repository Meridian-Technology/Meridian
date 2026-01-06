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
        const { status = 'scheduled', limit = 20, skip = 0 } = req.query;
        const sessions = await req.studySessionService.getUserStudySessions(
            req.user.userId,
            { status, limit: parseInt(limit), skip: parseInt(skip) }
        );
        
        console.log(`GET: /study-sessions for user ${req.user.userId}`);
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
        console.error('GET /study-sessions failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new study session
// Are these error messages rational? alot of this should be handled on the frontend, though backend confirmation is fine too
router.post('/', [
    verifyToken,
    body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title is required (max 100 characters)'),
    body('course').trim().isLength({ min: 1, max: 100 }).withMessage('Course is required (max 100 characters)'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long (max 1000 characters)'),
    body('visibility').isIn(['public', 'private']).withMessage('Visibility must be public or private'),
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').isISO8601().withMessage('Valid end time required'),
    body('location').trim().isLength({ min: 1 }).withMessage('Location is required')
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

        console.log(`GET: /study-sessions/${req.params.id}`);
        res.json({
            success: true,
            data: session,
            userPermissions: {
                canEdit: isCreator && session.status === 'scheduled',
                canRsvp: userId && !isCreator,
                canInvite: isCreator
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
