/**
 * Public Just Go landing telemetry. Writes every event (no view-day dedupe);
 * unique visitors are computed at read time for Launch KPIs.
 */

const getGlobalModels = require('./getGlobalModelService');
const {
  getTenantByKey,
  getMergedTenants,
  upsertStoredTenantRow,
} = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { LANDING_MODES, resolveLandingMode } = require('../constants/defaultTenants');
const { justGoPublicUrl } = require('../utilities/justGoPublicUrl');
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LAUNCH_RANGE_DAYS = 28;
const MAX_LAUNCH_RANGE_DAYS = 366;

/**
 * Conversion always uses the city's *current* landingMode for the whole range.
 * Mixed-mode weeks (flipped waitlist ↔ launched mid-range) are best-effort.
 */
const CONVERSION_USES_CURRENT_MODE_NOTE =
  "Conversion uses the city's current landingMode (waitlist → signups/views; launched → store clicks/views). Ranges that span a mode change are best-effort.";

function cityNotFound() {
  return {
    error: 'City not found.',
    status: 404,
    code: 'TENANT_NOT_FOUND',
  };
}

function invalidRange(message) {
  return {
    error: message,
    status: 400,
    code: 'INVALID_RANGE',
  };
}

function parseRangeInstant(value, { endOfDay = false } = {}) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

/** Inclusive UTC range. Default last 28 days. Date-only `to` is end of that UTC day. */
function parseLaunchRange(query = {}, now = new Date()) {
  const fromParsed = parseRangeInstant(query.from, { endOfDay: false });
  const toParsed = parseRangeInstant(query.to, { endOfDay: true });
  if (fromParsed === undefined || toParsed === undefined) {
    return invalidRange('from and to must be valid dates.');
  }

  const to = toParsed || now;
  const from = fromParsed || new Date(to.getTime() - DEFAULT_LAUNCH_RANGE_DAYS * MS_PER_DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return invalidRange('from and to must be valid dates.');
  }
  if (from.getTime() > to.getTime()) {
    return invalidRange('from must be before to.');
  }
  if ((to.getTime() - from.getTime()) / MS_PER_DAY > MAX_LAUNCH_RANGE_DAYS) {
    return invalidRange(`Range cannot exceed ${MAX_LAUNCH_RANGE_DAYS} days.`);
  }
  return { from, to };
}

function roundRate(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10000) / 10000;
}

/** waitlist → signups/views; launched → store clicks/views. 0 when views is 0. QR hops are not conversion. */
function conversionRateForMode(landingMode, totals = {}) {
  const views = Number(totals.views) || 0;
  if (!views) return 0;
  const conversions =
    landingMode === 'launched'
      ? Number(totals.storeClicks) || 0
      : Number(totals.waitlistSignups) || 0;
  return roundRate(conversions / views);
}

function emptyMetricCounts() {
  return {
    views: 0,
    uniqueVisitors: 0,
    waitlistSignups: 0,
    storeClicks: 0,
  };
}

function emptySourceBreakdown() {
  return JUSTGO_LANDING_EVENT_SOURCES.reduce((acc, source) => {
    acc[source] = emptyMetricCounts();
    return acc;
  }, {});
}

function countById(rows, id) {
  const match = (rows || []).find((row) => row?._id === id);
  return Number(match?.count) || 0;
}

function cityPublicUrl(tenantKey, req) {
  const key = String(tenantKey || '').trim().toLowerCase();
  return justGoPublicUrl(`/${encodeURIComponent(key)}`, req);
}

function cityDisplayName(tenant) {
  return String(tenant.location || tenant.name || tenant.tenantKey).trim();
}

function eachUtcDayKeys(from, to) {
  const days = [];
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  for (let t = start; t <= end; t += MS_PER_DAY) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

function serializeRange(from, to) {
  return { from: from.toISOString(), to: to.toISOString() };
}

async function resolvePivotLandingTenant(req, tenantKeyRaw) {
  const tenantKey = String(tenantKeyRaw || '').trim().toLowerCase();
  if (!tenantKey) return cityNotFound();
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) return cityNotFound();
  return { tenant };
}

