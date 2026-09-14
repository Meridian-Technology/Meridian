const mongoose = require('mongoose');
const {
  COMPUTE_JOB_STATUSES,
  COMPUTE_JOB_ORIGIN_TYPES,
} = require('../utilities/pivotComputeJobTransitions');
const { COMPUTE_JOB_KINDS, CONTRACT_VERSION } = require('../utilities/pivotAdminComputeJobContract');

const PIVOT_COMPUTE_JOB_INDEX_NAMES = Object.freeze([
  'pivot_compute_job_external_job_id_unique',
  'pivot_compute_job_create_idempotency_unique',
  'pivot_compute_job_schedule_occurrence_unique',
  'pivot_compute_job_claim_queue',
  'pivot_compute_job_lease_expiry',
  'pivot_compute_job_city_createdAt',
  'pivot_compute_job_city_status_updatedAt',
  'pivot_compute_job_export_artifact_expiry',
]);

const MAX_PROGRESS_MESSAGE_LENGTH = 500;
const MAX_PROGRESS_PHASE_LENGTH = 64;
const MAX_PROGRESS_COUNTER_KEYS = 20;
// Keep embedded results below MongoDB's 16 MiB document ceiling while leaving
// room for job metadata and context. Full-city refreshes commonly exceed 512 KiB.
const MAX_EMBEDDED_RESULT_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_REF_KEY_LENGTH = 256;
const MAX_OPTIONS_BYTES = 16 * 1024;

const progressSchema = new mongoose.Schema(
  {
    phase: { type: String, trim: true, maxlength: MAX_PROGRESS_PHASE_LENGTH, default: null },
    message: { type: String, trim: true, maxlength: MAX_PROGRESS_MESSAGE_LENGTH, default: null },
    counters: {
      type: Map,
      of: Number,
      default: undefined,
    },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const leaseCapabilitySchema = new mongoose.Schema(
  {
    contractVersion: { type: String, required: true, enum: [CONTRACT_VERSION] },
    implementationRevision: { type: String, required: true, trim: true, maxlength: 128 },
    supportedContractVersions: {
      type: [String],
      required: true,
      validate: [(values) => Array.isArray(values) && values.length > 0 && values.length <= 8, 'invalid supportedContractVersions'],
    },
    supportedKinds: {
      type: [String],
      required: true,
      enum: COMPUTE_JOB_KINDS,
      validate: [(values) => Array.isArray(values) && values.length > 0 && values.length <= 8, 'invalid supportedKinds'],
    },
  },
  { _id: false },
);

const leaseSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, trim: true, maxlength: 128 },
    workerId: { type: String, required: true, trim: true, maxlength: 128 },
    attemptNumber: { type: Number, required: true, min: 1, max: 100 },
    attemptId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'PivotComputeJobAttempt' },
    expiresAt: { type: Date, required: true },
    capability: { type: leaseCapabilitySchema, default: null },
  },
  { _id: false },
);

const originSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: COMPUTE_JOB_ORIGIN_TYPES },
    scheduleId: { type: String, default: null, trim: true, maxlength: 128 },
    scheduleOccurrenceId: { type: String, default: null, trim: true, maxlength: 160 },
    requestedBy: { type: String, default: null, trim: true, maxlength: 256 },
  },
  { _id: false },
);

const resultArtifactRefSchema = new mongoose.Schema(
  {
    storage: { type: String, required: true, enum: ['s3', 'gridfs'], default: 's3' },
    key: { type: String, required: true, trim: true, maxlength: MAX_ARTIFACT_REF_KEY_LENGTH },
    byteSize: { type: Number, required: true, min: 1, max: MAX_EMBEDDED_RESULT_BYTES },
    checksum: { type: String, default: null, trim: true, maxlength: 128 },
  },
  { _id: false },
);

