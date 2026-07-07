const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant, serializePivotReferralCode } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
const {
  normalizeBatchWeek,
  PUBLISHED_EVENT_QUERY,
  getWeeklySnapshot,
  aggregateEngagementMetrics,
} = require('./pivotWeeklySnapshotService');
const { buildDropSchedulePayload } = require('./pivotConfigService');

async function loadReferralCodesForTenant(req, tenantKey) {
  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  const docs = await PivotReferralCode.find({ tenantKey }).sort({ active: -1, code: 1 }).lean();
  return docs.map(serializePivotReferralCode);
}

async function aggregateRegisteredFeedback(PivotEventIntent, UniversalFeedback, batchWeek, eventIds) {
  if (!eventIds.length) {
    return { feedbackCount: 0, feedbackAvg: null };
  }

  const registeredIntents = await PivotEventIntent.find({
    batchWeek,
    status: 'registered',
    eventId: { $in: eventIds },
  })
    .select('userId eventId')
    .lean();

  if (!registeredIntents.length) {
    return { feedbackCount: 0, feedbackAvg: null };
  }

  const registeredKeys = new Set(
    registeredIntents.map(
      (intent) => `${String(intent.userId)}:${String(intent.eventId)}`,
    ),
  );

  const feedbackRows = await UniversalFeedback.find({
    feature: PIVOT_EVENT_FEATURE,
    processId: { $in: eventIds },
  })
    .select('user processId responses.rating')
    .lean();

  const registeredFeedback = feedbackRows.filter((row) =>
    registeredKeys.has(`${String(row.user)}:${String(row.processId)}`),
  );

  const ratings = registeredFeedback
    .map((row) => row.responses?.rating)
    .filter((rating) => typeof rating === 'number' && rating >= 1 && rating <= 5);

  if (!ratings.length) {
    return { feedbackCount: registeredFeedback.length, feedbackAvg: null };
  }

  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return {
    feedbackCount: registeredFeedback.length,
    feedbackAvg: Math.round((sum / ratings.length) * 100) / 100,
  };
}

async function aggregateTenantOverview(req, tenant, batchWeek) {
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
    feedback,
    referralCodes,
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
    aggregateRegisteredFeedback(PivotEventIntent, UniversalFeedback, batchWeek, eventIds),
    loadReferralCodesForTenant(req, tenantKey),
  ]);

  const swipeCount = passedCount + interestedCount + registeredCount;

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
    feedbackCount: feedback.feedbackCount,
    feedbackAvg: feedback.feedbackAvg,
    activeUsers: activeUserIds.length,
    referralCodes,
    dropSchedule: buildDropSchedulePayload(tenant, batchWeek),
  };
}

async function getPivotOverview(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const { batchWeek } = normalized;
  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenants = [];

  for (const tenant of pivotTenants) {
    try {
      tenants.push(await aggregateTenantOverview(req, tenant, batchWeek));
    } catch (error) {
      console.error(
        `[pivotAdminOverview] aggregate failed tenant=${tenant.tenantKey} batchWeek=${batchWeek}:`,
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
        feedbackCount: 0,
        feedbackAvg: null,
        activeUsers: 0,
        referralCodes: await loadReferralCodesForTenant(req, tenant.tenantKey).catch(() => []),
        dropSchedule: buildDropSchedulePayload(tenant, batchWeek),
        error: 'AGGREGATION_FAILED',
      });
    }
  }

  const snapshotResult = await getWeeklySnapshot(req, { batchWeek });
  const snapshotGeneratedAt =
    snapshotResult.data?.generatedAt ?? null;

  return {
    data: {
      batchWeek,
      snapshotGeneratedAt,
      tenants,
    },
  };
}

module.exports = {
  aggregateTenantOverview,
  aggregateRegisteredFeedback,
  getPivotOverview,
  loadReferralCodesForTenant,
};
