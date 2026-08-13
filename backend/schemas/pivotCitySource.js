const mongoose = require('mongoose');

/**
 * Registry of event sources discovered for a city.
 *
 * This is the durable memory that the manual Claude Code loop never had. Each
 * run wrote its findings into a throwaway JSON file, so the next run started
 * blind and had to be re-seeded by hand. Persisting both outcomes here — the
 * sites worth crawling *and* the ones already ruled out — makes discovery
 * cheaper on every subsequent pass and lets coverage be measured rather than
 * guessed at.
 */

/** Native parsers are free; `generic-site` costs Firecrawl credits per crawl. */
const SOURCE_PROVIDERS = ['partiful', 'luma', 'generic-site'];

/**
 * `qualified` produced events during discovery; `rejected` did not. Rejections
 * are kept rather than discarded so later runs skip them instead of paying to
 * re-check a site that has already proven fruitless.
 */
const SOURCE_STATUSES = ['qualified', 'rejected'];

const REJECTION_REASONS = [
  'no-events',
  'below-threshold',
  'scrape-failed',
  'no-index-page',
  'blocked-host',
];

const pivotCitySourceSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    /**
     * Hostname with any leading `www.` removed, used as the per-city dedupe key.
     * Deliberately the full hostname rather than the registrable domain so that
     * `arts.example.edu` and `athletics.example.edu` register as separate
     * calendars instead of the first one claiming the whole institution.
     */
    host: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    /** Best event-index URL found for this host, not necessarily its homepage. */
    url: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      default: null,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      enum: SOURCE_PROVIDERS,
    },
    status: {
      type: String,
      required: true,
      enum: SOURCE_STATUSES,
    },
    rejectedReason: {
      type: String,
      default: null,
      enum: [...REJECTION_REASONS, null],
    },
    /**
     * Whether refresh crawls should keep running. Separate from `status` so an
     * operator can mute a noisy but technically qualified source without it
     * looking like discovery failed to find it.
     */
    enabled: {
      type: Boolean,
      default: true,
    },
    /** Catalog slugs whose seed queries surfaced this host. */
    seedTags: {
      type: [String],
      default: [],
    },
    /** Verbatim query that found it, so a thin category can be traced to its seed. */
    discoveredVia: {
      type: String,
      default: null,
      trim: true,
    },
    discoveredAt: {
      type: Date,
      default: null,
    },
    lastQualifiedAt: {
      type: Date,
      default: null,
    },
    /** Event count seen by the qualifying scrape; a rough yield signal. */
    lastEventCount: {
      type: Number,
      default: 0,
    },
    /** Curation job created for this source, when discovery registered one. */
    curationJobId: {
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

pivotCitySourceSchema.pre('validate', function normalizeFields() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.host) {
    this.host = String(this.host).trim().toLowerCase().replace(/^www\./, '');
  }
  if (Array.isArray(this.seedTags)) {
    this.seedTags = [
      ...new Set(this.seedTags.map((tag) => String(tag || '').trim()).filter(Boolean)),
    ];
  }
});

pivotCitySourceSchema.index({ tenantKey: 1, host: 1 }, { unique: true });
pivotCitySourceSchema.index({ tenantKey: 1, status: 1, enabled: 1 });

module.exports = pivotCitySourceSchema;
module.exports.SOURCE_PROVIDERS = SOURCE_PROVIDERS;
module.exports.SOURCE_STATUSES = SOURCE_STATUSES;
module.exports.REJECTION_REASONS = REJECTION_REASONS;
