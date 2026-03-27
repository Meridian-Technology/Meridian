const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const lineItemTemplateSchema = new Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        required: { type: Boolean, default: false },
        type: { type: String, enum: ['text', 'number', 'currency', 'select'], default: 'text' },
        options: { type: [String], default: [] }
    },
    { _id: false }
);

const budgetSectionTemplateSchema = new Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        lineItems: { type: [lineItemTemplateSchema], default: [] }
    },
    { _id: false }
);

const orgBudgetTemplateSchema = new Schema(
    {
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        name: { type: String, required: true },
        isDefault: { type: Boolean, default: false },
        sections: { type: [budgetSectionTemplateSchema], default: [] },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { timestamps: true }
);

orgBudgetTemplateSchema.index({ org_id: 1, name: 1 }, { unique: true });

module.exports = orgBudgetTemplateSchema;
