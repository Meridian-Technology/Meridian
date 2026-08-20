const { getTenantByKey } = require('./tenantConfigService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  describePivotDropSchedule,
  isPivotTenant,
  resolvePivotDropInstant,
  resolvePivotLiveBatchWeek,
  resolvePivotUpcomingDropBatchWeek,
} = require('../utilities/pivotDropSchedule');
const { mergePivotCrewConfig } = require('../utilities/pivotCrewConfig');
const { mergePivotMobileConfig } = require('../utilities/pivotMobileConfig');
const { getCopyPointer, EMPTY_COPY_POINTER } = require('./pivotCopyService');

function buildDropSchedulePayload(tenant, batchWeek, now = new Date()) {
  const resolved = resolvePivotDropInstant(tenant, batchWeek, now);
  const description = describePivotDropSchedule(resolved);

  return {
    batchWeek,
    timezone: resolved.timezone,
    dayOfWeek: resolved.dayOfWeek,
    hour: resolved.hour,
    minute: resolved.minute,
    nextDropAt: resolved.dropAt.toISOString(),
    nextDropFormatted: description.formatted,
    localSchedule: description.localTime,
    source: resolved.source,
    usingPilotDefaults: resolved.usingPilotDefaults,
  };
}

async function resolveCopyPointer(req, tenantKey) {
  try {
    const result = await getCopyPointer(req, { tenantKey });
    if (!result.error && result.data?.revision != null) {
      return {
        revision: result.data.revision,
        schemaVersion: result.data.schemaVersion,
      };
    }
  } catch (err) {
    console.warn('[pivot] GET /pivot/config copy pointer failed', err);
  }
  return { ...EMPTY_COPY_POINTER };
}

async function getPivotConfig(req, options = {}) {
  const tenantKey = req.school || options.tenantKey;
  if (!tenantKey) {
    return { error: 'Tenant context required.', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    console.warn('[pivot] GET /pivot/config non-pivot tenant', {
      tenantKey: tenant.tenantKey,
      tenantType: tenant.tenantType,
      pivotPilot: tenant.pivotPilot === true,
      reqSchool: tenantKey,
      xTenant: req.headers?.['x-tenant'] || null,
      host: req.headers?.host || null,
    });
    return { error: 'Pivot config is only available for pivot city tenants.', status: 400 };
  }

  const now = options.now || new Date();
  const liveBatchWeek =
    options.batchWeek?.trim() || resolvePivotLiveBatchWeek(tenant, now);
  if (options.batchWeek && !isValidIsoWeek(liveBatchWeek)) {
    return { error: 'batchWeek must be ISO format YYYY-Www.', status: 400, code: 'INVALID_BATCH_WEEK' };
  }

  const dropScheduleBatchWeek = options.batchWeek?.trim()
    ? liveBatchWeek
    : resolvePivotUpcomingDropBatchWeek(tenant, now);

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      liveBatchWeek,
      dropSchedule: buildDropSchedulePayload(tenant, dropScheduleBatchWeek, now),
      liveDropSchedule: buildDropSchedulePayload(tenant, liveBatchWeek, now),
      crew: mergePivotCrewConfig(tenant.pivotCrewConfig),
      mobile: mergePivotMobileConfig(tenant.pivotMobileConfig, {
        product: String(req.headers?.['x-app-product'] || '').toLowerCase(),
      }),
      copy: await resolveCopyPointer(req, tenant.tenantKey),
    },
  };
}

module.exports = {
  buildDropSchedulePayload,
  getPivotConfig,
};
