const mongoose = require('mongoose');

const MERIDIAN_JOB_ATTEMPT_STATUSES = Object.freeze([
  'pending',
  'running',
  'succeeded',
  'failed',
]);

const MERIDIAN_JOB_ATTEMPT_INDEX_NAMES = Object.freeze([
  'meridian_job_attempt_run_attempt_unique',
  'meridian_job_attempt_run_createdAt',
]);

const meridianJobAttemptSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'MeridianJobRun',
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
    },
    status: {
      type: String,
      required: true,
      enum: MERIDIAN_JOB_ATTEMPT_STATUSES,
      default: 'pending',
    },
    error: { type: String, default: null, trim: true, maxlength: 1000 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, autoIndex: false },
);

meridianJobAttemptSchema.index(
  { runId: 1, attemptNumber: 1 },
  { unique: true, name: MERIDIAN_JOB_ATTEMPT_INDEX_NAMES[0] },
);
meridianJobAttemptSchema.index(
  { runId: 1, createdAt: -1 },
  { name: MERIDIAN_JOB_ATTEMPT_INDEX_NAMES[1] },
);

module.exports = meridianJobAttemptSchema;
module.exports.MERIDIAN_JOB_ATTEMPT_STATUSES = MERIDIAN_JOB_ATTEMPT_STATUSES;
module.exports.MERIDIAN_JOB_ATTEMPT_INDEX_NAMES = MERIDIAN_JOB_ATTEMPT_INDEX_NAMES;
