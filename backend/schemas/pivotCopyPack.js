const mongoose = require('mongoose');

/**
 * Dedicated global collection for Just Go consumer-voice overlays.
 *
 * Not stored on `tenant_configs` (crew/mobile knobs stay there). One row is
 * product-wide (`scope=platform`, `tenantKey=null`); city overlays are
 * `scope=tenant` + `tenantKey`. Consumer merge lives in pivotCopyService (2.2).
 *
 * Unique indexes:
 * - `pivot_copy_pack_platform_unique` — at most one platform row
 * - `pivot_copy_pack_tenant_unique` — at most one row per `tenantKey`
 *
 * `entries` / `tokens` are sparse dotted-key → template maps. Assign the whole
 * object (do not `$set` nested dotted paths) so MongoDB stores literal keys
 * like `ticker.week` / `group.singular`.
 */

const PIVOT_COPY_PACK_SCOPES = Object.freeze(['platform', 'tenant']);
const PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION = 1;

const PIVOT_COPY_PACK_INDEX_NAMES = Object.freeze([
  'pivot_copy_pack_platform_unique',
  'pivot_copy_pack_tenant_unique',
]);

function isSparseStringMap(value) {
  if (value == null) {
    return true;
  }
  if (value instanceof Map) {
    return [...value.values()].every((entry) => typeof entry === 'string');
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

const pivotCopyPackSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      enum: PIVOT_COPY_PACK_SCOPES,
    },
    tenantKey: {
      type: String,
      required: false,
      default: null,
      trim: true,
      lowercase: true,
    },
    schemaVersion: {
      type: Number,
      required: true,
      min: 1,
      default: PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
    },
    /** Monotonic int; bump on every successful write (2.2). */
    revision: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    tokens: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      validate: {
        validator: isSparseStringMap,
        message: 'tokens must be a sparse object of string values',
      },
    },
    entries: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      validate: {
        validator: isSparseStringMap,
        message: 'entries must be a sparse object of string values',
      },
    },
    updatedBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

pivotCopyPackSchema.pre('validate', function normalizeScope() {
  if (this.scope === 'platform') {
    this.tenantKey = null;
  } else if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.tokens == null) {
    this.tokens = {};
  }
  if (this.entries == null) {
    this.entries = {};
  }
});

pivotCopyPackSchema.path('tenantKey').validate(function validateTenantKey(value) {
  if (this.scope === 'platform') {
    return value == null;
  }
  return typeof value === 'string' && value.length > 0;
}, 'tenantKey must be null for platform packs and a non-empty string for tenant packs');

pivotCopyPackSchema.index(
  { scope: 1 },
  {
    unique: true,
    name: 'pivot_copy_pack_platform_unique',
    partialFilterExpression: { scope: 'platform' },
  },
);

pivotCopyPackSchema.index(
  { tenantKey: 1 },
  {
    unique: true,
    name: 'pivot_copy_pack_tenant_unique',
    partialFilterExpression: {
      scope: 'tenant',
      tenantKey: { $type: 'string' },
    },
  },
);

module.exports = pivotCopyPackSchema;
module.exports.PIVOT_COPY_PACK_SCOPES = PIVOT_COPY_PACK_SCOPES;
module.exports.PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION =
  PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION;
module.exports.PIVOT_COPY_PACK_INDEX_NAMES = PIVOT_COPY_PACK_INDEX_NAMES;
