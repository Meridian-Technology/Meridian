const mongoose = require('mongoose');

/**
 * Global allowlist for Just Go Creator Console access.
 * One active grant scopes a GlobalUser to a single pivot city tenant.
 * Choice (Task 1.1): global DB via getGlobalModelService — same family as
 * TenantMembership / PivotReferralCode — so platform admins can grant/revoke
 * without a city DB connection, with audit fields and soft revoke.
 */
const PIVOT_CREATOR_GRANT_STATUSES = ['active', 'revoked'];

const pivotCreatorGrantSchema = new mongoose.Schema(
  {
    /** Plan field `userId` → global identity (GlobalUser). */
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: PIVOT_CREATOR_GRANT_STATUSES,
      default: 'active',
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: false,
      default: null,
    },
    grantedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: false,
      default: null,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

pivotCreatorGrantSchema.index({ globalUserId: 1, tenantKey: 1 }, { unique: true });
pivotCreatorGrantSchema.index({ tenantKey: 1, status: 1 });
pivotCreatorGrantSchema.index({ globalUserId: 1, status: 1 });

module.exports = pivotCreatorGrantSchema;
module.exports.PIVOT_CREATOR_GRANT_STATUSES = PIVOT_CREATOR_GRANT_STATUSES;
