const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const {
  aggregateTenantOverview,
  buildFunnelStages,
} = require('./pivotAdminOverviewService');
const { isoWeekToUtcRange } = require('../utilities/pivotIsoWeek');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');

const WIPE_CONFIRM_TOKEN = 'WIPE';
const SEARCH_RESULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;
const HISTORY_ANALYTICS_LIMIT = 100;
const PATH_NEXT_LIMIT = 5;

/** Plan aliases → real mobile analytics event names (MVP Task 4.2). */
const FUNNEL_STEP_ALIASES = {
  deck_open: 'pivot_card_view',
  card_view: 'pivot_card_view',
  card_interested: 'pivot_card_interested',
  interested: 'pivot_card_interested',
  external_open: 'pivot_external_open',
  registered: 'pivot_confirm_registered',
  confirm_registered: 'pivot_confirm_registered',
};

const DEFAULT_FUNNEL_STEPS = [
  'deck_open',
  'card_interested',
  'external_open',
  'registered',
];

const PIVOT_ANALYTICS_EVENTS = [
  'pivot_card_view',
  'pivot_card_pass',
  'pivot_card_interested',
  'pivot_external_open',
  'pivot_confirm_registered',
  'pivot_feedback_submit',
  'pivot_calendar_add',
  'pivot_invite_share',
  'pivot_invite_copy',
];

function openTenantDb(tenantKey) {
  return connectToDatabase(tenantKey).then((db) => ({ db, school: tenantKey }));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameUsernameQuery(term) {
  const regex = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [{ name: { $regex: regex } }, { username: { $regex: regex } }],
  };
}

function rateOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function resolveFunnelEventName(raw) {
  const key = String(raw || '').trim();
  if (!key) return null;
  if (FUNNEL_STEP_ALIASES[key]) return FUNNEL_STEP_ALIASES[key];
  if (key.startsWith('pivot_')) return key;
  return null;
}

/**
 * Parse `steps` query: comma-separated aliases or real event names.
 * @returns {{ steps: { key: string, event: string }[] } | { error, status, code }}
 */
function parseFunnelSteps(raw) {
  const parts =
    raw == null || raw === ''
      ? DEFAULT_FUNNEL_STEPS
      : String(raw)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  if (!parts.length) {
    return {
      error: 'steps must include at least one funnel step.',
      status: 400,
      code: 'INVALID_STEPS',
    };
  }

  const steps = [];
  for (const part of parts) {
    const event = resolveFunnelEventName(part);
    if (!event) {
      return {
        error: `Unknown funnel step: ${part}`,
        status: 400,
        code: 'INVALID_STEPS',
      };
    }
    steps.push({ key: part, event });
  }
  return { steps };
}

function parseUserId(raw) {
  const id = String(raw || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      error: 'userId must be a valid ObjectId.',
      status: 400,
      code: 'INVALID_USER_ID',
    };
  }
  return { userId: new mongoose.Types.ObjectId(id) };
}

/**
 * Unique users who fired each analytics event in order (closed funnel by user_id).
 * Filters by properties.batchWeek when present; also bounds ts to the ISO week.
 */
async function aggregateAnalyticsClosedFunnel(AnalyticsEvent, batchWeek, stepEvents) {
  const { start, end } = isoWeekToUtcRange(batchWeek);
  const baseMatch = {
    ts: { $gte: start, $lt: end },
    event: { $in: stepEvents },
    user_id: { $ne: null },
    $or: [
      { 'properties.batchWeek': batchWeek },
      { 'properties.batchWeek': { $exists: false } },
      { 'properties.batchWeek': null },
    ],
  };

  const sessionsStream = await AnalyticsEvent.aggregate([
    { $match: baseMatch },
    { $sort: { user_id: 1, ts: 1 } },
    {
      $group: {
        _id: '$user_id',
        stream: { $push: '$event' },
      },
    },
  ]);

  const closedCounts = stepEvents.map(() => 0);
  for (const row of sessionsStream) {
    const stream = row.stream || [];
    let nextExpected = 0;
    for (const lbl of stream) {
      if (lbl === stepEvents[nextExpected]) {
        closedCounts[nextExpected] += 1;
        nextExpected += 1;
        if (nextExpected >= stepEvents.length) break;
      }
    }
  }

  return closedCounts;
}

