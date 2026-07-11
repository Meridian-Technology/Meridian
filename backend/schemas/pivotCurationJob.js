const mongoose = require('mongoose');

const CURATION_PROVIDERS = ['partiful', 'luma', 'manual-json'];
const BATCH_WEEK_STRATEGIES = ['explicit', 'next-drop', 'current-iso'];
const RUN_STATUSES = ['queued', 'running', 'completed', 'failed'];

const lastRunStatsSchema = new mongoose.Schema(
  {
    discovered: { type: Number, default: 0 },
    upserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    message: { type: String, default: null, trim: true },
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
});

pivotCurationJobSchema.index({ tenantKey: 1, createdAt: -1 });
pivotCurationJobSchema.index({ tenantKey: 1, enabled: 1 });

module.exports = pivotCurationJobSchema;
module.exports.CURATION_PROVIDERS = CURATION_PROVIDERS;
module.exports.BATCH_WEEK_STRATEGIES = BATCH_WEEK_STRATEGIES;
module.exports.RUN_STATUSES = RUN_STATUSES;
