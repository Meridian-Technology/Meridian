const mongoose = require('mongoose');

const lineItemDefinitionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        required: { type: Boolean, default: false },
        kind: { type: String, enum: ['currency', 'number', 'text'], default: 'currency' },
        helpText: { type: String, default: '' }
    },
    { _id: false }
);

const workflowStageSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        actorType: { type: String, enum: ['org_permission', 'platform_admin'], required: true },
        permission: { type: String, default: 'manage_finances' }
    },
    { _id: false }
);

const workflowPresetSchema = new mongoose.Schema(
    {
        presetKey: { type: String, required: true },
        stages: { type: [workflowStageSchema], default: [] }
    },
    { _id: false }
);

const budgetTemplateSchema = new mongoose.Schema(
    {
        templateKey: { type: String, required: true },
        displayName: { type: String, required: true },
        orgTypeKeys: { type: [String], default: [] },
        fiscalLabel: { type: String, default: 'Fiscal year' },
        workflowPresetKey: { type: String, default: 'two_stage' },
        lineItemDefinitions: { type: [lineItemDefinitionSchema], default: [] }
    },
    { _id: false }
);

const financeConfigSchema = new mongoose.Schema(
    {
        budgetTemplates: { type: [budgetTemplateSchema], default: [] },
        workflowPresets: { type: [workflowPresetSchema], default: [] }
    },
    { timestamps: true }
);

module.exports = financeConfigSchema;