function rangeMatch(from, to, extra = {}) {
  return {
    ...extra,
    createdAt: { $gte: from, $lte: to },
  };
}

async function aggregateCityLandingEvents(JustGoLandingEvent, tenantKey, from, to) {
  const rows = await JustGoLandingEvent.aggregate([
    { $match: rangeMatch(from, to, { tenantKey }) },
    {
      $facet: {
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        uniqueVisitors: [
          { $match: { type: 'view' } },
          { $group: { _id: '$visitorId' } },
          { $count: 'count' },
        ],
        bySourceType: [
          {
            $group: {
              _id: { source: '$source', type: '$type' },
              count: { $sum: 1 },
            },
          },
        ],
        uniqueBySource: [
          { $match: { type: 'view' } },
          { $group: { _id: '$source', visitors: { $addToSet: '$visitorId' } } },
        ],
        byQrNameType: [
          { $match: { source: 'qr', qrName: { $nin: [null, ''] } } },
          {
            $group: {
              _id: { qrName: '$qrName', type: '$type' },
              count: { $sum: 1 },
            },
          },
        ],
        uniqueByQrName: [
          { $match: { type: 'view', source: 'qr', qrName: { $nin: [null, ''] } } },
          { $group: { _id: '$qrName', visitors: { $addToSet: '$visitorId' } } },
        ],
        series: [
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: 'UTC',
                  },
                },
                type: '$type',
              },
              count: { $sum: 1 },
              visitors: {
                $addToSet: {
                  $cond: [{ $eq: ['$type', 'view'] }, '$visitorId', '$$REMOVE'],
                },
              },
            },
          },
        ],
      },
    },
  ]);
  return rows?.[0] || {};
}

async function aggregateCityWaitlist(JustGoWaitlist, tenantKey, from, to) {
  const rows = await JustGoWaitlist.aggregate([
    { $match: rangeMatch(from, to, { tenantKey }) },
    {
      $facet: {
        total: [{ $count: 'count' }],
        bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
        byQrName: [
          { $match: { qrName: { $nin: [null, ''] } } },
          { $group: { _id: '$qrName', count: { $sum: 1 } } },
        ],
        series: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: 'UTC',
                },
              },
              count: { $sum: 1 },
            },
          },
        ],
        lastSignup: [
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { createdAt: 1, _id: 0 } },
        ],
      },
    },
  ]);
  return rows?.[0] || {};
}

function emptyQrNameCounts() {
  return {
    scans: 0,
    views: 0,
    uniqueVisitors: 0,
    waitlistSignups: 0,
    storeClicks: 0,
  };
}

function qrNameKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return key || null;
}

/**
 * Hops (QR collection scanDays in range) joined with landing events / waitlist
 * rows attributed to that named code. Conversion stays waitlist / store clicks.
 */
function buildQrBreakdown(eventFacet, waitlistFacet, qrScanRows, qrSource = {}) {
  const byName = new Map();
  const bucket = (name) => {
    const key = qrNameKey(name);
    if (!key) return null;
    if (!byName.has(key)) {
      byName.set(key, { qrName: key, ...emptyQrNameCounts() });
    }
    return byName.get(key);
  };

  for (const row of qrScanRows || []) {
    const item = bucket(row?._id);
    if (item) item.scans = Number(row.scans) || 0;
  }
  for (const row of eventFacet.byQrNameType || []) {
    const item = bucket(row?._id?.qrName);
    if (!item) continue;
    if (row._id.type === 'view') item.views = Number(row.count) || 0;
    if (row._id.type === 'store_click') item.storeClicks = Number(row.count) || 0;
  }
  for (const row of eventFacet.uniqueByQrName || []) {
    const item = bucket(row?._id);
    if (item) item.uniqueVisitors = Array.isArray(row.visitors) ? row.visitors.length : 0;
  }
  for (const row of waitlistFacet.byQrName || []) {
    const item = bucket(row?._id);
    if (item) item.waitlistSignups = Number(row.count) || 0;
  }

  const items = [...byName.values()].sort((a, b) => {
    if (b.scans !== a.scans) return b.scans - a.scans;
    if (b.views !== a.views) return b.views - a.views;
    return a.qrName.localeCompare(b.qrName);
  });

  return {
    scans: items.reduce((sum, row) => sum + row.scans, 0),
    views: Number(qrSource.views) || 0,
    byName: items,
  };
}

