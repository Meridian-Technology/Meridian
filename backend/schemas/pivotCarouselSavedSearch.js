const mongoose = require('mongoose');

/**
 * A named curation query for one editorial account. The stored spec is the
 * normalized filter, not a live result set.
 */
const pivotCarouselSavedSearchSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    query: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: String, default: null, trim: true },
    updatedBy: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

pivotCarouselSavedSearchSchema.index({ accountId: 1, updatedAt: -1 });
pivotCarouselSavedSearchSchema.index({ accountId: 1, name: 1 }, { unique: true });

module.exports = pivotCarouselSavedSearchSchema;
