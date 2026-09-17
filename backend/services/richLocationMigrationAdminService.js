const { randomUUID } = require('crypto');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { runLocationBackfill } = require('./pivotLocationBackfillService');
const { resolveRichLocationControls } = require('../utilities/justGoRichLocationControls');
const googleLocationService = require('./googleLocationService');
const { isGoogleLocationConfigured } = googleLocationService;

const LEASE_MS = 10 * 60 * 1000;
const MAX_UI_BATCH_SIZE = 50;
const MAX_UI_INTERVAL_MS = 5_000;
const HEATMAP_COLS = 40;
const HEATMAP_ROWS = 32;
const HEATMAP_MAX_POINTS = 8_000;
const HEATMAP_PAD_RATIO = 0.08;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function migrationUiEnabled(env = process.env) {
  return env.ENABLE_RICH_LOCATION_MIGRATION_UI === 'true';
}

function actorFrom(req) {
  return trimString(req.user?.email)
    || trimString(req.user?.globalUserId)
    || trimString(req.user?.userId)
    || 'platform-admin';
}

function publicRun(run) {
  if (!run) return null;
  return {
    scope: run.scope,
    batchWeek: run.batchWeek || null,
    status: run.status,
    catalogAsOf: run.catalogAsOf || null,
    checkpoint: run.checkpoint || null,
    cumulativeCounts: run.cumulativeCounts || null,
    lastBatch: run.lastBatch || null,
    updatedAt: run.updatedAt || null,
  };
}

function publicLease(lease) {
  if (!lease) return null;
  return {
    scope: lease.scope,
    actor: lease.actor || null,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
  };
}

async function tenantModels(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  return {
    db,
    ...getModels(
      { db },
      'Event',
      'PivotLocationBackfillRun',
      'PivotLocationBackfillWeekRun',
      'PivotLocationMigrationLease',
    ),
  };
}

const CITY_BOUNDARY_ERROR_MESSAGES = {
  GOOGLE_LOCATION_NOT_CONFIGURED: 'Google location lookup is not configured.',
  GOOGLE_GEOCODE_NOT_FOUND: 'Google could not find that city.',
  GOOGLE_CITY_BOUNDARY_NOT_FOUND: 'Google found a place, but no usable city boundary.',
  GOOGLE_CITY_QUERY_INVALID: 'Enter a city name to look up a boundary.',
  GOOGLE_LOCATION_AUTH_FAILED: 'Google rejected the location lookup credential.',
  GOOGLE_LOCATION_UNAVAILABLE: 'Google location lookup is temporarily unavailable.',
};

function defaultCityBoundaryQuery(tenant) {
  return trimString(tenant?.location) || trimString(tenant?.name) || '';
}

function suggestCityBoundaryError(error) {
  const code = error?.code || 'RICH_LOCATION_MIGRATION_CITY_BOUNDARY_FAILED';
  const mapped = new Error(CITY_BOUNDARY_ERROR_MESSAGES[code] || error.message || 'Unable to look up a city boundary.');
  mapped.code = code;
  mapped.status = Number(error?.status) || 502;
  return mapped;
}

async function suggestCityBoundary({ tenant, query, countryCode, googleAdapter }) {
  const cityQuery = trimString(query) || defaultCityBoundaryQuery(tenant);
  if (!cityQuery) {
    throw suggestCityBoundaryError({
      code: 'GOOGLE_CITY_QUERY_INVALID',
      status: 400,
      message: CITY_BOUNDARY_ERROR_MESSAGES.GOOGLE_CITY_QUERY_INVALID,
    });
  }

  const adapter = googleAdapter || googleLocationService;
  try {
    const suggestion = await adapter.lookupCityBoundary(cityQuery, {
      countryCode: trimString(countryCode) || tenant?.richLocationConstraints?.countryCode,
    });
    return {
      query: cityQuery,
      formattedAddress: suggestion.formattedAddress,
      countryCode: suggestion.countryCode,
      bounds: suggestion.bounds,
      center: suggestion.center,
      radiusKm: suggestion.radiusKm,
      matchCount: suggestion.matchCount,
      ambiguous: Number(suggestion.matchCount) > 1,
    };
  } catch (error) {
    throw suggestCityBoundaryError(error);
  }
}

