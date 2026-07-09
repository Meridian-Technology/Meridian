const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');
const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
const { toIsoWeek, isValidIsoWeek, isoWeekToUtcRange } = require('../utilities/pivotIsoWeek');

/** Mobile analytics event names surfaced as Lab engagement metrics. */
const ENGAGEMENT_EVENTS = {
  calendarAdds: ['pivot_calendar_add'],
  inviteShares: ['pivot_invite_share', 'pivot_invite_copy'],
  interestsSaved: ['pivot_interests_onboarding_completed', 'pivot_interests_updated'],
};

/**
 * Client-only loop counts (calendar adds, invite shares, interests saved) from the
 * tenant analytics_events collection, bounded to the ISO week's UTC range.
 * Best-effort: analytics ingestion must never fail a snapshot, so errors return zeros.
 */
async function aggregateEngagementMetrics(tenantReq, batchWeek) {
  const zeros = { calendarAdds: 0, inviteShares: 0, interestsSaved: 0 };
  try {
    const { AnalyticsEvent } = getModels(tenantReq, 'AnalyticsEvent');
    const { start, end } = isoWeekToUtcRange(batchWeek);
    const tsFilter = { ts: { $gte: start, $lt: end } };

    const entries = await Promise.all(
      Object.entries(ENGAGEMENT_EVENTS).map(async ([key, eventNames]) => [
        key,
        await AnalyticsEvent.countDocuments({ event: { $in: eventNames }, ...tsFilter }),
      ]),
    );
    return Object.fromEntries(entries);
  } catch (error) {
    console.error(`[pivotWeeklySnapshot] engagement aggregate failed batchWeek=${batchWeek}:`, error);
    return zeros;
  }
}

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
      externalOpenUsers: row.externalOpenUsers ?? 0,
      calendarAdds: row.calendarAdds ?? 0,
      inviteShares: row.inviteShares ?? 0,
      interestsSaved: row.interestsSaved ?? 0,
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
    externalOpenUserIds,
    engagement,
  ] = await Promise.all([
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'interested' }),
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'registered' }),
    PivotEventIntent.countDocuments({ ...intentFilter, status: 'passed' }),
    PivotEventIntent.distinct('userId', intentFilter),
    PivotEventIntent.aggregate([
      { $match: intentFilter },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$externalOpenCount', 0] } } } },
    ]),
    PivotEventIntent.distinct('userId', { ...intentFilter, externalOpenAt: { $ne: null } }),
    aggregateEngagementMetrics(tenantReq, batchWeek),
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
    externalOpenUsers: externalOpenUserIds.length,
    calendarAdds: engagement.calendarAdds,
    inviteShares: engagement.inviteShares,
    interestsSaved: engagement.interestsSaved,
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
        externalOpenUsers: 0,
        calendarAdds: 0,
        inviteShares: 0,
        interestsSaved: 0,
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
  aggregateEngagementMetrics,
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
  normalizeBatchWeek,
  serializeSnapshot,
  PUBLISHED_EVENT_QUERY,
  ENGAGEMENT_EVENTS,
};
