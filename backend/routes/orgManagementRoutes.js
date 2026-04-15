const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const getModels = require('../services/getModelService');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { uploadImageToS3, upload } = require('../services/imageUploadService');
const { emitToOrgApprovalRoom } = require('../socket');
const { clean, isProfane } = require('../services/profanityFilterService');
const {
    getEffectivePolicyFromConfig,
    assertLifecycleTransition
} = require('../services/atlasPolicyService');
const { recordMemberJoined, recordMemberRemoved } = require('../services/orgMembershipService');
const budgetService = require('../services/budgetService');
const adminTenantSummaryService = require('../services/adminTenantSummaryService');
const adminTenantEventsService = require('../services/adminTenantEventsService');
const adminTenantEventOperatorService = require('../services/adminTenantEventOperatorService');
const rootOperatorUsersService = require('../services/rootOperatorUsersService');

const router = express.Router();

/** Org schema has no timestamps; derive a stable created time from _id when createdAt is missing. */
function resolveOrgCreatedAt(plainOrg) {
    const raw = plainOrg.createdAt || plainOrg.created_at;
    if (raw != null && raw !== '') {
        const d = raw instanceof Date ? raw : new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (plainOrg._id != null && mongoose.Types.ObjectId.isValid(plainOrg._id)) {
        try {
            return new mongoose.Types.ObjectId(String(plainOrg._id)).getTimestamp();
        } catch (e) {
            return undefined;
        }
    }
    return undefined;
}

const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size exceeds 5MB limit.'
            });
        }
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next();
};

// ==================== VERIFICATION REQUESTS ====================

// Submit a verification request
router.post('/verification-requests', verifyToken, async (req, res) => {
    const { OrgVerification, Org, OrgManagementConfig } = getModels(req, 'OrgVerification', 'Org', 'OrgManagementConfig');
    const { orgId, requestType, requestData, priority, tags, verificationType } = req.body;
    const userId = req.user.userId;

    try {
        // Check if verification is enabled
        const config = await OrgManagementConfig.findOne();
        if (!config?.verificationEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Verification requests are currently disabled'
            });
        }

        // Verify org exists and user has permission
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is org owner or has management role
        const { OrgMember } = getModels(req, 'OrgMember');
        const membership = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (!membership || !['owner', 'admin'].includes(membership.role)) {
            return res.status(403).json({
                success: false,
                message: 'You must be an owner or admin of the organization to submit verification requests'
            });
        }

        // Check if request type is allowed
        const allowedRequestTypes = Array.isArray(config.allowedRequestTypes) ? config.allowedRequestTypes : [];
        if (Array.isArray(allowedRequestTypes) && allowedRequestTypes.length > 0 && !allowedRequestTypes.includes(requestType)) {
            return res.status(400).json({
                success: false,
                message: 'This request type is not currently allowed'
            });
        }
        
        // Validate and set verification tier (can be at top level or in requestData)
        const verificationTiers = config.verificationTiers || {};
        let finalVerificationType = verificationType || requestData?.verificationType || config.defaultVerificationType || 'basic';
        
        // For verification and status_upgrade requests, validate the tier
        if (requestType === 'verification' || requestType === 'status_upgrade') {
            if (!verificationTiers[finalVerificationType]) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid verification tier. Please select a valid verification tier from the configuration.'
                });
            }
        }

        // Create verification request
        const verificationRequest = new OrgVerification({
            orgId,
            requestedBy: userId,
            requestType,
            verificationType: finalVerificationType,
            requestData: requestData || {},
            priority: priority || 'medium',
            tags: tags || []
        });

        await verificationRequest.save();

        console.log(`POST: /org-management/verification-requests - Request submitted for org ${orgId}`);
        res.status(201).json({
            success: true,
            message: 'Verification request submitted successfully',
            data: verificationRequest
        });
    } catch (error) {
        console.error('Error submitting verification request:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting verification request',
            error: error.message
        });
    }
});

// Get verification requests (with filtering)
router.get('/verification-requests', verifyToken, async (req, res) => {
    const { OrgVerification, Org, User } = getModels(req, 'OrgVerification', 'Org', 'User');
    const { status, requestType, priority, orgId, page = 1, limit = 20, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    const userId = req.user.userId;

    try {
        const filter = {};
        if (status) filter.status = status;
        if (requestType) filter.requestType = requestType;
        if (priority) filter.priority = priority;
        
        // If not admin/root, only show requests for user's orgs
        if (!['admin', 'root'].includes(req.user.role)) {
            const { OrgMember } = getModels(req, 'OrgMember');
            const userOrgs = await OrgMember.find({ user_id: userId, role: { $in: ['owner', 'admin'] } }).distinct('org_id');
            const userOrgIds = userOrgs.map(id => id.toString());
            
            if (orgId) {
                // If orgId is specified, verify user has access to that org
                if (userOrgIds.includes(orgId.toString())) {
                    filter.orgId = orgId;
                } else {
                    // User doesn't have access, return empty result
                    filter.orgId = { $in: [] };
                }
            } else {
                filter.orgId = { $in: userOrgs };
            }
        } else {
            // Admin/root can filter by any orgId
            if (orgId) filter.orgId = orgId;
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const requests = await OrgVerification.find(filter)
            .populate('orgId', 'org_name org_description org_profile_image')
            .populate('requestedBy', 'username name email')
            .populate('reviewedBy', 'username name')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await OrgVerification.countDocuments(filter);

        console.log(`GET: /org-management/verification-requests - Retrieved ${requests.length} requests`);
        res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching verification requests:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching verification requests',
            error: error.message
        });
    }
});

// Review verification request
router.put('/verification-requests/:requestId', verifyToken, requireAdmin, async (req, res) => {
    const { OrgVerification, Org, User } = getModels(req, 'OrgVerification', 'Org', 'User');
    const { requestId } = req.params;
    const { status, reviewNotes } = req.body;
    const reviewerId = req.user.userId;

    try {
        const request = await OrgVerification.findById(requestId)
            .populate('orgId')
            .populate('requestedBy');

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Verification request not found'
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Request has already been reviewed'
            });
        }

        // Update request
        request.status = status;
        request.reviewedBy = reviewerId;
        request.reviewedAt = new Date();
        request.reviewNotes = reviewNotes;

        await request.save();

        // If approved, update org verification status and type
        if (status === 'approved' && (request.requestType === 'verification' || request.requestType === 'status_upgrade')) {
            const org = await Org.findById(request.orgId._id);
            if (org) {
                org.verified = true;
                org.verifiedAt = new Date();
                org.verifiedBy = reviewerId;
                org.verificationType = request.verificationType;
                org.verificationStatus = status;
                await org.save();
            }
        } else if (status === 'conditionally_approved') {
            const org = await Org.findById(request.orgId._id);
            if (org) {
                org.verificationStatus = status;
                org.verificationType = request.verificationType;
                await org.save();
            }
        }

        console.log(`PUT: /org-management/verification-requests/${requestId} - Request ${status}`);
        res.status(200).json({
            success: true,
            message: `Request ${status} successfully`,
            data: request
        });
    } catch (error) {
        console.error('Error reviewing verification request:', error);
        res.status(500).json({
            success: false,
            message: 'Error reviewing verification request',
            error: error.message
        });
    }
});

// ==================== PENDING APPROVALS ====================

// Get orgs pending approval (admin/root only)
router.get('/pending-approvals', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');

    try {
        const orgs = await Org.find({ approvalStatus: 'pending' })
            .populate('owner', 'username name email')
            .sort({ createdAt: -1 })
            .lean();

        const orgsWithCount = await Promise.all(orgs.map(async (org) => {
            const memberCount = await OrgMember.countDocuments({ org_id: org._id, status: 'active' });
            return {
                ...org,
                memberCount
            };
        }));

        console.log(`GET: /org-management/pending-approvals - Retrieved ${orgsWithCount.length} pending orgs`);
        res.status(200).json({
            success: true,
            data: orgsWithCount
        });
    } catch (error) {
        console.error('Error fetching pending approvals:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending approvals',
            error: error.message
        });
    }
});