const exportArtifactEntrySchema = new mongoose.Schema(
  {
    logicalName: { type: String, required: true, trim: true, maxlength: 128 },
    artifactId: { type: String, required: true, trim: true, maxlength: 128 },
    mimeType: { type: String, required: true, trim: true, maxlength: 64 },
    byteCount: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, trim: true, maxlength: 64 },
    slideNumber: { type: Number, default: null, min: 1, max: 20 },
    objectKey: { type: String, required: true, trim: true, maxlength: 512 },
  },
  { _id: false },
);

const exportArtifactsSchema = new mongoose.Schema(
  {
    attemptId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'PivotComputeJobAttempt' },
    attemptNumber: { type: Number, required: true, min: 1, max: 100 },
    prefix: { type: String, required: true, trim: true, maxlength: 512 },
    grantId: { type: String, required: true, trim: true, maxlength: 128 },
    finalizedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    expired: { type: Boolean, default: false },
    cleanedAt: { type: Date, default: null },
    artifacts: { type: [exportArtifactEntrySchema], default: undefined },
  },
  { _id: false },
);

const storedResultSchema = new mongoose.Schema(
  {
    mode: { type: String, required: true, enum: ['embedded', 'artifact-ref'] },
    embedded: { type: mongoose.Schema.Types.Mixed, default: null },
    artifactRef: { type: resultArtifactRefSchema, default: null },
    resultIdempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    submittedAt: { type: Date, required: true },
    contractVersion: { type: String, required: true, enum: [CONTRACT_VERSION], default: CONTRACT_VERSION },
  },
  { _id: false },
);

const applicationAuditSchema = new mongoose.Schema(
  {
    previewId: { type: String, default: null, trim: true, maxlength: 128 },
    idempotencyKey: { type: String, default: null, trim: true, maxlength: 128 },
    appliedAt: { type: Date, default: null },
    appliedBy: { type: String, default: null, trim: true, maxlength: 256 },
    outcome: {
      type: String,
      default: null,
      enum: ['completed', 'partial', 'rejected'],
    },
    errorCode: { type: String, default: null, trim: true, maxlength: 64 },
    errorMessage: { type: String, default: null, trim: true, maxlength: 1000 },
    previewDrift: { type: Boolean, default: false },
    summary: {
      creates: { type: Number, default: 0, min: 0 },
      updates: { type: Number, default: 0, min: 0 },
      unchanged: { type: Number, default: 0, min: 0 },
      conflicts: { type: Number, default: 0, min: 0 },
      stale: { type: Number, default: 0, min: 0 },
      rejected: { type: Number, default: 0, min: 0 },
      skipped: { type: Number, default: 0, min: 0 },
    },
  },
  { _id: false },
);

const jobFailureSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 64 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    details: {
      type: [String],
      default: undefined,
      validate: [
        (values) => !values || (
          values.length <= 12 && values.every((value) => String(value).length <= 240)
        ),
        'failure details exceed safe bounds',
      ],
    },
    retryable: { type: Boolean, default: false },
  },
  { _id: false },
);

function boundedByteLength(value, maxBytes) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function normalizeCityKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const pivotComputeJobSchema = new mongoose.Schema(
  {
    externalJobId: {
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
    cityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    kind: {
      type: String,
      required: true,
      enum: COMPUTE_JOB_KINDS,
    },
    contractVersion: {
      type: String,
      required: true,
      enum: [CONTRACT_VERSION],
      default: CONTRACT_VERSION,
    },
    implementationRevision: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128,
    },
    contextVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    status: {
      type: String,
      required: true,
      enum: COMPUTE_JOB_STATUSES,
      default: 'pending',
    },
    origin: { type: originSchema, required: true },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    createIdempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    scheduleOccurrenceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
    },
    attemptCount: { type: Number, default: 0, min: 0, max: 100 },
    cancelRequested: { type: Boolean, default: false },
    lease: { type: leaseSchema, default: null },
    progress: { type: progressSchema, default: null },
    result: { type: storedResultSchema, default: null },
    exportArtifacts: { type: exportArtifactsSchema, default: null },
    applicationAudit: { type: applicationAuditSchema, default: null },
    failure: { type: jobFailureSchema, default: null },
    requestedAt: { type: Date, required: true },
    leasedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, autoIndex: false },
);

