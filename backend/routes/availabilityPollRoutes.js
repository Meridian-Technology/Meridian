const express = require('express');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const AvailabilityService = require('../services/availabilityService');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

const router = express.Router();

// Middleware to attach service
const withAvailabilityService = (req, res, next) => {
    req.availabilityService = new AvailabilityService(req);
    next();
};

// ============ UNIFIED POLL ROUTES ============

// Create availability poll
router.post('/', [
    verifyToken,
    body('parentType').isIn(['StudySession', 'Event', 'Org']).withMessage('Invalid parent type'),
    body('parentId').isMongoId().withMessage('Invalid parent ID'),
    body('timeSlotOptions').isArray({ min: 1 }).withMessage('At least one time slot required'),
    body('timeSlotOptions.*.startTime').isISO8601().withMessage('Invalid start time'),
    body('timeSlotOptions.*.endTime').isISO8601().withMessage('Invalid end time'),
    body('timeSlotOptions.*.label').optional().trim().isLength({ max: 50 }),
    body('invitedUsers').isArray().withMessage('Invited users must be an array'),
    body('invitedUsers.*').isMongoId().withMessage('Invalid user ID'),
    body('allowAnonymous').optional().isBoolean(),
    body('expiresAt').isISO8601().withMessage('Valid expiration date required')
], withAvailabilityService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const pollData = req.body;

        // Validate time slots
        for (const slot of pollData.timeSlotOptions) {
            if (new Date(slot.startTime) >= new Date(slot.endTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'Start time must be before end time for all slots'
                });
            }
        }

        // Validate expiration date
        if (new Date(pollData.expiresAt) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiration date must be in the future'
            });
        }

        // Determine creator based on parent type
        let creatorType = 'User';
        let creatorId = req.user.userId;

        // TODO: Add logic to handle Org-created polls if needed
        // For now, all polls are created by Users

        const poll = new AvailabilityPoll({
            parentType: pollData.parentType,
            parentId: pollData.parentId,
            creatorType: creatorType,
            creatorId: creatorId,
            timeSlotOptions: pollData.timeSlotOptions,
            invitedUsers: pollData.invitedUsers,
            allowAnonymous: pollData.allowAnonymous || false,
            expiresAt: new Date(pollData.expiresAt),
            responses: []
        });

        await poll.save();

        // TODO: Send invitation notifications

        console.log(`POST: /availability-polls - Created poll ${poll._id} by user ${req.user.userId}`);
        res.status(201).json({
            success: true,
            data: poll,
            message: 'Availability poll created successfully'
        });

    } catch (error) {
        console.error('POST /availability-polls failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get poll details (unified for authenticated and anonymous)
router.get('/:pollId', verifyTokenOptional, withAvailabilityService, async (req, res) => {
    try {
        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;

        const poll = await AvailabilityPoll.findById(pollId)
            .populate('invitedUsers', 'name email picture')
            .populate('creatorId', 'name picture');

        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (poll.isExpired()) {
            return res.status(410).json({ success: false, message: 'Poll has expired' });
        }

        // Check access permissions
        const userId = req.user?.userId;
        const isAuthenticated = !!userId;
        const isCreator = poll.isCreator(userId);
        const isInvited = isAuthenticated && poll.invitedUsers.some(u => u._id.toString() === userId);
        const canAccess = isCreator || isInvited || poll.allowAnonymous;

        if (!canAccess) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Prepare response data
        const responseData = {
            _id: poll._id,
            parentType: poll.parentType,
            parentId: poll.parentId,
            timeSlotOptions: poll.timeSlotOptions,
            allowAnonymous: poll.allowAnonymous,
            isFinalized: poll.isFinalized,
            finalizedChoice: poll.finalizedChoice,
            expiresAt: poll.expiresAt,
            createdAt: poll.createdAt,
            responses: poll.responses.map(response => ({
                _id: response._id,
                user: response.user ? {
                    _id: response.user._id,
                    name: response.user.name,
                    picture: response.user.picture
                } : null,
                displayName: response.displayName,
                selectedBlocks: response.selectedBlocks,
                submittedAt: response.submittedAt
            }))
        };

        // Add permissions info
        responseData.userPermissions = {
            canEdit: isAuthenticated && (isCreator || (!poll.isFinalized && (isInvited || poll.allowAnonymous))),
            canFinalize: isCreator && !poll.isFinalized,
            canDelete: isCreator,
            isCreator: isCreator
        };

        console.log(`GET: /availability-polls/${pollId} - Accessed by ${userId || 'anonymous'}`);
        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error(`GET /availability-polls/${req.params.pollId} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit or update response (unified for authenticated and anonymous)
router.post('/:pollId/respond', [
    verifyTokenOptional,
    body('selectedBlocks').isArray({ min: 1 }).withMessage('At least one time block must be selected'),
    body('selectedBlocks.*.startTime').isISO8601().withMessage('Invalid start time'),
    body('selectedBlocks.*.endTime').isISO8601().withMessage('Invalid end time'),
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Display name must be 1-50 characters'),
    body('conflictPreferences').optional().isObject(),
    body('conflictPreferences.blockRsvpEvents').optional().isBoolean(),
    body('conflictPreferences.blockClasses').optional().isBoolean(),
    body('conflictPreferences.blockClubMeetings').optional().isBoolean()
], withAvailabilityService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;
        const { selectedBlocks, displayName, conflictPreferences } = req.body;

        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (poll.isExpired()) {
            return res.status(410).json({ success: false, message: 'Poll has expired' });
        }

        if (poll.isFinalized) {
            return res.status(400).json({ success: false, message: 'Poll has been finalized' });
        }

        const userId = req.user?.userId;
        const isAuthenticated = !!userId;
        const isCreator = poll.isCreator(userId);
        const isInvited = isAuthenticated && poll.invitedUsers.includes(userId);
        const canRespond = isCreator || isInvited || poll.allowAnonymous;

        if (!canRespond) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Validate selected blocks
        const blockErrors = req.availabilityService.validateTimeBlocks(selectedBlocks);
        if (blockErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid time blocks',
                errors: blockErrors
            });
        }

        // For anonymous users, display name is required
        if (!isAuthenticated && !displayName) {
            return res.status(400).json({
                success: false,
                message: 'Display name is required for anonymous responses'
            });
        }

        // Remove existing response if authenticated user
        if (isAuthenticated) {
            poll.responses = poll.responses.filter(r => !r.user || r.user.toString() !== userId);
        }

        // Check for conflicts if authenticated user
        let conflicts = [];
        if (isAuthenticated && conflictPreferences) {
            conflicts = await req.availabilityService.checkUserConflicts(
                userId,
                selectedBlocks,
                conflictPreferences
            );
        }

        // Create new response
        const response = {
            user: isAuthenticated ? userId : null,
            displayName: displayName || null,
            selectedBlocks: selectedBlocks,
            conflictPreferences: isAuthenticated ? (conflictPreferences || {
                blockRsvpEvents: true,
                blockClasses: true,
                blockClubMeetings: false
            }) : undefined,
            submittedAt: new Date()
        };

        poll.responses.push(response);
        await poll.save();

        console.log(`POST: /availability-polls/${pollId}/respond - Response by ${userId || 'anonymous'}`);
        res.json({
            success: true,
            data: response,
            conflicts: conflicts,
            message: 'Response submitted successfully'
        });

    } catch (error) {
        console.error(`POST /availability-polls/${req.params.pollId}/respond failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Edit response (authenticated users only)
router.put('/:pollId/respond', [
    verifyToken,
    body('selectedBlocks').isArray({ min: 1 }).withMessage('At least one time block must be selected'),
    body('selectedBlocks.*.startTime').isISO8601().withMessage('Invalid start time'),
    body('selectedBlocks.*.endTime').isISO8601().withMessage('Invalid end time'),
    body('conflictPreferences').optional().isObject()
], withAvailabilityService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;
        const { selectedBlocks, conflictPreferences } = req.body;

        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (poll.isExpired()) {
            return res.status(410).json({ success: false, message: 'Poll has expired' });
        }

        if (poll.isFinalized) {
            return res.status(400).json({ success: false, message: 'Poll has been finalized' });
        }

        const userId = req.user.userId;
        const existingResponse = poll.getUserResponse(userId);
        
        if (!existingResponse) {
            return res.status(404).json({ success: false, message: 'No existing response found' });
        }

        // Validate selected blocks
        const blockErrors = req.availabilityService.validateTimeBlocks(selectedBlocks);
        if (blockErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid time blocks',
                errors: blockErrors
            });
        }

        // Check for conflicts
        const conflicts = await req.availabilityService.checkUserConflicts(
            userId,
            selectedBlocks,
            conflictPreferences || existingResponse.conflictPreferences
        );

        // Update existing response
        existingResponse.selectedBlocks = selectedBlocks;
        existingResponse.conflictPreferences = conflictPreferences || existingResponse.conflictPreferences;
        existingResponse.lastUpdated = new Date();

        await poll.save();

        console.log(`PUT: /availability-polls/${pollId}/respond - Response updated by ${userId}`);
        res.json({
            success: true,
            data: existingResponse,
            conflicts: conflicts,
            message: 'Response updated successfully'
        });

    } catch (error) {
        console.error(`PUT /availability-polls/${req.params.pollId}/respond failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Finalize poll and choose time
router.post('/:pollId/finalize', [
    verifyToken,
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').isISO8601().withMessage('Valid end time required')
], withAvailabilityService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;
        const { startTime, endTime } = req.body;

        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (!poll.isCreator(req.user.userId)) {
            return res.status(403).json({ success: false, message: 'Only the creator can finalize the poll' });
        }

        if (poll.isFinalized) {
            return res.status(400).json({ success: false, message: 'Poll is already finalized' });
        }

        // Validate time selection
        if (new Date(startTime) >= new Date(endTime)) {
            return res.status(400).json({
                success: false,
                message: 'Start time must be before end time'
            });
        }

        // Finalize the poll
        poll.isFinalized = true;
        poll.finalizedChoice = {
            startTime: new Date(startTime),
            endTime: new Date(endTime)
        };

        await poll.save();

        // TODO: Create study session if parentType is StudySession
        // TODO: Send finalization notifications

        console.log(`POST: /availability-polls/${pollId}/finalize - Finalized by ${req.user.userId}`);
        res.json({
            success: true,
            data: poll,
            message: 'Poll finalized successfully'
        });

    } catch (error) {
        console.error(`POST /availability-polls/${req.params.pollId}/finalize failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete poll
router.delete('/:pollId', verifyToken, async (req, res) => {
    try {
        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;

        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (!poll.isCreator(req.user.userId)) {
            return res.status(403).json({ success: false, message: 'Only the creator can delete the poll' });
        }

        await AvailabilityPoll.findByIdAndDelete(pollId);

        console.log(`DELETE: /availability-polls/${pollId} - Deleted by ${req.user.userId}`);
        res.json({
            success: true,
            message: 'Poll deleted successfully'
        });

    } catch (error) {
        console.error(`DELETE /availability-polls/${req.params.pollId} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get optimal times from poll responses
router.get('/:pollId/optimal-times', verifyToken, withAvailabilityService, async (req, res) => {
    try {
        const { AvailabilityPoll } = getModels(req, 'AvailabilityPoll');
        const { pollId } = req.params;

        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (!poll.isCreator(req.user.userId)) {
            return res.status(403).json({ success: false, message: 'Only the creator can view optimal times' });
        }

        const optimalTimes = await req.availabilityService.findOptimalTimes(pollId);

        console.log(`GET: /availability-polls/${pollId}/optimal-times - Viewed by ${req.user.userId}`);
        res.json({
            success: true,
            data: optimalTimes
        });

    } catch (error) {
        console.error(`GET /availability-polls/${req.params.pollId}/optimal-times failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
