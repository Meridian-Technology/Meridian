/**
 * Public Just Go waitlist signup. Stores phone + city globally; mints shareCode.
 * Inbound `ref` matching another row’s shareCode increments friendsJoined
 * (same city only; unknown/self refs are ignored). Response never echoes the phone.
 */

const { randomBytes } = require('crypto');
const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey, getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { normalizeWaitlistPhoneE164 } = require('../utilities/justGoWaitlistPhone');
const { justGoWaitlistShareUrl } = require('../utilities/justGoPublicUrl');
const {
  JUSTGO_WAITLIST_SOURCES,
  JUSTGO_WAITLIST_STORES,
  VISITOR_ID_MAX_LENGTH,
  SHARE_CODE_MAX_LENGTH,
  ATTR_MAX_LENGTH,
  USER_AGENT_MAX_LENGTH,
} = require('../schemas/justGoWaitlist');

const SHARE_CODE_LENGTH = 10;
const SHARE_CODE_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SHARE_CODE_ATTEMPTS = 5;

function trimToNull(value, max) {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function mintShareCode(length = SHARE_CODE_LENGTH) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return out.slice(0, SHARE_CODE_MAX_LENGTH);
}

function normalizeWaitlistShareCode(value) {
  const trimmed = trimToNull(value, ATTR_MAX_LENGTH);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.length > SHARE_CODE_MAX_LENGTH) return null;
  return lower;
}

/**
 * Soft friend-share: increment the referrer’s friendsJoined when `ref` matches
 * their outbound shareCode, same tenant, and is not a self-ref.
 * Unknown / cross-city / self refs return false and do not fail signup.
 */