// ==================== CONFIGURATION MANAGEMENT ====================

// Messaging defaults from orgManagementConfig schema (so clients always get min/max limits)
const MESSAGING_SCHEMA_DEFAULTS = {
    minCharacterLimit: 100,
    maxCharacterLimit: 2000,
    defaultCharacterLimit: 500,
    defaultVisibility: 'members_and_followers'
};

// Get management configuration (readable by any authenticated user for messaging limits etc.; write remains admin/root)
router.get('/config', verifyToken, async (req, res) => {
    const { OrgManagementConfig } = getModels(req, 'OrgManagementConfig');

    try {
        let config = await OrgManagementConfig.findOne();
        
        if (!config) {
            // Create default config if none exists
            config = new OrgManagementConfig();
            await config.save();
        }

        const data = config.toObject ? config.toObject() : config;
        if (!data.messaging || typeof data.messaging !== 'object') {
            data.messaging = { ...MESSAGING_SCHEMA_DEFAULTS };
        } else {
            data.messaging = { ...MESSAGING_SCHEMA_DEFAULTS, ...data.messaging };
        }
        data.atlasPolicy = getEffectivePolicyFromConfig(config);

        console.log(`GET: /org-management/config`);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error fetching management config:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching management configuration',
            error: error.message
        });
    }
});

router.get('/onboarding-config', verifyToken, async (req, res) => {
    const { OrgManagementConfig } = getModels(req, 'OrgManagementConfig');
    try {
        let config = await OrgManagementConfig.findOne();
        if (!config) {
            config = new OrgManagementConfig();
            await config.save();
        }
        const defaults = {
            enabled: false,
            welcomeTitle: 'Welcome to your community',
            welcomeSubtitle:
                'A quick setup helps community managers and campus admins better support your interests.',
            collectName: true,
            collectInterests: true,
            enforceMinInterests: true,
            enforceMaxInterests: true,
            minInterests: 1,
            maxInterests: 6,
            customSteps: [],
        };
        const onboarding = { ...defaults, ...(config.userOnboarding || {}) };
        return res.status(200).json({
            success: true,
            data: onboarding,
        });
    } catch (error) {
        console.error('GET /org-management/onboarding-config failed:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to load onboarding config',
        });
    }
});

// Update management configuration
router.put('/config', verifyToken, requireAdmin, async (req, res) => {
    const { OrgManagementConfig } = getModels(req, 'OrgManagementConfig');
    const updates = req.body;

    try {
        console.log('incoming updates:', JSON.stringify(updates, null, 2));

        // Build $set object for nested updates
        const $set = {};
        
        // Process updates and convert to dot notation for $set
        Object.keys(updates).forEach(key => {
            // Skip special fields
            if (key === '_id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
                return;
            }

            // Check if this is a nested object
            if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
                // For nested objects, iterate through each property
                Object.keys(updates[key]).forEach(nestedKey => {
                    // Handle deeply nested objects (like notificationSettings)
                    if (typeof updates[key][nestedKey] === 'object' && updates[key][nestedKey] !== null && !Array.isArray(updates[key][nestedKey])) {
                        Object.keys(updates[key][nestedKey]).forEach(deepKey => {
                            const dotPath = `${key}.${nestedKey}.${deepKey}`;
                            $set[dotPath] = updates[key][nestedKey][deepKey];
                            console.log(`Setting ${dotPath} = ${updates[key][nestedKey][deepKey]}`);
                        });
                    } else {
                        // Use dot notation for primitive values
                        const dotPath = `${key}.${nestedKey}`;
                        $set[dotPath] = updates[key][nestedKey];
                        console.log(`Setting ${dotPath} = ${updates[key][nestedKey]}`);
                    }
                });
            } else {
                // Direct assignment for primitive values or arrays
                $set[key] = updates[key];
                console.log(`Setting ${key} = ${updates[key]}`);
            }
        });

        console.log('$set object:', JSON.stringify($set, null, 2));

        // Use findOneAndUpdate with $set for proper nested updates
        const config = await OrgManagementConfig.findOneAndUpdate(
            {},
            { $set: $set },
            { new: true, upsert: true, runValidators: true }
        );

        console.log('config after updates:', JSON.stringify(config.toObject(), null, 2));

        console.log(`PUT: /org-management/config - Configuration updated`);
        res.status(200).json({
            success: true,
            message: 'Configuration updated successfully',
            data: config
        });
    } catch (error) {
        console.error('Error updating management config:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating management configuration',
            error: error.message
        });
    }
});

// ==================== ADMIN TENANT (read-only summary & events) ====================

router.get(
    '/admin-tenant-summary',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const data = await adminTenantSummaryService.getAdminTenantSummary(req);
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/admin-tenant-summary failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load admin tenant summary',
            });
        }
    }
);

router.get(
    '/admin-tenant-events',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const page = parseInt(String(req.query.page || '1'), 10);
            const limit = parseInt(String(req.query.limit || '20'), 10);
            const q = typeof req.query.q === 'string' ? req.query.q : '';
            const includePast = ['1', 'true', 'yes'].includes(String(req.query.includePast || '').toLowerCase());
            const data = await adminTenantEventsService.listAdminTenantUpcomingEvents(req, {
                page,
                limit,
                q,
                includePast,
            });
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/admin-tenant-events failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load admin tenant events',
            });
        }
    }
);

router.get(
    '/admin-tenant-events/:eventId/dashboard',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { eventId } = req.params;
            const data = await adminTenantEventOperatorService.getAdminTenantEventDashboard(req, eventId);
            if (!data) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/admin-tenant-events/:eventId/dashboard failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load event dashboard',
            });
        }
    }
);

router.get(
    '/admin-tenant-events/:eventId/registration-responses',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { eventId } = req.params;
            const data = await adminTenantEventOperatorService.getAdminTenantEventRegistrationResponses(req, eventId);
            if (!data) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error(
                'GET /org-management/admin-tenant-events/:eventId/registration-responses failed:',
                error
            );
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load registration responses',
            });
        }
    }
);

router.get(
    '/admin-tenant-events/:eventId/rsvp-growth',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { eventId } = req.params;
            const data = await adminTenantEventOperatorService.getAdminTenantEventRsvpGrowth(req, eventId, {
                timezone: req.query.timezone,
            });
            if (!data) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/admin-tenant-events/:eventId/rsvp-growth failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load RSVP growth',
            });
        }
    }
);

// ==================== ROOT / COMMUNITY DASHBOARD: PEOPLE & ACCESS ====================

router.get(
    '/root-operator-user-stats',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const data = await rootOperatorUsersService.getRootOperatorUserStats(req);
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/root-operator-user-stats failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to load user statistics',
            });
        }
    }
);

router.get(
    '/root-operator-users',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const q = typeof req.query.q === 'string' ? req.query.q : '';
            const limit = parseInt(String(req.query.limit || '25'), 10);
            const role = typeof req.query.role === 'string' ? req.query.role : '';
            const data = await rootOperatorUsersService.searchRootOperatorUsers(req, { q, limit, role });
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET /org-management/root-operator-users failed:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to search users',
            });
        }
    }
);

