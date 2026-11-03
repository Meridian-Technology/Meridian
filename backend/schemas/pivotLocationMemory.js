const mongoose = require('mongoose');

/**
 * A reviewer's decision for one source location string, remembered per city so
 * the same text from later scrapes resolves without another review.
 */
const pivotLocationMemorySchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    matchKey: { type: String, required: true, trim: true },
    sourceText: { type: String, required: true, trim: true },
    // Stored without originalInput or timestamps; each event gets its own.
    richLocation: { type: mongoose.Schema.Types.Mixed, required: true },
    action: { type: String, required: true },
    rememberedBy: {
      id: { type: String, default: null },
      email: { type: String, default: null },
    },
    sourceEventId: { type: String, default: null },
    useCount: { type: Number, default: 0 },
    lastUsedAt: Date,
  },
  { timestamps: true },
);

pivotLocationMemorySchema.index(
  { tenantKey: 1, matchKey: 1 },
  { unique: true, name: 'tenantKey_matchKey_unique' },
);

module.exports = pivotLocationMemorySchema;