async function attributeWaitlistShareRef(
  JustGoWaitlist,
  { tenantKey, phoneE164, refCode, createdId } = {},
) {
  const shareCode = normalizeWaitlistShareCode(refCode);
  if (!shareCode || !JustGoWaitlist) return false;

  const referrer = await JustGoWaitlist.findOne({ shareCode }).lean();
  if (!referrer) return false;
  if (String(referrer.tenantKey || '') !== String(tenantKey || '')) return false;
  if (referrer.phoneE164 === phoneE164) return false;
  if (createdId != null && String(referrer._id) === String(createdId)) return false;

  await JustGoWaitlist.updateOne({ _id: referrer._id }, { $inc: { friendsJoined: 1 } });
  return true;
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

function waitlistDuplicate() {
  return {
    error: 'This number is already on the waitlist for this city.',
    status: 409,
    code: 'WAITLIST_DUPLICATE',
  };
}

function requestUserAgent(req) {
  return trimToNull(req.get?.('user-agent'), USER_AGENT_MAX_LENGTH);
}

function detectStoreFromUserAgent(userAgent) {
  return /android/i.test(String(userAgent || '')) ? 'android' : 'ios';
}

function resolveWaitlistStore(body = {}, req) {
  const store = trimToNull(body.store, 16);
  if (store) {
    if (!JUSTGO_WAITLIST_STORES.includes(store)) {
      return {
        error: 'store must be ios or android.',
        status: 400,
        code: 'INVALID_STORE',
      };
    }
    return { store };
  }
  const userAgent = trimToNull(body.userAgent, USER_AGENT_MAX_LENGTH) || requestUserAgent(req);
  return { store: detectStoreFromUserAgent(userAgent) };
}

function cityLabelFor(tenant) {
  return String(tenant.location || tenant.name || tenant.tenantKey).trim();
}

async function resolveWaitlistCity(req, body = {}) {
  const tenantKeyRaw = trimToNull(body.tenantKey, ATTR_MAX_LENGTH);
  if (tenantKeyRaw) {
    const tenant = await getTenantByKey(req, tenantKeyRaw.toLowerCase());
    if (!tenant || !isPivotTenant(tenant)) {
      return {
        error: 'City not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      };
    }
    return { tenant };
  }

  const cityRaw = trimToNull(body.city, ATTR_MAX_LENGTH);
  if (!cityRaw) {
    return {
      error: 'City is required.',
      status: 400,
      code: 'CITY_REQUIRED',
    };
  }

  const needle = cityRaw.toLowerCase();
  const tenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const match =
    tenants.find((row) => row.tenantKey === needle) ||
    tenants.find((row) => String(row.location || '').trim().toLowerCase() === needle) ||
    tenants.find((row) => String(row.name || '').trim().toLowerCase() === needle);

  if (!match) {
    return {
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }
  return { tenant: match };
}

function publicWaitlistPayload(row, req) {
  return {
    shareUrl: justGoWaitlistShareUrl(row.tenantKey, row.shareCode, req),
    friendsJoined: Number(row.friendsJoined) || 0,
    tenantKey: row.tenantKey,
  };
}

async function joinWaitlist(req, body = {}) {
  const phoneE164 = normalizeWaitlistPhoneE164(body.phone);
  if (!phoneE164) {
    return {
      error: 'Enter a valid US phone number.',
      status: 400,
      code: 'INVALID_PHONE',
    };
  }

  const city = await resolveWaitlistCity(req, body);
  if (city.error) return city;
  const { tenant } = city;
  const tenantKey = tenant.tenantKey;

  const visitorId = trimToNull(body.visitorId, VISITOR_ID_MAX_LENGTH + 1);
  if (!visitorId || visitorId.length > VISITOR_ID_MAX_LENGTH) {
    return {
      error: 'visitorId is required (opaque string, max 64 characters).',
      status: 400,
      code: 'INVALID_VISITOR_ID',
    };
  }

  const refCode = normalizeWaitlistShareCode(body.refCode ?? body.ref);
  const sourceRaw = trimToNull(body.source, 32);
  const source = sourceRaw || (refCode ? 'share' : 'direct');
  if (!JUSTGO_WAITLIST_SOURCES.includes(source)) {
    return {
      error: 'source must be direct, share, or qr.',
      status: 400,
      code: 'INVALID_SOURCE',
    };
  }

  const storeResult = resolveWaitlistStore(body, req);
  if (storeResult.error) return storeResult;
  const userAgent = trimToNull(body.userAgent, USER_AGENT_MAX_LENGTH) || requestUserAgent(req);

  const { JustGoWaitlist } = getGlobalModels(req, 'JustGoWaitlist');

  const existing = await JustGoWaitlist.findOne({ tenantKey, phoneE164 }).lean();
  if (existing) {
    return waitlistDuplicate();
  }

  const doc = {
    phoneE164,
    tenantKey,
    cityLabel: cityLabelFor(tenant),
    visitorId,
    source,
    qrName: trimToNull(body.qrName ?? body.qr, ATTR_MAX_LENGTH),
    refCode,
    friendsJoined: 0,
    store: storeResult.store,
    userAgent,
  };

  let created;
  for (let attempt = 0; attempt < SHARE_CODE_ATTEMPTS; attempt += 1) {
    try {
      created = await JustGoWaitlist.create({
        ...doc,
        shareCode: mintShareCode(),
      });
      break;
    } catch (err) {
      if (isMongoDup(err, ['tenantKey', 'phoneE164'])) {
        return waitlistDuplicate();
      }
      if (isMongoDup(err, ['shareCode']) && attempt < SHARE_CODE_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new Error('Unable to mint a unique waitlist share code.');
  }

  await attributeWaitlistShareRef(JustGoWaitlist, {
    tenantKey,
    phoneE164,
    refCode,
    createdId: created._id,
  });

  return { data: publicWaitlistPayload(created, req) };
}

const WAITLIST_PAGE_DEFAULT = 50;
const WAITLIST_PAGE_MAX = 100;

const WAITLIST_CSV_COLUMNS = Object.freeze([
  'createdAt',
  'phoneE164',
  'source',
  'qrName',
  'refCode',
  'friendsJoined',
]);

function cityNotFound() {
  return {
    error: 'City not found.',
    status: 404,
    code: 'TENANT_NOT_FOUND',
  };
}

async function resolveAdminWaitlistTenant(req, tenantKeyRaw) {
  const tenantKey = String(tenantKeyRaw || '').trim().toLowerCase();
  if (!tenantKey) return cityNotFound();
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) return cityNotFound();
  return { tenant };
}

function parsePage(value) {
  const parsed = Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? WAITLIST_PAGE_DEFAULT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return WAITLIST_PAGE_DEFAULT;
  return Math.min(WAITLIST_PAGE_MAX, parsed);
}

function parseWaitlistId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  try {
    if (String(new mongoose.Types.ObjectId(raw)) !== raw) return null;
  } catch {
    return null;
  }
  return raw;
}

function serializeWaitlistAdminRow(row) {
  return {
    id: row._id != null ? String(row._id) : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    phoneE164: row.phoneE164 || null,
    source: row.source || 'direct',
    qrName: row.qrName || null,
    refCode: row.refCode || null,
    friendsJoined: Number(row.friendsJoined) || 0,
  };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function waitlistRowsToCsv(rows) {
  const header = WAITLIST_CSV_COLUMNS.join(',');
  const lines = rows.map((row) =>
    WAITLIST_CSV_COLUMNS.map((key) => csvEscape(row[key])).join(','),
  );
  return [header, ...lines].join('\n');
}

async function listTenantWaitlist(req, options = {}) {
  const resolved = await resolveAdminWaitlistTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const page = parsePage(options.page);
  const limit = parseLimit(options.limit);
  const skip = (page - 1) * limit;
  const tenantKey = resolved.tenant.tenantKey;
  const { JustGoWaitlist } = getGlobalModels(req, 'JustGoWaitlist');

  const [total, docs] = await Promise.all([
    JustGoWaitlist.countDocuments({ tenantKey }),
    JustGoWaitlist.find({ tenantKey })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    data: {
      tenantKey,
      items: (docs || []).map(serializeWaitlistAdminRow),
      pagination: {
        page,
        limit,
        total,
      },
    },
  };
}

async function exportTenantWaitlistCsv(req, options = {}) {
  const resolved = await resolveAdminWaitlistTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const tenantKey = resolved.tenant.tenantKey;
  const { JustGoWaitlist } = getGlobalModels(req, 'JustGoWaitlist');
  const docs = await JustGoWaitlist.find({ tenantKey }).sort({ createdAt: -1 }).lean();
  const rows = (docs || []).map(serializeWaitlistAdminRow);

  return {
    contentType: 'text/csv; charset=utf-8',
    filename: `justgo-waitlist-${tenantKey}.csv`,
    body: waitlistRowsToCsv(rows),
  };
}

/**
 * Hard-delete one waitlist row for ops mistakes. No self-serve public delete.
 * Response never echoes the phone.
 */
async function deleteTenantWaitlistRow(req, options = {}) {
  const resolved = await resolveAdminWaitlistTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const id = parseWaitlistId(options.id);
  if (!id) {
    return {
      error: 'Waitlist id is invalid.',
      status: 400,
      code: 'INVALID_WAITLIST_ID',
    };
  }

  const tenantKey = resolved.tenant.tenantKey;
  const { JustGoWaitlist } = getGlobalModels(req, 'JustGoWaitlist');
  const deleted = await JustGoWaitlist.findOneAndDelete({ _id: id, tenantKey }).lean();
  if (!deleted) {
    return {
      error: 'Waitlist signup not found.',
      status: 404,
      code: 'WAITLIST_NOT_FOUND',
    };
  }

  return {
    data: {
      tenantKey,
      id: String(deleted._id),
      deleted: true,
    },
  };
}

module.exports = {
  joinWaitlist,
  resolveWaitlistCity,
  resolveWaitlistStore,
  mintShareCode,
  normalizeWaitlistShareCode,
  attributeWaitlistShareRef,
  publicWaitlistPayload,
  listTenantWaitlist,
  exportTenantWaitlistCsv,
  deleteTenantWaitlistRow,
  parseWaitlistId,
  serializeWaitlistAdminRow,
  waitlistRowsToCsv,
  WAITLIST_CSV_COLUMNS,
  WAITLIST_PAGE_DEFAULT,
  WAITLIST_PAGE_MAX,
};
