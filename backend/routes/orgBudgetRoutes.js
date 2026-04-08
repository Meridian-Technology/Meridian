const express = require('express');
const getModels = require('../services/getModelService');
const orgBudgetSchema = require('../schemas/orgBudget');
const { verifyToken } = require('../middlewares/verifyToken');
const { requireOrgPermission } = require('../middlewares/orgPermissions');
const { ORG_PERMISSIONS } = require('../constants/permissions');
const budgetService = require('../services/budgetService');

const router = express.Router();

/** Stale unique indexes on org_id/name (pre-schema) collide: all docs lack those fields → duplicate null keys. */
const orgBudgetIndexesSynced = new WeakSet();

router.use(async (req, res, next) => {
    try {
        if (!req.db || orgBudgetIndexesSynced.has(req.db)) return next();
        const OrgBudget = req.db.models.OrgBudget || req.db.model('OrgBudget', orgBudgetSchema, 'orgBudgets');
        await OrgBudget.syncIndexes();
        orgBudgetIndexesSynced.add(req.db);
    } catch (e) {
        console.warn('[org-budgets] OrgBudget.syncIndexes:', e.message);
    }
    next();
});

router.get('/:orgId/budget-templates', verifyToken, requireOrgPermission(ORG_PERMISSIONS.VIEW_FINANCES), async (req, res) => {
    try {
        const { orgId } = req.params;
        const { Org } = getModels(req, 'Org');
        const org = await Org.findById(orgId).select('orgTypeKey org_name').lean();
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const config = await budgetService.ensureFinanceConfig(req);
        res.status(200).json({
            success: true,
            data: {
                templates: config.budgetTemplates || [],
                workflowPresets: config.workflowPresets || [],
                orgTypeKey: org.orgTypeKey || 'default'
            }
        });
    } catch (e) {
        console.error('budget-templates', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/:orgId/budgets', verifyToken, requireOrgPermission(ORG_PERMISSIONS.VIEW_FINANCES), async (req, res) => {
    try {
        const { orgId } = req.params;
        const data = await budgetService.listBudgetsForOrg(req, orgId);
        res.status(200).json({ success: true, data });
    } catch (e) {
        console.error('list budgets', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get(
    '/:orgId/budgets/:budgetId',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.VIEW_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const data = await budgetService.getBudgetById(req, orgId, budgetId);
            if (!data) {
                return res.status(404).json({ success: false, message: 'Budget not found' });
            }
            res.status(200).json({ success: true, data });
        } catch (e) {
            console.error('get budget', e);
            res.status(500).json({ success: false, message: e.message });
        }
    }
);

router.post('/:orgId/budgets', verifyToken, requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES), async (req, res) => {
    try {
        const { orgId } = req.params;
        const data = await budgetService.createBudget(req, orgId, req.user.userId, req.body || {});
        res.status(201).json({ success: true, data });
    } catch (e) {
        const code = e.statusCode || 500;
        console.error('create budget', e);
        res.status(code).json({ success: false, message: e.message });
    }
});

router.patch(
    '/:orgId/budgets/:budgetId',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const data = await budgetService.updateBudgetDraft(req, orgId, budgetId, req.user.userId, req.body || {});
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('update budget', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.post(
    '/:orgId/budgets/:budgetId/submit',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const data = await budgetService.submitBudget(req, orgId, budgetId, req.user.userId);
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('submit budget', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.post(
    '/:orgId/budgets/:budgetId/comments',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const data = await budgetService.addComment(req, orgId, budgetId, req.user.userId, req.body || {});
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('budget comment', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.put(
    '/:orgId/budgets/:budgetId/stages/:stageKey/approve',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.approveStageOrg(req, orgId, budgetId, req.user.userId, stageKey);
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('approve org stage', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.put(
    '/:orgId/budgets/:budgetId/stages/:stageKey/reject',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.rejectBudget(
                req,
                orgId,
                budgetId,
                req.user.userId,
                { ...(req.body || {}), stageKey },
                { platformOnly: false }
            );
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('reject org stage', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.put(
    '/:orgId/budgets/:budgetId/stages/:stageKey/request-revision',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.MANAGE_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId, stageKey } = req.params;
            const data = await budgetService.requestRevision(
                req,
                orgId,
                budgetId,
                req.user.userId,
                { ...(req.body || {}), stageKey },
                { platformOnly: false }
            );
            res.status(200).json({ success: true, data });
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('request revision org', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

router.get(
    '/:orgId/budgets/:budgetId/export',
    verifyToken,
    requireOrgPermission(ORG_PERMISSIONS.VIEW_FINANCES),
    async (req, res) => {
        try {
            const { orgId, budgetId } = req.params;
            const format = (req.query.format || 'json').toLowerCase();
            const out = await budgetService.exportBudget(req, orgId, budgetId, format);
            if (format === 'csv') {
                res.setHeader('Content-Type', out.contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
                return res.status(200).send(out.body);
            }
            return res.status(200).json(out.body);
        } catch (e) {
            const code = e.statusCode || 500;
            console.error('export budget', e);
            res.status(code).json({ success: false, message: e.message });
        }
    }
);

module.exports = router;
