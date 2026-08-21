const mongoose = require('mongoose');
const {
  JUSTGO_LANDING_EVENT_SOURCES,
  JUSTGO_LANDING_EVENT_STORES,
  VISITOR_ID_MAX_LENGTH,
} = require('./justGoLandingEvent');
const { EMAIL_MAX_LENGTH } = require('../utilities/justGoWaitlistEmail');

/**
 * Just Go public waitlist signups (email + city).
 *
 * Global collection via getGlobalModelService — not campus/school getModels.
 * Unique (tenantKey, email). Unique outbound shareCode (minted at insert).
 * Inbound refCode matching another row’s shareCode increments friendsJoined
 * (same city, not self). Available on iOS and Android; `store` records which
 * client signed up.
 *
 * Retention: rows are kept until a platform admin deletes them
 * (`DELETE /admin/pivot/tenants/:tenantKey/waitlist/:id`). No public self-serve
 * delete in v1. Emails are PII — public APIs and Mixpanel never echo them.
 *
 * Indexes:
 * - `justgo_waitlist_tenant_email_unique` — `{ tenantKey, email }` unique
 * - `justgo_waitlist_share_code_unique` — `{ shareCode }` unique
 */

const JUSTGO_WAITLIST_INDEX_NAMES = Object.freeze([
  'justgo_waitlist_tenant_email_unique',
  'justgo_waitlist_share_code_unique',
]);

/** Dropped by syncIndexes after the phone → email migration (28d9353b). */
const JUSTGO_WAITLIST_LEGACY_INDEX_NAMES = Object.freeze([
  'justgo_waitlist_tenant_phone_unique',
]);

const SHARE_CODE_MAX_LENGTH = 16;
const CITY_LABEL_MAX_LENGTH = 120;
const ATTR_MAX_LENGTH = 64;
const USER_AGENT_MAX_LENGTH = 512;

function emptyToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

const justGoWaitlistSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    cityLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: CITY_LABEL_MAX_LENGTH,
    },
    visitorId: {
      type: String,
      required: true,
      trim: true,
      maxlength: VISITOR_ID_MAX_LENGTH,
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
      maxlength: ATTR_MAX_LENGTH,
    },
    shareCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: SHARE_CODE_MAX_LENGTH,
    },
    friendsJoined: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    store: {
      type: String,
      required: true,
      enum: JUSTGO_LANDING_EVENT_STORES,
    },
    userAgent: {
      type: String,
      required: false,
      default: null,
      trim: true,
      maxlength: USER_AGENT_MAX_LENGTH,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

justGoWaitlistSchema.pre('validate', function normalizeWaitlistRow() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }
  if (this.shareCode) {
    this.shareCode = String(this.shareCode).trim().toLowerCase();
  }
  if (this.visitorId) {
    this.visitorId = String(this.visitorId).trim();
  }
  this.qrName = emptyToNull(this.qrName);
  if (this.qrName) {
    this.qrName = this.qrName.toLowerCase();
  }
  this.refCode = emptyToNull(this.refCode);
  if (this.refCode) {
    this.refCode = String(this.refCode).trim().toLowerCase();
  }
  this.userAgent = emptyToNull(this.userAgent);
  this.store = emptyToNull(this.store);
});

justGoWaitlistSchema.index(
  { tenantKey: 1, email: 1 },
  { unique: true, name: 'justgo_waitlist_tenant_email_unique' },
);

justGoWaitlistSchema.index(
  { shareCode: 1 },
  { unique: true, name: 'justgo_waitlist_share_code_unique' },
);

module.exports = justGoWaitlistSchema;
module.exports.JUSTGO_WAITLIST_INDEX_NAMES = JUSTGO_WAITLIST_INDEX_NAMES;
module.exports.JUSTGO_WAITLIST_LEGACY_INDEX_NAMES = JUSTGO_WAITLIST_LEGACY_INDEX_NAMES;
module.exports.SHARE_CODE_MAX_LENGTH = SHARE_CODE_MAX_LENGTH;
module.exports.EMAIL_MAX_LENGTH = EMAIL_MAX_LENGTH;
module.exports.CITY_LABEL_MAX_LENGTH = CITY_LABEL_MAX_LENGTH;
module.exports.ATTR_MAX_LENGTH = ATTR_MAX_LENGTH;
module.exports.USER_AGENT_MAX_LENGTH = USER_AGENT_MAX_LENGTH;
module.exports.VISITOR_ID_MAX_LENGTH = VISITOR_ID_MAX_LENGTH;
module.exports.JUSTGO_WAITLIST_SOURCES = JUSTGO_LANDING_EVENT_SOURCES;
module.exports.JUSTGO_WAITLIST_STORES = JUSTGO_LANDING_EVENT_STORES;
