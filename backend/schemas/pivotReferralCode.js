const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const pivotReferralCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    cohortId: {
      type: String,
      required: true,
      trim: true,
    },
    maxRedemptions: {
      type: Number,
      required: true,
      min: 0,
      default: 100,
    },
    redemptionCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    batchWeek: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator(value) {
          if (value == null || value === '') return true;
          return isValidIsoWeek(value);
        },
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
  },
  { timestamps: true }
);

pivotReferralCodeSchema.pre('validate', function normalizeFields() {
  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.cohortId) {
    this.cohortId = String(this.cohortId).trim();
  }
});

pivotReferralCodeSchema.methods.isRedeemable = function isRedeemable(now = new Date()) {
  if (!this.active) return false;
  if (this.expiresAt && this.expiresAt < now) return false;
  if (this.redemptionCount >= this.maxRedemptions) return false;
  return true;
};

pivotReferralCodeSchema.index({ code: 1 }, { unique: true });
pivotReferralCodeSchema.index({ tenantKey: 1, active: 1 });

module.exports = pivotReferralCodeSchema;
