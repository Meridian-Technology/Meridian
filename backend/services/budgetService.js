const getModels = require('./getModelService');
const { ORG_PERMISSIONS } = require('../constants/permissions');

function defaultFinancePayload() {
    return {
        budgetTemplates: [
            {
                templateKey: 'annual_club',
                displayName: 'Annual club budget',
                orgTypeKeys: ['default', 'club'],
                fiscalLabel: 'Fiscal year',
                workflowPresetKey: 'two_stage',
                lineItemDefinitions: [
                    {
                        key: 'operating',
                        label: 'Operating',
                        required: true,
                        kind: 'currency',
                        helpText: 'General operating funds requested'
                    },
                    {
                        key: 'events',
                        label: 'Events & programs',
                        required: false,
                        kind: 'currency',
                        helpText: ''
                    },
                    {
                        key: 'summary',
                        label: 'Summary notes',
                        required: false,
                        kind: 'text',
                        helpText: 'Optional context for reviewers'
                    }
                ]
            }
        ],
        workflowPresets: [
            {
                presetKey: 'two_stage',
                stages: [
                    {
                        key: 'officer',
                        label: 'Officer review',
                        actorType: 'org_permission',
                        permission: ORG_PERMISSIONS.MANAGE_FINANCES
                    },
                    {
                        key: 'finance_office',
                        label: 'Finance office',
                        actorType: 'platform_admin',
                        permission: ''
                    }
                ]
            }
        ]
    };
}

async function ensureFinanceConfig(req) {
    const { FinanceConfig } = getModels(req, 'FinanceConfig');
    let doc = await FinanceConfig.findOne();
    if (!doc) {
        doc = new FinanceConfig(defaultFinancePayload());
        await doc.save();
    } else if (
        (!doc.budgetTemplates || doc.budgetTemplates.length === 0) &&
        (!doc.workflowPresets || doc.workflowPresets.length === 0)
    ) {
        const defs = defaultFinancePayload();
        doc.budgetTemplates = defs.budgetTemplates;
        doc.workflowPresets = defs.workflowPresets;
        await doc.save();
    }
    return doc;
}

function getPreset(config, presetKey) {
    const key = presetKey || 'two_stage';
    return (config.workflowPresets || []).find((p) => p.presetKey === key) || config.workflowPresets?.[0];
}

/** Append workflow audit entry (mongoose document). */
function pushAudit(budget, { userId, actor, action, message = '', fromStatus = '', toStatus = '', stageKey = '' }) {
    if (!budget.auditLog) budget.auditLog = [];
    budget.auditLog.push({
        at: new Date(),
        userId,
        actor,
        action,
        message: message || '',
        fromStatus: fromStatus || '',
        toStatus: toStatus || '',
        stageKey: stageKey || ''
    });
}

function pickTemplateForOrg(config, org) {
    const typeKey = org.orgTypeKey || 'default';
    const templates = config.budgetTemplates || [];
    const match = templates.find(
        (t) => !t.orgTypeKeys?.length || t.orgTypeKeys.includes(typeKey) || t.orgTypeKeys.includes('default')
    );
    return match || templates[0];
}

function materializeLineItems(template, incoming) {
    const defs = template?.lineItemDefinitions || [];
    const byKey = {};
    (incoming || []).forEach((row) => {
        if (row && row.key) byKey[row.key] = row;
    });
    return defs.map((def) => {
        const row = byKey[def.key] || {};
        const base = {
            key: def.key,
            label: def.label,
            kind: def.kind || 'currency',
            amount: null,
            numberValue: null,
            textValue: '',
            note: row.note != null ? String(row.note) : ''
        };
        if (def.kind === 'currency') {
            base.amount = row.amount != null && row.amount !== '' ? Number(row.amount) : null;
        } else if (def.kind === 'number') {
            base.numberValue = row.numberValue != null && row.numberValue !== '' ? Number(row.numberValue) : null;
        } else {
            base.textValue = row.textValue != null ? String(row.textValue) : '';
        }
        return base;
    });
}

