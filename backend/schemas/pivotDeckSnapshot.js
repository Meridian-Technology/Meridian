const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

/**
 * Frozen weekly deck order per user for offline eval and future shadow ranker mode.
 * Written on first GET /pivot/feed per user/batchWeek; Explore does not read this.
 *
 * @see Meridian-Mintlify/strategy/just-go-explore-embeddings-plan.mdx Task 6.1
 */
const pivotDeckSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    orderedEventIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Event',
        },
      ],
      required: true,
      default: [],
    },
    rankerVersion: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotDeckSnapshotSchema.index({ userId: 1, batchWeek: 1 }, { unique: true });

module.exports = pivotDeckSnapshotSchema;
