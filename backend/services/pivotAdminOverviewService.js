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
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { loadIntentStatsByEventId, labEventsQuery } = require('./pivotLabEventsService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');

const DEFAULT_PERFORMANCE_LIMIT = 20;
const MAX_PERFORMANCE_LIMIT = 100;

/** KPI fields compared week-over-week on the tenant overview. */
const DELTA_KPI_KEYS = [
  'activeUsers',
  'eventCount',
  'interestedCount',
  'registeredCount',
  'externalOpenCount',
  'externalOpenUsers',
  'swipeCount',
  'calendarAdds',
  'inviteShares',
  'interestsSaved',
  'feedbackCount',
];

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

/**
 * Catalog events for a batch week (any ingestStatus), excluding soft-deleted rows.
 * Broader than PUBLISHED_EVENT_QUERY — used for status breakdowns and performance lists.
 */
function catalogEventsQuery(batchWeek) {
  return {
    ...labEventsQuery(batchWeek),
    status: { $in: PIVOT_EVENT_STATUSES },
  };
}

async function aggregateEventCountsByStatus(Event, batchWeek) {
  const rows = await Event.aggregate([
    { $match: catalogEventsQuery(batchWeek) },
    {
      $group: {
        _id: { $ifNull: ['$customFields.pivot.ingestStatus', 'unknown'] },
        count: { $sum: 1 },
      },
    },
  ]);

  const byStatus = { draft: 0, staged: 0, published: 0, other: 0 };
  for (const row of rows) {
    const key = row._id;
    if (key === 'draft' || key === 'staged' || key === 'published') {
      byStatus[key] = row.count;
    } else {
      byStatus.other += row.count;
    }
  }

  return {
    draft: byStatus.draft,
    staged: byStatus.staged,
    published: byStatus.published,
    other: byStatus.other,
    total: byStatus.draft + byStatus.staged + byStatus.published + byStatus.other,
  };
}

/** Funnel stages matching PivotLabOverview FunnelChart definitions. */
function buildFunnelStages({
  swipeCount,
  interestedCount,
  registeredCount,
  externalOpenUsers,
}) {
  const interestedSurvivors = interestedCount + registeredCount;
  return [
    { key: 'swipes', label: 'Swipes', value: swipeCount, hint: 'cards acted on' },
    { key: 'interested', label: 'Interested', value: interestedSurvivors, hint: 'right swipes' },
    { key: 'openers', label: 'Ticket openers', value: externalOpenUsers, hint: 'unique users' },
    { key: 'going', label: 'Going', value: registeredCount, hint: 'self-confirmed' },
  ];
}

function buildVsPrevWeek(current, previous) {
  if (!previous) {
    return null;
  }

  const deltas = {};
  for (const key of DELTA_KPI_KEYS) {
    const curr = current[key] ?? 0;
    const prev = previous[key] ?? 0;
    deltas[key] = {
      current: curr,
      previous: prev,
      delta: curr - prev,
    };
  }

  const currAvg = current.feedbackAvg;
  const prevAvg = previous.feedbackAvg;
  deltas.feedbackAvg = {
    current: currAvg,
    previous: prevAvg,
    delta:
      currAvg != null && prevAvg != null
        ? Math.round((currAvg - prevAvg) * 100) / 100
        : null,
  };

  return deltas;
}

async function aggregateTenantOverview(req, tenant, batchWeek, options = {}) {
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
  const includeStatusBreakdown = options.includeStatusBreakdown === true;
  const includeReferralCodes = options.includeReferralCodes !== false;

  const [eventCount, events, eventCountsByStatus] = await Promise.all([
    Event.countDocuments(eventQuery),
    Event.find(eventQuery).select('_id').lean(),
    includeStatusBreakdown
      ? aggregateEventCountsByStatus(Event, batchWeek)
      : Promise.resolve(null),
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
    includeReferralCodes
      ? loadReferralCodesForTenant(req, tenantKey)
      : Promise.resolve(undefined),
  ]);

  const swipeCount = passedCount + interestedCount + registeredCount;

  const row = {
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
    dropSchedule: buildDropSchedulePayload(tenant, batchWeek),
  };

  if (includeReferralCodes) {
    row.referralCodes = referralCodes;
  }
  if (eventCountsByStatus) {
    row.eventCountsByStatus = eventCountsByStatus;
  }

  return row;
}

