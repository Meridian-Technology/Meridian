/**
 * Admin CRUD for named Just Go landing QRs.
 * Global collection only — never campus/school `QR`.
 */

const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { justGoLandingQrUrl, justGoLandingQrHopUrl } = require('../utilities/justGoPublicUrl');
const { IOWA_TENANT_KEY, resolvePosterTzHop } = require('../utilities/justGoPosterTzHop');
const { VISITOR_ID_MAX_LENGTH } = require('../schemas/justGoLandingEvent');
const {
  JUSTGO_LANDING_QR_DOT_TYPES,
  JUSTGO_LANDING_QR_CORNER_TYPES,
  JUSTGO_LANDING_QR_DEFAULT_FG,
  JUSTGO_LANDING_QR_DEFAULT_BG,
  DESCRIPTION_MAX_LENGTH,
  QR_NAME_MAX_LENGTH,
  normalizeLandingQrName,
  normalizeHexColor,
  utcDayKey,
} = require('../schemas/justGoLandingQr');

function cityNotFound() {
  return {
    error: 'City not found.',
    status: 404,
    code: 'TENANT_NOT_FOUND',
  };
}

function qrNotFound() {
  return {
    error: 'QR code not found.',
    status: 404,
    code: 'QR_NOT_FOUND',
  };
}

function qrInactive() {
  return {
    error: 'QR code is inactive.',
    status: 400,
    code: 'QR_INACTIVE',
  };
}

function nameTaken() {
  return {
    error: 'That QR name is already taken.',
    status: 409,
    code: 'QR_NAME_TAKEN',
  };
}

function invalidQrName() {
  return {
    error: 'name must be a lowercase slug (a-z, 0-9, hyphens).',
    status: 400,
    code: 'INVALID_QR_NAME',
  };
}

function mongoDupFields(err) {
  if (!err || err.code !== 11000) return null;
  if (err.keyPattern && typeof err.keyPattern === 'object') {
    return Object.keys(err.keyPattern);
  }
  if (err.keyValue && typeof err.keyValue === 'object') {
    return Object.keys(err.keyValue);
  }
  return [];
}

function isMongoDup(err, fields) {
  const keys = mongoDupFields(err);
  if (!keys) return false;
  if (keys.length === 0) {
    const msg = String(err.message || '');
    return fields.every((field) => msg.includes(field));
  }
  return fields.every((field) => keys.includes(field));
}

function trimToNull(value, max) {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return max != null ? trimmed.slice(0, max) : trimmed;
}

async function resolvePivotTenant(req, tenantKeyRaw) {
  const tenantKey = String(tenantKeyRaw || '').trim().toLowerCase();
  if (!tenantKey) return cityNotFound();
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) return cityNotFound();
  return { tenant };
}

function scanDaysToObject(value) {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  if (typeof value === 'object') return { ...value };
  return {};
}