async function aggregateMedianCardsSeen(AnalyticsEvent, batchWeek) {
  try {
    const { start, end } = isoWeekToUtcRange(batchWeek);
    const rows = await AnalyticsEvent.aggregate([
      {
        $match: {
          event: 'pivot_card_view',
          ts: { $gte: start, $lt: end },
          user_id: { $ne: null },
          $or: [
            { 'properties.batchWeek': batchWeek },
            { 'properties.batchWeek': { $exists: false } },
            { 'properties.batchWeek': null },
          ],
        },
      },
      { $group: { _id: '$user_id', cardsSeen: { $sum: 1 } } },
    ]);
    return median(rows.map((r) => r.cardsSeen));
  } catch (error) {
    console.error(
      `[pivotTenantJourney] medianCardsSeen failed batchWeek=${batchWeek}:`,
      error,
    );
    return null;
  }
}

/**
 * Compact journey KPIs for a city week.
 * Intent metrics are source of truth; medianCardsSeen is best-effort from analytics.
 */
async function getJourneyOverview(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;

  const overview = await aggregateTenantOverview(req, tenant, batchWeek, {
    includeStatusBreakdown: false,
    includeReferralCodes: false,
  });

  const funnel = buildFunnelStages(overview);
  const interestedSurvivors = overview.interestedCount + overview.registeredCount;

  const tenantReq = await openTenantDb(tenantKey);
  const { AnalyticsEvent } = getModels(tenantReq, 'AnalyticsEvent');
  const medianCardsSeen = await aggregateMedianCardsSeen(AnalyticsEvent, batchWeek);

  return {
    data: {
      tenantKey,
      cityDisplayName: overview.cityDisplayName,
      batchWeek,
      kpis: {
        activeUsers: overview.activeUsers,
        medianCardsSeen,
        swipeCount: overview.swipeCount,
        interestedCount: interestedSurvivors,
        externalOpenUsers: overview.externalOpenUsers,
        registeredCount: overview.registeredCount,
      },
      conversionRates: {
        interestRate: rateOrNull(interestedSurvivors, overview.swipeCount),
        ticketOpenRate: rateOrNull(overview.externalOpenUsers, interestedSurvivors),
        registerRate: rateOrNull(overview.registeredCount, overview.externalOpenUsers),
      },
      funnel,
    },
  };
}

/**
 * Pivot funnel for a city week.
 * Primary: closed analytics funnel on mapped event names.
 * Also returns intent-based stages (same as Overview) for ops alignment.
 */
async function getJourneyFunnel(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const stepsResult = parseFunnelSteps(options.steps);
  if (stepsResult.error) return stepsResult;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const { steps } = stepsResult;
  const stepEvents = steps.map((s) => s.event);

  const tenantReq = await openTenantDb(tenantKey);
  const { AnalyticsEvent } = getModels(tenantReq, 'AnalyticsEvent');

  let closedCounts;
  try {
    closedCounts = await aggregateAnalyticsClosedFunnel(
      AnalyticsEvent,
      batchWeek,
      stepEvents,
    );
  } catch (error) {
    console.error(
      `[pivotTenantJourney] analytics funnel failed tenant=${tenantKey} batchWeek=${batchWeek}:`,
      error,
    );
    closedCounts = stepEvents.map(() => 0);
  }

  const entered = closedCounts[0] || 0;
  const analyticsSteps = steps.map((step, idx) => {
    const count = closedCounts[idx] || 0;
    const prev = idx === 0 ? count : closedCounts[idx - 1] || 0;
    return {
      key: step.key,
      event: step.event,
      index: idx + 1,
      count,
      conversionRate: entered > 0 ? Math.round((count / entered) * 1000) / 10 : 0,
      dropOff: idx === 0 ? 0 : Math.max(0, prev - count),
    };
  });

  const overview = await aggregateTenantOverview(req, tenant, batchWeek, {
    includeStatusBreakdown: false,
    includeReferralCodes: false,
  });
  const intentFunnel = buildFunnelStages(overview);

  return {
    data: {
      tenantKey,
      batchWeek,
      steps: analyticsSteps,
      totalEntered: entered,
      totalConverted: closedCounts[closedCounts.length - 1] || 0,
      overallConversionRate:
        entered > 0
          ? Math.round(
              ((closedCounts[closedCounts.length - 1] || 0) / entered) * 1000,
            ) / 10
          : 0,
      intentFunnel,
      intentActiveUsers: overview.activeUsers,
    },
  };
}