router.post(
    '/root-operator-users/:userId/role',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { userId } = req.params;
            const { role, assign } = req.body || {};
            const data = await rootOperatorUsersService.setRootOperatorUserRole(req, {
                userId,
                role,
                assign: assign === true || assign === 'true',
            });
            res.status(200).json({ success: true, data });
        } catch (error) {
            const status = error.statusCode || 500;
            console.error('POST /org-management/root-operator-users/:userId/role failed:', error);
            res.status(status).json({
                success: false,
                message: error.message || 'Failed to update role',
            });
        }
    }
);

router.patch(
    '/root-operator-users/:userId/access',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { userId } = req.params;
            const { accessSuspended } = req.body || {};
            const data = await rootOperatorUsersService.setRootOperatorAccessSuspended(req, {
                userId,
                accessSuspended: accessSuspended === true || accessSuspended === 'true',
            });
            res.status(200).json({ success: true, data });
        } catch (error) {
            const status = error.statusCode || 500;
            console.error('PATCH /org-management/root-operator-users/:userId/access failed:', error);
            res.status(status).json({
                success: false,
                message: error.message || 'Failed to update access',
            });
        }
    }
);

router.get(
    '/user-onboarding-responses-summary',
    verifyToken,
    authorizeRoles('admin', 'developer', 'beta'),
    async (req, res) => {
        try {
            const { User, OrgManagementConfig } = getModels(req, 'User', 'OrgManagementConfig');
            const config = await OrgManagementConfig.findOne().lean();
            const onboardingConfig = config?.userOnboarding || {};
            const customSteps = Array.isArray(onboardingConfig.customSteps) ? onboardingConfig.customSteps : [];

            const users = await User.find({})
                .select('tags onboardingResponses')
                .lean();

            const summary = {
                totalUsers: users.length,
                interests: {
                    totalTaggedUsers: 0,
                    optionCounts: {},
                },
                customSteps: customSteps.map((step) => ({
                    id: step.id,
                    label: step.label,
                    type: step.type,
                    required: !!step.required,
                    responseCount: 0,
                    optionCounts: {},
                    textSamples: [],
                })),
            };

            const stepMap = new Map(summary.customSteps.map((s) => [String(s.id), s]));

            users.forEach((user) => {
                const tags = Array.isArray(user.tags) ? user.tags : [];
                if (tags.length > 0) summary.interests.totalTaggedUsers += 1;
                tags.forEach((tag) => {
                    const key = String(tag || '').trim();
                    if (!key) return;
                    summary.interests.optionCounts[key] = (summary.interests.optionCounts[key] || 0) + 1;
                });

                const responses = user.onboardingResponses && typeof user.onboardingResponses === 'object'
                    ? user.onboardingResponses
                    : {};

                customSteps.forEach((step) => {
                    const s = stepMap.get(String(step.id));
                    if (!s) return;
                    const value = responses[step.id];
                    if (Array.isArray(value)) {
                        const cleaned = value.map((v) => String(v || '').trim()).filter(Boolean);
                        if (cleaned.length > 0) s.responseCount += 1;
                        cleaned.forEach((v) => {
                            s.optionCounts[v] = (s.optionCounts[v] || 0) + 1;
                        });
                        return;
                    }
                    const normalized = String(value || '').trim();
                    if (!normalized) return;
                    s.responseCount += 1;
                    if (step.type === 'single-select') {
                        s.optionCounts[normalized] = (s.optionCounts[normalized] || 0) + 1;
                    } else if (s.textSamples.length < 8) {
                        s.textSamples.push(normalized);
                    }
                });
            });

            return res.status(200).json({
                success: true,
                data: summary,
            });
        } catch (error) {
            console.error('GET /org-management/user-onboarding-responses-summary failed:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to load onboarding responses summary',
            });
        }
    }
);

// ==================== ORGANIZATION ANALYTICS ====================

function parseOrgOverviewTimeRange(rawRange) {
    const now = new Date();
    const range = ['7d', '30d', '90d', '1y'].includes(rawRange) ? rawRange : '30d';
    let startDate;
    switch (range) {
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        case '1y':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
        default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }
    return { range, startDate, endDate: now };
}

// New org overview endpoint backed by analytics_events (platform analytics pipeline)
router.get('/analytics/platform-overview', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, OrgVerification, AnalyticsEvent, Event } = getModels(
        req,
        'Org',
        'OrgMember',
        'OrgVerification',
        'AnalyticsEvent',
        'Event'
    );
    const { timeRange = '30d' } = req.query;

    try {
        const { range, startDate, endDate } = parseOrgOverviewTimeRange(timeRange);
        const match = {
            ts: { $gte: startDate, $lte: endDate },
            event: { $in: ['event_view', 'event_registration'] }
        };

        const [totalOrgs, verifiedOrgs, newOrgs, memberStats, verificationStats, totalsByType, trendRows, sourceRows] = await Promise.all([
            Org.countDocuments(),
            Org.countDocuments({ verified: true }),
            Org.countDocuments({ createdAt: { $gte: startDate } }),
            OrgMember.aggregate([
                {
                    $group: {
                        _id: null,
                        totalMembers: { $sum: 1 }
                    }
                }
            ]),
            OrgVerification.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            AnalyticsEvent.aggregate([
                { $match: match },
                { $group: { _id: '$event', count: { $sum: 1 } } }
            ]),
            AnalyticsEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
                            event: '$event'
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'event_view' } },
                {
                    $project: {
                        source: {
                            $ifNull: [
                                '$properties.source',
                                {
                                    $switch: {
                                        branches: [
                                            { case: { $regexMatch: { input: { $ifNull: ['$context.referrer', ''] }, regex: 'org/|club-dashboard' } }, then: 'org_page' },
                                            { case: { $regexMatch: { input: { $ifNull: ['$context.referrer', ''] }, regex: 'events-dashboard' } }, then: 'explore' }
                                        ],
                                        default: 'direct'
                                    }
                                }
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$source',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        const totalsMap = totalsByType.reduce((acc, row) => {
            acc[row._id] = row;
            return acc;
        }, {});
        const totalViews = totalsMap.event_view?.count || 0;
        const totalRegistrations = totalsMap.event_registration?.count || 0;
        const registrationRate = totalViews > 0 ? Number(((totalRegistrations / totalViews) * 100).toFixed(1)) : 0;
        const [uniqueViewActorCount, uniqueRegistrantActorCount] = await Promise.all([
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'event_view' } },
                {
                    $project: {
                        actor: {
                            $ifNull: [
                                { $concat: ['u:', { $toString: '$user_id' }] },
                                { $concat: ['a:', { $ifNull: ['$anonymous_id', ''] }] }
                            ]
                        }
                    }
                },
                { $match: { actor: { $ne: 'a:' } } },
                { $group: { _id: '$actor' } },
                { $count: 'count' }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'event_registration' } },
                {
                    $project: {
                        actor: {
                            $ifNull: [
                                { $concat: ['u:', { $toString: '$user_id' }] },
                                { $concat: ['a:', { $ifNull: ['$anonymous_id', ''] }] }
                            ]
                        }
                    }
                },
                { $match: { actor: { $ne: 'a:' } } },
                { $group: { _id: '$actor' } },
                { $count: 'count' }
            ])
        ]);
        const uniqueViewers = uniqueViewActorCount[0]?.count || 0;
        const uniqueRegistrants = uniqueRegistrantActorCount[0]?.count || 0;

        const trendMap = {};
        for (const row of trendRows) {
            const date = row._id?.date;
            const event = row._id?.event;
            if (!date) continue;
            if (!trendMap[date]) trendMap[date] = { date, views: 0, registrations: 0 };
            if (event === 'event_view') trendMap[date].views = row.count;
            if (event === 'event_registration') trendMap[date].registrations = row.count;
        }
        const trends = Object.values(trendMap).sort((a, b) => (a.date < b.date ? -1 : 1));

        const viewSources = { direct: 0, explore: 0, org_page: 0, email: 0, qr: 0 };
        for (const row of sourceRows) {
            const key = String(row._id || '').toLowerCase();
            if (Object.prototype.hasOwnProperty.call(viewSources, key)) {
                viewSources[key] = row.count;
            } else {
                viewSources.direct += row.count;
            }
        }

        const topEventCounts = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ts: { $gte: startDate, $lte: endDate },
                    event: { $in: ['event_view', 'event_registration'] },
                    'properties.event_id': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        eventId: { $toString: '$properties.event_id' },
                        event: '$event'
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const topEventIds = [...new Set(topEventCounts.map((r) => r?._id?.eventId).filter(Boolean))];
        const topEventObjIds = topEventIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        const eventRows = topEventObjIds.length
            ? await Event.find({
                _id: { $in: topEventObjIds },
                hostingType: 'Org'
            }).select('_id hostingId').lean()
            : [];
        const eventToOrgMap = new Map(eventRows.map((row) => [String(row._id), String(row.hostingId)]));

        const orgMetricMap = new Map();
        for (const row of topEventCounts) {
            const eventId = row?._id?.eventId ? String(row._id.eventId) : '';
            const orgId = eventToOrgMap.get(eventId) || '';
            if (!orgId) continue;
            if (!orgMetricMap.has(orgId)) orgMetricMap.set(orgId, { orgId, views: 0, registrations: 0 });
            const current = orgMetricMap.get(orgId);
            if (row?._id?.event === 'event_view') current.views = row.count;
            if (row?._id?.event === 'event_registration') current.registrations = row.count;
        }

        const rankedOrgMetrics = [...orgMetricMap.values()]
            .map((row) => ({ ...row, score: row.views + row.registrations * 4 }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);

        const orgDocs = rankedOrgMetrics.length
            ? await Org.find({ _id: { $in: rankedOrgMetrics.map((r) => r.orgId) } }).select('org_name').lean()
            : [];
        const orgNameMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o.org_name || 'Unknown org']));

        const topOrganizations = rankedOrgMetrics.map((row) => ({
            orgId: row.orgId,
            orgName: orgNameMap[row.orgId] || 'Unknown org',
            views: row.views,
            registrations: row.registrations,
            score: row.score
        }));

        res.status(200).json({
            success: true,
            data: {
                timeRange: range,
                window: { startDate, endDate },
                overview: {
                    totalOrgs,
                    verifiedOrgs,
                    newOrgs,
                    totalMembers: memberStats[0]?.totalMembers || 0,
                    pendingVerificationRequests: verificationStats.find((s) => s._id === 'pending')?.count || 0
                },
                engagement: {
                    totalViews,
                    totalRegistrations,
                    registrationRate,
                    uniqueViewers,
                    uniqueRegistrants
                },
                trends,
                viewSources,
                topOrganizations
            }
        });
    } catch (error) {
        console.error('Error fetching org platform overview analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching org platform overview analytics',
            error: error.message
        });
    }
});

