const mongoose = require('mongoose');

/**
 * First-party Just Go public-landing telemetry (views + store clicks).
 *
 * Global collection via getGlobalModelService — not the campus/city Event
 * collection, and not school-scoped getModels. Append-only: uniqueness for
 * KPIs is computed at read time (distinct visitorId in range). Store every
 * view; do not dedupe on write.
 *
 * Indexes:
 * - `justgo_landing_event_tenant_type_created` — `{ tenantKey, type, createdAt }`
 *   city Launch KPIs (views / store clicks over a range)
 * - `justgo_landing_event_visitor_tenant_created` — `{ visitorId, tenantKey, createdAt }`
 *   unique-visitor counts (distinct visitorId per city in range)
 *
 * `tenantKey` is optional (null on generic `/` until a city is selected).
 * `store` is required on `store_click` and must be omitted on `view`.
 */

const JUSTGO_LANDING_EVENT_TYPES = Object.freeze(['view', 'store_click']);
const JUSTGO_LANDING_EVENT_SOURCES = Object.freeze(['direct', 'share', 'qr']);
const JUSTGO_LANDING_EVENT_STORES = Object.freeze(['ios', 'android']);

const JUSTGO_LANDING_EVENT_INDEX_NAMES = Object.freeze([
  'justgo_landing_event_tenant_type_created',
  'justgo_landing_event_visitor_tenant_created',
]);

const VISITOR_ID_MAX_LENGTH = 64;

function emptyToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

const justGoLandingEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: JUSTGO_LANDING_EVENT_TYPES,
    },
    tenantKey: {
      type: String,
      required: false,
      default: null,
      trim: true,
      lowercase: true,
    },
    host: {
      type: String,
      required: true,
      trim: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      enum: JUSTGO_LANDING_EVENT_SOURCES,
      default: 'direct',
    },
    qrName: {
      type: String,
      required: false,
      default: null,
      trim: true,
      lowercase: true,
    },
    refCode: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    visitorId: {
      type: String,
      required: true,
      trim: true,
      maxlength: VISITOR_ID_MAX_LENGTH,
    },
    userAgent: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    store: {
      type: String,
      required: false,
      default: null,
      enum: [...JUSTGO_LANDING_EVENT_STORES, null],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

justGoLandingEventSchema.pre('validate', function normalizeLandingEvent() {
  this.tenantKey = emptyToNull(this.tenantKey);
  if (this.tenantKey) {
    this.tenantKey = this.tenantKey.toLowerCase();
  }
  this.qrName = emptyToNull(this.qrName);
  if (this.qrName) {
    this.qrName = this.qrName.toLowerCase();
  }
  this.refCode = emptyToNull(this.refCode);
  this.userAgent = emptyToNull(this.userAgent);
  this.store = emptyToNull(this.store);
  if (this.visitorId) {
    this.visitorId = String(this.visitorId).trim();
  }
});

justGoLandingEventSchema.path('store').validate(function validateStore(value) {
  if (this.type === 'store_click') {
    return JUSTGO_LANDING_EVENT_STORES.includes(value);
  }
  return value == null;
}, 'store is required for store_click (ios|android) and must be omitted for view');

justGoLandingEventSchema.index(
  { tenantKey: 1, type: 1, createdAt: 1 },
  { name: 'justgo_landing_event_tenant_type_created' },
);

justGoLandingEventSchema.index(
  { visitorId: 1, tenantKey: 1, createdAt: 1 },
  { name: 'justgo_landing_event_visitor_tenant_created' },
);

module.exports = justGoLandingEventSchema;
module.exports.JUSTGO_LANDING_EVENT_TYPES = JUSTGO_LANDING_EVENT_TYPES;
module.exports.JUSTGO_LANDING_EVENT_SOURCES = JUSTGO_LANDING_EVENT_SOURCES;
module.exports.JUSTGO_LANDING_EVENT_STORES = JUSTGO_LANDING_EVENT_STORES;
module.exports.JUSTGO_LANDING_EVENT_INDEX_NAMES = JUSTGO_LANDING_EVENT_INDEX_NAMES;
module.exports.VISITOR_ID_MAX_LENGTH = VISITOR_ID_MAX_LENGTH;