async function aggregateCityQrScans(JustGoLandingQr, tenantKey, from, to) {
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  return JustGoLandingQr.aggregate([
    { $match: { tenantKey } },
    {
      $project: {
        name: 1,
        pairs: {
          $objectToArray: {
            $ifNull: ['$scanDays', {}],
          },
        },
      },
    },
    { $unwind: { path: '$pairs', preserveNullAndEmptyArrays: false } },
    {
      $match: {
        'pairs.k': { $gte: fromDay, $lte: toDay },
      },
    },
    {
      $group: {
        _id: '$name',
        scans: { $sum: { $ifNull: ['$pairs.v', 0] } },
      },
    },
  ]);
}

function buildSourceBreakdown(eventFacet, waitlistFacet) {
  const sources = emptySourceBreakdown();
  for (const row of eventFacet.bySourceType || []) {
    const source = row?._id?.source;
    const type = row?._id?.type;
    if (!sources[source]) continue;
    if (type === 'view') sources[source].views = Number(row.count) || 0;
    if (type === 'store_click') sources[source].storeClicks = Number(row.count) || 0;
  }
  for (const row of eventFacet.uniqueBySource || []) {
    if (!sources[row?._id]) continue;
    sources[row._id].uniqueVisitors = Array.isArray(row.visitors) ? row.visitors.length : 0;
  }
  for (const row of waitlistFacet.bySource || []) {
    if (!sources[row?._id]) continue;
    sources[row._id].waitlistSignups = Number(row.count) || 0;
  }
  return sources;
}

function buildDailySeries(from, to, eventFacet, waitlistFacet) {
  const byDay = new Map();
  for (const date of eachUtcDayKeys(from, to)) {
    byDay.set(date, emptyMetricCounts());
  }
  for (const row of eventFacet.series || []) {
    const date = row?._id?.day;
    const bucket = byDay.get(date);
    if (!bucket) continue;
    const type = row?._id?.type;
    if (type === 'view') {
      bucket.views = Number(row.count) || 0;
      bucket.uniqueVisitors = Array.isArray(row.visitors) ? row.visitors.length : 0;
    } else if (type === 'store_click') {
      bucket.storeClicks = Number(row.count) || 0;
    }
  }
  for (const row of waitlistFacet.series || []) {
    const bucket = byDay.get(row?._id);
    if (!bucket) continue;
    bucket.waitlistSignups = Number(row.count) || 0;
  }
  return [...byDay.entries()].map(([date, counts]) => ({ date, ...counts }));
}

function totalsFromFacets(eventFacet, waitlistFacet) {
  return {
    views: countById(eventFacet.byType, 'view'),
    uniqueVisitors: Number(eventFacet.uniqueVisitors?.[0]?.count) || 0,
    waitlistSignups: Number(waitlistFacet.total?.[0]?.count) || 0,
    storeClicks: countById(eventFacet.byType, 'store_click'),
  };
}

