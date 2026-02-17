const express = require('express');
const router = express.Router();
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const { requireMemberManagement } = require('../middlewares/orgPermissions');
const orgInviteService = require('../services/orgInviteService');

const BATCH_MAX = 30;

// Get pending invites for current user (must be before /:orgId)
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const invites = await orgInviteService.getPendingForUser(req);

        res.status(200).json({
            success: true,
            data: invites
        });
    } catch (error) {
        console.error('Error fetching pending invites:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending invites'
        });
    }
});

// Validate token (for register page - must be before /:orgId)
router.get('/validate/:token', verifyTokenOptional, async (req, res) => {
    try {
        const { token } = req.params;

        const result = await orgInviteService.validateToken(req, token);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired invitation'
            });
        }

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error validating token:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate invitation'
        });
    }
});

// Landing page - set cookie and redirect to register (public)
router.get('/landing/:token', async (req, res) => {
    try {
        const getModels = require('../services/getModelService');
        const { OrgInvite } = getModels(req, 'OrgInvite');

        const { token } = req.params;
        const invite = await OrgInvite.findOne({ token, status: 'pending' });

        if (!invite || new Date() > invite.expires_at) {
            const baseUrl = process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
            return res.redirect(`${baseUrl}/register?error=invalid_invite`);
        }

        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        res.cookie('org_invite_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge
        });

        const baseUrl = process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
        res.redirect(`${baseUrl}/register?invite=${token}`);
    } catch (error) {
        console.error('Error in invite landing:', error);
        const baseUrl = process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
        res.redirect(`${baseUrl}/register?error=invalid_invite`);
    }
});

// Accept invite by token (for email links)
router.post('/accept-by-token', verifyToken, async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required'
            });
        }

        const result = await orgInviteService.acceptInviteByToken(req, token);

        res.status(200).json({
            success: true,
            data: result,
            message: result.alreadyMember ? 'You are already a member' : 'Invitation accepted'
        });
    } catch (error) {
        console.error('Error accepting invite by token:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to accept invitation'
        });
    }
});

// Decline invite by token
router.post('/decline-by-token', verifyToken, async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required'
            });
        }

        await orgInviteService.declineInviteByToken(req, token);

        res.status(200).json({
            success: true,
            message: 'Invitation declined'
        });
    } catch (error) {
        console.error('Error declining invite by token:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to decline invitation'
        });
    }
});

// Create single invite
router.post('/:orgId/invite', verifyToken, requireMemberManagement('orgId'), async (req, res) => {
    try {
        const { orgId } = req.params;
        const { email, role = 'member' } = req.body;

        if (!email || !String(email).trim()) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const result = await orgInviteService.createInvite(req, orgId, email.trim(), role);

        res.status(201).json({
            success: true,
            data: result,
            message: 'Invitation sent successfully'
        });
    } catch (error) {
        console.error('Error creating invite:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to send invitation'
        });
    }
});

// Batch preview
router.post('/:orgId/batch-preview', verifyToken, requireMemberManagement('orgId'), async (req, res) => {
    try {
        const { orgId } = req.params;
        const { emails } = req.body;

        if (!Array.isArray(emails) || emails.length > BATCH_MAX) {
            return res.status(400).json({
                success: false,
                message: `Emails must be an array with max ${BATCH_MAX} items`
            });
        }

        const result = await orgInviteService.batchPreview(req, orgId, emails);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in batch preview:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to preview batch'
        });
    }
});

// Batch invite
router.post('/:orgId/invite-batch', verifyToken, requireMemberManagement('orgId'), async (req, res) => {
    try {
        const { orgId } = req.params;
        const { invites } = req.body;

        if (!Array.isArray(invites) || invites.length > BATCH_MAX) {
            return res.status(400).json({
                success: false,
                message: `Invites must be an array with max ${BATCH_MAX} items`
            });
        }

        const result = await orgInviteService.createBatchInvites(req, orgId, invites);

        res.status(200).json({
            success: true,
            data: result,
            message: `${result.sent} invitation(s) sent`
        });
    } catch (error) {
        console.error('Error in batch invite:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to send invitations'
        });
    }
});

// Accept invite by ID
router.post('/:inviteId/accept', verifyToken, async (req, res) => {
    try {
        const { inviteId } = req.params;

        const result = await orgInviteService.acceptInvite(req, inviteId);

        res.status(200).json({
            success: true,
            data: result,
            message: result.alreadyMember ? 'You are already a member' : 'Invitation accepted'
        });
    } catch (error) {
        console.error('Error accepting invite:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to accept invitation'
        });
    }
});

// Decline invite by ID
router.post('/:inviteId/decline', verifyToken, async (req, res) => {
    try {
        const { inviteId } = req.params;

        await orgInviteService.declineInvite(req, inviteId);

        res.status(200).json({
            success: true,
            message: 'Invitation declined'
        });
    } catch (error) {
        console.error('Error declining invite:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to decline invitation'
        });
    }
});

// List org invites (admin)
router.get('/:orgId', verifyToken, requireMemberManagement('orgId'), async (req, res) => {
    try {
        const { orgId } = req.params;

        const invites = await orgInviteService.listOrgInvites(req, orgId);

        res.status(200).json({
            success: true,
            data: invites
        });
    } catch (error) {
        console.error('Error listing org invites:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list invites'
        });
    }
});

module.exports = router;
