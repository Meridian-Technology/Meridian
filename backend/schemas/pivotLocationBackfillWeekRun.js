const mongoose = require('mongoose');

/**
 * Durable checkpoint for the temporary tenant × batch-week location migration.
 * Detailed decisions remain on their Event documents; this collection contains
 * only aggregate, privacy-safe operational state.
 */
const pivotLocationBackfillWeekRunSchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    batchWeek: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-W\d{2}$/, 'batchWeek must be ISO week format YYYY-Www'],
    },
    version: { type: Number, default: 1 },
    catalogAsOf: Date,
    status: {
      type: String,
      required: true,
      enum: ['running', 'paused', 'quota_reached', 'completed', 'batch_complete'],
    },
    checkpoint: {
      lastEventId: mongoose.Schema.Types.ObjectId,
      processedAt: Date,
    },
    cumulativeCounts: { type: mongoose.Schema.Types.Mixed, required: true },
    lastBatch: { type: mongoose.Schema.Types.Mixed, default: undefined },
    auditSummaries: { type: [mongoose.Schema.Types.Mixed], default: undefined },
  },
  { timestamps: true },
);

pivotLocationBackfillWeekRunSchema.index(
  { tenantKey: 1, batchWeek: 1 },
  { unique: true, name: 'tenantKey_batchWeek_unique' },
);

module.exports = pivotLocationBackfillWeekRunSchema;
