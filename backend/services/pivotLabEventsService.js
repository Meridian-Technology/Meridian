const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { countPivotCatalogOutOfWeek } = require('./pivotCatalogPurgeService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotDropConfig } = require('../utilities/pivotDropSchedule');
const { isEventStartOutOfBatchWeekRange } = require('../utilities/pivotIsoWeek');
const {
  normalizeBatchWeek,
} = require('./pivotWeeklySnapshotService');
const { serializePivotMovie } = require('../utilities/pivotMovieMetadata');
const { serializePivotEnrichment } = require('../utilities/pivotEnrichment');
const { projectEventRichLocation } = require('./justGoRichLocationProjectionService');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');

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

function serializeLabEvent(event, intentStatsByEventId, options = {}) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};
  const batchWeek = pivot.batchWeek || null;
  const dropDayOfWeek = options.dropDayOfWeek;
  const movie = serializePivotMovie(pivot.movie);
  const enrichment = serializePivotEnrichment(pivot);
  const timeSlots = Array.isArray(pivot.timeSlots)
    ? pivot.timeSlots.map((slot) => ({
        id: slot.id,
        start_time: slot.start_time,
        end_time: slot.end_time || null,
        label: slot.label || null,
      }))
    : [];

  const creatorSubmittedAt = pivot.creatorSubmittedAt
    ? pivot.creatorSubmittedAt instanceof Date
      ? pivot.creatorSubmittedAt.toISOString()
      : pivot.creatorSubmittedAt
    : null;
  const richLocation = projectEventRichLocation(event, undefined, {
    readsEnabled: options.richLocationReadsEnabled,
  });
  const missingRichData = [];
  if (!event.description?.trim?.()) missingRichData.push('description');
  if (!event.image?.trim?.()) missingRichData.push('image');

  return {
    _id: String(event._id),
    name: event.name,
    description: event.description || '',
    image: event.image || null,
    missingRichData,
    needsRichData: missingRichData.length > 0,
    start_time: event.start_time,
    end_time: event.end_time || null,
    location: event.location || '',
    ...(richLocation ? { richLocation } : {}),
    externalLink: event.externalLink || null,
    sourceUrl: pivot.sourceUrl || null,
    ingestStatus: pivot.ingestStatus || null,
    featured: pivot.featured === true,
    source: pivot.source || null,
    batchWeek: pivot.batchWeek || null,
    outOfReviewRange:
      batchWeek && dropDayOfWeek != null
        ? isEventStartOutOfBatchWeekRange(event.start_time, batchWeek, dropDayOfWeek)
        : false,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    timeSlots,
    ...(movie ? { movie } : {}),
    ...(enrichment ? { enrichment } : {}),
    ...(pivot.duplicateRollup ? { duplicateRollup: pivot.duplicateRollup } : {}),
    ...(pivot.rawLocationText ? { rawLocationText: pivot.rawLocationText } : {}),
    ...(pivot.locationReview ? { locationReview: pivot.locationReview } : {}),
    organizerName: host.name || '',
    organizerImageUrl: host.imageUrl || null,
    organizerProfileUrl: host.profileUrl || null,
    hostIdentities: Array.isArray(host.identities) ? host.identities : [],
    /** Host-created (Just Go Creator) provenance — ops curation / Task 3.1 */
    platformManaged: pivot.platformManaged === true,
    createdByUserId: pivot.createdByUserId ? String(pivot.createdByUserId) : null,
    creatorSubmittedAt,
    intentStats: intentStatsByEventId?.get(String(event._id)) || EMPTY_INTENT_STATS,
  };
}

/**
 * Per-event intent counts so Lab / tenant ops can see which catalog events earned the swipes.
 * Optional `batchWeek` scopes intents to that ISO week (preferred for performance rankings).
 */
async function loadIntentStatsByEventId(PivotEventIntent, eventIds, options = {}) {
  if (!eventIds.length) {
    return new Map();
  }

  const match = { eventId: { $in: eventIds } };
  if (options.batchWeek) {
    match.batchWeek = options.batchWeek;
  }

  const rows = await PivotEventIntent.aggregate([
    { $match: match },
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
  const dropConfig = resolvePivotDropConfig(tenant);
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotEventIntent } = getModels(tenantReq, 'Event', 'PivotEventIntent');

  const query = labEventsQuery(batchWeek);

  const events = await Event.find(query)
    .select('name description image start_time end_time location richLocation externalLink customFields.pivot')
    .sort({ start_time: 1 })
    .lean();

  const [intentStatsByEventId, outOfWeek] = await Promise.all([
    loadIntentStatsByEventId(
      PivotEventIntent,
      events.map((event) => event._id),
    ),
    countPivotCatalogOutOfWeek(tenantKey, batchWeek, dropConfig.dayOfWeek),
  ]);

  return {
    data: {
      tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenantKey,
      batchWeek,
      outOfWeekCount: outOfWeek.count,
      events: events.map((event) =>
        serializeLabEvent(event, intentStatsByEventId, {
          dropDayOfWeek: dropConfig.dayOfWeek,
          richLocationReadsEnabled: isRichLocationCapabilityEnabled(tenant, 'reads'),
        }),
      ),
    },
  };
}

module.exports = {
  listPivotLabEvents,
  serializeLabEvent,
  loadIntentStatsByEventId,
  labEventsQuery,
};
