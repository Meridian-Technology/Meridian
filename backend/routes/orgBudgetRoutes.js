const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const {
    requireBudgetView,
    requireBudgetManagement
} = require('../middlewares/orgPermissions');
const { getTenantParityConfig } = require('../services/tenantConfigService');
const { hasAdminPermission } = require('../middlewares/requireAdmin');
const { ORG_PERMISSIONS } = require('../constants/permissions');

const router = express.Router();
const DEFAULT_REVIEW_ACTIONS = ['comment', 'request_changes', 'approve', 'reject'];
const DEFAULT_BUDGET_EDITABLE_STATES = ['draft', 'changes_requested'];
const DEFAULT_REVIEWABLE_STATES = ['submitted', 'preliminary_review', 'final_review', 'appealed'];
const ACTION_TO_STATE = {
    request_changes: 'changes_requested',
    approve: 'approved',
    reject: 'rejected'
};

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
    const parityConfig = getTenantParityConfig(req);
    let dimensions = await OrgAccountingDimension.find({ org_id: orgId }).lean();
    if (dimensions.length === 0 && Array.isArray(parityConfig?.finance?.accountingDimensions)) {
        const seedDimensions = parityConfig.finance.accountingDimensions.map((dimension) => ({
            org_id: orgId,
            key: dimension.key,
            label: dimension.label,
            required: Boolean(dimension.required),
            values: Array.isArray(dimension.values) ? dimension.values : [],
            createdBy: req.user.userId
        }));
        if (seedDimensions.length > 0) {
            await OrgAccountingDimension.insertMany(seedDimensions);
            dimensions = await OrgAccountingDimension.find({ org_id: orgId }).lean();
        }
    }
    const requiredDimensions = dimensions.filter((dimension) => dimension.required).map((dimension) => dimension.key);
    const allowedValuesByDimension = dimensions.reduce((acc, dimension) => {
        acc[dimension.key] = Array.isArray(dimension.values) ? dimension.values : [];
        return acc;
    }, {});
    const missingByIndex = [];
    const invalidValuesByIndex = [];

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
        Object.entries(accounting).forEach(([dimensionKey, value]) => {
            const allowedValues = allowedValuesByDimension[dimensionKey] || [];
            if (allowedValues.length > 0 && value && !allowedValues.includes(value)) {
                invalidValuesByIndex.push({
                    index,
                    label: lineItem.label,
                    dimensionKey,
                    value,
                    allowedValues
                });
            }
        });
    });

    return {
        requiredDimensions,
        missingByIndex,
        invalidValuesByIndex
    };
}

async function hasOrgPermission(req, permission, org) {
    if (req.user?.roles?.includes('admin') || req.user?.roles?.includes('root')) {
        return true;
    }
    if (!req.orgMember) {
        return false;
    }
    return req.orgMember.hasPermissionWithOrg(permission, org || req.org);
}

async function canReviewBudget(req, budget) {
    const parityConfig = getTenantParityConfig(req);
    const adminOnly = parityConfig?.finance?.reviewerPolicy?.adminOnly !== false;
    const isAdminReviewer = await hasAdminPermission(req, 'review_budget');
    if (isAdminReviewer) {
        return true;
    }
    if (adminOnly) {
        return false;
    }
    return hasOrgPermission(req, ORG_PERMISSIONS.REVIEW_BUDGETS, req.org);
}

async function canApproveBudget(req, budget) {
    const isAdminApprover = await hasAdminPermission(req, 'approve_budget');
    if (isAdminApprover) {
        return true;
    }
    return hasOrgPermission(req, ORG_PERMISSIONS.APPROVE_BUDGET, req.org);
}

async function canReleaseBudget(req, budget) {
    const isAdminReleaser = await hasAdminPermission(req, 'release_budget');
    if (isAdminReleaser) {
        return true;
    }
    return hasOrgPermission(req, ORG_PERMISSIONS.RELEASE_BUDGET, req.org);
}

function isReviewAction(action) {
    return action === 'approve' || action === 'reject' || action === 'request_changes';
}

function getEditableStates(parityConfig) {
    return parityConfig?.finance?.editableStates || DEFAULT_BUDGET_EDITABLE_STATES;
}

function getReviewableStates(parityConfig) {
    return parityConfig?.finance?.reviewableStates || DEFAULT_REVIEWABLE_STATES;
}

function isSubmissionTransition(fromState, toState) {
    return (fromState === 'draft' && toState === 'submitted') || (fromState === 'changes_requested' && toState === 'submitted');
}

