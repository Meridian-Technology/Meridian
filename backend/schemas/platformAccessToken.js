const mongoose = require('mongoose');

/**
 * One personal access token for a platform admin. The secret is never stored;
 * tokenHash is the SHA-256 of the secret. displayPrefix is the short prefix
 * shown when listing tokens. expiresAt is the expiry. A revoked token stays
 * so it can be recognized and so its owner can mint a replacement.
 */
const platformAccessTokenSchema = new mongoose.Schema(
  {
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    displayPrefix: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

platformAccessTokenSchema.index(
  { globalUserId: 1 },
  { unique: true, partialFilterExpression: { revokedAt: null } },
);

module.exports = platformAccessTokenSchema;
