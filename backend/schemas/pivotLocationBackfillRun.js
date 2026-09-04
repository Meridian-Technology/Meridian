const mongoose = require('mongoose');

const outcomeCountsSchema = new mongoose.Schema(
  {
    scanned: { type: Number, default: 0 },
    applied: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
    providerFailures: { type: Number, default: 0 },
    providerOperations: { type: Number, default: 0 },
    quotaStops: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    physical: { type: Number, default: 0 },
    approximate: { type: Number, default: 0 },
    online: { type: Number, default: 0 },
    tbd: { type: Number, default: 0 },
    registrationGated: { type: Number, default: 0 },
    ambiguous: { type: Number, default: 0 },
  },
  { _id: false },
);

const batchAuditSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, enum: ['live', 'historical'] },
    catalogAsOf: { type: Date, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['completed', 'paused', 'quota_reached', 'batch_complete'],
    },
    batchSize: { type: Number, required: true },
    maxProviderOperations: { type: Number, required: true, min: 0 },
    minIntervalMs: { type: Number, required: true },
    autoApplyConfidence: { type: Number, required: true },
    reviewConfidence: { type: Number, required: true },
    counts: { type: outcomeCountsSchema, required: true },
    lastErrorCode: String,
  },
  { _id: false },
);

/**
 * Per-city checkpoint and privacy-safe audit trail for rich-location backfill.
 * Event IDs, location text, provider payloads, coordinates, and Place IDs are
 * deliberately excluded from audit summaries.
 */
const pivotLocationBackfillRunSchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    scope: { type: String, required: true, enum: ['live', 'historical'], default: 'live' },
    version: { type: Number, default: 1 },
    /** Frozen selection boundary so resumed historical batches cannot drift. */
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
    cumulativeCounts: { type: outcomeCountsSchema, required: true },
    // Absent only while a brand-new run is in progress before its first audit.
    lastBatch: { type: batchAuditSchema, default: undefined },
    auditSummaries: { type: [batchAuditSchema], default: undefined },
  },
  { timestamps: true },
);

pivotLocationBackfillRunSchema.index(
  { tenantKey: 1, scope: 1 },
  { unique: true, name: 'tenantKey_scope_unique' },
);

module.exports = pivotLocationBackfillRunSchema;
