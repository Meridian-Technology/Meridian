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
const DEFAULT_REVIEW_ACTIONS = ['comment', 'request_changes', 'approve', 'reject'];

function sumRequestedAmounts(lineItems = []) {
    return lineItems.reduce((sum, item) => sum + (Number(item.requestedAmount) || 0), 0);
}

function sumApprovedAmounts(lineItems = []) {
    return lineItems.reduce((sum, item) => sum + (Number(item.approvedAmount) || 0), 0);
}

function buildAllowedBudgetTransitions(workflowStates = []) {
    const transitions = {};
    workflowStates.forEach((state, index) => {
        const nextState = workflowStates[index + 1];
        transitions[state] = [];
        if (nextState) {
            transitions[state].push(nextState);
        }
    });
    // Common finance transitions
    if (transitions.in_review) {
        transitions.in_review.push('changes_requested', 'rejected');
    }
    if (transitions.preliminary_review) {
        transitions.preliminary_review.push('changes_requested', 'rejected');
    }
    if (transitions.final_review) {
        transitions.final_review.push('changes_requested', 'rejected');
    }
    if (transitions.changes_requested) {
        transitions.changes_requested.push('submitted');
    }
    if (transitions.appealed) {
        transitions.appealed.push('final_review', 'approved', 'rejected');
    }
    return transitions;
}

async function validateAccountingDimensions(req, orgId, lineItems) {
    const { OrgAccountingDimension } = getModels(req, 'OrgAccountingDimension');
    const dimensions = await OrgAccountingDimension.find({ org_id: orgId }).lean();
    const requiredDimensions = dimensions.filter((dimension) => dimension.required).map((dimension) => dimension.key);
    const missingByIndex = [];

    lineItems.forEach((lineItem, index) => {
        const accounting = lineItem.accounting || {};
        const missing = requiredDimensions.filter((dimensionKey) => !accounting[dimensionKey]);
        if (missing.length > 0) {
            missingByIndex.push({
                index,
                label: lineItem.label,
                missing
            });
        }
    });

    return {
        requiredDimensions,
        missingByIndex
    };
}

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
    const { state } = req.query;
    try {
        const query = { org_id: req.params.orgId };
        if (state) {
            query.state = state;
        }
        const budgets = await OrgBudget.find(query).sort({ updatedAt: -1 }).lean();
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
        const dimensionValidation = await validateAccountingDimensions(req, req.params.orgId, lineItems);
        if (dimensionValidation.missingByIndex.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required accounting dimensions for one or more line items',
                code: 'MISSING_ACCOUNTING_DIMENSIONS',
                data: dimensionValidation
            });
        }
        const totalRequested = sumRequestedAmounts(lineItems);
        const totalApproved = sumApprovedAmounts(lineItems);
        const budget = await OrgBudget.create({
            org_id: req.params.orgId,
            fiscalYear,
            name,
            templateId,
            lineItems,
            totalRequested,
            totalApproved,
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

router.patch('/org-budgets/:orgId/:budgetId/line-items', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const { lineItems = [], reason = 'line_items_updated' } = req.body;
    if (!Array.isArray(lineItems)) {
        return res.status(400).json({ success: false, message: 'lineItems must be an array' });
    }

    try {
        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId });
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }

        const dimensionValidation = await validateAccountingDimensions(req, req.params.orgId, lineItems);
        if (dimensionValidation.missingByIndex.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required accounting dimensions for one or more line items',
                code: 'MISSING_ACCOUNTING_DIMENSIONS',
                data: dimensionValidation
            });
        }

        budget.lineItems = lineItems;
        budget.totalRequested = sumRequestedAmounts(lineItems);
        budget.totalApproved = sumApprovedAmounts(lineItems);
        budget.updatedBy = req.user.userId;
        await budget.save();

        await OrgBudgetWorkflowEvent.create({
            budget_id: budget._id,
            org_id: req.params.orgId,
            fromState: budget.state,
            toState: budget.state,
            reason,
            actorId: req.user.userId
        });

        return res.status(200).json({ success: true, data: budget });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update budget line items' });
    }
});

router.get('/org-budgets/:orgId/review-queue', verifyToken, requireBudgetReview(), async (req, res) => {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const { states } = req.query;
    const defaultStates = ['submitted', 'preliminary_review', 'final_review', 'appealed', 'changes_requested'];
    const reviewStates = typeof states === 'string' ? states.split(',').map((state) => state.trim()) : defaultStates;

    try {
        const queue = await OrgBudget.find({
            org_id: req.params.orgId,
            state: { $in: reviewStates }
        })
            .sort({ updatedAt: 1 })
            .lean();

        return res.status(200).json({ success: true, data: queue });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch review queue' });
    }
});

router.get('/org-budgets/:orgId/:budgetId/history', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudgetWorkflowEvent, OrgBudgetReview } = getModels(req, 'OrgBudgetWorkflowEvent', 'OrgBudgetReview');
    try {
        const [workflowEvents, reviews] = await Promise.all([
            OrgBudgetWorkflowEvent.find({
                budget_id: req.params.budgetId,
                org_id: req.params.orgId
            })
                .sort({ createdAt: -1 })
                .lean(),
            OrgBudgetReview.find({
                budget_id: req.params.budgetId,
                org_id: req.params.orgId
            })
                .sort({ createdAt: -1 })
                .lean()
        ]);
        return res.status(200).json({
            success: true,
            data: {
                workflowEvents,
                reviews
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch budget history' });
    }
});

router.post('/org-budgets/:orgId/:budgetId/reviews', verifyToken, requireBudgetReview(), async (req, res) => {
    const { OrgBudgetReview, OrgBudget } = getModels(req, 'OrgBudgetReview', 'OrgBudget');
    const { action, comment = '', metadata = {} } = req.body;
    if (!action) {
        return res.status(400).json({ success: false, message: 'action is required' });
    }
    const parityConfig = getTenantParityConfig(req);
    const validReviewActions = parityConfig?.finance?.reviewActions || DEFAULT_REVIEW_ACTIONS;
    if (!validReviewActions.includes(action)) {
        return res.status(400).json({
            success: false,
            message: `action must be one of: ${validReviewActions.join(', ')}`,
            code: 'INVALID_REVIEW_ACTION'
        });
    }

    try {
        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId });
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }
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
        const transitions = parityConfig?.finance?.transitions || buildAllowedBudgetTransitions(allowedStates);
        const fromState = budget.state;
        const allowedTransitions = transitions[fromState] || [];
        if (fromState !== toState && !allowedTransitions.includes(toState)) {
            return res.status(400).json({
                success: false,
                message: `Transition from ${fromState} to ${toState} is not allowed`,
                code: 'INVALID_BUDGET_TRANSITION'
            });
        }

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

router.patch('/org-budgets/:orgId/accounting-dimensions/:dimensionId', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgAccountingDimension } = getModels(req, 'OrgAccountingDimension');
    const { label, required, values } = req.body;
    try {
        const dimension = await OrgAccountingDimension.findOne({
            _id: req.params.dimensionId,
            org_id: req.params.orgId
        });
        if (!dimension) {
            return res.status(404).json({ success: false, message: 'Accounting dimension not found' });
        }
        if (label !== undefined) {
            dimension.label = label;
        }
        if (required !== undefined) {
            dimension.required = required;
        }
        if (Array.isArray(values)) {
            dimension.values = values;
        }
        await dimension.save();
        return res.status(200).json({ success: true, data: dimension });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update accounting dimension' });
    }
});

module.exports = router;