function migrationBatchWeek(value, { required = false } = {}) {
  const batchWeek = trimString(value);
  if (!batchWeek && !required) return null;
  if (!/^\d{4}-W\d{2}$/.test(batchWeek)) {
    const error = new Error('Choose a valid batch week in YYYY-Www format.');
    error.code = 'RICH_LOCATION_MIGRATION_BATCH_WEEK_INVALID';
    error.status = 400;
    throw error;
  }
  return batchWeek;
}

function weekCatalogQuery(batchWeek) {
  return {
    'customFields.pivot': { $exists: true },
    'customFields.pivot.batchWeek': batchWeek,
    isDeleted: { $ne: true },
    location: { $type: 'string', $ne: '' },
  };
}

function historicCatalogQuery() {
  return {
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  };
}

function coordinatesFromEvent(event) {
  const pair = event?.richLocation?.coordinates?.coordinates;
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const longitude = Number(pair[0]);
  const latitude = Number(pair[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function distanceKm(first, second) {
  const radians = (degrees) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude))
      * Math.cos(radians(second.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function longitudeWithinBounds(longitude, west, east) {
  return west <= east
    ? longitude >= west && longitude <= east
    : longitude >= west || longitude <= east;
}

function pointInCityScope(point, constraints) {
  if (!constraints) return true;
  if (constraints.bounds) {
    const { north, south, east, west } = constraints.bounds;
    if (point.latitude < south || point.latitude > north
      || !longitudeWithinBounds(point.longitude, west, east)) {
      return false;
    }
  }
  if (constraints.center && Number(constraints.radiusKm) > 0) {
    return distanceKm(point, constraints.center) <= Number(constraints.radiusKm);
  }
  return true;
}

function boundsFromPoints(points) {
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    north: Math.max(bounds.north, point.latitude),
    south: Math.min(bounds.south, point.latitude),
    east: Math.max(bounds.east, point.longitude),
    west: Math.min(bounds.west, point.longitude),
  }), {
    north: points[0].latitude,
    south: points[0].latitude,
    east: points[0].longitude,
    west: points[0].longitude,
  });
}

function boundsFromRadius(center, radiusKm) {
  if (!center || !(Number(radiusKm) > 0)) return null;
  const latDelta = Number(radiusKm) / 111.32;
  const lngDelta = Number(radiusKm)
    / (111.32 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));
  return {
    north: Math.min(90, center.latitude + latDelta),
    south: Math.max(-90, center.latitude - latDelta),
    east: Math.min(180, center.longitude + lngDelta),
    west: Math.max(-180, center.longitude - lngDelta),
  };
}

function unionBounds(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  return {
    north: Math.max(first.north, second.north),
    south: Math.min(first.south, second.south),
    east: Math.max(first.east, second.east),
    west: Math.min(first.west, second.west),
  };
}

function padBounds(bounds, ratio = HEATMAP_PAD_RATIO) {
  if (!bounds) return null;
  const latSpan = Math.max(bounds.north - bounds.south, 0.004);
  const lngSpan = Math.max(Math.abs(bounds.east - bounds.west), 0.004);
  const latPad = latSpan * ratio;
  const lngPad = lngSpan * ratio;
  return {
    north: Math.min(90, bounds.north + latPad),
    south: Math.max(-90, bounds.south - latPad),
    east: Math.min(180, bounds.east + lngPad),
    west: Math.max(-180, bounds.west - lngPad),
  };
}

function cityViewBounds(constraints) {
  if (!constraints) return null;
  return constraints.bounds
    || boundsFromRadius(constraints.center, constraints.radiusKm);
}

