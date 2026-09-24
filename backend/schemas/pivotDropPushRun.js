const mongoose = require('mongoose');

const MAX_RUN_RECIPIENTS = 500;

const pushRunRecipientSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true, maxlength: 128 },
    username: { type: String, default: null, trim: true, maxlength: 128 },
    name: { type: String, default: null, trim: true, maxlength: 256 },
    product: { type: String, enum: ['justgo', 'campus', 'legacy'], required: true },
    deliveryStatus: { type: String, enum: ['accepted', 'failed'], required: true },
    error: { type: String, default: null, trim: true, maxlength: 512 },
  },
  { _id: false },
);

const pivotDropPushRunSchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    batchWeek: { type: String, required: true, trim: true },
    title: { type: String, default: '', trim: true },
    body: { type: String, default: '', trim: true },
    attempted: { type: Number, required: true, min: 0 },
    accepted: { type: Number, required: true, min: 0 },
    failed: { type: Number, required: true, min: 0 },
    audience: {
      campus: { type: Number, default: 0 },
      justgo: { type: Number, default: 0 },
      legacy: { type: Number, default: 0 },
    },
    errors: { type: [String], default: [] },
    recipients: {
      type: [pushRunRecipientSchema],
      default: undefined,
      validate: [
        (values) => !Array.isArray(values) || values.length <= MAX_RUN_RECIPIENTS,
        `recipients exceed ${MAX_RUN_RECIPIENTS}`,
      ],
    },
    recipientOverflowCount: { type: Number, default: 0, min: 0 },
    forced: { type: Boolean, default: false },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

pivotDropPushRunSchema.index({ tenantKey: 1, createdAt: -1 });
pivotDropPushRunSchema.index({ batchWeek: 1, createdAt: -1 });

module.exports = pivotDropPushRunSchema;
module.exports.MAX_RUN_RECIPIENTS = MAX_RUN_RECIPIENTS;
