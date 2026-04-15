const mongoose = require('mongoose');

const lineItemValueSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        label: { type: String, default: '' },
        kind: { type: String, enum: ['currency', 'number', 'text'], default: 'currency' },
        amount: { type: Number, default: null },
        numberValue: { type: Number, default: null },
        textValue: { type: String, default: '' },
        note: { type: String, default: '' }
    },
    { _id: false }
);

const workflowStageStateSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        label: { type: String, default: '' },
        actorType: { type: String, enum: ['org_permission', 'platform_admin'], required: true },
        permission: { type: String, default: '' }
    },
    { _id: false }
);

const completedStageSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        approvedAt: { type: Date, default: Date.now },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { _id: false }
);

const budgetCommentSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        body: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        revision: { type: Number, default: null }
    },
    { _id: false }
);

const budgetRevisionSchema = new mongoose.Schema(
    {
        revision: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        lineItemsSnapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
        workflowSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
        status: { type: String, default: '' }
    },
    { _id: false }
);

const budgetAuditEntrySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actor: { type: String, enum: ['org', 'platform', 'system'], required: true },
        action: { type: String, required: true },
        message: { type: String, default: '' },
        fromStatus: { type: String, default: '' },
        toStatus: { type: String, default: '' },
        stageKey: { type: String, default: '' }
    },
    { _id: false }
);

const orgBudgetSchema = new mongoose.Schema(
    {
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        templateKey: { type: String, required: true },
        fiscalYear: { type: String, required: true },
        title: { type: String, default: '' },
        status: {
            type: String,
            enum: ['draft', 'submitted', 'in_review', 'approved', 'rejected', 'revision_requested'],
            default: 'draft',
            index: true
        },
        lineItems: { type: [lineItemValueSchema], default: [] },
        workflow: {
            presetKey: { type: String, default: '' },
            currentStageIndex: { type: Number, default: 0 },
            stagesSnapshot: { type: [workflowStageStateSchema], default: [] },
            completedStages: { type: [completedStageSchema], default: [] },
            lastActionAt: { type: Date },
            lastActionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        revisions: { type: [budgetRevisionSchema], default: [] },
        comments: { type: [budgetCommentSchema], default: [] },
        auditLog: { type: [budgetAuditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

orgBudgetSchema.index({ orgId: 1, fiscalYear: 1, templateKey: 1 });
orgBudgetSchema.index({ orgId: 1, status: 1 });

module.exports = orgBudgetSchema;
