const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const {
  buildFunnelStages,
  buildVsPrevWeek,
  comparePerformanceRows,
} = require('./pivotAdminOverviewService');
const { getTenantOpsBundle, parseInclude } = require('./pivotTenantOpsService');
const {
  toIsoWeek,
  shiftIsoWeek,
  formatBatchWeekRangeLabel,
} = require('../utilities/pivotIsoWeek');

const FLEET_SECTIONS = Object.freeze([
  'overview',
  'performance',
  'insights',
  'readiness',
  'retention',
  'crewMetrics',
]);

const FLEET_ALLOWED = new Set(FLEET_SECTIONS);

const DEFAULT_PERFORMANCE_LIMIT = 10;
const DEFAULT_INSIGHT_CAP = 12;

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

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 };

function rateOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function emptyStatusCounts() {
  return { draft: 0, staged: 0, published: 0, other: 0, total: 0 };
}

function emptyHostCreatedCounts() {
  return {
    hostDraft: 0,
    hostStaged: 0,
    hostPublished: 0,
    other: 0,
    total: 0,
  };
}

function emptyKpis() {
  const hostCreatedCounts = emptyHostCreatedCounts();
  return {
    activeUsers: 0,
    eventCount: 0,
    eventCountsByStatus: emptyStatusCounts(),
    hostDraft: 0,
    hostStaged: 0,
    hostPublished: 0,
    hostCreatedCounts,
    interestedCount: 0,
    registeredCount: 0,
    externalOpenCount: 0,
    externalOpenUsers: 0,
    swipeCount: 0,
    feedbackCount: 0,
    feedbackAvg: null,
    calendarAdds: 0,
    inviteShares: 0,
    interestsSaved: 0,
  };
}

function addStatusCounts(target, source) {
  if (!source) return target;
  target.draft += source.draft ?? 0;
  target.staged += source.staged ?? 0;
  target.published += source.published ?? 0;
  target.other += source.other ?? 0;
  target.total += source.total ?? 0;
  return target;
}

function addHostCounts(target, source) {
  if (!source) return target;
  target.hostDraft += source.hostDraft ?? 0;
  target.hostStaged += source.hostStaged ?? 0;
  target.hostPublished += source.hostPublished ?? 0;
  target.other += source.other ?? 0;
  target.total += source.total ?? 0;
  return target;
}

function weightedAvg(pairs) {
  let sum = 0;
  let count = 0;
  for (const pair of pairs) {
    if (pair.avg == null || !pair.count) continue;
    sum += pair.avg * pair.count;
    count += pair.count;
  }
  if (!count) return null;
  return Math.round((sum / count) * 100) / 100;
}

function sectionOk(section) {
  return Boolean(section) && !section.error;
}

/**
 * Fleet include is the Overview preset only — no curation / journeys / catalog.
 */
function parseFleetInclude(raw) {
  const parsed = parseInclude(raw);
  if (parsed.error) return parsed;
  const disallowed = parsed.sections.filter((name) => !FLEET_ALLOWED.has(name));
  if (disallowed.length) {
    return {
      error: `Fleet ops does not support: ${disallowed.join(', ')}.`,
      status: 400,
      code: 'INVALID_INCLUDE',
    };
  }
  return parsed;
}

function failedRow(row, fallbackError = 'AGGREGATION_FAILED') {
  return {
    tenantKey: row?.tenantKey || null,
    cityDisplayName: row?.cityDisplayName || row?.tenantKey || null,
    error: row?.error || fallbackError,
    code: row?.code || fallbackError,
  };
}