/**
 * Thin path exploration: top next pivot events after a starting event within sessions.
 */
async function getJourneyPath(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { batchWeek } = normalized;
  const tenantKey = tenantResult.tenant.tenantKey;

  const rawStart = String(options.startingPoint || 'deck_open').trim();
  const startingEvent = resolveFunnelEventName(rawStart) || rawStart;
  if (!startingEvent.startsWith('pivot_') && startingEvent !== 'PivotWeek') {
    return {
      error: `Unknown startingPoint: ${rawStart}`,
      status: 400,
      code: 'INVALID_STARTING_POINT',
    };
  }

  const tenantReq = await openTenantDb(tenantKey);
  const { AnalyticsEvent } = getModels(tenantReq, 'AnalyticsEvent');
  const { start, end } = isoWeekToUtcRange(batchWeek);

  const baseMatch = {
    ts: { $gte: start, $lt: end },
    $or: [
      { 'properties.batchWeek': batchWeek },
      { 'properties.batchWeek': { $exists: false } },
      { 'properties.batchWeek': null },
    ],
  };

  const startMatch =
    startingEvent === 'PivotWeek'
      ? { ...baseMatch, event: 'screen_view', 'context.screen': 'PivotWeek' }
      : { ...baseMatch, event: startingEvent };

  let startCount = 0;
  let nextSteps = [];

  try {
    startCount = await AnalyticsEvent.countDocuments(startMatch);
    const startSessions = await AnalyticsEvent.distinct('session_id', startMatch);

    if (startSessions.length) {
      const streams = await AnalyticsEvent.aggregate([
        {
          $match: {
            ...baseMatch,
            session_id: { $in: startSessions },
            $or: [
              { event: { $in: PIVOT_ANALYTICS_EVENTS } },
              { event: 'screen_view', 'context.screen': 'PivotWeek' },
            ],
          },
        },
        { $sort: { session_id: 1, ts: 1 } },
        {
          $group: {
            _id: '$session_id',
            stream: {
              $push: {
                label: {
                  $cond: {
                    if: { $eq: ['$event', 'screen_view'] },
                    then: { $ifNull: ['$context.screen', 'Unknown'] },
                    else: '$event',
                  },
                },
              },
            },
          },
        },
      ]);

      const nextLabels = {};
      for (const s of streams) {
        const stream = (s.stream || []).map((x) => x.label);
        const startIdx = stream.indexOf(startingEvent);
        if (startIdx < 0) continue;
        const after = stream.slice(startIdx + 1);
        for (const lbl of after) {
          if (lbl !== startingEvent) {
            nextLabels[lbl] = (nextLabels[lbl] || 0) + 1;
            break;
          }
        }
      }

      nextSteps = Object.entries(nextLabels)
        .sort((a, b) => b[1] - a[1])
        .slice(0, PATH_NEXT_LIMIT)
        .map(([event, count]) => ({ event, count }));
    }
  } catch (error) {
    console.error(
      `[pivotTenantJourney] path failed tenant=${tenantKey} batchWeek=${batchWeek}:`,
      error,
    );
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      startingPoint: startingEvent,
      startCount,
      nextSteps,
    },
  };
}

/**
 * Top users by intent count for a batch week (inspector default list).
 */
async function listMostActiveJourneyUsers(tenantReq, { tenantKey, batchWeek }) {
  const { User, PivotEventIntent } = getModels(tenantReq, 'User', 'PivotEventIntent');

  const counts = await PivotEventIntent.aggregate([
    { $match: { batchWeek } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: SEARCH_RESULT_LIMIT },
  ]);

  if (!counts.length) {
    return {
      data: { tenantKey, batchWeek, mode: 'active', users: [] },
    };
  }

  const userIds = counts.map((row) => row._id);
  const users = await User.find({ _id: { $in: userIds } })
    .select('name username picture')
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return {
    data: {
      tenantKey,
      batchWeek,
      mode: 'active',
      users: counts
        .map((row) => {
          const user = userById.get(String(row._id));
          if (!user) return null;
          return {
            userId: String(user._id),
            name: user.name || '',
            username: user.username || null,
            picture: user.picture || null,
            intentCount: row.count,
          };
        })
        .filter(Boolean),
    },
  };
}

