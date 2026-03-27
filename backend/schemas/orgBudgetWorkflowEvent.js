const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgBudgetWorkflowEventSchema = new Schema(
    {
        budget_id: { type: Schema.Types.ObjectId, ref: 'OrgBudget', required: true, index: true },
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        fromState: { type: String, default: null },
        toState: { type: String, required: true },
        reason: { type: String, default: '' },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
    },
    { timestamps: true }
);

module.exports = orgBudgetWorkflowEventSchema;