function rollupKpis(overviews) {
  const kpis = emptyKpis();
  const feedbackPairs = [];

  for (const overview of overviews) {
    const src = overview.kpis || {};
    kpis.activeUsers += src.activeUsers ?? 0;
    kpis.eventCount += src.eventCount ?? 0;
    kpis.interestedCount += src.interestedCount ?? 0;
    kpis.registeredCount += src.registeredCount ?? 0;
    kpis.externalOpenCount += src.externalOpenCount ?? 0;
    kpis.externalOpenUsers += src.externalOpenUsers ?? 0;
    kpis.swipeCount += src.swipeCount ?? 0;
    kpis.feedbackCount += src.feedbackCount ?? 0;
    kpis.calendarAdds += src.calendarAdds ?? 0;
    kpis.inviteShares += src.inviteShares ?? 0;
    kpis.interestsSaved += src.interestsSaved ?? 0;
    addStatusCounts(kpis.eventCountsByStatus, src.eventCountsByStatus);
    addHostCounts(
      kpis.hostCreatedCounts,
      src.hostCreatedCounts || {
        hostDraft: src.hostDraft ?? 0,
        hostStaged: src.hostStaged ?? 0,
        hostPublished: src.hostPublished ?? 0,
        other: 0,
        total:
          (src.hostDraft ?? 0) + (src.hostStaged ?? 0) + (src.hostPublished ?? 0),
      },
    );
    if (src.feedbackAvg != null && src.feedbackCount) {
      feedbackPairs.push({ avg: src.feedbackAvg, count: src.feedbackCount });
    }
  }

  kpis.hostDraft = kpis.hostCreatedCounts.hostDraft;
  kpis.hostStaged = kpis.hostCreatedCounts.hostStaged;
  kpis.hostPublished = kpis.hostCreatedCounts.hostPublished;
  kpis.feedbackAvg = weightedAvg(feedbackPairs);
  return kpis;
}

function rollupVsPrev(overviews) {
  const withPrev = overviews.filter((overview) => overview.vsPrevWeek);
  if (!withPrev.length) return null;

  const current = {};
  const previous = {};
  for (const key of DELTA_KPI_KEYS) {
    current[key] = 0;
    previous[key] = 0;
  }

  const currentFeedback = [];
  const previousFeedback = [];

  for (const overview of withPrev) {
    const vs = overview.vsPrevWeek;
    const kpis = overview.kpis || {};
    for (const key of DELTA_KPI_KEYS) {
      current[key] += vs?.[key]?.current ?? kpis[key] ?? 0;
      previous[key] += vs?.[key]?.previous ?? 0;
    }
    const currCount = kpis.feedbackCount ?? vs?.feedbackCount?.current ?? 0;
    const currAvg = kpis.feedbackAvg ?? vs?.feedbackAvg?.current;
    currentFeedback.push({ avg: currAvg, count: currCount });
    previousFeedback.push({
      avg: vs?.feedbackAvg?.previous,
      count: vs?.feedbackCount?.previous ?? 0,
    });
  }

  current.feedbackAvg = weightedAvg(currentFeedback);
  previous.feedbackAvg = weightedAvg(previousFeedback);
  return buildVsPrevWeek(current, previous);
}

function rollupCrewMetrics(okRows, batchWeek) {
  const rows = okRows.filter((row) => sectionOk(row.bundle?.crewMetrics));
  if (!rows.length) return null;

  const totals = {
    usersWithCrew: 0,
    wau: 0,
    quorumMet: 0,
    activeCrews: 0,
    confirmed: 0,
    proposed: 0,
    resolved: 0,
    sent: 0,
    views: 0,
    clicks: 0,
    deciding: 0,
    swapped: 0,
    swapsUsed: 0,
    totalCrews: 0,
    weekStateCount: 0,
  };

  for (const row of rows) {
    const crew = row.bundle.crewMetrics;
    const kpis = crew.kpis || {};
    totals.usersWithCrew += kpis.crewCreationRate?.usersWithCrew ?? 0;
    totals.wau += kpis.crewCreationRate?.wau ?? 0;
    totals.quorumMet += kpis.quorumHitRate?.quorumMet ?? 0;
    totals.activeCrews += kpis.quorumHitRate?.activeCrews ?? 0;
    totals.confirmed += kpis.judgementConfirmRate?.confirmed ?? 0;
    totals.proposed += kpis.judgementConfirmRate?.proposed ?? 0;
    totals.resolved += kpis.invitedJoinRate?.resolved ?? 0;
    totals.sent += kpis.invitedJoinRate?.sent ?? 0;
    totals.views += kpis.crossCrewSurfaces?.views ?? 0;
    totals.clicks += kpis.crossCrewSurfaces?.clicks ?? 0;
    totals.deciding += kpis.consensus?.deciding ?? 0;
    totals.swapped += kpis.consensus?.swapped ?? 0;
    totals.swapsUsed += kpis.consensus?.swapsUsed ?? 0;
    totals.totalCrews += crew.totalCrews ?? 0;
    totals.weekStateCount += crew.weekStateCount ?? 0;
  }

  return {
    tenantKey: null,
    cityDisplayName: 'All cities',
    batchWeek,
    totalCrews: totals.totalCrews,
    weekStateCount: totals.weekStateCount,
    vsPrevWeek: null,
    kpis: {
      crewCreationRate: {
        rate: rateOrNull(totals.usersWithCrew, totals.wau),
        usersWithCrew: totals.usersWithCrew,
        wau: totals.wau,
      },
      quorumHitRate: {
        rate: rateOrNull(totals.quorumMet, totals.activeCrews),
        quorumMet: totals.quorumMet,
        activeCrews: totals.activeCrews,
      },
      judgementConfirmRate: {
        rate: rateOrNull(totals.confirmed, totals.proposed),
        confirmed: totals.confirmed,
        proposed: totals.proposed,
      },
      consensus: {
        deciding: totals.deciding,
        swapped: totals.swapped,
        swapsUsed: totals.swapsUsed,
      },
      invitedJoinRate: {
        rate: rateOrNull(totals.resolved, totals.sent),
        resolved: totals.resolved,
        sent: totals.sent,
      },
      crossCrewSurfaces: {
        views: totals.views,
        clicks: totals.clicks,
        clickThroughRate: rateOrNull(totals.clicks, totals.views),
      },
    },
  };
}