/**
 * Search pivot city users by ObjectId, display name, or username.
 * Empty query + batchWeek returns most-active users for that week.
 * Optional batchWeek also ranks search hits by intent count that week.
 */
async function searchJourneyUsers(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const query = String(options.query || options.q || '').trim();

  let batchWeek = null;
  if (options.batchWeek) {
    const normalized = normalizeBatchWeek(options.batchWeek, options.now);
    if (normalized.error) return normalized;
    batchWeek = normalized.batchWeek;
  }

  const tenantReq = await openTenantDb(tenantKey);

  if (!query) {
    if (!batchWeek) {
      return { data: { tenantKey, batchWeek, mode: 'active', users: [] } };
    }
    return listMostActiveJourneyUsers(tenantReq, { tenantKey, batchWeek });
  }

  const { User, PivotEventIntent } = getModels(tenantReq, 'User', 'PivotEventIntent');

  let users = [];
  if (mongoose.Types.ObjectId.isValid(query) && String(new mongoose.Types.ObjectId(query)) === query) {
    const user = await User.findById(query).select('name username picture').lean();
    users = user ? [user] : [];
  } else if (query.length < MIN_QUERY_LENGTH) {
    return { data: { tenantKey, batchWeek, mode: 'search', users: [] } };
  } else {
    users = await User.find(buildNameUsernameQuery(query))
      .select('name username picture')
      .limit(SEARCH_RESULT_LIMIT)
      .lean();
  }

  if (!users.length) {
    return { data: { tenantKey, batchWeek, mode: 'search', users: [] } };
  }

  let intentCountByUser = new Map();
  if (batchWeek) {
    const userIds = users.map((u) => u._id);
    const counts = await PivotEventIntent.aggregate([
      { $match: { batchWeek, userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    intentCountByUser = new Map(counts.map((r) => [String(r._id), r.count]));

    // Prefer users active that week; keep others at the end with intentCount 0.
    users = [...users].sort((a, b) => {
      const ca = intentCountByUser.get(String(a._id)) || 0;
      const cb = intentCountByUser.get(String(b._id)) || 0;
      return cb - ca;
    });
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      mode: 'search',
      users: users.map((user) => ({
        userId: String(user._id),
        name: user.name || '',
        username: user.username || null,
        picture: user.picture || null,
        intentCount: batchWeek
          ? intentCountByUser.get(String(user._id)) || 0
          : undefined,
      })),
    },
  };
}

/**
 * Intent + key analytics history for one user (optional week filter).
 */
async function getUserJourneyHistory(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const userIdResult = parseUserId(options.userId);
  if (userIdResult.error) return userIdResult;

  let batchWeek = null;
  if (options.batchWeek) {
    const normalized = normalizeBatchWeek(options.batchWeek, options.now);
    if (normalized.error) return normalized;
    batchWeek = normalized.batchWeek;
  }

  const tenantKey = tenantResult.tenant.tenantKey;
  const { userId } = userIdResult;
  const tenantReq = await openTenantDb(tenantKey);
  const { User, PivotEventIntent, Event, AnalyticsEvent } = getModels(
    tenantReq,
    'User',
    'PivotEventIntent',
    'Event',
    'AnalyticsEvent',
  );

  const user = await User.findById(userId).select('name username picture').lean();
  if (!user) {
    return {
      error: 'User not found in this city.',
      status: 404,
      code: 'USER_NOT_FOUND',
    };
  }

  const intentFilter = { userId };
  if (batchWeek) intentFilter.batchWeek = batchWeek;

  const intents = await PivotEventIntent.find(intentFilter)
    .select(
      'eventId batchWeek status timeSlotId externalOpenAt externalOpenCount updatedAt createdAt',
    )
    .sort({ updatedAt: -1 })
    .lean();

  const eventIds = [...new Set(intents.map((i) => String(i.eventId)))];
  const events = eventIds.length
    ? await Event.find({ _id: { $in: eventIds } })
        .select('name start_time customFields.pivot.batchWeek customFields.pivot.ingestStatus')
        .lean()
    : [];
  const eventById = new Map(events.map((e) => [String(e._id), e]));

  const serializedIntents = intents.map((intent) => {
    const event = eventById.get(String(intent.eventId));
    return {
      eventId: String(intent.eventId),
      eventName: event?.name || null,
      eventStartTime: event?.start_time || null,
      ingestStatus: event?.customFields?.pivot?.ingestStatus || null,
      batchWeek: intent.batchWeek,
      status: intent.status,
      timeSlotId: intent.timeSlotId || null,
      externalOpenAt: intent.externalOpenAt || null,
      externalOpenCount: intent.externalOpenCount || 0,
      updatedAt: intent.updatedAt,
      createdAt: intent.createdAt,
    };
  });

  let analytics = [];
  try {
    const analyticsFilter = {
      user_id: userId,
      event: { $in: PIVOT_ANALYTICS_EVENTS },
    };
    if (batchWeek) {
      const { start, end } = isoWeekToUtcRange(batchWeek);
      analyticsFilter.ts = { $gte: start, $lt: end };
      analyticsFilter.$or = [
        { 'properties.batchWeek': batchWeek },
        { 'properties.batchWeek': { $exists: false } },
        { 'properties.batchWeek': null },
      ];
    }

    const rows = await AnalyticsEvent.find(analyticsFilter)
      .select('event ts properties.eventId properties.batchWeek session_id')
      .sort({ ts: -1 })
      .limit(HISTORY_ANALYTICS_LIMIT)
      .lean();

    analytics = rows.map((row) => ({
      event: row.event,
      ts: row.ts,
      eventId: row.properties?.eventId ? String(row.properties.eventId) : null,
      batchWeek: row.properties?.batchWeek || null,
      sessionId: row.session_id || null,
    }));
  } catch (error) {
    console.error(
      `[pivotTenantJourney] history analytics failed tenant=${tenantKey} userId=${userId}:`,
      error,
    );
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      user: {
        userId: String(user._id),
        name: user.name || '',
        username: user.username || null,
        picture: user.picture || null,
      },
      intents: serializedIntents,
      analytics,
    },
  };
}

/**
 * Platform-admin wipe of PivotEventIntent rows for one user + week.
 * v0: intents only (analytics retained). Requires confirm: "WIPE".
 */
async function wipeUserWeekIntents(req, options = {}) {
  if (options.confirm !== WIPE_CONFIRM_TOKEN) {
    return {
      error: 'Confirmation required. Send confirm: "WIPE".',
      status: 400,
      code: 'CONFIRM_REQUIRED',
    };
  }

  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const userIdResult = parseUserId(options.userId || options.targetUserId);
  if (userIdResult.error) return userIdResult;

  const { batchWeek } = normalized;
  const tenantKey = tenantResult.tenant.tenantKey;
  const { userId } = userIdResult;

  const tenantReq = await openTenantDb(tenantKey);
  const { PivotEventIntent, User } = getModels(tenantReq, 'PivotEventIntent', 'User');

  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    return {
      error: 'User not found in this city.',
      status: 404,
      code: 'USER_NOT_FOUND',
    };
  }

  const result = await PivotEventIntent.deleteMany({ userId, batchWeek });
  const deletedCount = result.deletedCount ?? 0;

  logPivot('info', 'admin wipe week intents', {
    ...pivotRequestContext(req),
    tenantKey,
    targetUserId: String(userId),
    batchWeek,
    deletedCount,
  });

  return {
    data: {
      tenantKey,
      userId: String(userId),
      batchWeek,
      deletedCount,
    },
  };
}

module.exports = {
  WIPE_CONFIRM_TOKEN,
  FUNNEL_STEP_ALIASES,
  DEFAULT_FUNNEL_STEPS,
  parseFunnelSteps,
  resolveFunnelEventName,
  getJourneyOverview,
  getJourneyFunnel,
  getJourneyPath,
  searchJourneyUsers,
  getUserJourneyHistory,
  wipeUserWeekIntents,
  rateOrNull,
  median,
};
