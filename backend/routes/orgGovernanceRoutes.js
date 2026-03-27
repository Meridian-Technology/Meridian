const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const { requireAnyOrgPermission, requireOrgPermission } = require('../middlewares/orgPermissions');
const { ORG_PERMISSIONS } = require('../constants/permissions');
const { getTenantParityConfig } = require('../services/tenantConfigService');

const router = express.Router();

router.get(
    '/org-governance/:orgId/documents',
    verifyToken,
    requireAnyOrgPermission([ORG_PERMISSIONS.MANAGE_SETTINGS, ORG_PERMISSIONS.MANAGE_MEMBERS]),
    async (req, res) => {
        const { OrgGovernanceDocument } = getModels(req, 'OrgGovernanceDocument');
        try {
            const documents = await OrgGovernanceDocument.find({ org_id: req.params.orgId })
                .sort({ documentType: 1, version: -1 })
                .lean();
            return res.status(200).json({ success: true, data: documents });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to fetch governance documents' });
        }
    }
);

router.post(
    '/org-governance/:orgId/documents',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_SETTINGS),
    async (req, res) => {
        const { OrgGovernanceDocument } = getModels(req, 'OrgGovernanceDocument');
        const { title, body, documentType = 'constitution', status = 'draft' } = req.body;

        if (!title || !body) {
            return res.status(400).json({ success: false, message: 'title and body are required' });
        }

        try {
            const currentVersion = await OrgGovernanceDocument.findOne({
                org_id: req.params.orgId,
                documentType
            })
                .sort({ version: -1 })
                .lean();

            const nextVersion = (currentVersion?.version || 0) + 1;
            const document = await OrgGovernanceDocument.create({
                org_id: req.params.orgId,
                title,
                body,
                documentType,
                status,
                version: nextVersion,
                createdBy: req.user.userId,
                updatedBy: req.user.userId,
                publishedAt: status === 'published' ? new Date() : null
            });

            return res.status(201).json({ success: true, data: document });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to save governance document' });
        }
    }
);

router.patch(
    '/org-governance/:orgId/lifecycle',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_SETTINGS),
    async (req, res) => {
        const { Org } = getModels(req, 'Org');
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: 'status is required' });
        }

        try {
            const parityConfig = getTenantParityConfig(req);
            const allowedStatuses = parityConfig?.orgLifecycle?.allowedStatuses || [];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Lifecycle status is not allowed by tenant policy',
                    code: 'INVALID_LIFECYCLE_STATUS'
                });
            }

            const org = await Org.findById(req.params.orgId);
            if (!org) {
                return res.status(404).json({ success: false, message: 'Organization not found' });
            }

            org.lifecycleStatus = status;
            org.lifecycleUpdatedAt = new Date();
            org.lifecycleUpdatedBy = req.user.userId;
            await org.save();

            return res.status(200).json({ success: true, data: org });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to update lifecycle status' });
        }
    }
);

router.get(
    '/org-governance/:orgId/membership-history',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_MEMBERS),
    async (req, res) => {
        const { OrgMember } = getModels(req, 'OrgMember');
        try {
            const members = await OrgMember.find({ org_id: req.params.orgId })
                .populate('user_id', 'name username email')
                .select('user_id role status joinedAt assignedAt roleHistory membershipAuditTrail termStart termEnd')
                .lean();
            return res.status(200).json({ success: true, data: members });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to fetch membership history' });
        }
    }
);

router.patch(
    '/org-governance/:orgId/member-terms/:memberId',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_MEMBERS),
    async (req, res) => {
        const { OrgMember } = getModels(req, 'OrgMember');
        const { termStart, termEnd } = req.body;

        try {
            const member = await OrgMember.findOne({
                _id: req.params.memberId,
                org_id: req.params.orgId
            });
            if (!member) {
                return res.status(404).json({ success: false, message: 'Membership not found' });
            }

            await member.updateOfficerTerm(termStart, termEnd, req.user.userId);
            return res.status(200).json({ success: true, data: member });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to update officer term' });
        }
    }
);

module.exports = router;