function rollupRetention(okRows, batchWeek) {
  const rows = okRows.filter((row) => sectionOk(row.bundle?.retention));
  if (!rows.length) return null;

  const weekList =
    rows[0].bundle.retention.weeks ||
    rows[0].bundle.retention.tenant?.weeks?.map((week) => week.batchWeek) ||
    [];

  const tenants = rows.map((row) => ({
    tenantKey: row.tenantKey,
    cityDisplayName: row.cityDisplayName,
    weeks: row.bundle.retention.tenant?.weeks || [],
    error: row.bundle.retention.tenant?.error,
  }));

  const summed = weekList.map((weekKey) => {
    let activeUsers = 0;
    let returningUsers = null;
    for (const tenant of tenants) {
      const week = tenant.weeks.find((item) => item.batchWeek === weekKey);
      if (!week) continue;
      activeUsers += week.activeUsers ?? 0;
      if (week.returningUsers != null) {
        returningUsers = (returningUsers || 0) + week.returningUsers;
      }
    }
    return { batchWeek: weekKey, activeUsers, returningUsers };
  });

  const weeks = summed.map((row, index) => {
    const previous = index > 0 ? summed[index - 1] : null;
    const retentionRate =
      previous && previous.activeUsers > 0 && row.returningUsers != null
        ? Math.round((row.returningUsers / previous.activeUsers) * 1000) / 10
        : null;
    return { ...row, retentionRate };
  });

  return {
    batchWeek,
    weeks: weekList,
    tenant: {
      tenantKey: null,
      cityDisplayName: 'All cities',
      weeks,
    },
    tenants,
  };
}

function rollupPerformance(okRows, batchWeek, limit) {
  const events = [];
  for (const row of okRows) {
    if (!sectionOk(row.bundle?.performance)) continue;
    for (const event of row.bundle.performance.events || []) {
      events.push({
        ...event,
        tenantKey: row.tenantKey,
        cityDisplayName: row.cityDisplayName,
      });
    }
  }
  events.sort(comparePerformanceRows);
  return {
    tenantKey: null,
    cityDisplayName: 'All cities',
    batchWeek,
    sortBy: 'interestedTotal',
    limit,
    total: events.length,
    events: events.slice(0, limit),
  };
}

function rollupInsights(okRows, batchWeek, cap) {
  const insights = [];
  for (const row of okRows) {
    if (!sectionOk(row.bundle?.insights)) continue;
    for (const insight of row.bundle.insights.insights || []) {
      insights.push({
        ...insight,
        id: `${row.tenantKey}:${insight.id}`,
        tenantKey: row.tenantKey,
        cityDisplayName: row.cityDisplayName,
        title: `${row.cityDisplayName}: ${insight.title}`,
      });
    }
  }
  insights.sort((a, b) => {
    const rank =
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (rank !== 0) return rank;
    return String(a.tenantKey).localeCompare(String(b.tenantKey));
  });
  return {
    tenantKey: null,
    cityDisplayName: 'All cities',
    batchWeek,
    insights: insights.slice(0, cap),
  };
}

