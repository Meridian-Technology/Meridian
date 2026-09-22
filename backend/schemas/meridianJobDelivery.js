const mongoose = require('mongoose');

const MERIDIAN_JOB_DELIVERY_PRODUCTS = Object.freeze(['justgo', 'campus', 'legacy']);

const MERIDIAN_JOB_DELIVERY_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'failed',
  'blocked_dev_gate',
  'skipped',
]);

const MERIDIAN_JOB_DELIVERY_INDEX_NAMES = Object.freeze([
  'meridian_job_delivery_run_createdAt',
  'meridian_job_delivery_run_status',
  'meridian_job_delivery_tenant_user_createdAt',
  'meridian_job_delivery_user_sentAt',
]);

const meridianJobDeliverySchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'MeridianJobRun',
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    userId: { type: String, required: true, trim: true, maxlength: 128 },
    username: { type: String, default: null, trim: true, maxlength: 128 },
    name: { type: String, default: null, trim: true, maxlength: 256 },
    product: {
      type: String,
      required: true,
      enum: MERIDIAN_JOB_DELIVERY_PRODUCTS,
    },
    copyKey: { type: String, default: null, trim: true, maxlength: 128 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },
    deliveryStatus: {
      type: String,
      required: true,
      enum: MERIDIAN_JOB_DELIVERY_STATUSES,
    },
    sentAt: { type: Date, default: null },
    error: { type: String, default: null, trim: true, maxlength: 512 },
  },
  { timestamps: true, autoIndex: false },
);

meridianJobDeliverySchema.pre('validate', function normalizeMeridianJobDelivery() {
  if (typeof this.tenantKey === 'string') {
    this.tenantKey = this.tenantKey.trim().toLowerCase();
  }
});

meridianJobDeliverySchema.index(
  { runId: 1, createdAt: -1 },
  { name: MERIDIAN_JOB_DELIVERY_INDEX_NAMES[0] },
);
meridianJobDeliverySchema.index(
  { runId: 1, deliveryStatus: 1 },
  { name: MERIDIAN_JOB_DELIVERY_INDEX_NAMES[1] },
);
meridianJobDeliverySchema.index(
  { tenantKey: 1, userId: 1, createdAt: -1 },
  { name: MERIDIAN_JOB_DELIVERY_INDEX_NAMES[2] },
);
meridianJobDeliverySchema.index(
  { userId: 1, sentAt: -1 },
  { name: MERIDIAN_JOB_DELIVERY_INDEX_NAMES[3] },
);

module.exports = meridianJobDeliverySchema;
module.exports.MERIDIAN_JOB_DELIVERY_PRODUCTS = MERIDIAN_JOB_DELIVERY_PRODUCTS;
module.exports.MERIDIAN_JOB_DELIVERY_STATUSES = MERIDIAN_JOB_DELIVERY_STATUSES;
module.exports.MERIDIAN_JOB_DELIVERY_INDEX_NAMES = MERIDIAN_JOB_DELIVERY_INDEX_NAMES;
