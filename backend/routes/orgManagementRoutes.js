const express = require('express');
const multer = require('multer');
const path = require('path');
const getModels = require('../services/getModelService');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { uploadImageToS3, upload } = require('../services/imageUploadService');
const { emitToOrgApprovalRoom } = require('../socket');
const { clean, isProfane } = require('../services/profanityFilterService');

const router = express.Router();

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
router.put('/verification-requests/:requestId', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.get('/pending-approvals', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

// Update management configuration
router.put('/config', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

// ==================== ORGANIZATION ANALYTICS ====================

// Get organization analytics
router.get('/analytics', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

// Get all organizations with management data
router.get('/organizations', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
    const { Org, OrgMember, Event } = getModels(req, 'Org', 'OrgMember', 'Event');
    const { 
        search, 
        status, 
        verified, 
        page = 1, 
        limit = 20, 
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
        if (verified !== '') filter.verified = verified === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        console.log(filter);

        const orgs = await Org.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Get additional data for each org
        const orgsWithData = await Promise.all(orgs.map(async (org) => {
            const memberCount = await OrgMember.countDocuments({ org_id: org._id });
            const eventCount = await Event.countDocuments({ 
                hostingId: org._id, 
                hostingType: 'Org',
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });

            return {
                ...org.toObject(),
                memberCount,
                recentEventCount: eventCount
            };
        }));

        const total = await Org.countDocuments(filter);

        console.log(`GET: /org-management/organizations - Retrieved ${orgsWithData.length} organizations`);
        res.status(200).json({
            success: true,
            data: orgsWithData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
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
router.get('/organizations/export', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

// Get single organization by ID (admin only)
router.get('/organizations/:orgId', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
    const { Org, OrgMember, Event } = getModels(req, 'Org', 'OrgMember', 'Event');
    const { orgId } = req.params;

    try {
        const org = await Org.findById(orgId).populate('owner', 'username name email');
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const memberCount = await OrgMember.countDocuments({ org_id: orgId });
        const eventCount = await Event.countDocuments({
            hostingId: orgId,
            hostingType: 'Org',
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

        const orgWithData = {
            ...org.toObject(),
            memberCount,
            recentEventCount: eventCount
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
router.post('/organizations/:orgId/edit', verifyToken, authorizeRoles('admin', 'root'), upload.fields([
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
router.put('/organizations/:orgId/owner', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.get('/organizations/:orgId/members', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.post('/organizations/:orgId/members', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
            assignedBy: req.user.userId
        });
        await member.save();

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
router.delete('/organizations/:orgId/members/:userId', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.put('/organizations/:orgId/members/:userId/role', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

        await member.changeRole(role, req.user.userId, 'Role changed by admin');

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
router.put('/organizations/:orgId/approve', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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

// Update organization status
router.put('/organizations/:orgId', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const { verified, status, notes } = req.body;
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

        if (status) org.status = status;
        if (notes) org.adminNotes = notes;

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

// ==================== MIGRATIONS ====================

/**
 * Add _id to org positions that don't have it (for role rename detection).
 * Run once per tenant. Protected: admin or root only.
 */
router.post('/migrate/org-positions-ids', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
    const mongoose = require('mongoose');
    const { Org } = getModels(req, 'Org');

    try {
        const orgs = await Org.find({}).lean();
        let updated = 0;

        for (const org of orgs) {
            const positions = org.positions || [];
            let changed = false;

            for (let i = 0; i < positions.length; i++) {
                if (!positions[i]._id) {
                    positions[i]._id = new mongoose.Types.ObjectId();
                    changed = true;
                }
            }

            if (changed) {
                await Org.updateOne(
                    { _id: org._id },
                    { $set: { positions } }
                );
                updated++;
            }
        }

        console.log(`POST: /org-management/migrate/org-positions-ids - Updated ${updated} org(s)`);
        res.status(200).json({
            success: true,
            message: `Migration completed. Updated ${updated} organization(s) with _id on role positions.`,
            data: { orgsUpdated: updated }
        });
    } catch (error) {
        console.error('Migration org-positions-ids failed:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Migration failed'
        });
    }
});

module.exports = router;
