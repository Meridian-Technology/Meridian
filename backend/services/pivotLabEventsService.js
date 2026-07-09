const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const {
  normalizeBatchWeek,
} = require('./pivotWeeklySnapshotService');
const { serializePivotMovie } = require('../utilities/pivotMovieMetadata');

function labEventsQuery(batchWeek) {
  return {
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  };
}

const EMPTY_INTENT_STATS = Object.freeze({
  interested: 0,
  registered: 0,
  passed: 0,
  externalOpens: 0,
  externalOpenUsers: 0,
});

function serializeLabEvent(event, intentStatsByEventId) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};
  const movie = serializePivotMovie(pivot.movie);
  const timeSlots = Array.isArray(pivot.timeSlots)
    ? pivot.timeSlots.map((slot) => ({
        id: slot.id,
        start_time: slot.start_time,
        end_time: slot.end_time || null,
        label: slot.label || null,
      }))
    : [];

  return {
    _id: String(event._id),
    name: event.name,
    description: event.description || '',
    image: event.image || null,
    start_time: event.start_time,
    end_time: event.end_time || null,
    location: event.location || '',
    externalLink: event.externalLink || null,
    sourceUrl: pivot.sourceUrl || null,
    ingestStatus: pivot.ingestStatus || null,
    source: pivot.source || null,
    batchWeek: pivot.batchWeek || null,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    timeSlots,
    ...(movie ? { movie } : {}),
    organizerName: host.name || '',
    organizerImageUrl: host.imageUrl || null,
    intentStats: intentStatsByEventId?.get(String(event._id)) || EMPTY_INTENT_STATS,
  };
}

/** Per-event intent counts so Lab can see which catalog events earned the swipes. */
async function loadIntentStatsByEventId(PivotEventIntent, eventIds) {
  if (!eventIds.length) {
    return new Map();
  }

  const rows = await PivotEventIntent.aggregate([
    { $match: { eventId: { $in: eventIds } } },
    {
      $group: {
        _id: '$eventId',
        interested: { $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] } },
        registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } },
        passed: { $sum: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] } },
        externalOpens: { $sum: { $ifNull: ['$externalOpenCount', 0] } },
        externalOpenUsers: {
          $sum: { $cond: [{ $gt: [{ $ifNull: ['$externalOpenCount', 0] }, 0] }, 1, 0] },
        },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        interested: row.interested ?? 0,
        registered: row.registered ?? 0,
        passed: row.passed ?? 0,
        externalOpens: row.externalOpens ?? 0,
        externalOpenUsers: row.externalOpenUsers ?? 0,
      },
    ]),
  );
}

async function listPivotLabEvents(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantKey = options.tenantKey?.trim()?.toLowerCase();
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenant = pivotTenants.find((row) => row.tenantKey === tenantKey);
  if (!tenant) {
    return {
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }

  const { batchWeek } = normalized;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotEventIntent } = getModels(tenantReq, 'Event', 'PivotEventIntent');

  const query = labEventsQuery(batchWeek);

  const events = await Event.find(query)
    .select('name description image start_time end_time location externalLink customFields.pivot')
    .sort({ start_time: 1 })
    .lean();

  const intentStatsByEventId = await loadIntentStatsByEventId(
    PivotEventIntent,
    events.map((event) => event._id),
  );

  return {
    data: {
      tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenantKey,
      batchWeek,
      events: events.map((event) => serializeLabEvent(event, intentStatsByEventId)),
    },
  };
}

module.exports = {
  listPivotLabEvents,
  serializeLabEvent,
  loadIntentStatsByEventId,
  labEventsQuery,
};