function binHistoricPoints(points, bounds, cols = HEATMAP_COLS, rows = HEATMAP_ROWS) {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  if (!(latSpan > 0) || !(lngSpan > 0)) {
    return { cells: [], maxCount: 0 };
  }

  const counts = new Map();
  points.forEach((point) => {
    const x = Math.min(
      cols - 1,
      Math.max(0, Math.floor(((point.longitude - bounds.west) / lngSpan) * cols)),
    );
    const y = Math.min(
      rows - 1,
      Math.max(0, Math.floor(((bounds.north - point.latitude) / latSpan) * rows)),
    );
    const key = `${x},${y}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let maxCount = 0;
  const cells = Array.from(counts.entries()).map(([key, count]) => {
    const [x, y] = key.split(',').map(Number);
    maxCount = Math.max(maxCount, count);
    return { x, y, count };
  });

  return { cells, maxCount };
}

async function getHistoricLocationHeatmap({ tenant }) {
  const { Event } = await tenantModels(tenant.tenantKey);
  const constraints = tenant.richLocationConstraints || null;
  const resolvedQuery = {
    ...historicCatalogQuery(),
    'richLocation.coordinates.coordinates.0': { $type: 'number' },
    'richLocation.coordinates.coordinates.1': { $type: 'number' },
  };
  const unresolvedQuery = {
    ...historicCatalogQuery(),
    location: { $type: 'string', $ne: '' },
    $or: [
      { richLocation: { $exists: false } },
      { richLocation: null },
      { 'richLocation.coordinates.coordinates.0': { $exists: false } },
    ],
  };

  const [docs, unresolvedCount] = await Promise.all([
    Event.find(resolvedQuery)
      .select({ 'richLocation.coordinates.coordinates': 1 })
      .limit(HEATMAP_MAX_POINTS)
      .lean(),
    Event.countDocuments(unresolvedQuery),
  ]);

  const points = docs.map(coordinatesFromEvent).filter(Boolean);
  const viewBounds = padBounds(unionBounds(
    boundsFromPoints(points),
    cityViewBounds(constraints),
  ));
  const { cells, maxCount } = viewBounds
    ? binHistoricPoints(points, viewBounds)
    : { cells: [], maxCount: 0 };
  const outsideCount = constraints
    ? points.filter((point) => !pointInCityScope(point, constraints)).length
    : 0;

  return {
    cols: HEATMAP_COLS,
    rows: HEATMAP_ROWS,
    bounds: viewBounds,
    cityBounds: constraints?.bounds || null,
    cityCenter: constraints?.center || null,
    cityRadiusKm: Number(constraints?.radiusKm) > 0 ? Number(constraints.radiusKm) : null,
    cells,
    maxCount,
    pointCount: points.length,
    outsideCount,
    unresolvedCount,
    truncated: docs.length >= HEATMAP_MAX_POINTS,
  };
}

async function getRichLocationMigrationStatus({ tenant, batchWeek: requestedBatchWeek }) {
  const batchWeek = migrationBatchWeek(requestedBatchWeek);
  const {
    Event,
    PivotLocationBackfillRun,
    PivotLocationBackfillWeekRun,
    PivotLocationMigrationLease,
  } =
    await tenantModels(tenant.tenantKey);
  const now = new Date();
  const baseWeekQuery = batchWeek ? weekCatalogQuery(batchWeek) : null;
  const [runs, weekRun, leases, availableWeeks, total, processed, resolved, needsReview] = await Promise.all([
    PivotLocationBackfillRun.find({ tenantKey: tenant.tenantKey }).lean(),
    batchWeek
      ? PivotLocationBackfillWeekRun.findOne({ tenantKey: tenant.tenantKey, batchWeek }).lean()
      : null,
    PivotLocationMigrationLease.find({
      tenantKey: tenant.tenantKey,
      expiresAt: { $gt: now },
    }).lean(),
    Event.distinct('customFields.pivot.batchWeek', {
      isDeleted: { $ne: true },
      'customFields.pivot.batchWeek': { $type: 'string' },
    }),
    batchWeek ? Event.countDocuments(baseWeekQuery) : 0,
    batchWeek ? Event.countDocuments({
      ...baseWeekQuery,
      $or: [
        { richLocation: { $exists: true, $ne: null } },
        { 'customFields.pivot.locationBackfill.processedAt': { $exists: true } },
      ],
    }) : 0,
    batchWeek ? Event.countDocuments({
      ...baseWeekQuery,
      richLocation: { $exists: true, $ne: null },
      'customFields.pivot.locationReview.status': { $ne: 'needs_review' },
    }) : 0,
    Event.countDocuments({
      ...(batchWeek ? baseWeekQuery : { isDeleted: { $ne: true } }),
      'customFields.pivot.locationReview.status': 'needs_review',
    }),
  ]);
  const byScope = Object.fromEntries(runs.map((run) => [run.scope, publicRun(run)]));
  const leasesByScope = Object.fromEntries(
    leases.map((lease) => [lease.scope, publicLease(lease)]),
  );
  return {
    tenantKey: tenant.tenantKey,
    batchWeek,
    availableWeeks: availableWeeks.filter((week) => /^\d{4}-W\d{2}$/.test(week)).sort(),
    coverage: batchWeek ? {
      total,
      processed,
      resolved,
      needsReview,
      remaining: Math.max(0, total - processed),
      percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
    } : null,
    weekRun: publicRun(weekRun),
    constraints: tenant.richLocationConstraints || null,
    controls: resolveRichLocationControls(tenant),
    configuredControls: tenant.richLocationControls || null,
    providerConfigured: isGoogleLocationConfigured(),
    needsReview,
    runs: {
      live: byScope.live || null,
      historical: byScope.historical || null,
    },
    leases: {
      live: leasesByScope.live || null,
      historical: leasesByScope.historical || null,
    },
  };
}

async function acquireLease(Model, options) {
  const now = new Date();
  await Model.deleteOne({
    tenantKey: options.tenantKey,
    scope: options.scope,
    expiresAt: { $lte: now },
  });
  const leaseId = randomUUID();
  try {
    await Model.create({
      tenantKey: options.tenantKey,
      scope: options.scope,
      leaseId,
      actor: options.actor,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + LEASE_MS),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('A rich-location migration batch is already running.');
      conflict.code = 'RICH_LOCATION_MIGRATION_LOCKED';
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
  return leaseId;
}

function uiNumber(value, fallback, min, max, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${field} must be between ${min} and ${max}.`);
    error.code = 'RICH_LOCATION_MIGRATION_OPTIONS_INVALID';
    error.status = 400;
    throw error;
  }
  return number;
}