function rateOrNull(numerator, denominator) {
  if (!denominator) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * Primary sort for event performance: right-swipe survivors (interested + registered).
 * Ties break on external opens, then name.
 */
function comparePerformanceRows(a, b) {
  const interestDiff = b.interestedTotal - a.interestedTotal;
  if (interestDiff !== 0) return interestDiff;
  const openDiff = b.externalOpen - a.externalOpen;
  if (openDiff !== 0) return openDiff;
  return (a.name || '').localeCompare(b.name || '');
}

function serializePerformanceEvent(event, stats) {
  const interested = stats.interested ?? 0;
  const registered = stats.registered ?? 0;
  const passed = stats.passed ?? 0;
  const externalOpen = stats.externalOpens ?? 0;
  const externalOpenUsers = stats.externalOpenUsers ?? 0;
  const interestedTotal = interested + registered;
  const swipeTotal = interestedTotal + passed;
  const pivot = event.customFields?.pivot || {};

  return {
    eventId: String(event._id),
    name: event.name || '',
    image: event.image || null,
    start_time: event.start_time || null,
    ingestStatus: pivot.ingestStatus || null,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    interested,
    registered,
    passed,
    externalOpen,
    externalOpenUsers,
    /** Right-swipe survivors — primary ranking metric. */
    interestedTotal,
    /** People who swiped on this card (interested + registered + passed). */
    reached: swipeTotal,
    interestRate: rateOrNull(interestedTotal, swipeTotal),
    ticketOpenRate: rateOrNull(externalOpenUsers, interestedTotal),
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

/**
 * Single-tenant overview for the Pivot tenant ops dashboard.
 * Does not loop other cities — use getPivotOverview for fleet Lab.
 */
async function getTenantOverview(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const includePrevWeek = options.includePrevWeek !== false;

  const current = await aggregateTenantOverview(req, tenant, batchWeek, {
    includeStatusBreakdown: true,
    includeReferralCodes: true,
  });

  let vsPrevWeek = null;
  let previousBatchWeek = null;
  if (includePrevWeek) {
    previousBatchWeek = shiftIsoWeek(batchWeek, -1);
    try {
      const previous = await aggregateTenantOverview(req, tenant, previousBatchWeek, {
        includeStatusBreakdown: false,
        includeReferralCodes: false,
      });
      vsPrevWeek = buildVsPrevWeek(current, previous);
    } catch (error) {
      console.error(
        `[pivotAdminOverview] prev-week aggregate failed tenant=${tenant.tenantKey} batchWeek=${previousBatchWeek}:`,
        error,
      );
    }
  }

  const funnel = buildFunnelStages(current);

  return {
    data: {
      tenantKey: current.tenantKey,
      cityDisplayName: current.cityDisplayName,
      batchWeek,
      previousBatchWeek,
      kpis: {
        activeUsers: current.activeUsers,
        eventCount: current.eventCount,
        eventCountsByStatus: current.eventCountsByStatus,
        interestedCount: current.interestedCount,
        registeredCount: current.registeredCount,
        externalOpenCount: current.externalOpenCount,
        externalOpenUsers: current.externalOpenUsers,
        swipeCount: current.swipeCount,
        feedbackCount: current.feedbackCount,
        feedbackAvg: current.feedbackAvg,
        calendarAdds: current.calendarAdds,
        inviteShares: current.inviteShares,
        interestsSaved: current.interestsSaved,
      },
      funnel,
      vsPrevWeek,
      dropSchedule: current.dropSchedule,
      referralCodes: current.referralCodes,
    },
  };
}

function parsePerformanceLimit(raw) {
  if (raw == null || raw === '') {
    return DEFAULT_PERFORMANCE_LIMIT;
  }
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      error: 'limit must be a positive integer.',
      status: 400,
      code: 'INVALID_LIMIT',
    };
  }
  return Math.min(parsed, MAX_PERFORMANCE_LIMIT);
}

/**
 * Ranked per-event performance for one pivot city + batch week.
 * Sorted by interestedTotal (interested + registered), then externalOpen.
 */
async function getTenantEventPerformance(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const limitResult = parsePerformanceLimit(options.limit);
  if (limitResult?.error) {
    return limitResult;
  }
  const limit = limitResult;

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotEventIntent } = getModels(tenantReq, 'Event', 'PivotEventIntent');

  const events = await Event.find(catalogEventsQuery(batchWeek))
    .select('name image start_time customFields.pivot')
    .lean();

  const intentStatsByEventId = await loadIntentStatsByEventId(
    PivotEventIntent,
    events.map((event) => event._id),
    { batchWeek },
  );

  const ranked = events
    .map((event) =>
      serializePerformanceEvent(
        event,
        intentStatsByEventId.get(String(event._id)) || {
          interested: 0,
          registered: 0,
          passed: 0,
          externalOpens: 0,
          externalOpenUsers: 0,
        },
      ),
    )
    .sort(comparePerformanceRows);

  return {
    data: {
      tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenantKey,
      batchWeek,
      sortBy: 'interestedTotal',
      limit,
      total: ranked.length,
      events: ranked.slice(0, limit),
    },
  };
}

module.exports = {
  aggregateTenantOverview,
  aggregateRegisteredFeedback,
  aggregateEventCountsByStatus,
  buildFunnelStages,
  buildVsPrevWeek,
  getPivotOverview,
  getTenantOverview,
  getTenantEventPerformance,
  loadReferralCodesForTenant,
  serializePerformanceEvent,
  comparePerformanceRows,
};
