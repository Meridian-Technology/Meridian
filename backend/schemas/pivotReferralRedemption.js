const mongoose = require('mongoose');

/** One row per successful server-side redemption (idempotent via unique index). */
const pivotReferralRedemptionSchema = new mongoose.Schema(
  {
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    pivotReferralCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /** Pilot user who shared the invite link (global identity). Best-effort attribution. */
    referredByGlobalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      default: null,
    },
  },
  { timestamps: true }
);

pivotReferralRedemptionSchema.index({ globalUserId: 1, code: 1 }, { unique: true });
pivotReferralRedemptionSchema.index({ referredByGlobalUserId: 1, createdAt: -1 });

module.exports = pivotReferralRedemptionSchema;
