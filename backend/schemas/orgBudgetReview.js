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
        parentReviewId: { type: Schema.Types.ObjectId, ref: 'OrgBudgetReview', default: null },
        visibility: {
            type: String,
            enum: ['internal', 'submitter_visible'],
            default: 'submitter_visible'
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

module.exports = orgBudgetReviewSchema;
