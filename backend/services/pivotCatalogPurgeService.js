const mongoose = require('mongoose');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
const { isValidIsoWeek, outOfRangeCatalogEventsQuery } = require('../utilities/pivotIsoWeek');

const PURGE_CONFIRM_TOKEN = 'PURGE';
const PIVOT_CATALOG_EVENT_QUERY = { 'customFields.pivot': { $exists: true } };

const CATALOG_MODEL_NAMES = [
  'Event',
  'PivotEventIntent',
  'UniversalFeedback',
  'FormResponse',
  'EventAnalytics',
  'EventQR',
  'AnalyticsEvent',
];

function emptyDeletedCounts() {
  return {
    events: 0,
    intents: 0,
    feedback: 0,
    formResponses: 0,
    eventAnalytics: 0,
    eventQr: 0,
    analyticsEvents: 0,
  };
}

function outOfRangeEventsQuery(batchWeek, dropDayOfWeek = 4) {
  if (!batchWeek || !isValidIsoWeek(batchWeek)) {
    return null;
  }
  return outOfRangeCatalogEventsQuery(batchWeek, dropDayOfWeek);
}

// Legacy alias — behavior is out-of-range within the review week, not other batch weeks.
function outOfWeekEventsQuery(batchWeek, dropDayOfWeek = 4) {
  return outOfRangeEventsQuery(batchWeek, dropDayOfWeek);
}

async function withTenantCatalogModels(tenantKey, fn) {
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const models = getModels(tenantReq, ...CATALOG_MODEL_NAMES);
  return fn(models);
}

async function deletePivotCatalogEventsWithModels(models, eventIds) {
  const deleted = emptyDeletedCounts();
  if (!eventIds.length) {
    return deleted;
  }

  const {
    Event,
    PivotEventIntent,
    UniversalFeedback,
    FormResponse,
    EventAnalytics,
    EventQR,
    AnalyticsEvent,
  } = models;
  const eventIdStrings = eventIds.map(String);

  const intentResult = await PivotEventIntent.deleteMany({
    eventId: { $in: eventIds },
  });
  deleted.intents = intentResult.deletedCount || 0;

  const feedbackResult = await UniversalFeedback.deleteMany({
    feature: PIVOT_EVENT_FEATURE,
    processId: { $in: eventIds },
  });
  deleted.feedback = feedbackResult.deletedCount || 0;

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

  return deleted;
}

async function purgeTenantPivotCatalog(tenantKey, options = {}) {
  const batchWeek = options.batchWeek || null;

  return withTenantCatalogModels(tenantKey, async (models) => {
    const { Event, PivotEventIntent, UniversalFeedback } = models;
    const eventQuery = batchWeek
      ? { ...PIVOT_CATALOG_EVENT_QUERY, 'customFields.pivot.batchWeek': batchWeek }
      : PIVOT_CATALOG_EVENT_QUERY;

    const events = await Event.find(eventQuery).select('_id').lean();
    const eventIds = events.map((event) => event._id);
    const deleted = await deletePivotCatalogEventsWithModels(models, eventIds);

    // Attendee intents store batchWeek directly, so a weekly purge scopes to that field —
    // this also cleans up intents whose event was already removed.
    if (batchWeek) {
      const intentResult = await PivotEventIntent.deleteMany({ batchWeek });
      deleted.intents += intentResult.deletedCount || 0;

      const feedbackResult = await UniversalFeedback.deleteMany({
        feature: PIVOT_EVENT_FEATURE,
        'metadata.batchWeek': batchWeek,
      });
      deleted.feedback += feedbackResult.deletedCount || 0;
    }

    return deleted;
  });
}

async function countPivotCatalogOutOfWeek(tenantKey, batchWeek, dropDayOfWeek = 4) {
  const query = outOfRangeEventsQuery(batchWeek, dropDayOfWeek);
  if (!query) {
    return { count: 0 };
  }

  return withTenantCatalogModels(tenantKey, async ({ Event }) => {
    const count = await Event.countDocuments(query);
    return { count };
  });
}

async function deletePivotCatalogEvent(tenantKey, eventId) {
  const normalizedKey = tenantKey?.trim()?.toLowerCase();
  if (!normalizedKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return {
      error: 'Invalid event id.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  return withTenantCatalogModels(normalizedKey, async (models) => {
    const event = await models.Event.findOne({
      _id: eventId,
      ...PIVOT_CATALOG_EVENT_QUERY,
      isDeleted: { $ne: true },
    })
      .select('_id name customFields.pivot.batchWeek')
      .lean();

    if (!event) {
      return {
        error: 'Pivot catalog event not found.',
        status: 404,
        code: 'EVENT_NOT_FOUND',
      };
    }

    const deleted = await deletePivotCatalogEventsWithModels(models, [event._id]);

    return {
      data: {
        tenantKey: normalizedKey,
        eventId: String(event._id),
        eventName: event.name || null,
        batchWeek: event.customFields?.pivot?.batchWeek || null,
        deleted,
      },
    };
  });
}

async function purgePivotCatalogOutOfWeek(tenantKey, batchWeek, dropDayOfWeek = 4) {
  const normalizedKey = tenantKey?.trim()?.toLowerCase();
  if (!normalizedKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const normalizedWeek = batchWeek?.trim() || null;
  if (!normalizedWeek || !isValidIsoWeek(normalizedWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const query = outOfRangeEventsQuery(normalizedWeek, dropDayOfWeek);
  if (!query) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  return withTenantCatalogModels(normalizedKey, async (models) => {
    const events = await models.Event.find(query).select('_id').lean();
    const eventIds = events.map((event) => event._id);
    const deleted = await deletePivotCatalogEventsWithModels(models, eventIds);

    return {
      data: {
        tenantKey: normalizedKey,
        batchWeek: normalizedWeek,
        dropDayOfWeek,
        outOfWeekEventCount: eventIds.length,
        deleted,
      },
    };
  });
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
  deletePivotCatalogEvent,
  deletePivotCatalogEventsWithModels,
  purgePivotCatalogOutOfWeek,
  countPivotCatalogOutOfWeek,
  outOfWeekEventsQuery,
  PURGE_CONFIRM_TOKEN,
  PIVOT_CATALOG_EVENT_QUERY,
};
