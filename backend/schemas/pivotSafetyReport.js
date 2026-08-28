const mongoose = require('mongoose');

const PIVOT_SAFETY_REPORT_REASONS = Object.freeze([
  'harassment',
  'spam',
  'impersonation',
  'other',
]);

/** In-app user report for Just Go (Guideline 1.2). */
const pivotSafetyReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: PIVOT_SAFETY_REPORT_REASONS,
      required: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

pivotSafetyReportSchema.index({ reporterId: 1, createdAt: -1 });

module.exports = pivotSafetyReportSchema;
module.exports.PIVOT_SAFETY_REPORT_REASONS = PIVOT_SAFETY_REPORT_REASONS;