// Get organization analytics
router.get('/analytics', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, Event, OrgVerification } = getModels(req, 'Org', 'OrgMember', 'Event', 'OrgVerification');
    const { timeRange = '30d' } = req.query;

    try {
        const now = new Date();
        let startDate;
        
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Get basic counts
        const totalOrgs = await Org.countDocuments();
        const verifiedOrgs = await Org.countDocuments({ verified: true });
        const newOrgs = await Org.countDocuments({ createdAt: { $gte: startDate } });
        
        // Get member statistics
        const memberStats = await OrgMember.aggregate([
            {
                $group: {
                    _id: null,
                    totalMembers: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user_id' }
                }
            }
        ]);

        // Get event statistics
        const eventStats = await Event.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate },
                    hostingType: 'Org'
                }
            },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    uniqueOrgs: { $addToSet: '$hostingId' }
                }
            }
        ]);

        // Get verification request statistics
        const verificationStats = await OrgVerification.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get top organizations by member count
        const topOrgs = await OrgMember.aggregate([
            {
                $group: {
                    _id: '$org_id',
                    memberCount: { $sum: 1 }
                }
            },
            {
                $sort: { memberCount: -1 }
            },
            {
                $limit: 10
            },
            {
                $lookup: {
                    from: 'orgs',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'org'
                }
            },
            {
                $unwind: '$org'
            },
            {
                $project: {
                    orgName: '$org.org_name',
                    memberCount: 1
                }
            }
        ]);

        const analytics = {
            overview: {
                totalOrgs,
                verifiedOrgs,
                newOrgs,
                totalMembers: memberStats[0]?.totalMembers || 0,
                uniqueUsers: memberStats[0]?.uniqueUsers?.length || 0,
                totalEvents: eventStats[0]?.totalEvents || 0,
                activeOrgs: eventStats[0]?.uniqueOrgs?.length || 0
            },
            verificationRequests: verificationStats.reduce((acc, stat) => {
                acc[stat._id] = stat.count;
                return acc;
            }, {}),
            topOrganizations: topOrgs,
            timeRange
        };

        console.log(`GET: /org-management/analytics - Analytics retrieved for ${timeRange}`);
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
});

// ==================== ORGANIZATION MANAGEMENT ====================

// Draft governance versions awaiting platform admin approval (must be before /organizations/:orgId)
router.get('/governance/pending-drafts', verifyToken, requireAdmin, async (req, res) => {
    const { Org } = getModels(req, 'Org');
    try {
        const orgs = await Org.find({
            'governanceDocuments.versions.status': 'draft'
        })
            .select('org_name org_profile_image governanceDocuments')
            .lean();

        const rows = [];
        for (const org of orgs) {
            for (const slot of org.governanceDocuments || []) {
                for (const ver of slot.versions || []) {
                    if (ver.status === 'draft') {
                        rows.push({
                            orgId: org._id.toString(),
                            orgName: org.org_name,
                            orgProfileImage: org.org_profile_image || null,
                            docKey: slot.key,
                            version: ver.version,
                            uploadedAt: ver.uploadedAt,
                            originalFilename: ver.originalFilename || null,
                            storageUrl: ver.storageUrl || null
                        });
                    }
                }
            }
        }
        rows.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error listing pending governance drafts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all organizations with management data
router.get('/organizations', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, Event } = getModels(req, 'Org', 'OrgMember', 'Event');
    const {
        search,
        status,
        lifecycleStatus,
        verified,
        page: pageRaw = 1,
        limit: limitRaw = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    try {
        const filter = {};
        
        if (search) {
            filter.$or = [
                { org_name: { $regex: search, $options: 'i' } },
                { org_description: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) filter.status = status;
        if (lifecycleStatus) filter.lifecycleStatus = lifecycleStatus;
        // Only apply when explicitly requested; missing/undefined verified must not imply false
        if (verified === 'true' || verified === 'false') {
            filter.verified = verified === 'true';
        }

        const pageNum = Math.max(1, parseInt(String(pageRaw), 10) || 1);
        const limitParsed = parseInt(String(limitRaw), 10);
        const limitNum = Number.isFinite(limitParsed) && limitParsed > 0
            ? Math.min(limitParsed, 100)
            : 20;

        const skip = (pageNum - 1) * limitNum;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        console.log(filter);

        const orgs = await Org.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        // Get additional data for each org
        const orgsWithData = await Promise.all(orgs.map(async (org) => {
            const memberCount = await OrgMember.countDocuments({ org_id: org._id });
            const eventCount = await Event.countDocuments({ 
                hostingId: org._id, 
                hostingType: 'Org',
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });

            const plain = org.toObject();
            const createdAt = resolveOrgCreatedAt(plain);
            const createdAtOut =
                createdAt != null && !Number.isNaN(createdAt.getTime()) ? createdAt : null;

            return {
                ...plain,
                createdAt: createdAtOut,
                memberCount,
                recentEventCount: eventCount
            };
        }));

        const total = await Org.countDocuments(filter);

        console.log(`GET: /org-management/organizations - Retrieved ${orgsWithData.length} organizations`);
        const totalPages = Math.max(1, Math.ceil(total / limitNum));

        res.status(200).json({
            success: true,
            data: orgsWithData,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages
            }
        });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching organizations',
            error: error.message
        });
    }
});

// Export organizations data (must be before /organizations/:orgId to avoid route conflict)
router.get('/organizations/export', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, Event } = getModels(req, 'Org', 'OrgMember', 'Event');
    const { format = 'json' } = req.query;

    try {
        const orgs = await Org.find({}).lean();

        const orgsWithData = await Promise.all(orgs.map(async (org) => {
            const memberCount = await OrgMember.countDocuments({ org_id: org._id });
            const eventCount = await Event.countDocuments({ hostingId: org._id, hostingType: 'Org' });

            return {
                ...org,
                memberCount,
                totalEventCount: eventCount
            };
        }));

        if (format === 'csv') {
            const csvHeaders = ['Name', 'Description', 'Members', 'Events', 'Verified', 'Created At'];
            const csvData = orgsWithData.map(org => [
                org.org_name,
                org.org_description,
                org.memberCount,
                org.totalEventCount,
                org.verified ? 'Yes' : 'No',
                new Date(org.createdAt).toLocaleDateString()
            ]);

            const csvContent = [csvHeaders, ...csvData]
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="organizations.csv"');
            res.send(csvContent);
        } else {
            res.status(200).json({
                success: true,
                data: orgsWithData
            });
        }

        console.log(`GET: /org-management/organizations/export - Data exported in ${format} format`);
    } catch (error) {
        console.error('Error exporting organizations:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting organizations',
            error: error.message
        });
    }
});

