const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'JustGoCampaign', required: true },
  // The raw NFC token is returned only when issued; persist its digest.
  tokenHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true, required: true },
  admissionLimit: { type: Number, required: true, default: 3, min: 1, validate: Number.isSafeInteger },
  admissionCount: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
}, { timestamps: true });

schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ campaignId: 1, createdAt: -1 });

module.exports = schema;