async function getTenantLaunchStats(req, options = {}) {
  const resolved = await resolvePivotLandingTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const range = parseLaunchRange(options, options.now);
  if (range.error) return range;

  const { tenant } = resolved;
  const landingMode = resolveLandingMode(tenant.landingMode);
  const { JustGoLandingEvent, JustGoWaitlist, JustGoLandingQr } = getGlobalModels(
    req,
    'JustGoLandingEvent',
    'JustGoWaitlist',
    'JustGoLandingQr',
  );

  const [eventFacet, waitlistFacet, qrScanRows] = await Promise.all([
    aggregateCityLandingEvents(JustGoLandingEvent, tenant.tenantKey, range.from, range.to),
    aggregateCityWaitlist(JustGoWaitlist, tenant.tenantKey, range.from, range.to),
    aggregateCityQrScans(JustGoLandingQr, tenant.tenantKey, range.from, range.to),
  ]);

  const totals = totalsFromFacets(eventFacet, waitlistFacet);
  const conversionRate = conversionRateForMode(landingMode, totals);
  const sources = buildSourceBreakdown(eventFacet, waitlistFacet);

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: cityDisplayName(tenant),
      landingMode,
      publicUrl: cityPublicUrl(tenant.tenantKey, req),
      range: serializeRange(range.from, range.to),
      conversionNote: CONVERSION_USES_CURRENT_MODE_NOTE,
      totals: { ...totals, conversionRate },
      series: buildDailySeries(range.from, range.to, eventFacet, waitlistFacet),
      sources,
      qr: buildQrBreakdown(eventFacet, waitlistFacet, qrScanRows, sources.qr),
    },
  };
}

async function aggregateFleetLandingEvents(JustGoLandingEvent, tenantKeys, from, to) {
  const rows = await JustGoLandingEvent.aggregate([
    {
      $match: rangeMatch(from, to, {
        tenantKey: { $in: tenantKeys },
      }),
    },
    {
      $facet: {
        byTenantType: [
          {
            $group: {
              _id: { tenantKey: '$tenantKey', type: '$type' },
              count: { $sum: 1 },
            },
          },
        ],
        uniqueByTenant: [
          { $match: { type: 'view' } },
          { $group: { _id: { tenantKey: '$tenantKey', visitorId: '$visitorId' } } },
          { $group: { _id: '$_id.tenantKey', count: { $sum: 1 } } },
        ],
        uniqueTotal: [
          { $match: { type: 'view' } },
          { $group: { _id: '$visitorId' } },
          { $count: 'count' },
        ],
      },
    },
  ]);
  return rows?.[0] || {};
}

async function aggregateFleetWaitlist(JustGoWaitlist, tenantKeys, from, to) {
  const rows = await JustGoWaitlist.aggregate([
    { $match: rangeMatch(from, to, { tenantKey: { $in: tenantKeys } }) },
    {
      $facet: {
        byTenant: [{ $group: { _id: '$tenantKey', count: { $sum: 1 } } }],
        lastSignupByTenant: [
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$tenantKey',
              lastSignupAt: { $first: '$createdAt' },
            },
          },
        ],
      },
    },
  ]);
  return rows?.[0] || {};
}