/** Platform admin: org-hosted events time window for snapshot / list. */
function parseAdminOrgEventTime(query) {
    const range = ['7d', '30d', '90d', '1y'].includes(query.range) ? query.range : '30d';
    const windowMode = query.window === 'upcoming' ? 'upcoming' : 'past';
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeMs =
        range === '7d' ? 7 * dayMs
            : range === '90d' ? 90 * dayMs
                : range === '1y' ? 365 * dayMs
                    : 30 * dayMs;
    let startDate;
    let endDate;
    if (windowMode === 'past') {
        endDate = now;
        startDate = new Date(now.getTime() - rangeMs);
    } else {
        startDate = now;
        endDate = new Date(now.getTime() + rangeMs);
    }
    return { startDate, endDate, range, windowMode };
}

function adminOrgEventEngagementScore(ev, an) {
    const attendeeCount = ev.registrationCount ?? (Array.isArray(ev.attendees) ? ev.attendees.length : 0);
    const ur = an?.uniqueRegistrations ?? 0;
    const r = an?.registrations ?? 0;
    const uv = an?.uniqueViews ?? 0;
    const v = an?.views ?? 0;
    return ur * 5 + r * 2 + attendeeCount * 3 + uv * 0.08 + v * 0.02 + (ev.expectedAttendance || 0) * 0.05;
}

function deriveEventViewSource(raw) {
    const source = raw?.properties?.source;
    if (['org_page', 'explore', 'direct', 'email'].includes(source)) return source;
    const referrer = String(raw?.context?.referrer || '');
    if (referrer.includes('org/') || referrer.includes('club-dashboard')) return 'org_page';
    if (referrer.includes('events-dashboard')) return 'explore';
    return 'direct';
}

function buildAnalyticsEventIdMatch(eventIds) {
    const strIds = [...new Set((eventIds || []).map((id) => String(id)).filter(Boolean))];
    const objIds = strIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    return {
        strIds,
        match: {
            $or: [
                { 'properties.event_id': { $in: strIds } },
                { 'properties.event_id': { $in: objIds } }
            ]
        }
    };
}

function finalizeAnalyticsBuckets(bucketMap) {
    const out = new Map();
    for (const [eventId, b] of bucketMap.entries()) {
        out.set(eventId, {
            views: b.views,
            uniqueViews: b.uniqueViewActors.size,
            anonymousViews: b.anonymousViews,
            uniqueAnonymousViews: b.uniqueAnonymousActors.size,
            registrations: b.registrations,
            uniqueRegistrations: b.uniqueRegistrationActors.size,
            sources: b.sources
        });
    }
    return out;
}

async function buildAnalyticsByEventId(AnalyticsEvent, eventIds) {
    const { strIds, match } = buildAnalyticsEventIdMatch(eventIds);
    if (!strIds.length) return new Map();

    const rows = await AnalyticsEvent.find({
        event: { $in: ['event_view', 'event_registration'] },
        ...match
    })
        .select('event user_id anonymous_id session_id properties context ts')
        .lean();

    const targetIds = new Set(strIds);
    const buckets = new Map();

    for (const row of rows) {
        const eventId = row?.properties?.event_id != null ? String(row.properties.event_id) : '';
        if (!targetIds.has(eventId)) continue;
        if (!buckets.has(eventId)) {
            buckets.set(eventId, {
                views: 0,
                registrations: 0,
                anonymousViews: 0,
                uniqueViewActors: new Set(),
                uniqueAnonymousActors: new Set(),
                uniqueRegistrationActors: new Set(),
                sources: { org_page: 0, explore: 0, direct: 0, email: 0 }
            });
        }
        const b = buckets.get(eventId);
        const userKey = row.user_id ? `u:${String(row.user_id)}` : '';
        const anonKey = row.anonymous_id ? `a:${String(row.anonymous_id)}` : '';
        const sessionKey = row.session_id ? `s:${String(row.session_id)}` : '';
        const actor = userKey || anonKey || sessionKey || `e:${String(row._id)}`;

        if (row.event === 'event_view') {
            b.views += 1;
            b.uniqueViewActors.add(actor);
            if (!userKey) {
                b.anonymousViews += 1;
                b.uniqueAnonymousActors.add(actor);
            }
            const source = deriveEventViewSource(row);
            if (Object.prototype.hasOwnProperty.call(b.sources, source)) b.sources[source] += 1;
        }

        if (row.event === 'event_registration') {
            b.registrations += 1;
            b.uniqueRegistrationActors.add(actor);
        }
    }

    return finalizeAnalyticsBuckets(buckets);
}

// Admin: ranked "best" events in a time window (by engagement heuristics)
router.get('/organizations/:orgId/events/snapshot', verifyToken, requireAdmin, async (req, res) => {
    const { Event, AnalyticsEvent } = getModels(req, 'Event', 'AnalyticsEvent');
    const { orgId } = req.params;
    const topN = Math.min(Math.max(parseInt(String(req.query.top || '5'), 10) || 5, 1), 25);
    const { startDate, endDate, range, windowMode } = parseAdminOrgEventTime(req.query);

    try {
        const filter = {
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false,
            start_time: { $gte: startDate, $lte: endDate }
        };

        const events = await Event.find(filter)
            .select('name type start_time end_time location status registrationCount attendees expectedAttendance image')
            .lean();

        const ids = events.map((e) => e._id);
        const analyticsById = await buildAnalyticsByEventId(AnalyticsEvent, ids);

        const enriched = events.map((ev) => {
            const an = analyticsById.get(String(ev._id));
            const attendeeCount = ev.registrationCount ?? (Array.isArray(ev.attendees) ? ev.attendees.length : 0);
            const score = adminOrgEventEngagementScore(ev, an);
            return {
                _id: ev._id,
                name: ev.name,
                type: ev.type,
                start_time: ev.start_time,
                end_time: ev.end_time,
                location: ev.location,
                status: ev.status,
                image: ev.image,
                expectedAttendance: ev.expectedAttendance,
                registrationCount: attendeeCount,
                analytics: {
                    views: an?.views ?? 0,
                    uniqueViews: an?.uniqueViews ?? 0,
                    registrations: an?.registrations ?? 0,
                    uniqueRegistrations: an?.uniqueRegistrations ?? 0
                },
                score
            };
        });
        enriched.sort((a, b) => b.score - a.score);
        const topEvents = enriched.slice(0, topN);

        res.status(200).json({
            success: true,
            data: {
                range,
                window: windowMode,
                startDate,
                endDate,
                totalInRange: enriched.length,
                topEvents
            }
        });
    } catch (error) {
        console.error('Error building org event snapshot (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Error loading event snapshot',
            error: error.message
        });
    }
});

