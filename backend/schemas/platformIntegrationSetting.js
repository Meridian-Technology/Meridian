const mongoose = require('mongoose');

/**
 * One delivery attempt to an integration's webhook. Never the body: only the
 * time, the event, the job, and the HTTP status or the error message.
 */
const deliverySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    event: { type: String, required: true, maxlength: 40 },
    jobId: { type: String, default: null, maxlength: 200 },
    attempt: { type: Number, default: 1 },
    status: { type: Number, default: null },
    error: { type: String, default: null, maxlength: 200 },
  },
  { _id: false },
);

/**
 * Global settings for one outside integration, one row per `key` (`grokbot`).
 * webhookKey is AES-256-GCM ciphertext and is never returned. updatedAt and
 * updatedBy are set only when an admin saves the settings; a row with no
 * updatedAt holds only deliveries, and the env vars still apply.
 * deliveries keeps the last 20 attempts, oldest first.
 */
const platformIntegrationSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    enum: ['grokbot'],
  },
  webhookUrl: { type: String, default: null, maxlength: 2048 },
  webhookKey: { type: String, default: null },
  enabled: { type: Boolean, default: false },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GlobalUser',
    default: null,
  },
  updatedAt: { type: Date, default: null },
  deliveries: { type: [deliverySchema], default: [] },
});

module.exports = platformIntegrationSettingSchema;
