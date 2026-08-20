const mongoose = require('mongoose');
const { IDENTITY_PROVIDERS } = require('../utilities/pivotHostIdentity');

/**
 * City-scoped organizer identity (Just Go). Not a campus Org.
 *
 * `host.name` on Event stays the card snapshot and is never unique-indexed.
 * Hard IDs live on `identities[]`. `normalizedName` collisions are the product
 * (tier 2 ambiguous) — do not unique-index that field.
 *
 * @see Meridian-Mintlify/strategy/just-go-organizer-identity-plan.mdx Task 2.1
 */

const PIVOT_ORGANIZER_KINDS = Object.freeze(['person', 'brand', 'venue', 'unclear']);
const PIVOT_ORGANIZER_CLAIM_STATUSES = Object.freeze([
  'unclaimed',
  'pending',
  'claimed',
]);
const PIVOT_ORGANIZER_STATUSES = Object.freeze(['active', 'merged']);

function activeOrganizerFilter(tenantKey) {
  return { tenantKey, status: { $ne: 'merged' } };
}

function omitBlankString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

const aliasSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    normalized: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const organizerIdentitySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: IDENTITY_PROVIDERS,
    },
    externalId: {
      type: String,
      trim: true,
      set: omitBlankString,
    },
    profileUrl: {
      type: String,
      trim: true,
      set: omitBlankString,
    },
    name: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      set: omitBlankString,
    },
    /** Optional 0–1 score when a later resolver writes a proposed identity. */
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  { _id: false },
);

const pivotOrganizerSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    canonicalName: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
    },
    aliases: {
      type: [aliasSchema],
      default: undefined,
    },
    kind: {
      type: String,
      enum: PIVOT_ORGANIZER_KINDS,
      default: 'unclear',
    },
    identities: {
      type: [organizerIdentitySchema],
      default: undefined,
    },
    imageUrl: {
      type: String,
      trim: true,
      set: omitBlankString,
    },
    claimedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      default: null,
    },
    claimStatus: {
      type: String,
      enum: PIVOT_ORGANIZER_CLAIM_STATUSES,
      default: 'unclaimed',
    },
    status: {
      type: String,
      enum: PIVOT_ORGANIZER_STATUSES,
      default: 'active',
    },
    mergedInto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PivotOrganizer',
      default: null,
    },
    lastResolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Unique only when a real profileUrl is present. A sparse unique on this
// compound key still indexes `null` for name-only rows (E11000). Partial
// filter omits empty / missing profiles — most historical hosts are name-only.
pivotOrganizerSchema.index(
  { tenantKey: 1, 'identities.profileUrl': 1 },
  {
    unique: true,
    name: 'tenantKey_identities_profileUrl_unique',
    partialFilterExpression: {
      'identities.profileUrl': { $gt: '' },
    },
  },
);
pivotOrganizerSchema.index({
  tenantKey: 1,
  'identities.provider': 1,
  'identities.externalId': 1,
});
// Not unique: same normalizedName in a city is tier-2 ambiguous.
pivotOrganizerSchema.index({ tenantKey: 1, normalizedName: 1 });
pivotOrganizerSchema.index({ tenantKey: 1, claimStatus: 1 });
pivotOrganizerSchema.index({ tenantKey: 1, status: 1 });

module.exports = pivotOrganizerSchema;
module.exports.PIVOT_ORGANIZER_KINDS = PIVOT_ORGANIZER_KINDS;
module.exports.PIVOT_ORGANIZER_CLAIM_STATUSES = PIVOT_ORGANIZER_CLAIM_STATUSES;
module.exports.PIVOT_ORGANIZER_STATUSES = PIVOT_ORGANIZER_STATUSES;
module.exports.PIVOT_ORGANIZER_IDENTITY_PROVIDERS = IDENTITY_PROVIDERS;
module.exports.activeOrganizerFilter = activeOrganizerFilter;
