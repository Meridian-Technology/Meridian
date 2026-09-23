const mongoose = require('mongoose');

const MERIDIAN_JOB_RUN_CATEGORIES = Object.freeze(['notification', 'compute_surface']);

const MERIDIAN_JOB_RUN_STATUSES = Object.freeze([
  'pending',
  'running',
  'retry_wait',
  'succeeded',
  'failed',
  'preview',
]);

const MERIDIAN_JOB_RUN_INDEX_NAMES = Object.freeze([
  'meridian_job_run_run_key_unique',
  'meridian_job_run_claim_queue',
  'meridian_job_run_tenant_createdAt',
  'meridian_job_run_tenant_status_updatedAt',
  'meridian_job_run_type_createdAt',
]);

const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_SUMMARY_BYTES = 16 * 1024;
const MAX_ATTEMPTS = 3;

function boundedByteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function normalizeTenantKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const summarySchema = new mongoose.Schema(
  {
    attempted: { type: Number, default: 0, min: 0 },
    accepted: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    recipientOverflowCount: { type: Number, default: 0, min: 0 },
    message: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const meridianJobRunSchema = new mongoose.Schema(
  {
    runKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    category: {
      type: String,
      required: true,
      enum: MERIDIAN_JOB_RUN_CATEGORIES,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
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
      enum: MERIDIAN_JOB_RUN_STATUSES,
      default: 'pending',
    },
    scheduledFor: { type: Date, required: true },
    nextAttemptAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0, min: 0, max: MAX_ATTEMPTS },
    maxAttempts: { type: Number, default: MAX_ATTEMPTS, min: 1, max: MAX_ATTEMPTS },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    summary: { type: summarySchema, default: null },
    lastError: { type: String, default: null, trim: true, maxlength: 1000 },
    failureAlertSentAt: { type: Date, default: null },
    failureAlertClaimedAt: { type: Date, default: null },
    pivotDropPushRunId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: 'PivotDropPushRun',
    },
    claimedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, autoIndex: false },
);

meridianJobRunSchema.pre('validate', function normalizeMeridianJobRun() {
  this.tenantKey = normalizeTenantKey(this.tenantKey);
  if (!this.nextAttemptAt && this.scheduledFor) {
    this.nextAttemptAt = this.scheduledFor;
  }
  if (boundedByteLength(this.payload) > MAX_PAYLOAD_BYTES) {
    this.invalidate('payload', `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  if (this.summary != null && boundedByteLength(this.summary) > MAX_SUMMARY_BYTES) {
    this.invalidate('summary', `summary exceeds ${MAX_SUMMARY_BYTES} bytes`);
  }
});

meridianJobRunSchema.index(
  { runKey: 1 },
  { unique: true, name: MERIDIAN_JOB_RUN_INDEX_NAMES[0] },
);
meridianJobRunSchema.index(
  { status: 1, nextAttemptAt: 1 },
  { name: MERIDIAN_JOB_RUN_INDEX_NAMES[1] },
);
meridianJobRunSchema.index(
  { tenantKey: 1, createdAt: -1 },
  { name: MERIDIAN_JOB_RUN_INDEX_NAMES[2] },
);
meridianJobRunSchema.index(
  { tenantKey: 1, status: 1, updatedAt: -1 },
  { name: MERIDIAN_JOB_RUN_INDEX_NAMES[3] },
);
meridianJobRunSchema.index(
  { type: 1, createdAt: -1 },
  { name: MERIDIAN_JOB_RUN_INDEX_NAMES[4] },
);

module.exports = meridianJobRunSchema;
module.exports.MERIDIAN_JOB_RUN_CATEGORIES = MERIDIAN_JOB_RUN_CATEGORIES;
module.exports.MERIDIAN_JOB_RUN_STATUSES = MERIDIAN_JOB_RUN_STATUSES;
module.exports.MERIDIAN_JOB_RUN_INDEX_NAMES = MERIDIAN_JOB_RUN_INDEX_NAMES;
module.exports.MAX_PAYLOAD_BYTES = MAX_PAYLOAD_BYTES;
module.exports.MAX_SUMMARY_BYTES = MAX_SUMMARY_BYTES;
module.exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