pivotComputeJobSchema.pre('validate', function normalizeComputeJobFields() {
  this.cityKey = normalizeCityKey(this.cityKey);
  this.tenantKey = normalizeCityKey(this.tenantKey || this.cityKey);
  if (this.scheduleOccurrenceId === undefined) {
    this.scheduleOccurrenceId = this.origin?.scheduleOccurrenceId ?? null;
  }
  if (this.progress?.counters instanceof Map && this.progress.counters.size > MAX_PROGRESS_COUNTER_KEYS) {
    this.invalidate('progress.counters', `progress counters exceed ${MAX_PROGRESS_COUNTER_KEYS} keys`);
  }
  if (boundedByteLength(this.options, MAX_OPTIONS_BYTES) > MAX_OPTIONS_BYTES) {
    this.invalidate('options', `options exceed ${MAX_OPTIONS_BYTES} bytes`);
  }
  if (this.result?.mode === 'embedded' && this.result.embedded != null) {
    if (boundedByteLength(this.result.embedded, MAX_EMBEDDED_RESULT_BYTES) > MAX_EMBEDDED_RESULT_BYTES) {
      this.invalidate('result.embedded', `embedded result exceeds ${MAX_EMBEDDED_RESULT_BYTES} bytes`);
    }
  }
});

pivotComputeJobSchema.index(
  { externalJobId: 1 },
  { unique: true, name: PIVOT_COMPUTE_JOB_INDEX_NAMES[0] },
);
pivotComputeJobSchema.index(
  { createIdempotencyKey: 1 },
  { unique: true, name: PIVOT_COMPUTE_JOB_INDEX_NAMES[1] },
);
pivotComputeJobSchema.index(
  { scheduleOccurrenceId: 1 },
  {
    unique: true,
    name: PIVOT_COMPUTE_JOB_INDEX_NAMES[2],
    partialFilterExpression: { scheduleOccurrenceId: { $type: 'string' } },
  },
);
pivotComputeJobSchema.index(
  { status: 1, kind: 1, cityKey: 1, requestedAt: 1 },
  { name: PIVOT_COMPUTE_JOB_INDEX_NAMES[3] },
);
pivotComputeJobSchema.index(
  { status: 1, 'lease.expiresAt': 1 },
  {
    name: PIVOT_COMPUTE_JOB_INDEX_NAMES[4],
    partialFilterExpression: { status: { $in: ['leased', 'running'] } },
  },
);
pivotComputeJobSchema.index(
  { cityKey: 1, createdAt: -1 },
  { name: PIVOT_COMPUTE_JOB_INDEX_NAMES[5] },
);
pivotComputeJobSchema.index(
  { cityKey: 1, status: 1, updatedAt: -1 },
  { name: PIVOT_COMPUTE_JOB_INDEX_NAMES[6] },
);
pivotComputeJobSchema.index(
  { kind: 1, 'exportArtifacts.expiresAt': 1 },
  {
    name: PIVOT_COMPUTE_JOB_INDEX_NAMES[7],
    partialFilterExpression: {
      kind: 'carousel-export',
      'exportArtifacts.expired': false,
    },
  },
);

module.exports = pivotComputeJobSchema;
module.exports.PIVOT_COMPUTE_JOB_INDEX_NAMES = PIVOT_COMPUTE_JOB_INDEX_NAMES;
module.exports.MAX_EMBEDDED_RESULT_BYTES = MAX_EMBEDDED_RESULT_BYTES;
module.exports.MAX_OPTIONS_BYTES = MAX_OPTIONS_BYTES;
