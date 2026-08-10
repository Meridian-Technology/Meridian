const getModels = require('./getModelService');
const connectionsManager = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { mergePivotCrewConfig } = require('../utilities/pivotCrewConfig');
const { isoWeekToUtcRange, shiftIsoWeek } = require('../utilities/pivotIsoWeek');

const PROPOSED_JUDGEMENT_STATUSES = new Set([
  'proposed',
  'split',
  'deciding',
  'confirmed',
  'swapped',
]);
const CONFIRMED_JUDGEMENT_STATUSES = new Set(['confirmed', 'swapped']);

const CREW_RATE_DELTA_KEYS = [
  'crewCreationRate',
  'quorumHitRate',
  'judgementConfirmRate',
  'invitedJoinRate',
];

function openTenantDb(tenantKey) {
  return connectionsManager.connectToDatabase(tenantKey).then((db) => ({ db, school: tenantKey }));
}

function rateOrNull(numerator, denominator) {
  if (!denominator) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function buildCrewVsPrevWeek(current, previous) {
  if (!previous) {
    return null;
  }

  const deltas = {};
  for (const key of CREW_RATE_DELTA_KEYS) {
    const curr = current.kpis?.[key]?.rate;
    const prev = previous.kpis?.[key]?.rate;
    deltas[key] = {
      current: curr,
      previous: prev,
      delta:
        curr != null && prev != null
          ? Math.round((curr - prev) * 1000) / 1000
          : null,
    };
  }

  deltas.crossCrewViews = {
    current: current.kpis?.crossCrewSurfaces?.views ?? 0,
    previous: previous.kpis?.crossCrewSurfaces?.views ?? 0,
    delta:
      (current.kpis?.crossCrewSurfaces?.views ?? 0) -
      (previous.kpis?.crossCrewSurfaces?.views ?? 0),
  };

  return deltas;
}

async function countCrossCrewAnalytics(AnalyticsEvent, batchWeek, { start, end }) {
  const baseMatch = {
    ts: { $gte: start, $lt: end },
    $or: [
      { 'properties.batchWeek': batchWeek },
      { 'properties.batchWeek': { $exists: false } },
      { 'properties.batchWeek': null },
    ],
  };

  const [views, clicks] = await Promise.all([
    AnalyticsEvent.countDocuments({
      ...baseMatch,
      event: 'pivot_cross_crew_surface_view',
    }),
    AnalyticsEvent.countDocuments({
      ...baseMatch,
      event: 'pivot_cross_crew_surface_click',
    }),
  ]);

  return { views, clicks };
}

/**
 * Aggregate crew coordination metrics for a tenant × batchWeek (Task 6.2).
 */
async function aggregateTenantCrewMetrics(req, tenant, batchWeek) {
  const tenantKey = tenant.tenantKey;
  const tenantReq = await openTenantDb(tenantKey);
  const {
    PivotEventIntent,
    PivotCrew,
    PivotCrewMembership,
    PivotCrewWeekState,
    AnalyticsEvent,
  } = getModels(
    tenantReq,
    'PivotEventIntent',
    'PivotCrew',
    'PivotCrewMembership',
    'PivotCrewWeekState',
    'AnalyticsEvent',
  );

  const { start, end } = isoWeekToUtcRange(batchWeek);
  const crewConfig = mergePivotCrewConfig(tenant.pivotCrewConfig);
  const minActiveMembers = crewConfig.quorum?.minActiveMembers ?? 2;

  const [
    activeUserIds,
    weekStates,
    invitesSent,
    invitesResolved,
    totalCrews,
    crossCrewAnalytics,
  ] = await Promise.all([
    PivotEventIntent.distinct('userId', { batchWeek }),
    PivotCrewWeekState.find({ tenantKey, batchWeek }).lean(),
    PivotCrewMembership.countDocuments({
      invitedAt: { $gte: start, $lt: end },
      $or: [{ status: 'invited' }, { $expr: { $gt: ['$joinedAt', '$invitedAt'] } }],
    }),
    PivotCrewMembership.countDocuments({
      status: 'active',
      joinedAt: { $gte: start, $lt: end },
      $expr: { $gt: ['$joinedAt', '$invitedAt'] },
    }),
    PivotCrew.countDocuments({ tenantKey, archivedAt: null }),
    countCrossCrewAnalytics(AnalyticsEvent, batchWeek, { start, end }).catch((error) => {
      console.error(
        `[pivotCrewMetrics] cross-crew analytics failed tenant=${tenantKey} batchWeek=${batchWeek}:`,
        error,
      );
      return { views: 0, clicks: 0 };
    }),
  ]);

  const wau = activeUserIds.length;
  let usersWithCrew = 0;
  if (wau > 0) {
    const crewUserIds = await PivotCrewMembership.distinct('userId', {
      status: 'active',
      userId: { $in: activeUserIds },
    });
    usersWithCrew = crewUserIds.length;
  }

  const activeCrews = weekStates.filter(
    (row) => (row.swipeProgress?.activeMemberCount ?? 0) >= minActiveMembers,
  );
  const quorumMetCrews = activeCrews.filter((row) => row.swipeProgress?.quorumMet === true);
  const proposedCrews = weekStates.filter((row) =>
    PROPOSED_JUDGEMENT_STATUSES.has(row.judgementStatus),
  );
  const confirmedCrews = weekStates.filter((row) =>
    CONFIRMED_JUDGEMENT_STATUSES.has(row.judgementStatus),
  );
  const decidingCrews = weekStates.filter((row) => row.judgementStatus === 'deciding');
  const swappedCrews = weekStates.filter((row) => row.judgementStatus === 'swapped');
  const swapsUsed = weekStates.reduce((sum, row) => {
    const budget = Number(row.crewSwapsRemaining);
    if (!Number.isFinite(budget)) {
      return sum;
    }
    // Approximate used swaps from remaining vs default budget when present.
    const defaultBudget = 2;
    return sum + Math.max(0, defaultBudget - budget);
  }, 0);

  const kpis = {
    crewCreationRate: {
      rate: rateOrNull(usersWithCrew, wau),
      usersWithCrew,
      wau,
    },
    quorumHitRate: {
      rate: rateOrNull(quorumMetCrews.length, activeCrews.length),
      quorumMet: quorumMetCrews.length,
      activeCrews: activeCrews.length,
    },
    judgementConfirmRate: {
      rate: rateOrNull(confirmedCrews.length, proposedCrews.length),
      confirmed: confirmedCrews.length,
      proposed: proposedCrews.length,
    },
    consensus: {
      deciding: decidingCrews.length,
      swapped: swappedCrews.length,
      swapsUsed,
    },
    invitedJoinRate: {
      rate: rateOrNull(invitesResolved, invitesSent),
      resolved: invitesResolved,
      sent: invitesSent,
    },
    crossCrewSurfaces: {
      views: crossCrewAnalytics.views,
      clicks: crossCrewAnalytics.clicks,
      clickThroughRate: rateOrNull(crossCrewAnalytics.clicks, crossCrewAnalytics.views),
    },
  };

  return {
    tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenantKey,
    batchWeek,
    totalCrews,
    weekStateCount: weekStates.length,
    kpis,
  };
}

async function getTenantCrewMetrics(req, options = {}) {
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

  const current = await aggregateTenantCrewMetrics(req, tenant, batchWeek);

  let vsPrevWeek = null;
  let previousBatchWeek = null;
  if (includePrevWeek) {
    previousBatchWeek = shiftIsoWeek(batchWeek, -1);
    try {
      const previous = await aggregateTenantCrewMetrics(req, tenant, previousBatchWeek);
      vsPrevWeek = buildCrewVsPrevWeek(current, previous);
    } catch (error) {
      console.error(
        `[pivotCrewMetrics] prev-week aggregate failed tenant=${tenant.tenantKey} batchWeek=${previousBatchWeek}:`,
        error,
      );
    }
  }

  return {
    data: {
      ...current,
      previousBatchWeek,
      vsPrevWeek,
    },
  };
}

module.exports = {
  aggregateTenantCrewMetrics,
  getTenantCrewMetrics,
  buildCrewVsPrevWeek,
  rateOrNull,
};
