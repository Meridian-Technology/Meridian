const mongoose = require('mongoose');

/**
 * Named Just Go tracking QRs (justgo.lol/qr/{name} → city landing).
 *
 * Global collection via getGlobalModelService — not campus/school `QR`
 * (`getModels(req, 'QR')`). `{name}` is unique across all cities because the
 * public URL has no tenant segment. Destination is always that city’s landing
 * (`/{tenantKey}?src=qr&qr={name}`); there is no arbitrary redirectUrl.
 *
 * Scan rollup is a daily map plus integer totals — not an unbounded
 * per-scan history array like campus QR.
 *
 * Indexes:
 * - `justgo_landing_qr_name_unique` — `{ name }` unique
 * - `justgo_landing_qr_tenant_created` — `{ tenantKey, createdAt }`
 */

const JUSTGO_LANDING_QR_INDEX_NAMES = Object.freeze([
  'justgo_landing_qr_name_unique',
  'justgo_landing_qr_tenant_created',
]);

const JUSTGO_LANDING_QR_DOT_TYPES = Object.freeze([
  'extra-rounded',
  'square',
  'dots',
]);
const JUSTGO_LANDING_QR_CORNER_TYPES = Object.freeze([
  'extra-rounded',
  'square',
  'dot',
]);

const QR_NAME_MAX_LENGTH = 64;
const QR_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DESCRIPTION_MAX_LENGTH = 280;
const COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const JUSTGO_LANDING_QR_DEFAULT_FG = '#1A1714';
const JUSTGO_LANDING_QR_DEFAULT_BG = '#FAF6EF';

function emptyToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeLandingQrName(value) {
  const trimmed = emptyToNull(value);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.length > QR_NAME_MAX_LENGTH) return null;
  if (!QR_NAME_PATTERN.test(lower)) return null;
  return lower;
}

function normalizeHexColor(value, fallback) {
  const trimmed = emptyToNull(value);
  if (!trimmed) return fallback;
  if (!COLOR_HEX_PATTERN.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function utcDayKey(date = new Date()) {
  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) return utcDayKey(new Date());
  return when.toISOString().slice(0, 10);
}

function scanDaysAsMap(value) {
  if (value instanceof Map) return value;
  if (value && typeof value === 'object') {
    return new Map(Object.entries(value));
  }
  return new Map();
}

/**
 * Increment integer totals + the UTC-day bucket. Does not append per-scan rows.
 */
function applyLandingQrScan(doc, { unique = false, at = new Date() } = {}) {
  const when = at instanceof Date ? at : new Date(at);
  const day = utcDayKey(when);
  const scanDays = scanDaysAsMap(doc.scanDays);
  scanDays.set(day, (Number(scanDays.get(day)) || 0) + 1);
  doc.scanDays = scanDays;
  doc.scans = (Number(doc.scans) || 0) + 1;
  if (unique) {
    doc.uniqueScans = (Number(doc.uniqueScans) || 0) + 1;
  }
  doc.lastScannedAt = when;
  return doc;
}

const justGoLandingQrSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: QR_NAME_MAX_LENGTH,
    },
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: false,
      default: '',
      trim: true,
      maxlength: DESCRIPTION_MAX_LENGTH,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    fgColor: {
      type: String,
      required: true,
      default: JUSTGO_LANDING_QR_DEFAULT_FG,
      trim: true,
    },
    bgColor: {
      type: String,
      required: true,
      default: JUSTGO_LANDING_QR_DEFAULT_BG,
      trim: true,
    },
    transparentBg: {
      type: Boolean,
      required: true,
      default: true,
    },
    dotType: {
      type: String,
      required: true,
      enum: JUSTGO_LANDING_QR_DOT_TYPES,
      default: 'extra-rounded',
    },
    cornerType: {
      type: String,
      required: true,
      enum: JUSTGO_LANDING_QR_CORNER_TYPES,
      default: 'extra-rounded',
    },
    scans: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    uniqueScans: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastScannedAt: {
      type: Date,
      required: false,
      default: null,
    },
    scanDays: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
  },
);

justGoLandingQrSchema.pre('validate', function normalizeLandingQr() {
  const name = normalizeLandingQrName(this.name);
  if (name) this.name = name;
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  this.description = this.description == null ? '' : String(this.description).trim();
  if (this.fgColor) {
    const fg = normalizeHexColor(this.fgColor, JUSTGO_LANDING_QR_DEFAULT_FG);
    if (fg) this.fgColor = fg;
  }
  if (this.bgColor) {
    const bg = normalizeHexColor(this.bgColor, JUSTGO_LANDING_QR_DEFAULT_BG);
    if (bg) this.bgColor = bg;
  }
});

justGoLandingQrSchema.path('name').validate(function validateQrName(value) {
  return Boolean(normalizeLandingQrName(value));
}, 'name must be a lowercase slug (a-z, 0-9, hyphens)');

justGoLandingQrSchema.path('fgColor').validate(function validateFg(value) {
  return COLOR_HEX_PATTERN.test(String(value || ''));
}, 'fgColor must be a 6-digit hex color');

justGoLandingQrSchema.path('bgColor').validate(function validateBg(value) {
  return COLOR_HEX_PATTERN.test(String(value || ''));
}, 'bgColor must be a 6-digit hex color');

justGoLandingQrSchema.index(
  { name: 1 },
  { unique: true, name: 'justgo_landing_qr_name_unique' },
);

justGoLandingQrSchema.index(
  { tenantKey: 1, createdAt: -1 },
  { name: 'justgo_landing_qr_tenant_created' },
);

module.exports = justGoLandingQrSchema;
module.exports.JUSTGO_LANDING_QR_INDEX_NAMES = JUSTGO_LANDING_QR_INDEX_NAMES;
module.exports.JUSTGO_LANDING_QR_DOT_TYPES = JUSTGO_LANDING_QR_DOT_TYPES;
module.exports.JUSTGO_LANDING_QR_CORNER_TYPES = JUSTGO_LANDING_QR_CORNER_TYPES;
module.exports.QR_NAME_MAX_LENGTH = QR_NAME_MAX_LENGTH;
module.exports.QR_NAME_PATTERN = QR_NAME_PATTERN;
module.exports.DESCRIPTION_MAX_LENGTH = DESCRIPTION_MAX_LENGTH;
module.exports.JUSTGO_LANDING_QR_DEFAULT_FG = JUSTGO_LANDING_QR_DEFAULT_FG;
module.exports.JUSTGO_LANDING_QR_DEFAULT_BG = JUSTGO_LANDING_QR_DEFAULT_BG;
module.exports.normalizeLandingQrName = normalizeLandingQrName;
module.exports.normalizeHexColor = normalizeHexColor;
module.exports.applyLandingQrScan = applyLandingQrScan;
module.exports.utcDayKey = utcDayKey;
module.exports.COLOR_HEX_PATTERN = COLOR_HEX_PATTERN;