async function runRichLocationMigrationBatch(req, { tenant, input = {} }) {
  const apply = input.apply === true;
  if (apply && trimString(input.confirmTenantKey).toLowerCase() !== tenant.tenantKey) {
    const error = new Error(`Type "${tenant.tenantKey}" to confirm an applied batch.`);
    error.code = 'RICH_LOCATION_MIGRATION_CONFIRMATION_REQUIRED';
    error.status = 400;
    throw error;
  }
  const scope = trimString(input.scope || 'live').toLowerCase();
  if (!['live', 'historical'].includes(scope)) {
    const error = new Error('scope must be live or historical.');
    error.code = 'RICH_LOCATION_MIGRATION_SCOPE_INVALID';
    error.status = 400;
    throw error;
  }
  const batchWeek = migrationBatchWeek(input.batchWeek, { required: true });
  const batchSize = Math.floor(uiNumber(
    input.batchSize,
    25,
    1,
    MAX_UI_BATCH_SIZE,
    'batchSize',
  ));
  const maxProviderOperations = Math.floor(uiNumber(
    input.maxProviderOperations,
    batchSize,
    0,
    batchSize,
    'maxProviderOperations',
  ));
  const minIntervalMs = Math.floor(uiNumber(
    input.minIntervalMs,
    100,
    0,
    MAX_UI_INTERVAL_MS,
    'minIntervalMs',
  ));
  const autoApplyConfidence = uiNumber(
    input.autoApplyConfidence,
    0.9,
    0,
    1,
    'autoApplyConfidence',
  );
  const reviewConfidence = uiNumber(
    input.reviewConfidence,
    0.6,
    0,
    autoApplyConfidence,
    'reviewConfidence',
  );

  const { db, PivotLocationMigrationLease } = await tenantModels(tenant.tenantKey);
  const leaseId = await acquireLease(PivotLocationMigrationLease, {
    tenantKey: tenant.tenantKey,
    scope,
    actor: actorFrom(req),
  });
  try {
    return await runLocationBackfill({
      db,
      tenantKey: tenant.tenantKey,
      tenant,
      scope,
      batchWeek,
      liveCatalogStable: input.confirmLiveStable === true,
      dryRun: !apply,
      batchSize,
      minIntervalMs,
      autoApplyConfidence,
      reviewConfidence,
      maxProviderOperations,
      asOf: input.asOf,
    });
  } catch (error) {
    if (error?.code || /^Location backfill/.test(error?.message || '')) {
      error.status = error.status || 400;
    }
    throw error;
  } finally {
    try {
      await PivotLocationMigrationLease.deleteOne({ leaseId });
    } catch (error) {
      console.error('Unable to release rich-location migration lease:', error.message);
    }
  }
}

module.exports = {
  migrationUiEnabled,
  migrationBatchWeek,
  weekCatalogQuery,
  historicCatalogQuery,
  getRichLocationMigrationStatus,
  getHistoricLocationHeatmap,
  runRichLocationMigrationBatch,
  suggestCityBoundary,
  defaultCityBoundaryQuery,
  acquireLease,
  publicRun,
  binHistoricPoints,
  constants: {
    LEASE_MS,
    MAX_UI_BATCH_SIZE,
    MAX_UI_INTERVAL_MS,
    HEATMAP_COLS,
    HEATMAP_ROWS,
    HEATMAP_MAX_POINTS,
  },
};
