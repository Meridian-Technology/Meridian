const mongoose = require('mongoose');

/**
 * Last organizer-identity backfill for a city (v0 singleton per tenantKey).
 * Catalog 4.4 reads this for last-run counts. Not a crawl / Firecrawl record.
 *
 * @see Meridian-Mintlify/strategy/just-go-organizer-identity-plan.mdx Task 3.3
 */

const pivotOrganizerBackfillRunSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    ranAt: {
      type: Date,
      required: true,
    },
    force: {
      type: Boolean,
      default: false,
    },
    scanned: { type: Number, default: 0 },
    linked: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    ambiguous: { type: Number, default: 0 },
    unlinked: { type: Number, default: 0 },
    createdOrganizers: { type: Number, default: 0 },
    /** Distinct host.name values that stayed ambiguous on this run (capped). */
    ambiguousNames: {
      type: [String],
      default: undefined,
    },
  },
  { timestamps: true },
);

pivotOrganizerBackfillRunSchema.index(
  { tenantKey: 1 },
  { unique: true, name: 'tenantKey_unique' },
);

module.exports = pivotOrganizerBackfillRunSchema;