function validateRequiredLineItems(template, lineItems) {
    const defs = template?.lineItemDefinitions || [];
    for (const def of defs) {
        if (!def.required) continue;
        const li = lineItems.find((x) => x.key === def.key);
        if (!li) return { ok: false, message: `Missing line item: ${def.label || def.key}` };
        if (def.kind === 'currency' && (li.amount == null || Number.isNaN(li.amount))) {
            return { ok: false, message: `Required amount: ${def.label || def.key}` };
        }
        if (def.kind === 'number' && (li.numberValue == null || Number.isNaN(li.numberValue))) {
            return { ok: false, message: `Required number: ${def.label || def.key}` };
        }
        if (def.kind === 'text' && (!li.textValue || !String(li.textValue).trim())) {
            return { ok: false, message: `Required text: ${def.label || def.key}` };
        }
    }
    return { ok: true };
}

function nextRevisionNumber(budget) {
    const revs = budget.revisions || [];
    if (!revs.length) return 1;
    return Math.max(...revs.map((r) => r.revision || 0)) + 1;
}

async function listBudgetsForOrg(req, orgId) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    return OrgBudget.find({ orgId }).sort({ updatedAt: -1 }).lean();
}

async function getBudgetById(req, orgId, budgetId) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const b = await OrgBudget.findOne({ _id: budgetId, orgId }).lean();
    return b;
}

async function createBudget(req, orgId, userId, { templateKey, fiscalYear, title }) {
    const { Org, OrgBudget } = getModels(req, 'Org', 'OrgBudget');
    const org = await Org.findById(orgId);
    if (!org) {
        const err = new Error('Organization not found');
        err.statusCode = 404;
        throw err;
    }
    const config = await ensureFinanceConfig(req);
    const template =
        (config.budgetTemplates || []).find((t) => t.templateKey === templateKey) || pickTemplateForOrg(config, org);
    if (!template) {
        const err = new Error('No budget template configured');
        err.statusCode = 400;
        throw err;
    }
    const fy = fiscalYear != null ? String(fiscalYear) : String(new Date().getFullYear());
    const dup = await OrgBudget.findOne({
        orgId,
        fiscalYear: fy,
        templateKey: template.templateKey,
        status: { $nin: ['rejected'] }
    })
        .select('_id')
        .lean();
    if (dup) {
        const err = new Error(
            'A budget already exists for this fiscal year and template. Continue the existing one or reject it before starting another.'
        );
        err.statusCode = 409;
        throw err;
    }
    const lineItems = materializeLineItems(template, []);
    const budget = new OrgBudget({
        orgId,
        templateKey: template.templateKey,
        fiscalYear: fy,
        title: title || `${template.displayName} ${fy}`,
        status: 'draft',
        lineItems,
        workflow: {
            presetKey: template.workflowPresetKey || 'two_stage',
            currentStageIndex: 0,
            stagesSnapshot: [],
            completedStages: []
        },
        createdBy: userId,
        updatedBy: userId
    });
    pushAudit(budget, {
        userId,
        actor: 'org',
        action: 'draft_created',
        toStatus: 'draft',
        message: title ? `Title: ${title}` : ''
    });
    await budget.save();
    return budget.toObject();
}

async function updateBudgetDraft(req, orgId, budgetId, userId, { lineItems: incoming, title }) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'revision_requested'].includes(budget.status)) {
        const err = new Error('Budget cannot be edited in its current status');
        err.statusCode = 400;
        throw err;
    }
    const config = await ensureFinanceConfig(req);
    const template = (config.budgetTemplates || []).find((t) => t.templateKey === budget.templateKey);
    if (!template) {
        const err = new Error('Template missing');
        err.statusCode = 400;
        throw err;
    }
    if (title != null) budget.title = String(title);
    budget.lineItems = materializeLineItems(template, incoming);
    budget.updatedBy = userId;
    if (budget.status === 'revision_requested') {
        pushAudit(budget, {
            userId,
            actor: 'org',
            action: 'resumed_after_revision',
            fromStatus: 'revision_requested',
            toStatus: 'draft'
        });
        budget.status = 'draft';
    }
    await budget.save();
    return budget.toObject();
}

async function addComment(req, orgId, budgetId, userId, { body }) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    const text = (body || '').trim();
    if (!text) {
        const err = new Error('Comment body required');
        err.statusCode = 400;
        throw err;
    }
    const revision =
        budget.revisions && budget.revisions.length ? budget.revisions[budget.revisions.length - 1].revision : null;
    budget.comments.push({ userId, body: text, revision });
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    await budget.save();
    return budget.toObject();
}