// Admin: paginated events in window (optional sort by engagement score)
router.get('/organizations/:orgId/events', verifyToken, requireAdmin, async (req, res) => {
    const { Event, AnalyticsEvent } = getModels(req, 'Event', 'AnalyticsEvent');
    const { orgId } = req.params;
    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limitNum = Math.min(Math.max(parseInt(String(req.query.limit || '15'), 10) || 15, 1), 50);
    const sort = req.query.sort === 'start_time' ? 'start_time' : 'engagement';
    const { startDate, endDate, range, windowMode } = parseAdminOrgEventTime(req.query);

    try {
        const filter = {
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false,
            start_time: { $gte: startDate, $lte: endDate }
        };

        const events = await Event.find(filter)
            .select('name type start_time end_time location status registrationCount attendees expectedAttendance image')
            .lean();

        const ids = events.map((e) => e._id);
        const analyticsById = await buildAnalyticsByEventId(AnalyticsEvent, ids);

        const enriched = events.map((ev) => {
            const an = analyticsById.get(String(ev._id));
            const attendeeCount = ev.registrationCount ?? (Array.isArray(ev.attendees) ? ev.attendees.length : 0);
            const score = adminOrgEventEngagementScore(ev, an);
            return {
                _id: ev._id,
                name: ev.name,
                type: ev.type,
                start_time: ev.start_time,
                end_time: ev.end_time,
                location: ev.location,
                status: ev.status,
                image: ev.image,
                expectedAttendance: ev.expectedAttendance,
                registrationCount: attendeeCount,
                analytics: {
                    views: an?.views ?? 0,
                    uniqueViews: an?.uniqueViews ?? 0,
                    registrations: an?.registrations ?? 0,
                    uniqueRegistrations: an?.uniqueRegistrations ?? 0
                },
                score
            };
        });

        if (sort === 'start_time') {
            enriched.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        } else {
            enriched.sort((a, b) => b.score - a.score);
        }

        const total = enriched.length;
        const skip = (pageNum - 1) * limitNum;
        const pageRows = enriched.slice(skip, skip + limitNum);

        res.status(200).json({
            success: true,
            data: {
                range,
                window: windowMode,
                startDate,
                endDate,
                events: pageRows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limitNum))
                }
            }
        });
    } catch (error) {
        console.error('Error listing org events (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Error loading events',
            error: error.message
        });
    }
});

// Admin: deep engagement + ops snapshot for one org-hosted event
router.get('/organizations/:orgId/events/:eventId/engagement', verifyToken, requireAdmin, async (req, res) => {
    const { Event, AnalyticsEvent, EventAgenda, EventJob, VolunteerSignup, EventEquipment } = getModels(
        req,
        'Event',
        'AnalyticsEvent',
        'EventAgenda',
        'EventJob',
        'VolunteerSignup',
        'EventEquipment'
    );
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        })
            .populate('hostingId', 'org_name org_profile_image')
            .populate('collaboratorOrgs.orgId', 'org_name org_profile_image')
            .lean();

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const analyticsByEvent = await buildAnalyticsByEventId(AnalyticsEvent, [eventId]);
        const analytics = analyticsByEvent.get(String(eventId)) || null;
        const agenda = await EventAgenda.findOne({ eventId }).lean();
        const roles = await EventJob.find({ eventId }).lean();
        const totalVolunteers = roles.reduce((sum, role) => sum + (role.assignments?.length || 0), 0);
        const confirmedVolunteers = roles.reduce(
            (sum, role) => sum + (role.assignments?.filter((a) => a.status === 'confirmed')?.length || 0),
            0
        );
        const signups = await VolunteerSignup.find({ eventId }).populate('memberId', 'name email').lean();
        const equipment = await EventEquipment.findOne({ eventId }).lean();

        const registrationCount = event.registrationCount ?? (event.attendees?.length ?? 0);
        const checkedInCount = signups.filter((s) => s.checkedIn).length;

        let eventCheckIn = null;
        if (event.checkInEnabled && event.attendees && Array.isArray(event.attendees)) {
            const totalCheckedIn = event.attendees.filter((a) => a.checkedIn).length;
            const totalRegistrations = event.registrationCount ?? event.attendees.length;
            eventCheckIn = {
                totalCheckedIn,
                totalRegistrations,
                checkInRate: totalRegistrations > 0
                    ? ((totalCheckedIn / totalRegistrations) * 100).toFixed(1)
                    : '0'
            };
        }

        const now = new Date();
        let operationalStatus = 'upcoming';
        if (event.start_time <= now && event.end_time >= now) {
            operationalStatus = 'active';
        } else if (event.end_time < now) {
            operationalStatus = 'completed';
        }

        const { match } = buildAnalyticsEventIdMatch([eventId]);
        const historyRows = await AnalyticsEvent.find({
            event: { $in: ['event_view', 'event_registration'] },
            ...match
        })
            .select('event ts user_id anonymous_id session_id properties context')
            .sort({ ts: -1 })
            .limit(400)
            .lean();

        const viewHistory = historyRows
            .filter((r) => r.event === 'event_view')
            .slice(0, 40)
            .map((r) => ({
                timestamp: r.ts,
                isAnonymous: !r.user_id,
                source: deriveEventViewSource(r)
            }));

        const registrationHistory = historyRows
            .filter((r) => r.event === 'event_registration')
            .slice(0, 40)
            .map((r) => ({
                timestamp: r.ts,
                isAnonymous: !r.user_id
            }));

        res.status(200).json({
            success: true,
            data: {
                event,
                analytics: analytics
                    ? {
                        views: analytics.views,
                        uniqueViews: analytics.uniqueViews,
                        anonymousViews: analytics.anonymousViews,
                        uniqueAnonymousViews: analytics.uniqueAnonymousViews,
                        registrations: analytics.registrations,
                        uniqueRegistrations: analytics.uniqueRegistrations,
                        sources: analytics.sources || { org_page: 0, explore: 0, direct: 0, email: 0 },
                        viewHistorySample: viewHistory,
                        registrationHistorySample: registrationHistory
                    }
                    : {
                        views: 0,
                        uniqueViews: 0,
                        anonymousViews: 0,
                        uniqueAnonymousViews: 0,
                        registrations: 0,
                        uniqueRegistrations: 0,
                        sources: { org_page: 0, explore: 0, direct: 0, email: 0 },
                        viewHistorySample: [],
                        registrationHistorySample: []
                    },
                agenda: agenda || { items: [] },
                roles: {
                    total: roles.length,
                    assignments: totalVolunteers,
                    confirmed: confirmedVolunteers,
                    signups: signups.length
                },
                equipment: equipment || { items: [] },
                stats: {
                    registrationCount,
                    volunteers: {
                        total: totalVolunteers,
                        confirmed: confirmedVolunteers,
                        checkedIn: checkedInCount
                    },
                    operationalStatus,
                    checkIn: eventCheckIn
                }
            }
        });
    } catch (error) {
        console.error('Error loading org event engagement (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Error loading event engagement',
            error: error.message
        });
    }
});