function rollupReadiness(okRows, batchWeek) {
  const cities = [];
  for (const row of okRows) {
    if (!sectionOk(row.bundle?.readiness)) continue;
    const readiness = row.bundle.readiness;
    const readyCount = readiness.metrics?.readyCount ?? 0;
    const targetEventCount = readiness.targetEventCount ?? 0;
    cities.push({
      tenantKey: row.tenantKey,
      cityDisplayName: row.cityDisplayName,
      score: readiness.score ?? 0,
      batchWeek: readiness.batchWeek || batchWeek,
      targetEventCount,
      readyCount,
      belowTarget: targetEventCount > 0 && readyCount < targetEventCount,
      hoursUntilDrop: readiness.hoursUntilDrop ?? null,
    });
  }

  if (!cities.length) return null;

  const belowTarget = cities.filter((city) => city.belowTarget).length;
  const worstScore = Math.min(...cities.map((city) => city.score ?? 0));
  const hourValues = cities
    .map((city) => city.hoursUntilDrop)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const soonestHoursUntilDrop = hourValues.length ? Math.min(...hourValues) : null;

  return {
    batchWeek,
    cityCount: cities.length,
    belowTarget,
    worstScore,
    soonestHoursUntilDrop,
    cities,
  };
}

function pickSoonestDrop(okRows) {
  let best = null;
  for (const row of okRows) {
    const drop = row.bundle.dropSchedule || row.bundle.overview?.dropSchedule;
    if (!drop?.nextDropAt) continue;
    const at = new Date(drop.nextDropAt);
    if (Number.isNaN(at.getTime())) continue;
    if (!best || at < best.at) {
      best = { at, drop, tenantKey: row.tenantKey, cityDisplayName: row.cityDisplayName };
    }
  }
  if (!best) return null;
  return {
    ...best.drop,
    tenantKey: best.tenantKey,
    cityDisplayName: best.cityDisplayName,
  };
}

function cityContribution(overviews) {
  return overviews
    .map((overview) => ({
      tenantKey: overview.tenantKey,
      cityDisplayName: overview.cityDisplayName,
      activeUsers: overview.kpis?.activeUsers ?? 0,
      eventCount: overview.kpis?.eventCount ?? 0,
    }))
    .sort((a, b) => b.activeUsers - a.activeUsers || a.tenantKey.localeCompare(b.tenantKey));
}

/**
 * Pure rollup of per-city ops bundles into a fleet Overview payload.
 * Does not merge local eventsByDay calendars.
 */
function rollupFleetOverview(tenantRows, options = {}) {
  const batchWeek = options.batchWeek;
  const performanceLimit = options.performanceLimit ?? DEFAULT_PERFORMANCE_LIMIT;
  const insightCap = options.insightCap ?? DEFAULT_INSIGHT_CAP;
  const sections = options.sections || [...FLEET_SECTIONS];

  const ok = [];
  const failedTenants = [];

  for (const row of tenantRows) {
    if (!row || row.error) {
      failedTenants.push(failedRow(row));
      continue;
    }
    ok.push(row);
  }

  const overviews = ok
    .filter((row) => sectionOk(row.bundle?.overview) && row.bundle.overview.kpis)
    .map((row) => ({
      tenantKey: row.tenantKey,
      cityDisplayName: row.cityDisplayName,
      ...row.bundle.overview,
    }));

  const kpis = rollupKpis(overviews);
  const vsPrevWeek = rollupVsPrev(overviews);
  const funnel = buildFunnelStages(kpis);
  const dropSchedule = pickSoonestDrop(ok);

  const hostLiveWeekAlerts = ok
    .map((row) => {
      const alert = row.bundle.overview?.hostLiveWeekAlert;
      if (!alert?.active) return null;
      return {
        ...alert,
        tenantKey: row.tenantKey,
        cityDisplayName: row.cityDisplayName,
      };
    })
    .filter(Boolean);

  const tenants = ok.map((row) => {
    const overview = sectionOk(row.bundle?.overview) ? row.bundle.overview : null;
    const readiness = sectionOk(row.bundle?.readiness) ? row.bundle.readiness : null;
    const insights = sectionOk(row.bundle?.insights)
      ? row.bundle.insights.insights || []
      : [];
    return {
      tenantKey: row.tenantKey,
      cityDisplayName: row.cityDisplayName,
      activeUsers: overview?.kpis?.activeUsers ?? 0,
      eventCount: overview?.kpis?.eventCount ?? 0,
      score: readiness?.score ?? null,
      insightCount: insights.length,
      error: overview ? null : row.bundle?.overview?.error || null,
    };
  });

  const wants = (name) => sections.includes(name);

  const data = {
    tenantKey: null,
    cityDisplayName: 'All cities',
    batchWeek,
    cityCount: ok.length,
    failedTenants,
    include: sections,
    dropSchedule,
    overview: wants('overview')
      ? overviews.length
        ? {
            tenantKey: null,
            cityDisplayName: 'All cities',
            batchWeek,
            previousBatchWeek: overviews[0]?.previousBatchWeek || null,
            kpis,
            vsPrevWeek,
            funnel,
            cityContribution: cityContribution(overviews),
            eventsByDay: [],
            hostLiveWeekAlerts,
            dropSchedule,
            referralCodes: [],
          }
        : failedTenants.length
          ? {
              error: 'All cities failed to load overview.',
              code: 'AGGREGATION_FAILED',
            }
          : {
              tenantKey: null,
              cityDisplayName: 'All cities',
              batchWeek,
              kpis: emptyKpis(),
              vsPrevWeek: null,
              funnel: buildFunnelStages(emptyKpis()),
              cityContribution: [],
              eventsByDay: [],
              hostLiveWeekAlerts: [],
              dropSchedule: null,
              referralCodes: [],
            }
      : undefined,
    performance: wants('performance')
      ? rollupPerformance(ok, batchWeek, performanceLimit)
      : undefined,
    insights: wants('insights') ? rollupInsights(ok, batchWeek, insightCap) : undefined,
    readiness: wants('readiness') ? rollupReadiness(ok, batchWeek) : undefined,
    retention: wants('retention') ? rollupRetention(ok, batchWeek) : undefined,
    crewMetrics: wants('crewMetrics') ? rollupCrewMetrics(ok, batchWeek) : undefined,
    tenants,
  };

  return data;
}