async function submitBudget(req, orgId, budgetId, userId) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'revision_requested'].includes(budget.status)) {
        const err = new Error('Only draft or revision-requested budgets can be submitted');
        err.statusCode = 400;
        throw err;
    }
    const config = await ensureFinanceConfig(req);
    const template = (config.budgetTemplates || []).find((t) => t.templateKey === budget.templateKey);
    const v = validateRequiredLineItems(template, budget.lineItems || []);
    if (!v.ok) {
        const err = new Error(v.message);
        err.statusCode = 400;
        throw err;
    }
    const preset = getPreset(config, budget.workflow?.presetKey || template?.workflowPresetKey);
    if (!preset || !preset.stages?.length) {
        const err = new Error('Workflow preset not configured');
        err.statusCode = 500;
        throw err;
    }
    const rev = nextRevisionNumber(budget);
    budget.revisions.push({
        revision: rev,
        createdBy: userId,
        lineItemsSnapshot: JSON.parse(JSON.stringify(budget.lineItems || [])),
        workflowSnapshot: JSON.parse(JSON.stringify(budget.workflow || {})),
        status: budget.status
    });
    budget.workflow.presetKey = preset.presetKey;
    budget.workflow.stagesSnapshot = preset.stages.map((s) => ({
        key: s.key,
        label: s.label,
        actorType: s.actorType,
        permission: s.permission || ''
    }));
    budget.workflow.currentStageIndex = 0;
    budget.workflow.completedStages = [];
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    const prevStatus = budget.status;
    budget.status = 'in_review';
    budget.updatedBy = userId;
    pushAudit(budget, {
        userId,
        actor: 'org',
        action: 'submitted',
        fromStatus: prevStatus,
        toStatus: 'in_review'
    });
    await budget.save();
    return budget.toObject();
}

function currentStage(budget) {
    const stages = budget.workflow?.stagesSnapshot || [];
    const idx = budget.workflow?.currentStageIndex ?? 0;
    return stages[idx] || null;
}

async function approveStageOrg(req, orgId, budgetId, userId, stageKey) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (budget.status !== 'in_review') {
        const err = new Error('Budget is not in review');
        err.statusCode = 400;
        throw err;
    }
    const stage = currentStage(budget);
    if (!stage || stage.key !== stageKey) {
        const err = new Error('Invalid workflow stage');
        err.statusCode = 400;
        throw err;
    }
    if (stage.actorType !== 'org_permission') {
        const err = new Error('This stage is not an organization approval step');
        err.statusCode = 403;
        throw err;
    }
    const beforeStatus = budget.status;
    budget.workflow.completedStages.push({ key: stage.key, approvedBy: userId, approvedAt: new Date() });
    budget.workflow.currentStageIndex = (budget.workflow.currentStageIndex || 0) + 1;
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    const stages = budget.workflow.stagesSnapshot || [];
    if (budget.workflow.currentStageIndex >= stages.length) {
        budget.status = 'approved';
    }
    budget.updatedBy = userId;
    pushAudit(budget, {
        userId,
        actor: 'org',
        action: budget.status === 'approved' ? 'approved' : 'officer_stage_approved',
        fromStatus: beforeStatus,
        toStatus: budget.status,
        stageKey: stage.key
    });
    await budget.save();
    return budget.toObject();
}

async function approveStagePlatform(req, orgId, budgetId, userId, stageKey) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (budget.status !== 'in_review') {
        const err = new Error('Budget is not in review');
        err.statusCode = 400;
        throw err;
    }
    const stage = currentStage(budget);
    if (!stage || stage.key !== stageKey) {
        const err = new Error('Invalid workflow stage');
        err.statusCode = 400;
        throw err;
    }
    if (stage.actorType !== 'platform_admin') {
        const err = new Error('This stage is not a platform admin step');
        err.statusCode = 400;
        throw err;
    }
    const beforeStatus = budget.status;
    budget.workflow.completedStages.push({ key: stage.key, approvedBy: userId, approvedAt: new Date() });
    budget.workflow.currentStageIndex = (budget.workflow.currentStageIndex || 0) + 1;
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    const stages = budget.workflow.stagesSnapshot || [];
    if (budget.workflow.currentStageIndex >= stages.length) {
        budget.status = 'approved';
    }
    budget.updatedBy = userId;
    pushAudit(budget, {
        userId,
        actor: 'platform',
        action: budget.status === 'approved' ? 'approved' : 'platform_stage_approved',
        fromStatus: beforeStatus,
        toStatus: budget.status,
        stageKey: stage.key
    });
    await budget.save();
    return budget.toObject();
}