// Get single organization by ID (admin only)
router.get('/organizations/:orgId', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, Event } = getModels(req, 'Org', 'OrgMember', 'Event');
    const { orgId } = req.params;

    try {
        const org = await Org.findById(orgId).populate('owner', 'username name email picture');
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const memberCount = await OrgMember.countDocuments({ org_id: orgId });
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentEventCount = await Event.countDocuments({
            hostingId: orgId,
            hostingType: 'Org',
            createdAt: { $gte: thirtyDaysAgo }
        });
        const totalEventCount = await Event.countDocuments({
            hostingId: orgId,
            hostingType: 'Org'
        });

        const plain = org.toObject();
        const createdResolved = resolveOrgCreatedAt(plain);
        const createdAtOut =
            createdResolved != null && !Number.isNaN(createdResolved.getTime())
                ? createdResolved
                : null;

        const orgWithData = {
            ...plain,
            createdAt: createdAtOut,
            memberCount,
            recentEventCount,
            totalEventCount
        };

        console.log(`GET: /org-management/organizations/${orgId} - Retrieved org`);
        res.status(200).json({
            success: true,
            data: orgWithData
        });
    } catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching organization',
            error: error.message
        });
    }
});

// Admin edit organization (name, description, images)
router.post('/organizations/:orgId/edit', verifyToken, requireAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 }
]), handleMulterError, async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const {
        org_name,
        org_description,
        org_profile_image,
        org_banner_image
    } = req.body;
    const profileFile = req.files?.image?.[0];
    const bannerFile = req.files?.bannerImage?.[0];

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        if (org_name) {
            const cleanOrgName = clean(org_name);
            if (isProfane(org_name)) {
                return res.status(400).json({
                    success: false,
                    message: 'Org name contains inappropriate language'
                });
            }
            const orgExist = await Org.findOne({ org_name: cleanOrgName });
            if (orgExist && orgExist._id.toString() !== orgId) {
                return res.status(400).json({
                    success: false,
                    message: 'Org name already taken'
                });
            }
            org.org_name = cleanOrgName;
        }

        if (org_description) {
            const cleanOrgDescription = clean(org_description);
            if (isProfane(org_description)) {
                return res.status(400).json({
                    success: false,
                    message: 'Description contains inappropriate language'
                });
            }
            org.org_description = cleanOrgDescription;
        }

        if (profileFile) {
            const fileExtension = path.extname(profileFile.originalname);
            const fileName = `${org._id}_profile${fileExtension}`;
            const imageUrl = await uploadImageToS3(profileFile, 'orgs', fileName);
            org.org_profile_image = imageUrl;
        } else if (org_profile_image !== undefined) {
            org.org_profile_image = org_profile_image;
        }

        if (bannerFile) {
            const fileExtension = path.extname(bannerFile.originalname);
            const fileName = `${org._id}_banner${fileExtension}`;
            const bannerUrl = await uploadImageToS3(bannerFile, 'orgs', fileName);
            org.org_banner_image = bannerUrl;
        } else if (org_banner_image !== undefined) {
            org.org_banner_image = org_banner_image || null;
        }

        await org.save();

        console.log(`POST: /org-management/organizations/${orgId}/edit - Organization updated by admin`);
        res.status(200).json({
            success: true,
            message: 'Organization updated successfully',
            data: org
        });
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating organization',
            error: error.message
        });
    }
});

// Assign new owner (admin only)
router.put('/organizations/:orgId/owner', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');
    const { orgId } = req.params;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
        return res.status(400).json({
            success: false,
            message: 'newOwnerId is required'
        });
    }

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const newOwner = await User.findById(newOwnerId);
        if (!newOwner) {
            return res.status(404).json({
                success: false,
                message: 'New owner user not found'
            });
        }

        const newOwnerMember = await OrgMember.findOne({ org_id: orgId, user_id: newOwnerId });
        if (!newOwnerMember) {
            return res.status(400).json({
                success: false,
                message: 'New owner must be an existing member of the organization'
            });
        }

        const oldOwnerId = org.owner.toString();
        org.owner = newOwnerId;
        await org.save();

        const oldOwnerMember = await OrgMember.findOne({ org_id: orgId, user_id: oldOwnerId });
        if (oldOwnerMember) {
            await oldOwnerMember.changeRole('member', req.user.userId, 'Owner transferred by admin');
        }

        await newOwnerMember.changeRole('owner', req.user.userId, 'Assigned as owner by admin');

        if (!newOwner.clubAssociations || !newOwner.clubAssociations.some(c => c.toString() === orgId)) {
            if (!newOwner.clubAssociations) newOwner.clubAssociations = [];
            newOwner.clubAssociations.push(orgId);
            await newOwner.save();
        }

        console.log(`PUT: /org-management/organizations/${orgId}/owner - Owner assigned`);
        res.status(200).json({
            success: true,
            message: 'Owner assigned successfully',
            data: org
        });
    } catch (error) {
        console.error('Error assigning owner:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning owner',
            error: error.message
        });
    }
});

// Get organization members (admin only)
router.get('/organizations/:orgId/members', verifyToken, requireAdmin, async (req, res) => {
    const { OrgMember, OrgMemberApplication } = getModels(req, 'OrgMember', 'OrgMemberApplication');
    const { orgId } = req.params;

    try {
        const members = await OrgMember.find({ org_id: orgId, status: 'active' })
            .populate('user_id', 'username name email picture')
            .populate('assignedBy', 'username name')
            .sort({ role: 1, joinedAt: 1 });
        const applications = await OrgMemberApplication.find({ org_id: orgId, status: 'pending' })
            .populate('user_id formResponse');

        res.status(200).json({
            success: true,
            members,
            applications,
            count: members.length
        });
    } catch (error) {
        console.error('Error fetching organization members:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching members',
            error: error.message
        });
    }
});

// Add member to organization (admin only)
router.post('/organizations/:orgId/members', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');
    const { orgId } = req.params;
    const { userId, role = 'member' } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'userId is required'
        });
    }

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const roleExists = org.getRoleByName(role);
        if (!roleExists) {
            return res.status(400).json({
                success: false,
                message: 'Role not found'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (member) {
            return res.status(400).json({
                success: false,
                message: 'User is already a member'
            });
        }

        member = new OrgMember({
            org_id: orgId,
            user_id: userId,
            role,
            status: 'active',
            assignedBy: req.user.userId
        });
        await member.save();
        await recordMemberJoined(member, req.user.userId, 'admin_added');

        if (!user.clubAssociations || !user.clubAssociations.some(c => c.toString() === orgId)) {
            if (!user.clubAssociations) user.clubAssociations = [];
            user.clubAssociations.push(orgId);
            await user.save();
        }

        const { checkAndAutoApproveOrg } = require('../services/orgApprovalService');
        await checkAndAutoApproveOrg(req, orgId);

        res.status(201).json({
            success: true,
            message: 'Member added successfully',
            member: {
                ...member.toObject(),
                user_id: user
            }
        });
    } catch (error) {
        console.error('Error adding member:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding member',
            error: error.message
        });
    }
});

// Remove member from organization (admin only)
router.delete('/organizations/:orgId/members/:userId', verifyToken, requireAdmin, async (req, res) => {
    const { OrgMember, Org, User } = getModels(req, 'OrgMember', 'Org', 'User');
    const { orgId, userId } = req.params;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        if (org.owner.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove organization owner. Assign a new owner first.'
            });
        }

        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        await recordMemberRemoved(req, {
            org_id: orgId,
            user_id: userId,
            actorUserId: req.user.userId,
            reason: 'admin_removed'
        });
        await OrgMember.deleteOne({ _id: member._id });

        const user = await User.findById(userId);
        if (user && user.clubAssociations) {
            user.clubAssociations = user.clubAssociations.filter(c => c.toString() !== orgId);
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing member',
            error: error.message
        });
    }
});

