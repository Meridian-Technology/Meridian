const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

/**
 * Append-only Pivot interaction log (tenant DB).
 * Product state stays on PivotEventIntent; this collection is training / eval / Explore telemetry.
 *
 * @see Meridian-Mintlify/strategy/just-go-explore-embeddings-plan.mdx Task 1.1
 */

const PIVOT_INTERACTION_SURFACES = Object.freeze([
  'deck',
  'explore',
  'recap',
  'plans',
  'detail',
]);

const PIVOT_INTERACTION_RETRIEVALS = Object.freeze([
  'weekly_batch',
  'filter',
  'search',
  'similar',
  'for_you_rail',
  'friends_rail',
  'tag_rail',
  'curated_rail',
]);

const PIVOT_INTERACTION_TYPES = Object.freeze([
  'impression',
  'dwell',
  'detail_open',
  'pass',
  'interested',
  'external_open',
  'registered',
  'rating',
  'explore_request',
]);

const pivotInteractionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** Null for request-level rows (e.g. explore_request). */
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    batchWeek: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          return isValidIsoWeek(value);
        },
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
    surface: {
      type: String,
      enum: PIVOT_INTERACTION_SURFACES,
      required: true,
      default: 'deck',
    },
    retrieval: {
      type: String,
      enum: PIVOT_INTERACTION_RETRIEVALS,
      default: 'weekly_batch',
    },
    type: {
      type: String,
      enum: PIVOT_INTERACTION_TYPES,
      required: true,
    },
    rankInFeed: {
      type: Number,
      min: 0,
      default: null,
    },
    /** Dwell duration in milliseconds (clamped by writers). */
    ms: {
      type: Number,
      min: 0,
      default: null,
    },
    section: {
      type: String,
      default: null,
      trim: true,
    },
    query: {
      type: String,
      default: null,
      trim: true,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    seedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    requestId: {
      type: String,
      default: null,
      trim: true,
    },
    rankerVersion: {
      type: String,
      default: null,
      trim: true,
    },
    sessionId: {
      type: String,
      default: null,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
  },
  { timestamps: true },
);

pivotInteractionSchema.index({ userId: 1, batchWeek: 1, createdAt: 1 });
pivotInteractionSchema.index({ eventId: 1, type: 1, createdAt: 1 });
pivotInteractionSchema.index({ batchWeek: 1, surface: 1, type: 1 });
pivotInteractionSchema.index({ requestId: 1 }, { sparse: true });

module.exports = pivotInteractionSchema;
module.exports.PIVOT_INTERACTION_SURFACES = PIVOT_INTERACTION_SURFACES;
module.exports.PIVOT_INTERACTION_RETRIEVALS = PIVOT_INTERACTION_RETRIEVALS;
module.exports.PIVOT_INTERACTION_TYPES = PIVOT_INTERACTION_TYPES;
