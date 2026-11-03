const mongoose = require('mongoose');

/**
 * A physical NFC dog tag, belonging to one Just Go city. The printed number
 * (per city) is public; the code written on the tag is a random secret,
 * stored only as a digest, so tag URLs can't be guessed from the number.
 */
const schema = new mongoose.Schema({
  tenantKey: { type: String, required: true, trim: true, lowercase: true },
  number: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  // The raw code is returned only when it's issued or rotated for writing.
  tokenHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', required: true },
  note: { type: String, trim: true, maxlength: 120, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', required: true },
  // Set when an admin's phone confirms the write; cleared when the code rotates.
  writtenAt: { type: Date, default: null },
  writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', default: null },
}, { timestamps: true });

// Each city numbers its own tags from №001.
schema.index({ tenantKey: 1, number: 1 }, { unique: true });
schema.index({ tokenHash: 1 }, { unique: true });

module.exports = schema;