async function rejectBudget(req, orgId, budgetId, userId, { message, stageKey }, { platformOnly }) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (budget.status !== 'in_review') {
        const err = new Error('Budget is not in review');
        err.statusCode = 400;
        throw err;
    }
    const stage = currentStage(budget);
    if (!stage) {
        const err = new Error('Invalid workflow');
        err.statusCode = 400;
        throw err;
    }
    if (stageKey && stage.key !== stageKey) {
        const err = new Error('Invalid workflow stage');
        err.statusCode = 400;
        throw err;
    }
    if (platformOnly && stage.actorType !== 'platform_admin') {
        const err = new Error('Use the organization route for this stage');
        err.statusCode = 400;
        throw err;
    }
    if (!platformOnly && stage.actorType !== 'org_permission') {
        const err = new Error('Use the admin route for this stage');
        err.statusCode = 400;
        throw err;
    }
    const beforeStatus = budget.status;
    budget.status = 'rejected';
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    budget.updatedBy = userId;
    const msg = (message && String(message).trim()) || '';
    if (msg) {
        budget.comments.push({ userId, body: `Rejected: ${msg}`, revision: null });
    }
    pushAudit(budget, {
        userId,
        actor: platformOnly ? 'platform' : 'org',
        action: 'rejected',
        fromStatus: beforeStatus,
        toStatus: 'rejected',
        stageKey: stage.key,
        message: msg
    });
    await budget.save();
    return budget.toObject();
}

async function requestRevision(req, orgId, budgetId, userId, { message, stageKey }, { platformOnly }) {
    const { OrgBudget } = getModels(req, 'OrgBudget');
    const budget = await OrgBudget.findOne({ _id: budgetId, orgId });
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (budget.status !== 'in_review') {
        const err = new Error('Budget is not in review');
        err.statusCode = 400;
        throw err;
    }
    const stage = currentStage(budget);
    if (!stage) {
        const err = new Error('Invalid workflow');
        err.statusCode = 400;
        throw err;
    }
    if (stageKey && stage.key !== stageKey) {
        const err = new Error('Invalid workflow stage');
        err.statusCode = 400;
        throw err;
    }
    if (platformOnly && stage.actorType !== 'platform_admin') {
        const err = new Error('Use the organization route for this stage');
        err.statusCode = 400;
        throw err;
    }
    if (!platformOnly && stage.actorType !== 'org_permission') {
        const err = new Error('Use the admin route for this stage');
        err.statusCode = 400;
        throw err;
    }
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        const err = new Error('A note explaining the requested changes is required.');
        err.statusCode = 400;
        throw err;
    }
    const beforeStatus = budget.status;
    const rev = nextRevisionNumber(budget);
    budget.revisions.push({
        revision: rev,
        createdBy: userId,
        lineItemsSnapshot: JSON.parse(JSON.stringify(budget.lineItems || [])),
        workflowSnapshot: JSON.parse(JSON.stringify(budget.workflow || {})),
        status: 'revision_requested'
    });
    budget.status = 'revision_requested';
    budget.workflow.stagesSnapshot = [];
    budget.workflow.currentStageIndex = 0;
    budget.workflow.completedStages = [];
    budget.workflow.lastActionAt = new Date();
    budget.workflow.lastActionBy = userId;
    budget.updatedBy = userId;
    budget.comments.push({ userId, body: `Revision requested: ${trimmed}`, revision: rev });
    pushAudit(budget, {
        userId,
        actor: platformOnly ? 'platform' : 'org',
        action: 'revision_requested',
        fromStatus: beforeStatus,
        toStatus: 'revision_requested',
        stageKey: stage.key,
        message: trimmed
    });
    await budget.save();
    return budget.toObject();
}

