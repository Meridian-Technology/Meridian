/**
 * Public Just Go landing telemetry. Writes every event (no view-day dedupe);
 * unique visitors are computed at read time for Launch KPIs.
 */

const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey, getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { resolveLandingMode } = require('../constants/defaultTenants');
const {
  JUSTGO_LANDING_EVENT_TYPES,
  JUSTGO_LANDING_EVENT_SOURCES,
  JUSTGO_LANDING_EVENT_STORES,
  VISITOR_ID_MAX_LENGTH,
} = require('../schemas/justGoLandingEvent');

const HOST_MAX_LENGTH = 253;
const PATH_MAX_LENGTH = 512;
const ATTR_MAX_LENGTH = 64;
const USER_AGENT_MAX_LENGTH = 512;

function trimToNull(value, max) {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function requestHost(req) {
  const forwarded = req.get?.('x-forwarded-host');
  return trimToNull(forwarded, HOST_MAX_LENGTH) || trimToNull(req.get?.('host'), HOST_MAX_LENGTH) || 'unknown';
}

function requestUserAgent(req) {
  return trimToNull(req.get?.('user-agent'), USER_AGENT_MAX_LENGTH);
}

async function recordLandingEvent(req, body = {}) {
  const type = trimToNull(body.type, 32);
  if (!JUSTGO_LANDING_EVENT_TYPES.includes(type)) {
    return {
      error: 'type must be view or store_click.',
      status: 400,
      code: 'INVALID_TYPE',
    };
  }

  const visitorId = trimToNull(body.visitorId, VISITOR_ID_MAX_LENGTH + 1);
  if (!visitorId || visitorId.length > VISITOR_ID_MAX_LENGTH) {
    return {
      error: 'visitorId is required (opaque string, max 64 characters).',
      status: 400,
      code: 'INVALID_VISITOR_ID',
    };
  }

  const sourceRaw = trimToNull(body.source, 32);
  const source = sourceRaw || 'direct';
  if (!JUSTGO_LANDING_EVENT_SOURCES.includes(source)) {
    return {
      error: 'source must be direct, share, or qr.',
      status: 400,
      code: 'INVALID_SOURCE',
    };
  }

  const store = trimToNull(body.store, 16);
  if (type === 'store_click') {
    if (!JUSTGO_LANDING_EVENT_STORES.includes(store)) {
      return {
        error: 'store must be ios or android for store_click.',
        status: 400,
        code: 'INVALID_STORE',
      };
    }
  } else if (store) {
    return {
      error: 'store is only allowed on store_click.',
      status: 400,
      code: 'INVALID_STORE',
    };
  }

  const tenantKeyRaw = trimToNull(body.tenantKey, ATTR_MAX_LENGTH);
  const tenantKey = tenantKeyRaw ? tenantKeyRaw.toLowerCase() : null;
  if (tenantKey) {
    const tenant = await getTenantByKey(req, tenantKey);
    if (!tenant || !isPivotTenant(tenant)) {
      return {
        error: 'City not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      };
    }
  }

  const { JustGoLandingEvent } = getGlobalModels(req, 'JustGoLandingEvent');
  await JustGoLandingEvent.create({
    type,
    tenantKey,
    host: trimToNull(body.host, HOST_MAX_LENGTH) || requestHost(req),
    path: trimToNull(body.path, PATH_MAX_LENGTH) || '/',
    source,
    qrName: trimToNull(body.qrName ?? body.qr, ATTR_MAX_LENGTH),
    refCode: trimToNull(body.refCode ?? body.ref, ATTR_MAX_LENGTH),
    visitorId,
    userAgent: trimToNull(body.userAgent, USER_AGENT_MAX_LENGTH) || requestUserAgent(req),
    store: type === 'store_click' ? store : null,
  });

  return { data: {} };
}

/** Public listing: pivot cities that are not hidden. `coming_soon` waitlist cities are included. */
const LANDING_LIST_STATUSES = new Set(['active', 'coming_soon']);

function serializeLandingCity(tenant) {
  return {
    tenantKey: tenant.tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
    landingMode: resolveLandingMode(tenant.landingMode),
  };
}

function sortLandingCities(cities) {
  return [...cities].sort((a, b) =>
    String(a.cityDisplayName).localeCompare(String(b.cityDisplayName)),
  );
}

/**
 * Public Just Go landing config. No admin fields (mongoUri, drop knobs, status, …).
 * Optional tenantKey includes that pivot city even when it is outside the default list.
 */
async function getLandingConfig(req, options = {}) {
  const tenants = await getMergedTenants(req);
  const byKey = new Map();

  tenants
    .filter((row) => isPivotTenant(row) && LANDING_LIST_STATUSES.has(row.status))
    .forEach((row) => {
      byKey.set(row.tenantKey, serializeLandingCity(row));
    });

  const tenantKeyRaw = trimToNull(options.tenantKey, ATTR_MAX_LENGTH);
  if (tenantKeyRaw) {
    const tenant = await getTenantByKey(req, tenantKeyRaw.toLowerCase());
    if (!tenant || !isPivotTenant(tenant)) {
      return {
        error: 'City not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      };
    }
    byKey.set(tenant.tenantKey, serializeLandingCity(tenant));
  }

  return { data: { cities: sortLandingCities([...byKey.values()]) } };
}

module.exports = {
  recordLandingEvent,
  getLandingConfig,
};
