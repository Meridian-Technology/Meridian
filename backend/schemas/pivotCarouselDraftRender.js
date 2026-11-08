const mongoose = require('mongoose');

/**
 * An unsaved carousel document, kept for half an hour so the compose worker can
 * render it and show the agent its own slides before it submits. Never an issue;
 * Mongo removes it at expiresAt.
 */
const pivotCarouselDraftRenderSchema = new mongoose.Schema(
  {
    externalJobId: { type: String, required: true, trim: true, maxlength: 128 },
    tenantKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 64 },
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

pivotCarouselDraftRenderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
pivotCarouselDraftRenderSchema.index({ externalJobId: 1, createdAt: -1 });

module.exports = pivotCarouselDraftRenderSchema;