function serializeLandingQr(row, req) {
  const name = row.name;
  return {
    id: row._id != null ? String(row._id) : undefined,
    name,
    tenantKey: row.tenantKey,
    description: row.description || '',
    isActive: row.isActive !== false,
    fgColor: row.fgColor || JUSTGO_LANDING_QR_DEFAULT_FG,
    bgColor: row.bgColor || JUSTGO_LANDING_QR_DEFAULT_BG,
    transparentBg: row.transparentBg !== false,
    dotType: row.dotType || 'extra-rounded',
    cornerType: row.cornerType || 'extra-rounded',
    scans: Number(row.scans) || 0,
    uniqueScans: Number(row.uniqueScans) || 0,
    lastScannedAt: row.lastScannedAt
      ? new Date(row.lastScannedAt).toISOString()
      : null,
    scanDays: scanDaysToObject(row.scanDays),
    payloadUrl: justGoLandingQrUrl(name, req),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}

function parseStylePatch(body = {}) {
  const patch = {};

  if (body.description !== undefined) {
    const description = body.description == null ? '' : String(body.description).trim();
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      return {
        error: `description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
        status: 400,
        code: 'INVALID_QR_DESCRIPTION',
      };
    }
    patch.description = description;
  }

  if (body.fgColor !== undefined) {
    const fg = normalizeHexColor(body.fgColor, null);
    if (!fg) {
      return {
        error: 'fgColor must be a 6-digit hex color.',
        status: 400,
        code: 'INVALID_QR_COLOR',
      };
    }
    patch.fgColor = fg;
  }

  if (body.bgColor !== undefined) {
    const bg = normalizeHexColor(body.bgColor, null);
    if (!bg) {
      return {
        error: 'bgColor must be a 6-digit hex color.',
        status: 400,
        code: 'INVALID_QR_COLOR',
      };
    }
    patch.bgColor = bg;
  }

  const transparentBg = parseOptionalBoolean(body.transparentBg);
  if (body.transparentBg !== undefined) {
    if (transparentBg === undefined) {
      return {
        error: 'transparentBg must be a boolean.',
        status: 400,
        code: 'INVALID_QR_STYLE',
      };
    }
    patch.transparentBg = transparentBg;
  }

  if (body.dotType !== undefined) {
    const dotType = String(body.dotType).trim();
    if (!JUSTGO_LANDING_QR_DOT_TYPES.includes(dotType)) {
      return {
        error: 'dotType must be extra-rounded, square, or dots.',
        status: 400,
        code: 'INVALID_QR_STYLE',
      };
    }
    patch.dotType = dotType;
  }

  if (body.cornerType !== undefined) {
    const cornerType = String(body.cornerType).trim();
    if (!JUSTGO_LANDING_QR_CORNER_TYPES.includes(cornerType)) {
      return {
        error: 'cornerType must be extra-rounded, square, or dot.',
        status: 400,
        code: 'INVALID_QR_STYLE',
      };
    }
    patch.cornerType = cornerType;
  }

  if (body.isActive !== undefined) {
    const isActive = parseOptionalBoolean(body.isActive);
    if (isActive === undefined) {
      return {
        error: 'isActive must be a boolean.',
        status: 400,
        code: 'INVALID_QR_STYLE',
      };
    }
    patch.isActive = isActive;
  }

  return { patch };
}

async function listTenantLandingQrs(req, options = {}) {
  const resolved = await resolvePivotTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const tenantKey = resolved.tenant.tenantKey;
  const { JustGoLandingQr } = getGlobalModels(req, 'JustGoLandingQr');
  const docs = await JustGoLandingQr.find({ tenantKey }).sort({ createdAt: -1 }).lean();

  return {
    data: {
      tenantKey,
      items: (docs || []).map((row) => serializeLandingQr(row, req)),
    },
  };
}

async function createTenantLandingQr(req, options = {}) {
  const resolved = await resolvePivotTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const name = normalizeLandingQrName(options.name);
  if (!name) return invalidQrName();

  const style = parseStylePatch(options);
  if (style.error) return style;

  const tenantKey = resolved.tenant.tenantKey;
  const { JustGoLandingQr } = getGlobalModels(req, 'JustGoLandingQr');

  const existing = await JustGoLandingQr.findOne({ name }).lean();
  if (existing) return nameTaken();

  const doc = {
    name,
    tenantKey,
    description: style.patch.description || '',
    isActive: style.patch.isActive !== undefined ? style.patch.isActive : true,
    fgColor: style.patch.fgColor || JUSTGO_LANDING_QR_DEFAULT_FG,
    bgColor: style.patch.bgColor || JUSTGO_LANDING_QR_DEFAULT_BG,
    transparentBg:
      style.patch.transparentBg !== undefined ? style.patch.transparentBg : true,
    dotType: style.patch.dotType || 'extra-rounded',
    cornerType: style.patch.cornerType || 'extra-rounded',
    scans: 0,
    uniqueScans: 0,
    lastScannedAt: null,
    scanDays: new Map(),
  };

  let created;
  try {
    created = await JustGoLandingQr.create(doc);
  } catch (err) {
    if (isMongoDup(err, ['name'])) return nameTaken();
    throw err;
  }

  return { data: serializeLandingQr(created, req), status: 201 };
}

async function findLandingQrByName(req, nameRaw) {
  const name = normalizeLandingQrName(nameRaw) || trimToNull(nameRaw, QR_NAME_MAX_LENGTH);
  if (!name) return qrNotFound();
  const { JustGoLandingQr } = getGlobalModels(req, 'JustGoLandingQr');
  const row = await JustGoLandingQr.findOne({ name });
  if (!row) return qrNotFound();
  return { JustGoLandingQr, row };
}

async function updateLandingQr(req, options = {}) {
  const found = await findLandingQrByName(req, options.name);
  if (found.error) return found;

  const style = parseStylePatch(options);
  if (style.error) return style;
  if (Object.keys(style.patch).length === 0) {
    return { data: serializeLandingQr(found.row, req) };
  }

  Object.assign(found.row, style.patch);
  await found.row.save();
  return { data: serializeLandingQr(found.row, req) };
}

async function deactivateLandingQr(req, options = {}) {
  const found = await findLandingQrByName(req, options.name);
  if (found.error) return found;

  found.row.isActive = false;
  await found.row.save();
  return { data: serializeLandingQr(found.row, req) };
}

function parseHopUnique(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return false;
}

function asQrRow(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return doc;
}

function iowaSiblingCreateDoc(printed, siblingName) {
  return {
    name: siblingName,
    tenantKey: IOWA_TENANT_KEY,
    description: printed.description
      || `Iowa poster (printed as ${printed.name})`,
    isActive: true,
    fgColor: printed.fgColor || JUSTGO_LANDING_QR_DEFAULT_FG,
    bgColor: printed.bgColor || JUSTGO_LANDING_QR_DEFAULT_BG,
    transparentBg: printed.transparentBg !== false,
    dotType: printed.dotType || 'extra-rounded',
    cornerType: printed.cornerType || 'extra-rounded',
    scans: 0,
    uniqueScans: 0,
    lastScannedAt: null,
    scanDays: new Map(),
  };
}

/**
 * Attribute an Iowa-timezone scan of a printed SF QR to the Iowa sibling row
 * (`sf-1` → `iowa-1`) before incrementing. Creates the Iowa row if missing.
 */
async function resolveIowaSiblingQr(JustGoLandingQr, printed, siblingName) {
  const name = normalizeLandingQrName(siblingName);
  if (!name || name === printed.name) {
    return { row: printed, remapped: false };
  }

  const existingSibling = await JustGoLandingQr.findOne({ name }).lean();
  if (existingSibling) {
    const siblingTenant = String(existingSibling.tenantKey || '').trim().toLowerCase();
    if (siblingTenant && siblingTenant !== IOWA_TENANT_KEY) {
      return { row: printed, remapped: false };
    }
    return { row: existingSibling, remapped: true };
  }

  try {
    const created = await JustGoLandingQr.create(iowaSiblingCreateDoc(printed, name));
    return { row: asQrRow(created), remapped: true, created: true };
  } catch (err) {
    if (!isMongoDup(err, ['name'])) throw err;
    const raced = await JustGoLandingQr.findOne({ name }).lean();
    if (!raced) return { row: printed, remapped: false };
    return { row: raced, remapped: true };
  }
}

/**
 * Public scan hop: increment daily totals, return the city landing URL.
 * Unique is client-reported from justgo.landing.visitor (no unbounded scanHistory).
 */
async function hopLandingQr(req, body = {}) {
  const name = normalizeLandingQrName(body.name);
  if (!name) return qrNotFound();

  const { JustGoLandingQr } = getGlobalModels(req, 'JustGoLandingQr');
  const existing = await JustGoLandingQr.findOne({ name }).lean();
  if (!existing) return qrNotFound();
  if (existing.isActive === false) return qrInactive();

  const hop = resolvePosterTzHop({
    tenantKey: existing.tenantKey,
    name: existing.name,
    timeZone: trimToNull(body.timeZone, 64),
    utcOffsetMinutes: body.utcOffsetMinutes,
  });

  let target = existing;
  let attributed = hop;
  if (hop.remapped) {
    const sibling = await resolveIowaSiblingQr(JustGoLandingQr, existing, hop.name);
    target = sibling.row;
    if (!sibling.remapped) {
      attributed = { tenantKey: hop.tenantKey, name: existing.name, remapped: true };
    }
  }

  const visitorId = trimToNull(body.visitorId, VISITOR_ID_MAX_LENGTH + 1);
  const unique = Boolean(visitorId && visitorId.length <= VISITOR_ID_MAX_LENGTH && parseHopUnique(body.unique));
  const at = new Date();
  const day = utcDayKey(at);
  const inc = { scans: 1, [`scanDays.${day}`]: 1 };
  if (unique) inc.uniqueScans = 1;

  const set = { lastScannedAt: at };
  if (hop.remapped && attributed.name !== existing.name) {
    set.isActive = true;
    set.tenantKey = IOWA_TENANT_KEY;
  }

  const updated = await JustGoLandingQr.findOneAndUpdate(
    hop.remapped && attributed.name !== existing.name
      ? { _id: target._id }
      : { _id: existing._id, isActive: true },
    { $inc: inc, $set: set },
    { new: true },
  );
  if (!updated) return qrInactive();

  const posterTzHop = attributed.tenantKey !== existing.tenantKey
    || attributed.name !== existing.name;

  const redirectUrl = justGoLandingQrHopUrl(
    attributed.tenantKey,
    attributed.name,
    req,
    body.search,
  );

  return {
    data: {
      name: attributed.name,
      tenantKey: attributed.tenantKey,
      redirectUrl,
      path: `/${attributed.tenantKey}`,
      ...(posterTzHop ? { posterTzHop: true } : {}),
    },
  };
}

module.exports = {
  listTenantLandingQrs,
  createTenantLandingQr,
  updateLandingQr,
  deactivateLandingQr,
  hopLandingQr,
  serializeLandingQr,
  resolvePivotTenant,
  parseStylePatch,
  normalizeLandingQrName,
};
