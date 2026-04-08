const mongoose = require('mongoose');

/** Append-only audit when OrgMember document is hard-deleted (removal history). */
const orgMembershipAuditSchema = new mongoose.Schema({
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now }
}, { timestamps: false });

orgMembershipAuditSchema.index({ org_id: 1, at: -1 });

module.exports = orgMembershipAuditSchema;
