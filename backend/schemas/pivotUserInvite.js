const mongoose = require('mongoose');

/**
 * One personal invite link per user per city (`justgo.lol/invite/{code}`).
 * Never expires and has no redemption cap: opening it is how friends find
 * friends. Admin cohort codes (`PivotReferralCode`) stay for campaigns.
 *
 * `inviterName` / `inviterPicture` are a snapshot refreshed whenever the owner
 * loads their link, so the public preview never reads a tenant DB.
 */
const pivotUserInviteSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
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
    /** Inviter's user id in the tenant DB — the friendship target on accept. */
    tenantUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    inviterName: {
      type: String,
      trim: true,
      default: '',
    },
    inviterPicture: {
      type: String,
      trim: true,
      default: null,
    },
    acceptedCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true }
);

pivotUserInviteSchema.index({ code: 1 }, { unique: true });
pivotUserInviteSchema.index({ globalUserId: 1, tenantKey: 1 }, { unique: true });

module.exports = pivotUserInviteSchema;