function ensureFinanceModuleEnabled(req, res) {
    const parityConfig = getTenantParityConfig(req);
    if (parityConfig?.modules?.finance === false || parityConfig?.finance?.enabled === false) {
        res.status(403).json({
            success: false,
            message: 'Finance module is disabled for this tenant',
            code: 'FINANCE_MODULE_DISABLED'
        });
        return { enabled: false, parityConfig };
    }
    return { enabled: true, parityConfig };
}

router.get('/org-budgets/:orgId/templates', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudgetTemplate } = getModels(req, 'OrgBudgetTemplate');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    try {
        const templates = await OrgBudgetTemplate.find({ org_id: req.params.orgId }).lean();
        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch budget templates' });
    }
});

router.post('/org-budgets/:orgId/templates', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudgetTemplate } = getModels(req, 'OrgBudgetTemplate');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
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
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
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

router.get('/org-budgets/:orgId/policy', verifyToken, requireBudgetView(), async (req, res) => {
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const parityConfig = moduleState.parityConfig;
    const noSelfApproval = parityConfig?.finance?.reviewerPolicy?.noSelfApproval !== false;
    const workflowStates = parityConfig?.finance?.workflowStates || [];
    const transitions = parityConfig?.finance?.transitions || buildAllowedBudgetTransitions(workflowStates);
    const reviewActions = parityConfig?.finance?.reviewActions || DEFAULT_REVIEW_ACTIONS;
    const editableStates = getEditableStates(parityConfig);
    const reviewableStates = getReviewableStates(parityConfig);
    const canReview = await canReviewBudget(req);
    const canApprove = await canApproveBudget(req);
    const canRelease = await canReleaseBudget(req);

    return res.status(200).json({
        success: true,
        data: {
            workflowStates,
            transitions,
            reviewActions,
            editableStates,
            reviewableStates,
            capabilities: {
                canReview,
                canApprove,
                canRelease
            }
        }
    });
});

router.post('/org-budgets/:orgId', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const { fiscalYear, name, templateId = null, lineItems = [] } = req.body;
    if (!fiscalYear || !name) {
        return res.status(400).json({ success: false, message: 'fiscalYear and name are required' });
    }

    try {
        const dimensionValidation = await validateAccountingDimensions(req, req.params.orgId, lineItems);
        if (dimensionValidation.missingByIndex.length > 0 || dimensionValidation.invalidValuesByIndex.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Accounting dimensions are invalid for one or more line items',
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
            eventType: 'system',
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
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const { lineItems = [], reason = 'line_items_updated' } = req.body;
    if (!Array.isArray(lineItems)) {
        return res.status(400).json({ success: false, message: 'lineItems must be an array' });
    }

    try {
        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId });
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }
        const editableStates = getEditableStates(moduleState.parityConfig);
        if (!editableStates.includes(budget.state)) {
            return res.status(400).json({
                success: false,
                message: `Budget line items are read-only in state ${budget.state}`,
                code: 'BUDGET_STATE_READ_ONLY'
            });
        }

        const dimensionValidation = await validateAccountingDimensions(req, req.params.orgId, lineItems);
        if (dimensionValidation.missingByIndex.length > 0 || dimensionValidation.invalidValuesByIndex.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Accounting dimensions are invalid for one or more line items',
                code: 'MISSING_ACCOUNTING_DIMENSIONS',
                data: dimensionValidation
            });
        }

        const previousLineItems = Array.isArray(budget.lineItems) ? budget.lineItems : [];
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
            eventType: 'line_item_update',
            reason,
            actorId: req.user.userId,
            metadata: {
                previousLineItemCount: previousLineItems.length,
                newLineItemCount: lineItems.length,
                requestedDelta: Number(sumRequestedAmounts(lineItems) - sumRequestedAmounts(previousLineItems)),
                approvedDelta: Number(sumApprovedAmounts(lineItems) - sumApprovedAmounts(previousLineItems))
            }
        });

        return res.status(200).json({ success: true, data: budget });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update budget line items' });
    }
});

router.patch('/org-budgets/:orgId/:budgetId', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const { name, fiscalYear, reason = 'budget_details_updated' } = req.body;
    try {
        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId });
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }
        const editableStates = getEditableStates(moduleState.parityConfig);
        if (!editableStates.includes(budget.state)) {
            return res.status(400).json({
                success: false,
                message: `Budget metadata is read-only in state ${budget.state}`,
                code: 'BUDGET_STATE_READ_ONLY'
            });
        }
        if (name !== undefined) {
            budget.name = name;
        }
        if (fiscalYear !== undefined) {
            budget.fiscalYear = fiscalYear;
        }
        budget.updatedBy = req.user.userId;
        await budget.save();
        await OrgBudgetWorkflowEvent.create({
            budget_id: budget._id,
            org_id: req.params.orgId,
            fromState: budget.state,
            toState: budget.state,
            eventType: 'metadata_update',
            reason,
            actorId: req.user.userId
        });
        return res.status(200).json({ success: true, data: budget });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update budget details' });
    }
});

