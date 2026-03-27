const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const budgetLineItemSchema = new Schema(
    {
        sectionKey: { type: String, required: true },
        label: { type: String, required: true },
        description: { type: String, default: '' },
        requestedAmount: { type: Number, required: true, min: 0 },
        approvedAmount: { type: Number, default: null, min: 0 },
        accounting: {
            type: Map,
            of: String,
            default: {}
        }
    },
    { _id: true }
);

const orgBudgetSchema = new Schema(
    {
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        fiscalYear: { type: String, required: true },
        name: { type: String, required: true },
        templateId: { type: Schema.Types.ObjectId, ref: 'OrgBudgetTemplate', default: null },
        state: {
            type: String,
            enum: [
                'draft',
                'submitted',
                'preliminary_review',
                'final_review',
                'changes_requested',
                'approved',
                'appealed',
                'finalized',
                'rejected'
            ],
            default: 'draft'
        },
        lineItems: { type: [budgetLineItemSchema], default: [] },
        totalRequested: { type: Number, default: 0 },
        totalApproved: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { timestamps: true }
);

orgBudgetSchema.index({ org_id: 1, fiscalYear: 1, name: 1 }, { unique: true });

module.exports = orgBudgetSchema;
