const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orgBudgetReviewSchema = new Schema(
    {
        budget_id: { type: Schema.Types.ObjectId, ref: 'OrgBudget', required: true, index: true },
        org_id: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
        reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        action: {
            type: String,
            enum: ['comment', 'request_changes', 'approve', 'reject'],
            required: true
        },
        comment: { type: String, default: '' },
        metadata: {
            type: Map,
            of: String,
            default: {}
        }
    },
    { timestamps: true }
);

module.exports = orgBudgetReviewSchema;
