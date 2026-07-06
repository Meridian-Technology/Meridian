const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');
const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const PUBLISHED_EVENT_QUERY = (batchWeek) => ({
  'customFields.pivot.batchWeek': batchWeek,
  'customFields.pivot.ingestStatus': 'published',
  status: { $in: PIVOT_EVENT_STATUSES },
  isDeleted: { $ne: true },
  'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
});

function normalizeBatchWeek(raw, now = new Date()) {
  const batchWeek = raw?.trim() || toIsoWeek(now);
  if (!isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }
  return { batchWeek };
}

function serializeSnapshot(doc) {
  if (!doc) {
    return null;
  }

  return {
    batchWeek: doc.batchWeek,
    generatedAt: doc.generatedAt,
    tenants: (doc.tenants || []).map((row) => ({
      tenantKey: row.tenantKey,
      cityDisplayName: row.cityDisplayName || row.tenantKey,
      eventCount: row.eventCount ?? 0,
      interestedCount: row.interestedCount ?? 0,
      registeredCount: row.registeredCount ?? 0,
      externalOpenCount: row.externalOpenCount ?? 0,
      swipeCount: row.swipeCount ?? 0,
      feedbackAvg: row.feedbackAvg ?? null,
      activeUsers: row.activeUsers ?? 0,
    })),
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

async function aggregateTenantMetrics(tenant, batchWeek) {
  const tenantKey = tenant.tenantKey;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotEventIntent, UniversalFeedback } = getModels(
    tenantReq,
    'Event',
    'PivotEventIntent',
    'UniversalFeedback',
  );

  const eventQuery = PUBLISHED_EVENT_QUERY(batchWeek);
  const [eventCount, events] = await Promise.all([
    Event.countDocuments(eventQuery),
    Event.find(eventQuery).select('_id').lean(),
  ]);
  const eventIds = events.map((event) => event._id);

  const intentFilter = { batchWeek };
  const [
    interestedCount,
    registeredCount,
    passedCount,
    activeUserIds,
    externalOpenAgg,
  ] = await Promise.all([
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'interested' }),
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'registered' }),
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'passed' }),
    PivotEventIntent.distinct('userId', intentFilter),
    PivotEventIntent.aggregate([
      { $match: intentFilter },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$externalOpenCount', 0] } } } },
    ]),
  ]);

  // Card swipes: pass + interested; registered users previously swiped right.
  const swipeCount = passedCount + interestedCount + registeredCount;

  let feedbackAvg = null;
  if (eventIds.length) {
    const feedbackRows = await UniversalFeedback.find({
      feature: PIVOT_EVENT_FEATURE,
      processId: { $in: eventIds },
    })
      .select('responses.rating')
      .lean();

    const ratings = feedbackRows
      .map((row) => row.responses?.rating)
      .filter((rating) => typeof rating === 'number' && rating >= 1 && rating <= 5);

    if (ratings.length) {
      const sum = ratings.reduce((acc, rating) => acc + rating, 0);
      feedbackAvg = Math.round((sum / ratings.length) * 100) / 100;
    }
  }

  return {
    tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenantKey,
    eventCount,
    interestedCount,
    registeredCount,
    externalOpenCount: externalOpenAgg[0]?.total ?? 0,
    swipeCount,
    feedbackAvg,
    activeUsers: activeUserIds.length,
  };
}

async function rebuildWeeklySnapshot(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const { batchWeek } = normalized;
  const generatedAt = options.now || new Date();
  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenants = [];

  for (const tenant of pivotTenants) {
    try {
      tenants.push(await aggregateTenantMetrics(tenant, batchWeek));
    } catch (error) {
      console.error(
        `[pivotWeeklySnapshot] aggregate failed tenant=${tenant.tenantKey} batchWeek=${batchWeek}:`,
        error,
      );
      tenants.push({
        tenantKey: tenant.tenantKey,
        cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
        eventCount: 0,
        interestedCount: 0,
        registeredCount: 0,
        externalOpenCount: 0,
        swipeCount: 0,
        feedbackAvg: null,
        activeUsers: 0,
      });
    }
  }

  const { PivotWeeklySnapshot } = getGlobalModels(req, 'PivotWeeklySnapshot');
  const doc = await PivotWeeklySnapshot.findOneAndUpdate(
    { batchWeek },
    { $set: { generatedAt, tenants } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return { data: serializeSnapshot(doc) };
}

async function getWeeklySnapshot(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const { PivotWeeklySnapshot } = getGlobalModels(req, 'PivotWeeklySnapshot');
  const doc = await PivotWeeklySnapshot.findOne({ batchWeek: normalized.batchWeek }).lean();

  if (!doc) {
    return {
      error: 'No snapshot found for this batch week.',
      status: 404,
      code: 'SNAPSHOT_NOT_FOUND',
    };
  }

  return { data: serializeSnapshot(doc) };
}

module.exports = {
  aggregateTenantMetrics,
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
  normalizeBatchWeek,
  serializeSnapshot,
  PUBLISHED_EVENT_QUERY,
};