// Change member role (admin only)
router.put('/organizations/:orgId/members/:userId/role', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');
    const { orgId, userId } = req.params;
    const { role } = req.body;

    if (!role) {
        return res.status(400).json({
            success: false,
            message: 'role is required'
        });
    }

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const roleExists = org.getRoleByName(role);
        if (!roleExists) {
            return res.status(400).json({
                success: false,
                message: 'Role not found'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        if (org.owner.toString() === userId && role !== 'owner') {
            return res.status(400).json({
                success: false,
                message: 'Cannot change owner role. Assign a new owner first.'
            });
        }

        await member.changeRole(role, req.user.userId, 'Role changed by admin', {
            termStart: req.body.roleTermStart ? new Date(req.body.roleTermStart) : undefined,
            termEnd: req.body.roleTermEnd ? new Date(req.body.roleTermEnd) : undefined
        });

        if (!user.clubAssociations || !user.clubAssociations.some(c => c.toString() === orgId)) {
            if (!user.clubAssociations) user.clubAssociations = [];
            user.clubAssociations.push(orgId);
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Role updated successfully',
            member: {
                userId: member.user_id,
                role: member.role,
                assignedAt: member.assignedAt
            }
        });
    } catch (error) {
        console.error('Error updating member role:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating role',
            error: error.message
        });
    }
});

// Approve a pending organization
router.put('/organizations/:orgId/approve', verifyToken, requireAdmin, async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const adminId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        if (org.approvalStatus !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Organization is not pending approval'
            });
        }

        org.approvalStatus = 'approved';
        org.approvedAt = new Date();
        org.approvedBy = adminId;
        await org.save();

        // Notify pending-org clients in real time (they leave the room after receiving this)
        emitToOrgApprovalRoom(orgId, 'org:approved', { orgId });

        console.log(`PUT: /org-management/organizations/${orgId}/approve - Organization approved`);
        res.status(200).json({
            success: true,
            message: 'Organization approved successfully',
            data: org
        });
    } catch (error) {
        console.error('Error approving organization:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving organization',
            error: error.message
        });
    }
});

// Update organization (verification flags, admin notes, optional orgTypeKey — not lifecycle; use PATCH lifecycle)
router.put('/organizations/:orgId', verifyToken, requireAdmin, async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const { verified, notes, orgTypeKey } = req.body;
    const adminId = req.user.userId;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        if (verified !== undefined) {
            org.verified = verified;
            org.verifiedAt = verified ? new Date() : null;
            org.verifiedBy = verified ? adminId : null;
        }

        if (notes !== undefined) org.adminNotes = notes;
        if (orgTypeKey !== undefined) org.orgTypeKey = orgTypeKey;

        await org.save();

        console.log(`PUT: /org-management/organizations/${orgId} - Organization updated`);
        res.status(200).json({
            success: true,
            message: 'Organization updated successfully',
            data: org
        });
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating organization',
            error: error.message
        });
    }
});

// PATCH lifecycle (platform admin)
router.patch('/organizations/:orgId/lifecycle', verifyToken, requireAdmin, async (req, res) => {
    const { Org, OrgManagementConfig } = getModels(req, 'Org', 'OrgManagementConfig');
    const { orgId } = req.params;
    const { lifecycleStatus: nextStatus } = req.body;
    const adminId = req.user.userId;

    try {
        if (!nextStatus) {
            return res.status(400).json({ success: false, message: 'lifecycleStatus is required' });
        }
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const config = await OrgManagementConfig.findOne();
        const policy = getEffectivePolicyFromConfig(config);
        assertLifecycleTransition(policy, org, nextStatus, { isPlatformAdmin: true, isOfficer: false });
        org.lifecycleStatus = nextStatus;
        org.lifecycleChangedAt = new Date();
        org.lifecycleChangedBy = adminId;
        await org.save();
        res.status(200).json({
            success: true,
            message: 'Lifecycle updated',
            data: org
        });
    } catch (error) {
        const code = error.statusCode || 500;
        console.error('Error updating lifecycle:', error);
        res.status(code).json({
            success: false,
            message: error.message || 'Error updating lifecycle'
        });
    }
});

// Approve a governance document version (platform admin)
router.put('/organizations/:orgId/governance/:docKey/versions/:version/approve', verifyToken, requireAdmin, async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId, docKey, version } = req.params;
    const adminId = req.user.userId;
    const verNum = parseInt(version, 10);

    try {
        if (Number.isNaN(verNum)) {
            return res.status(400).json({ success: false, message: 'Invalid version' });
        }
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const slot = org.getGovernanceSlot(docKey);
        if (!slot || !slot.versions?.length) {
            return res.status(404).json({ success: false, message: 'Governance document not found' });
        }
        const v = slot.versions.find((x) => x.version === verNum);
        if (!v) {
            return res.status(404).json({ success: false, message: 'Version not found' });
        }
        for (const x of slot.versions) {
            if (x.status === 'approved') {
                x.status = 'superseded';
            }
        }
        v.status = 'approved';
        v.approvedBy = adminId;
        v.approvedAt = new Date();
        org.markModified('governanceDocuments');
        await org.save();
        res.status(200).json({
            success: true,
            message: 'Version approved',
            data: org.governanceDocuments
        });
    } catch (error) {
        console.error('Governance approve error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== FINANCE (CMS Phase 2) ====================

router.get('/finance/config', verifyToken, requireAdmin, async (req, res) => {
    try {
        const data = await budgetService.ensureFinanceConfig(req);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('GET finance config:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/finance/config', verifyToken, requireAdmin, async (req, res) => {
    try {
        const data = await budgetService.updateFinanceConfig(req, req.body || {});
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('PUT finance config:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/finance/budgets', verifyToken, requireAdmin, async (req, res) => {
    try {
        const result = await budgetService.listBudgetsAdmin(req, req.query);
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error('GET finance budgets:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get(
    '/organizations/:orgId/budgets/:budgetId',
    verifyToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const data = await budgetService.getBudgetById(req, orgId, budgetId);
            if (!data) {
                return res.status(404).json({ success: false, message: 'Budget not found' });
            }
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('GET admin budget:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
);

router.put(
    '/organizations/:orgId/budgets/:budgetId/stages/:stageKey/approve',
    verifyToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.approveStagePlatform(req, orgId, budgetId, req.user.userId, stageKey);
            res.status(200).json({ success: true, data });
        } catch (error) {
            const code = error.statusCode || 500;
            console.error('Platform budget approve:', error);
            res.status(code).json({ success: false, message: error.message });
        }
    }
);

router.put(
    '/organizations/:orgId/budgets/:budgetId/stages/:stageKey/reject',
    verifyToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.rejectBudget(
                req,
                orgId,
                budgetId,
                req.user.userId,
                { ...(req.body || {}), stageKey },
                { platformOnly: true }
            );
            res.status(200).json({ success: true, data });
        } catch (error) {
            const code = error.statusCode || 500;
            console.error('Platform budget reject:', error);
            res.status(code).json({ success: false, message: error.message });
        }
    }
);

router.put(
    '/organizations/:orgId/budgets/:budgetId/stages/:stageKey/request-revision',
    verifyToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.requestRevision(
                req,
                orgId,
                budgetId,
                req.user.userId,
                { ...(req.body || {}), stageKey },
                { platformOnly: true }
            );
            res.status(200).json({ success: true, data });
        } catch (error) {
            const code = error.statusCode || 500;
            console.error('Platform budget request-revision:', error);
            res.status(code).json({ success: false, message: error.message });
        }
    }
);

module.exports = router;
