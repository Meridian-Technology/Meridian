const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const PURGE_CONFIRM_TOKEN = 'PURGE';
const PIVOT_CATALOG_EVENT_QUERY = { 'customFields.pivot': { $exists: true } };

async function purgeTenantPivotCatalog(tenantKey, options = {}) {
  const batchWeek = options.batchWeek || null;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const {
    Event,
    PivotEventIntent,
    UniversalFeedback,
    FormResponse,
    EventAnalytics,
    EventQR,
    AnalyticsEvent,
  } = getModels(
    tenantReq,
    'Event',
    'PivotEventIntent',
    'UniversalFeedback',
    'FormResponse',
    'EventAnalytics',
    'EventQR',
    'AnalyticsEvent',
  );

  const eventQuery = batchWeek
    ? { ...PIVOT_CATALOG_EVENT_QUERY, 'customFields.pivot.batchWeek': batchWeek }
    : PIVOT_CATALOG_EVENT_QUERY;

  const events = await Event.find(eventQuery).select('_id').lean();
  const eventIds = events.map((event) => event._id);
  const eventIdStrings = eventIds.map(String);

  const deleted = {
    events: 0,
    intents: 0,
    feedback: 0,
    formResponses: 0,
    eventAnalytics: 0,
    eventQr: 0,
    analyticsEvents: 0,
  };

  // Attendee intents store batchWeek directly, so a weekly purge scopes to that field —
  // this also cleans up intents whose event was already removed. A full purge falls back
  // to event membership, and an empty filter sweeps any orphaned intents.
  const intentResult = await PivotEventIntent.deleteMany(
    batchWeek
      ? { batchWeek }
      : eventIds.length
        ? { eventId: { $in: eventIds } }
        : {},
  );
  deleted.intents = intentResult.deletedCount || 0;

  const feedbackResult = await UniversalFeedback.deleteMany({
    feature: PIVOT_EVENT_FEATURE,
    ...(batchWeek
      ? { 'metadata.batchWeek': batchWeek }
      : eventIds.length
        ? { processId: { $in: eventIds } }
        : {}),
  });
  deleted.feedback = feedbackResult.deletedCount || 0;

  if (eventIds.length) {
    const [formResult, analyticsResult, qrResult, analyticsEventsResult] = await Promise.all([
      FormResponse.deleteMany({ event: { $in: eventIds } }),
      EventAnalytics.deleteMany({ eventId: { $in: eventIds } }),
      EventQR.deleteMany({ eventId: { $in: eventIds } }),
      AnalyticsEvent.deleteMany({
        'properties.event_id': { $in: eventIdStrings },
      }),
    ]);

    deleted.formResponses = formResult.deletedCount || 0;
    deleted.eventAnalytics = analyticsResult.deletedCount || 0;
    deleted.eventQr = qrResult.deletedCount || 0;
    deleted.analyticsEvents = analyticsEventsResult.deletedCount || 0;

    const eventResult = await Event.deleteMany({ _id: { $in: eventIds } });
    deleted.events = eventResult.deletedCount || 0;
  }

  return deleted;
}

async function purgeGlobalPivotSnapshots(req, options = {}) {
  const { PivotWeeklySnapshot } = getGlobalModels(req, 'PivotWeeklySnapshot');
  const result = await PivotWeeklySnapshot.deleteMany(
    options.batchWeek ? { batchWeek: options.batchWeek } : {},
  );
  return { weeklySnapshots: result.deletedCount || 0 };
}

async function purgePivotCatalog(req, options = {}) {
  const confirm = options.confirm?.trim();
  if (confirm !== PURGE_CONFIRM_TOKEN) {
    return {
      error: `Type ${PURGE_CONFIRM_TOKEN} to confirm.`,
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    };
  }

  const batchWeek = options.batchWeek?.trim() || null;
  if (batchWeek && !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenantKeyFilter = options.tenantKey?.trim()?.toLowerCase();

  let tenantsToPurge = pivotTenants;
  if (tenantKeyFilter) {
    const tenant = pivotTenants.find((row) => row.tenantKey === tenantKeyFilter);
    if (!tenant) {
      return {
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      };
    }
    tenantsToPurge = [tenant];
  }

  const tenantResults = [];
  for (const tenant of tenantsToPurge) {
    const counts = await purgeTenantPivotCatalog(tenant.tenantKey, { batchWeek });
    tenantResults.push({
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      deleted: counts,
    });
  }

  const globalDeleted =
    options.clearSnapshots === false ? {} : await purgeGlobalPivotSnapshots(req, { batchWeek });

  const totals = tenantResults.reduce(
    (acc, row) => {
      Object.entries(row.deleted).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + value;
      });
      return acc;
    },
    { weeklySnapshots: globalDeleted.weeklySnapshots || 0 },
  );

  return {
    data: {
      batchWeek,
      scope: batchWeek ? 'week' : 'all-weeks',
      tenants: tenantResults,
      totals,
    },
  };
}

module.exports = {
  purgePivotCatalog,
  purgeTenantPivotCatalog,
  PURGE_CONFIRM_TOKEN,
  PIVOT_CATALOG_EVENT_QUERY,
};
