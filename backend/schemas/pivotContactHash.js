const mongoose = require('mongoose');

/**
 * One-way hashes of a user's contact identifiers (email, phone) for privacy-preserving
 * "find people you know" matching. Raw identifiers are never stored — only SHA-256 hex digests.
 */
const pivotContactHashSchema = new mongoose.Schema(
  {
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    identifierType: {
      type: String,
      required: true,
      enum: ['email', 'phone'],
    },
    hash: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  },
);

pivotContactHashSchema.index({ identifierType: 1, hash: 1 }, { unique: true });
pivotContactHashSchema.index({ globalUserId: 1, identifierType: 1 });

module.exports = pivotContactHashSchema;