async function getFleetLaunchStats(req, options = {}) {
  const range = parseLaunchRange(options, options.now);
  if (range.error) return range;

  const tenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenantKeys = tenants.map((row) => row.tenantKey);

  if (!tenantKeys.length) {
    return {
      data: {
        range: serializeRange(range.from, range.to),
        conversionNote: CONVERSION_USES_CURRENT_MODE_NOTE,
        totals: { ...emptyMetricCounts(), conversionRate: 0 },
        cities: [],
      },
    };
  }

  const { JustGoLandingEvent, JustGoWaitlist } = getGlobalModels(
    req,
    'JustGoLandingEvent',
    'JustGoWaitlist',
  );

  const [eventFacet, waitlistFacet] = await Promise.all([
    aggregateFleetLandingEvents(JustGoLandingEvent, tenantKeys, range.from, range.to),
    aggregateFleetWaitlist(JustGoWaitlist, tenantKeys, range.from, range.to),
  ]);

  const viewsByTenant = new Map();
  const clicksByTenant = new Map();
  for (const row of eventFacet.byTenantType || []) {
    const key = row?._id?.tenantKey;
    if (!key) continue;
    if (row._id.type === 'view') viewsByTenant.set(key, Number(row.count) || 0);
    if (row._id.type === 'store_click') clicksByTenant.set(key, Number(row.count) || 0);
  }
  const uniqueByTenant = new Map(
    (eventFacet.uniqueByTenant || []).map((row) => [row._id, Number(row.count) || 0]),
  );
  const waitlistByTenant = new Map(
    (waitlistFacet.byTenant || []).map((row) => [row._id, Number(row.count) || 0]),
  );
  const lastSignupByTenant = new Map(
    (waitlistFacet.lastSignupByTenant || []).map((row) => [
      row._id,
      row.lastSignupAt ? new Date(row.lastSignupAt).toISOString() : null,
    ]),
  );

  let conversionNumerator = 0;
  let conversionViews = 0;
  const cities = sortLandingCities(
    tenants.map((tenant) => {
      const landingMode = resolveLandingMode(tenant.landingMode);
      const totals = {
        views: viewsByTenant.get(tenant.tenantKey) || 0,
        uniqueVisitors: uniqueByTenant.get(tenant.tenantKey) || 0,
        waitlistSignups: waitlistByTenant.get(tenant.tenantKey) || 0,
        storeClicks: clicksByTenant.get(tenant.tenantKey) || 0,
      };
      const conversionRate = conversionRateForMode(landingMode, totals);
      conversionNumerator +=
        landingMode === 'launched' ? totals.storeClicks : totals.waitlistSignups;
      conversionViews += totals.views;
      return {
        tenantKey: tenant.tenantKey,
        cityDisplayName: cityDisplayName(tenant),
        landingMode,
        publicUrl: cityPublicUrl(tenant.tenantKey, req),
        lastSignupAt: lastSignupByTenant.get(tenant.tenantKey) || null,
        ...totals,
        conversionRate,
      };
    }),
  );

  const totals = {
    views: cities.reduce((sum, row) => sum + row.views, 0),
    uniqueVisitors: Number(eventFacet.uniqueTotal?.[0]?.count) || 0,
    waitlistSignups: cities.reduce((sum, row) => sum + row.waitlistSignups, 0),
    storeClicks: cities.reduce((sum, row) => sum + row.storeClicks, 0),
    // Weighted by each city's current mode (signups vs clicks); mixed-mode history is best-effort.
    conversionRate: roundRate(conversionViews ? conversionNumerator / conversionViews : 0),
  };

  return {
    data: {
      range: serializeRange(range.from, range.to),
      conversionNote: CONVERSION_USES_CURRENT_MODE_NOTE,
      totals,
      cities,
    },
  };
}

async function updateTenantLandingMode(req, options = {}) {
  const resolved = await resolvePivotLandingTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const landingMode = String(options.landingMode ?? '').trim();
  if (!LANDING_MODES.has(landingMode)) {
    return {
      error: 'landingMode must be waitlist or launched.',
      status: 400,
      code: 'INVALID_LANDING_MODE',
    };
  }

  const updatedBy = req.user?.globalUserId || req.user?.userId || null;
  const saved = await upsertStoredTenantRow(
    req,
    { ...resolved.tenant, landingMode },
    updatedBy,
  );

  const nextMode = resolveLandingMode(saved?.landingMode ?? landingMode);
  return {
    data: {
      tenantKey: resolved.tenant.tenantKey,
      landingMode: nextMode,
      publicUrl: cityPublicUrl(resolved.tenant.tenantKey, req),
    },
  };
}

module.exports = {
  recordLandingEvent,
  getLandingConfig,
  getTenantLaunchStats,
  getFleetLaunchStats,
  updateTenantLandingMode,
  parseLaunchRange,
  conversionRateForMode,
  CONVERSION_USES_CURRENT_MODE_NOTE,
  DEFAULT_LAUNCH_RANGE_DAYS,
  MAX_LAUNCH_RANGE_DAYS,
};
