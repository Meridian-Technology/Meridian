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
  },
  { timestamps: true }
);

pivotReferralRedemptionSchema.index({ globalUserId: 1, code: 1 }, { unique: true });

module.exports = pivotReferralRedemptionSchema;
