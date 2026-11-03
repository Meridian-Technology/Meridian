const mongoose = require('mongoose');

const count = (defaultValue, min) => ({
  type: Number,
  required: true,
  default: defaultValue,
  min,
  validate: Number.isSafeInteger,
});

/** Global DB: campaign, invitations, and admissions share one transaction. */
const schema = new mongoose.Schema({
  tenantKey: { type: String, required: true, trim: true, lowercase: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  startsAt: { type: Date, required: true },
  claimsOpenAt: { type: Date, required: true },
  claimsCloseAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active', required: true },
  capacity: count(100, 1),
  admissionCount: count(0, 0),
}, { timestamps: true });

schema.index({ tenantKey: 1, createdAt: -1 });
// One shared capacity pool for an event, even if tags are issued in batches.
schema.index({ tenantKey: 1, eventId: 1 }, { unique: true });

module.exports = schema;
