const mongoose = require('mongoose');

const CURATION_PROVIDERS = ['partiful', 'luma', 'manual-json', 'generic-site'];
const BATCH_WEEK_STRATEGIES = ['explicit', 'next-drop', 'current-iso'];
const RUN_STATUSES = ['queued', 'running', 'completed', 'failed'];
const {
  mergeExtractionHints,
  MAX_PROMPT_HINTS,
  MAX_PROMPT_HINT_LENGTH,
} = require('../utilities/pivotExtractionHints');

const extractionProfileSchema = new mongoose.Schema(
  {
    promptHints: {
      type: [String],
      default: [],
      validate: [
        (values) => Array.isArray(values)
          && values.length <= MAX_PROMPT_HINTS
          && values.every((value) => String(value).length <= MAX_PROMPT_HINT_LENGTH),
        'promptHints exceed safe bounds',
      ],
    },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: String, default: null, trim: true, maxlength: 320 },
    suggestedHints: {
      type: [{
        id: { type: String, required: true },
        field: { type: String, required: true },
        text: { type: String, required: true, maxlength: MAX_PROMPT_HINT_LENGTH },
        eventId: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    extractionRules: { type: [{
      id: { type: String, required: true },
      field: { type: String, required: true, enum: ['image', 'description', 'start_time'] },
      reason: { type: String, required: true },
      badValue: { type: String, required: true, maxlength: 1000 },
      exampleId: { type: String, required: true },
      before: { type: String, default: null, maxlength: 1000 },
      after: { type: String, default: null, maxlength: 1000 },
      status: { type: String, enum: ['proposed', 'active', 'disabled'], default: 'proposed' },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      updatedBy: { type: String, default: null },
    }], default: [] },
    learningRuns: {
      type: [{
        runKey: { type: String, required: true },
        completedAt: { type: Date, default: Date.now },
        hintCount: { type: Number, default: 0 },
        discovered: { type: Number, default: 0 },
        upserted: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        corrections: { type: Number, default: 0 },
        discarded: { type: Number, default: 0 },
        missed: { type: Number, default: 0 },
        reviewSeconds: { type: Number, default: 0 },
        estimatedCredits: { type: Number, default: 0 },
      }],
      default: [],
    },
  },
  { _id: false },
);

const lastRunStatsSchema = new mongoose.Schema(
  {
    discovered: { type: Number, default: 0 },
    upserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    message: { type: String, default: null, trim: true },
    byBatchWeek: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const lastRunEventSchema = new mongoose.Schema(
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

const pivotCurationJobSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    /** A job is one crawl entrypoint; several jobs can feed one source. */
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PivotCitySource', default: null },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      default: null,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      enum: CURATION_PROVIDERS,
    },
    defaultBatchWeekStrategy: {
      type: String,
      enum: BATCH_WEEK_STRATEGIES,
      default: 'next-drop',
    },
    defaultTags: {
      type: [String],
      default: [],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: RUN_STATUSES,
      default: null,
    },
    lastRunStats: {
      type: lastRunStatsSchema,
      default: null,
    },
    /** Upserted events from the most recent completed/failed crawl (capped). */
    lastRunEvents: {
      type: [lastRunEventSchema],
      default: [],
    },
    /** Operator corrections that improve future generic-site extraction. */
    extractionProfile: {
      type: extractionProfileSchema,
      default: () => ({ promptHints: [] }),
    },
    createdBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotCurationJobSchema.pre('validate', function normalizeFields() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.label) {
    this.label = String(this.label).trim();
  }
  if (this.url != null) {
    const trimmed = String(this.url).trim();
    this.url = trimmed || null;
  }
  if (Array.isArray(this.defaultTags)) {
    this.defaultTags = this.defaultTags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean);
  }
  if (this.extractionProfile) {
    this.extractionProfile.promptHints = mergeExtractionHints(
      [],
      this.extractionProfile.promptHints,
    );
    if (this.extractionProfile.suggestedHints?.length > 30) {
      this.extractionProfile.suggestedHints = this.extractionProfile.suggestedHints.slice(-30);
    }
    if (this.extractionProfile.extractionRules?.length > 30) {
      this.extractionProfile.extractionRules = this.extractionProfile.extractionRules.slice(-30);
    }
    if (this.extractionProfile.learningRuns?.length > 12) {
      this.extractionProfile.learningRuns = this.extractionProfile.learningRuns.slice(-12);
    }
    if (this.extractionProfile.updatedBy != null) {
      this.extractionProfile.updatedBy = String(this.extractionProfile.updatedBy).trim() || null;
    }
  }
});

pivotCurationJobSchema.index({ tenantKey: 1, createdAt: -1 });
pivotCurationJobSchema.index({ tenantKey: 1, enabled: 1 });
pivotCurationJobSchema.index({ tenantKey: 1, sourceId: 1 });

module.exports = pivotCurationJobSchema;
module.exports.CURATION_PROVIDERS = CURATION_PROVIDERS;
module.exports.BATCH_WEEK_STRATEGIES = BATCH_WEEK_STRATEGIES;
module.exports.RUN_STATUSES = RUN_STATUSES;
module.exports.extractionProfileSchema = extractionProfileSchema;
