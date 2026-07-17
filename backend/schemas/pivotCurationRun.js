const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { RUN_STATUSES } = require('./pivotCurationJob');

const CURATION_RUN_STATUSES = RUN_STATUSES;

const runStatsSchema = new mongoose.Schema(
  {
    discovered: { type: Number, default: 0 },
    upserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    /** Plain map of batchWeek → upsert count for multi-week crawls. */
    byBatchWeek: { type: mongoose.Schema.Types.Mixed, default: null },
    message: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const runFailureSchema = new mongoose.Schema(
  {
    sourceUrl: { type: String, default: null, trim: true },
    name: { type: String, default: null, trim: true },
    message: { type: String, default: null, trim: true },
    code: { type: String, default: null, trim: true },
  },
  { _id: false },
);

/** Upserted catalog rows from a crawl — capped for UI polling payloads. */
const runEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, default: null, trim: true },
    name: { type: String, default: null, trim: true },
    batchWeek: { type: String, default: null, trim: true },
    sourceUrl: { type: String, default: null, trim: true },
    ingestStatus: { type: String, default: null, trim: true },
    updated: { type: Boolean, default: false },
  },
  { _id: false },
);

const pivotCurationRunSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'PivotCurationJob',
    },
    batchWeek: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidIsoWeek,
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
    /**
     * When true, every discovered event is forced into `batchWeek`.
     * When false (default), each event lands in the ISO week of its start date;
     * `batchWeek` is only a fallback for undated events / UI focus week.
     */
    forceBatchWeek: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: CURATION_RUN_STATUSES,
      default: 'queued',
      required: true,
    },
    maxEvents: {
      type: Number,
      default: null,
    },
    provider: {
      type: String,
      default: null,
      trim: true,
    },
    url: {
      type: String,
      default: null,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    stats: {
      type: runStatsSchema,
      default: () => ({
        discovered: 0,
        upserted: 0,
        skipped: 0,
        failed: 0,
        updated: 0,
        message: null,
      }),
    },
    failures: {
      type: [runFailureSchema],
      default: [],
    },
    events: {
      type: [runEventSchema],
      default: [],
    },
    error: {
      type: String,
      default: null,
      trim: true,
    },
    errorCode: {
      type: String,
      default: null,
      trim: true,
    },
    createdBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotCurationRunSchema.pre('validate', function normalizeFields() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
});

pivotCurationRunSchema.index({ tenantKey: 1, createdAt: -1 });
pivotCurationRunSchema.index({ jobId: 1, createdAt: -1 });
pivotCurationRunSchema.index({ tenantKey: 1, status: 1 });

module.exports = pivotCurationRunSchema;
module.exports.CURATION_RUN_STATUSES = CURATION_RUN_STATUSES;