router.get('/org-budgets/:orgId/review-queue', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const { states } = req.query;
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const canReview = await canReviewBudget(req);
    if (!canReview) {
        return res.status(403).json({
            success: false,
            message: 'Reviewer permission required for budget review queue',
            code: 'BUDGET_REVIEWER_REQUIRED'
        });
    }
    const defaultStates = getReviewableStates(moduleState.parityConfig);
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
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
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

router.get('/org-budgets/:orgId/:budgetId/revision-summary', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudgetWorkflowEvent');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    try {
        const revisions = await OrgBudgetWorkflowEvent.find({
            budget_id: req.params.budgetId,
            org_id: req.params.orgId,
            eventType: 'line_item_update'
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        const summary = revisions.map((event) => ({
            id: event._id,
            createdAt: event.createdAt,
            requestedDelta: Number(event.metadata?.requestedDelta || 0),
            approvedDelta: Number(event.metadata?.approvedDelta || 0),
            previousLineItemCount: Number(event.metadata?.previousLineItemCount || 0),
            newLineItemCount: Number(event.metadata?.newLineItemCount || 0)
        }));
        return res.status(200).json({ success: true, data: summary });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch budget revision summary' });
    }
});

router.get('/org-budgets/:orgId/:budgetId/workflow-context', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const parityConfig = moduleState.parityConfig;
    const workflowStates = parityConfig?.finance?.workflowStates || [];
    const transitions = parityConfig?.finance?.transitions || buildAllowedBudgetTransitions(workflowStates);
    const reviewActions = parityConfig?.finance?.reviewActions || DEFAULT_REVIEW_ACTIONS;
    try {
        const budget = await OrgBudget.findOne({ _id: req.params.budgetId, org_id: req.params.orgId }).lean();
        if (!budget) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }
        const fromState = budget.state;
        const canReview = await canReviewBudget(req, budget);
        const canApprove = await canApproveBudget(req, budget);
        const canRelease = await canReleaseBudget(req, budget);
        return res.status(200).json({
            success: true,
            data: {
                budgetId: budget._id,
                fromState,
                allowedNextStates: transitions[fromState] || [],
                reviewActions,
                editableStates: getEditableStates(parityConfig),
                reviewableStates: getReviewableStates(parityConfig),
                capabilities: {
                    canReview,
                    canApprove,
                    canRelease,
                    canSubmit: await hasOrgPermission(req, ORG_PERMISSIONS.MANAGE_BUDGETS, req.org)
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch budget workflow context' });
    }
});

router.post('/org-budgets/:orgId/:budgetId/reviews', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudgetReview, OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudgetReview', 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const { action, comment = '', metadata = {}, reason = '', toState = null, parentReviewId = null, visibility = 'submitter_visible' } = req.body;
    if (!action) {
        return res.status(400).json({ success: false, message: 'action is required' });
    }
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    const parityConfig = moduleState.parityConfig;
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
        const canReview = await canReviewBudget(req, budget);
        if (!canReview) {
            return res.status(403).json({
                success: false,
                message: 'Reviewer permission required',
                code: 'BUDGET_REVIEWER_REQUIRED'
            });
        }
        const reviewableStates = getReviewableStates(parityConfig);
        if (isReviewAction(action) && !reviewableStates.includes(budget.state)) {
            return res.status(400).json({
                success: false,
                message: `Budget cannot be reviewed while in state ${budget.state}`,
                code: 'BUDGET_NOT_REVIEWABLE'
            });
        }
        if (noSelfApproval && (action === 'approve' || action === 'reject') && String(budget.updatedBy || '') === String(req.user.userId || '')) {
            return res.status(403).json({
                success: false,
                message: 'Self-approval is not allowed',
                code: 'SELF_REVIEW_NOT_ALLOWED'
            });
        }
        let nextState = toState || ACTION_TO_STATE[action] || null;
        if (nextState) {
            const allowedStates = parityConfig?.finance?.workflowStates || [];
            if (!allowedStates.includes(nextState)) {
                return res.status(400).json({
                    success: false,
                    message: 'Requested review transition is not allowed by tenant policy',
                    code: 'INVALID_BUDGET_STATE'
                });
            }
            const transitions = parityConfig?.finance?.transitions || buildAllowedBudgetTransitions(allowedStates);
            const fromState = budget.state;
            const allowedTransitions = transitions[fromState] || [];
            if (fromState !== nextState && !allowedTransitions.includes(nextState)) {
                return res.status(400).json({
                    success: false,
                    message: `Transition from ${fromState} to ${nextState} is not allowed`,
                    code: 'INVALID_BUDGET_TRANSITION'
                });
            }
            if (noSelfApproval && (nextState === 'approved' || nextState === 'finalized') && String(budget.updatedBy || '') === String(req.user.userId || '')) {
                return res.status(403).json({
                    success: false,
                    message: 'Self-approval is not allowed',
                    code: 'SELF_REVIEW_NOT_ALLOWED'
                });
            }
            if (nextState === 'approved') {
                const canApprove = await canApproveBudget(req, budget);
                if (!canApprove) {
                    return res.status(403).json({
                        success: false,
                        message: 'Approve budget permission required',
                        code: 'APPROVE_BUDGET_REQUIRED'
                    });
                }
            }
            if (nextState === 'finalized') {
                const canRelease = await canReleaseBudget(req, budget);
                if (!canRelease) {
                    return res.status(403).json({
                        success: false,
                        message: 'Release budget permission required',
                        code: 'RELEASE_BUDGET_REQUIRED'
                    });
                }
            }
            budget.state = nextState;
            budget.updatedBy = req.user.userId;
            await budget.save();

            await OrgBudgetWorkflowEvent.create({
                budget_id: budget._id,
                org_id: req.params.orgId,
                fromState,
                toState: nextState,
                eventType: 'review_action',
                reason: reason || `review:${action}`,
                actorId: req.user.userId
            });
        }
        const review = await OrgBudgetReview.create({
            budget_id: req.params.budgetId,
            org_id: req.params.orgId,
            reviewerId: req.user.userId,
            action,
            comment,
            parentReviewId,
            visibility,
            metadata: {
                ...(metadata || {}),
                toState: nextState || null
            }
        });
        res.status(201).json({ success: true, data: { review, budget } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create budget review' });
    }
});

router.patch('/org-budgets/:orgId/:budgetId/state', verifyToken, requireBudgetView(), async (req, res) => {
    const { OrgBudget, OrgBudgetWorkflowEvent } = getModels(req, 'OrgBudget', 'OrgBudgetWorkflowEvent');
    const { toState, reason = '' } = req.body;
    if (!toState) {
        return res.status(400).json({ success: false, message: 'toState is required' });
    }

    try {
        const moduleState = ensureFinanceModuleEnabled(req, res);
        if (!moduleState.enabled) return;
        const parityConfig = moduleState.parityConfig;
        const allowedStates = parityConfig?.finance?.workflowStates || [];
        const noSelfApproval = parityConfig?.finance?.reviewerPolicy?.noSelfApproval !== false;
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
        if (isSubmissionTransition(fromState, toState)) {
            const canManage = await hasOrgPermission(req, ORG_PERMISSIONS.MANAGE_BUDGETS, req.org);
            if (!canManage) {
                return res.status(403).json({
                    success: false,
                    message: 'Manage budgets permission required for submission transitions',
                    code: 'MANAGE_BUDGETS_REQUIRED'
                });
            }
        } else {
            const canReview = await canReviewBudget(req, budget);
            if (!canReview) {
                return res.status(403).json({
                    success: false,
                    message: 'Reviewer permission required for this transition',
                    code: 'BUDGET_REVIEWER_REQUIRED'
                });
            }
        }
        if (noSelfApproval && (toState === 'approved' || toState === 'finalized') && String(budget.updatedBy || '') === String(req.user.userId || '')) {
            return res.status(403).json({
                success: false,
                message: 'Self-approval is not allowed',
                code: 'SELF_REVIEW_NOT_ALLOWED'
            });
        }
        if (toState === 'approved') {
            const canApprove = await canApproveBudget(req, budget);
            if (!canApprove) {
                return res.status(403).json({
                    success: false,
                    message: 'Approve budget permission required',
                    code: 'APPROVE_BUDGET_REQUIRED'
                });
            }
        }
        if (toState === 'finalized') {
            const canRelease = await canReleaseBudget(req, budget);
            if (!canRelease) {
                return res.status(403).json({
                    success: false,
                    message: 'Release budget permission required',
                    code: 'RELEASE_BUDGET_REQUIRED'
                });
            }
        }
        const transitions = parityConfig?.finance?.transitions || buildAllowedBudgetTransitions(allowedStates);
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
            eventType: 'state_transition',
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
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
    try {
        const dimensions = await OrgAccountingDimension.find({ org_id: req.params.orgId }).lean();
        res.status(200).json({ success: true, data: dimensions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch accounting dimensions' });
    }
});

router.post('/org-budgets/:orgId/accounting-dimensions', verifyToken, requireBudgetManagement(), async (req, res) => {
    const { OrgAccountingDimension } = getModels(req, 'OrgAccountingDimension');
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
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
    const moduleState = ensureFinanceModuleEnabled(req, res);
    if (!moduleState.enabled) return;
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
