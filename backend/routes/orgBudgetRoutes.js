const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const {
    requireBudgetView,
    requireBudgetManagement,
    requireBudgetReview
} = require('../middlewares/orgPermissions');
const { getTenantParityConfig } = require('../services/tenantConfigService');

const router = express.Router();

router.get('/org-budgets/:orgId/templates', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudgetTemplate } = getModels(req, 'OrgBudgetTemplate');
    try {
        const templates = await OrgBudgetTemplate.find({ org_id: req.params.orgId }).lean();
        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch budget templates' });
    }
});

router.post('/org-budgets/:orgId/templates', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudgetTemplate } = getModels(req, 'OrgBudgetTemplate');
    const { name, sections = [], isDefault = false } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'name is required' });
    }

    try {
        const template = await OrgBudgetTemplate.create({
            org_id: req.params.orgId,
            name,
            sections,
            isDefault,
            createdBy: req.user.userId,
            updatedBy: req.user.userId
        });
        res.status(201).json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create budget template' });
    }
});

router.get('/org-budgets/:orgId', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    try {
        const budgets = await OrgBudget.find({ org_id: req.params.orgId }).sort({ updatedAt: -1 }).lean();
        res.status(200).json({ success: true, data: budgets });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch budgets' });
    }
});

router.post('/org-budgets/:orgId', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const { fiscalYear, name, templateId = null, lineItems = [] } = req.body;
    if (!fiscalYear || !name) {
        return res.status(400).json({ success: false, message: 'fiscalYear and name are required' });
    }

    try {
        const totalRequested = lineItems.reduce((sum, item) => sum + (Number(item.requestedAmount) || 0), 0);
        const budget = await OrgBudget.create({
            org_id: req.params.orgId,
            fiscalYear,
            name,
            templateId,
            lineItems,
            totalRequested,
            createdBy: req.user.userId,
            updatedBy: req.user.userId
        });

        await OrgBudgetWorkflowEvent.create({
            budget_id: budget._id,
            org_id: req.params.orgId,
            fromState: null,
            toState: budget.state,
            reason: 'budget_created',
            actorId: req.user.userId
        });

        res.status(201).json({ success: true, data: budget });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create budget' });
    }
});

router.post('/org-budgets/:orgId/:budgetId/reviews', verifyToken, requireBudgetReview(), async (req, res) => {
    const { OrgBudgetReview } = getModels(req, 'OrgBudgetReview');
    const { action, comment = '', metadata = {} } = req.body;
    if (!action) {
        return res.status(400).json({ success: false, message: 'action is required' });
    }

    try {
        const review = await OrgBudgetReview.create({
            budget_id: req.params.budgetId,
            org_id: req.params.orgId,
            reviewerId: req.user.userId,
            action,
            comment,
            metadata
        });
        res.status(201).json({ success: true, data: review });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create budget review' });
    }
});

router.patch('/org-budgets/:orgId/:budgetId/state', verifyToken, requireBudgetReview(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const { toState, reason = '' } = req.body;
    if (!toState) {
        return res.status(400).json({ success: false, message: 'toState is required' });
    }

    try {
        const parityConfig = getTenantParityConfig(req);
        const allowedStates = parityConfig?.finance?.workflowStates || [];
        if (!allowedStates.includes(toState)) {
            return res.status(400).json({
                success: false,
                message: 'State is not allowed by tenant policy',
                code: 'INVALID_BUDGET_STATE'
            });
        }

        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId });
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }

        const fromState = budget.state;
        budget.state = toState;
        budget.updatedBy = req.user.userId;
        await budget.save();

        await OrgBudgetWorkflowEvent.create({
            budget_id: budget._id,
            org_id: req.params.orgId,
            fromState,
            toState,
            reason,
            actorId: req.user.userId
        });

        res.status(200).json({ success: true, data: budget });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to transition budget state' });
    }
});

router.get('/org-budgets/:orgId/accounting-dimensions', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgAccountingDimension } = getModels(req, 'OrgAccountingDimension');
    try {
        const dimensions = await OrgAccountingDimension.find({ org_id: req.params.orgId }).lean();
        res.status(200).json({ success: true, data: dimensions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch accounting dimensions' });
    }
});

router.post('/org-budgets/:orgId/accounting-dimensions', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgAccountingDimension } = getModels(req, 'OrgAccountingDimension');
    const { key, label, required = false, values = [] } = req.body;
    if (!key || !label) {
        return res.status(400).json({ success: false, message: 'key and label are required' });
    }

    try {
        const dimension = await OrgAccountingDimension.create({
            org_id: req.params.orgId,
            key,
            label,
            required,
            values,
            createdBy: req.user.userId
        });
        res.status(201).json({ success: true, data: dimension });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create accounting dimension' });
    }
});

module.exports = router;