async function listBudgetsAdmin(req, { status, search, page = 1, limit = 30 }) {
    const { OrgBudget, Org } = getModels(req, 'OrgBudget', 'Org');
    const filter = {};
    if (status) filter.status = status;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
    let orgIds = null;
    if (search && String(search).trim()) {
        const rx = new RegExp(String(search).trim(), 'i');
        const orgs = await Org.find({ org_name: rx }).select('_id').lean();
        orgIds = orgs.map((o) => o._id);
        if (!orgIds.length) {
            return { data: [], total: 0, page: parseInt(page, 10), limit: lim };
        }
        filter.orgId = { $in: orgIds };
    }
    const total = await OrgBudget.countDocuments(filter);
    const rows = await OrgBudget.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(lim).lean();
    const ids = [...new Set(rows.map((r) => String(r.orgId)))];
    const orgDocs = await Org.find({ _id: { $in: ids } })
        .select('org_name org_profile_image orgTypeKey')
        .lean();
    const orgMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o]));
    const enriched = rows.map((r) => ({
        ...r,
        org: orgMap[String(r.orgId)] || null
    }));
    return { data: enriched, total, page: parseInt(page, 10), limit: lim };
}

async function getFinanceConfigDoc(req) {
    return ensureFinanceConfig(req);
}

async function updateFinanceConfig(req, patch) {
    const { FinanceConfig } = getModels(req, 'FinanceConfig');
    await ensureFinanceConfig(req);
    const doc = await FinanceConfig.findOne();
    if (patch.budgetTemplates) doc.budgetTemplates = patch.budgetTemplates;
    if (patch.workflowPresets) doc.workflowPresets = patch.workflowPresets;
    await doc.save();
    return doc.toObject();
}

function budgetToExportRows(budget) {
    const rows = [];
    rows.push(['field', 'col2', 'col3', 'col4', 'col5', 'col6']);
    rows.push(['budgetId', String(budget._id), '', '', '', '']);
    rows.push(['title', budget.title || '', '', '', '', '']);
    rows.push(['fiscalYear', budget.fiscalYear || '', '', '', '', '']);
    rows.push(['templateKey', budget.templateKey || '', '', '', '', '']);
    rows.push(['status', budget.status || '', '', '', '', '']);
    rows.push(['---', 'lineItems', '', '', '', '']);
    rows.push(['key', 'label', 'amount', 'numberValue', 'textValue', 'note']);
    for (const li of budget.lineItems || []) {
        rows.push([
            li.key,
            li.label || '',
            li.amount != null ? String(li.amount) : '',
            li.numberValue != null ? String(li.numberValue) : '',
            li.textValue || '',
            li.note || ''
        ]);
    }
    return rows;
}

function toCsv(rows) {
    return rows
        .map((r) =>
            r
                .map((cell) => {
                    const s = cell == null ? '' : String(cell);
                    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
                    return s;
                })
                .join(',')
        )
        .join('\n');
}

async function exportBudget(req, orgId, budgetId, format) {
    const budget = await getBudgetById(req, orgId, budgetId);
    if (!budget) {
        const err = new Error('Budget not found');
        err.statusCode = 404;
        throw err;
    }
    if (format === 'csv') {
        const rows = budgetToExportRows(budget);
        return { contentType: 'text/csv; charset=utf-8', body: toCsv(rows), filename: `budget-${budgetId}.csv` };
    }
    return {
        contentType: 'application/json',
        body: { success: true, data: budget },
        filename: null
    };
}

module.exports = {
    ensureFinanceConfig,
    defaultFinancePayload,
    pickTemplateForOrg,
    getPreset,
    listBudgetsForOrg,
    getBudgetById,
    createBudget,
    updateBudgetDraft,
    addComment,
    submitBudget,
    approveStageOrg,
    approveStagePlatform,
    rejectBudget,
    requestRevision,
    listBudgetsAdmin,
    getFinanceConfigDoc,
    updateFinanceConfig,
    exportBudget,
    materializeLineItems,
    validateRequiredLineItems,
    budgetToExportRows,
    toCsv
};
