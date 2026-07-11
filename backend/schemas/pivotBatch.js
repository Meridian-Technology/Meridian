const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

/**
 * Per-city week ops progress for Curation readiness and release auditing.
 * Tenant-scoped (city DB). Does not gate the feed under Choice A —
 * feed keys only off event `customFields.pivot.ingestStatus === 'published'`.
 */
const PIVOT_BATCH_STATUSES = Object.freeze(['curating', 'ready', 'released']);

const pivotBatchSchema = new mongoose.Schema(
  {
    batchWeek: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          return isValidIsoWeek(value);
        },
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
    status: {
      type: String,
      enum: PIVOT_BATCH_STATUSES,
      required: true,
      default: 'curating',
    },
    targetEventCount: {
      type: Number,
      min: 0,
      default: 40,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotBatchSchema.index({ batchWeek: 1 }, { unique: true });

module.exports = pivotBatchSchema;
module.exports.PIVOT_BATCH_STATUSES = PIVOT_BATCH_STATUSES;
