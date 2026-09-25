const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  key: { type: String, required: true, unique: true },
  src: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  alt: { type: String, maxlength: 255, default: '' },
  credit: { type: String, maxlength: 1000, default: '' },
  mimeType: { type: String, required: true },
  createdBy: { type: String, default: null },
}, { timestamps: true });
schema.index({ accountId: 1, createdAt: -1 });
module.exports = schema;