/**
 * Single round-trip fleet Overview bundle. Fans out in parallel across pivot
 * tenants, then rolls up. Does not use GET /admin/pivot/overview (Lab tables).
 */
async function getFleetOpsBundle(req, options = {}) {
  const now = options.now || new Date();
  const normalized = normalizeBatchWeek(
    options.batchWeek?.trim() || toIsoWeek(now),
    now,
  );
  if (normalized.error) return normalized;

  const { batchWeek } = normalized;
  const includeRaw = options.include;
  const parsed = parseFleetInclude(includeRaw);
  if (parsed.error) return parsed;
  const { sections } = parsed;

  const performanceLimit = options.performanceLimit ?? DEFAULT_PERFORMANCE_LIMIT;
  const retentionWeeks = options.retentionWeeks;

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);

  const tenantRows = await Promise.all(
    pivotTenants.map(async (tenant) => {
      const tenantKey = tenant.tenantKey;
      const cityDisplayName = tenant.location || tenant.name || tenantKey;
      try {
        const result = await getTenantOpsBundle(req, {
          tenantKey,
          batchWeek,
          include: includeRaw,
          performanceLimit,
          retentionWeeks,
          now,
        });
        if (result.error) {
          return {
            tenantKey,
            cityDisplayName,
            error: result.error,
            code: result.code || 'AGGREGATION_FAILED',
          };
        }
        return { tenantKey, cityDisplayName, bundle: result.data };
      } catch (error) {
        console.error(
          `[pivotFleetOps] tenant=${tenantKey} batchWeek=${batchWeek}:`,
          error,
        );
        return {
          tenantKey,
          cityDisplayName,
          error: 'AGGREGATION_FAILED',
          code: 'AGGREGATION_FAILED',
        };
      }
    }),
  );

  const currentIsoWeek = toIsoWeek(now);
  const rolled = rollupFleetOverview(tenantRows, {
    batchWeek,
    performanceLimit,
    sections,
  });

  return {
    data: {
      ...rolled,
      anchors: {
        liveWeek: currentIsoWeek,
        curateWeek: shiftIsoWeek(currentIsoWeek, 1),
        currentWeek: currentIsoWeek,
        dropPending: false,
      },
      weekRange: {
        label: formatBatchWeekRangeLabel(batchWeek, {
          dropDayOfWeek: 1,
          timeZone: 'UTC',
        }),
        dropDayOfWeek: 1,
        timeZone: 'UTC',
      },
    },
  };
}

module.exports = {
  getFleetOpsBundle,
  rollupFleetOverview,
  parseFleetInclude,
  FLEET_SECTIONS,
  emptyKpis,
};
