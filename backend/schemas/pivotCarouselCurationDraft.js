const mongoose = require('mongoose');
const { FORMATS } = require('./pivotCarouselAccount');

/**
 * A curation draft exists before an issue. It is not a deck and does not export.
 */
const pivotCarouselCurationDraftSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    issueId: { type: mongoose.Schema.Types.ObjectId, default: null },
    format: { type: String, enum: FORMATS, required: true },
    query: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    selected: { type: [mongoose.Schema.Types.Mixed], default: [] },
    theme: { type: String, default: '', trim: true, maxlength: 120 },
    recapNotes: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    coverPreset: { type: String, default: 'loose-letters', trim: true },
    eventPreset: { type: String, default: 'photo-note', trim: true },
    revision: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['open', 'consumed'], default: 'open' },
    idempotencyKey: { type: String, default: null, trim: true, maxlength: 128 },
    createdIssueId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: String, default: null, trim: true },
    updatedBy: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

pivotCarouselCurationDraftSchema.index({ accountId: 1, status: 1, updatedAt: -1 });
pivotCarouselCurationDraftSchema.index({ accountId: 1, createdBy: 1, status: 1, updatedAt: -1 });
pivotCarouselCurationDraftSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = pivotCarouselCurationDraftSchema;
