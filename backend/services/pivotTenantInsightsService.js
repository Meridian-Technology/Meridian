const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { loadIntentStatsByEventId, labEventsQuery } = require('./pivotLabEventsService');
const {
  aggregateTenantOverview,
  serializePerformanceEvent,
} = require('./pivotAdminOverviewService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');

const DEFAULT_TARGET_EVENT_COUNT = 40;
const INTEREST_NO_TICKET_MIN = 3;
const TAG_CONCENTRATION_RATIO = 0.4;
const ACTIVE_USER_DROP_RATIO = 0.2;
const FEEDBACK_AVG_DROP = 0.5;

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 };

function catalogEventsQuery(batchWeek) {
  return {
    ...labEventsQuery(batchWeek),
    status: { $in: PIVOT_EVENT_STATUSES },
  };
}

function curationHref(tenantKey, batchWeek, filter) {
  const params = new URLSearchParams({ page: '1', batchWeek });
  if (filter) params.set('filter', filter);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

function journeysHref(tenantKey, batchWeek) {
  const params = new URLSearchParams({ page: '2', batchWeek });
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

function isDeckEligible(ingestStatus) {
  return ingestStatus === 'published' || ingestStatus === 'staged';
}

/**
 * Pure insight rules for tenant ops Overview.
 * Returns only cards that fire — empty array is a calm "all clear".
 */
function buildTenantInsights(context) {
  const {
    tenantKey,
    batchWeek,
    targetEventCount = DEFAULT_TARGET_EVENT_COUNT,
    eventCountsByStatus,
    performanceEvents = [],
    catalogEvents = [],
    vsPrevWeek,
    feedbackAvg,
    prevFeedbackAvg,
  } = context;

  const insights = [];
  const status = eventCountsByStatus || {
    draft: 0,
    staged: 0,
    published: 0,
    other: 0,
    total: 0,
  };
  const readyCount = (status.draft || 0) + (status.staged || 0) + (status.published || 0);

  // 1. Thin catalog vs next-drop target
  if (readyCount < targetEventCount) {
    const shortfall = targetEventCount - readyCount;
    insights.push({
      id: 'thin-catalog',
      severity: readyCount < Math.ceil(targetEventCount * 0.5) ? 'critical' : 'warn',
      title: 'Catalog below drop target',
      body: `${readyCount} events in ${batchWeek} (draft/staged/published); target is ${targetEventCount}. Add about ${shortfall} more.`,
      metric: { value: readyCount, target: targetEventCount, shortfall },
      href: curationHref(tenantKey, batchWeek),
      action: { type: 'open_curation', label: 'Open curation' },
    });
  }

  // 2. High interest, zero ticket opens
  const interestNoTicket = performanceEvents.filter(
    (row) => (row.interestedTotal ?? 0) >= INTEREST_NO_TICKET_MIN && (row.externalOpen ?? 0) === 0,
  );
  if (interestNoTicket.length) {
    const top = interestNoTicket[0];
    insights.push({
      id: 'interest-no-ticket',
      severity: interestNoTicket.length >= 3 ? 'critical' : 'warn',
      title: 'Interest without ticket opens',
      body: `${interestNoTicket.length} event${interestNoTicket.length === 1 ? '' : 's'} have ≥${INTEREST_NO_TICKET_MIN} right-swipes but no ticket opens${
        top?.name ? ` (e.g. “${top.name}”)` : ''
      }. Check links or host copy.`,
      metric: { count: interestNoTicket.length, minInterested: INTEREST_NO_TICKET_MIN },
      href: journeysHref(tenantKey, batchWeek),
      action: { type: 'open_journeys', label: 'Inspect journeys' },
    });
  }

  // 3. Published/staged missing tags
  const untagged = catalogEvents.filter((event) => {
    const pivot = event.customFields?.pivot || {};
    if (!isDeckEligible(pivot.ingestStatus)) return false;
    return !Array.isArray(pivot.tags) || pivot.tags.length === 0;
  });
  if (untagged.length) {
    insights.push({
      id: 'untagged-events',
      severity: untagged.length >= 5 ? 'critical' : 'warn',
      title: 'Events missing tags',
      body: `${untagged.length} published/staged event${untagged.length === 1 ? '' : 's'} have no tags. Tag coverage helps matching and readiness.`,
      metric: { count: untagged.length },
      href: curationHref(tenantKey, batchWeek, 'untagged'),
      action: { type: 'open_curation', filter: 'untagged', label: 'Fix untagged' },
    });
  }

  // 4. Tag concentration
  const taggedDeck = catalogEvents.filter((event) => {
    const pivot = event.customFields?.pivot || {};
    return isDeckEligible(pivot.ingestStatus) && Array.isArray(pivot.tags) && pivot.tags.length;
  });
  if (taggedDeck.length >= 3) {
    const tagCounts = new Map();
    for (const event of taggedDeck) {
      for (const tag of event.customFields.pivot.tags) {
        const key = String(tag);
        tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      }
    }
    let topTag = null;
    let topCount = 0;
    for (const [tag, count] of tagCounts) {
      if (count > topCount) {
        topTag = tag;
        topCount = count;
      }
    }
    const ratio = topCount / taggedDeck.length;
    if (topTag && ratio > TAG_CONCENTRATION_RATIO) {
      const pct = Math.round(ratio * 100);
      insights.push({
        id: 'tag-concentration',
        severity: ratio > 0.6 ? 'warn' : 'info',
        title: 'Tag concentration',
        body: `“${topTag}” appears on ${pct}% of tagged deck events (${topCount}/${taggedDeck.length}). Consider diversifying the week.`,
        metric: { tag: topTag, count: topCount, total: taggedDeck.length, ratio },
        href: curationHref(tenantKey, batchWeek),
        action: { type: 'open_curation', label: 'Review tags' },
      });
    }
  }

  // 5. Feedback avg below prior week
  if (
    typeof feedbackAvg === 'number' &&
    typeof prevFeedbackAvg === 'number' &&
    feedbackAvg < prevFeedbackAvg - FEEDBACK_AVG_DROP
  ) {
    const drop = Math.round((prevFeedbackAvg - feedbackAvg) * 100) / 100;
    insights.push({
      id: 'low-feedback',
      severity: feedbackAvg < 3 ? 'critical' : 'warn',
      title: 'Feedback below last week',
      body: `Average rating is ${feedbackAvg} vs ${prevFeedbackAvg} last week (−${drop}). Spot-check going events and hosts.`,
      metric: { current: feedbackAvg, previous: prevFeedbackAvg, drop },
      href: journeysHref(tenantKey, batchWeek),
      action: { type: 'open_journeys', label: 'Review journeys' },
    });
  }

  // 6. Week-over-week active user drop
  const activeDelta = vsPrevWeek?.activeUsers;
  if (
    activeDelta &&
    typeof activeDelta.previous === 'number' &&
    activeDelta.previous >= 5 &&
    typeof activeDelta.current === 'number' &&
    activeDelta.current < activeDelta.previous * (1 - ACTIVE_USER_DROP_RATIO)
  ) {
    const dropPct = Math.round(
      ((activeDelta.previous - activeDelta.current) / activeDelta.previous) * 100,
    );
    insights.push({
      id: 'active-users-drop',
      severity: dropPct >= 40 ? 'critical' : 'warn',
      title: 'Active users down week-over-week',
      body: `${activeDelta.current} active vs ${activeDelta.previous} last week (−${dropPct}%). Check drop timing, push, and deck quality.`,
      metric: {
        current: activeDelta.current,
        previous: activeDelta.previous,
        dropPct,
      },
      href: journeysHref(tenantKey, batchWeek),
      action: { type: 'open_journeys', label: 'Open journeys' },
    });
  }

  return insights.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
}

async function getTenantInsights(req, options = {}) {
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
  const tenantKey = tenant.tenantKey;
  const targetEventCount =
    Number.isFinite(Number(options.targetEventCount)) && Number(options.targetEventCount) > 0
      ? Math.trunc(Number(options.targetEventCount))
      : DEFAULT_TARGET_EVENT_COUNT;

  const previousBatchWeek = shiftIsoWeek(batchWeek, -1);

  const [current, previous] = await Promise.all([
    aggregateTenantOverview(req, tenant, batchWeek, {
      includeStatusBreakdown: true,
      includeReferralCodes: false,
    }),
    aggregateTenantOverview(req, tenant, previousBatchWeek, {
      includeStatusBreakdown: false,
      includeReferralCodes: false,
    }).catch((error) => {
      console.error(
        `[pivotTenantInsights] prev-week aggregate failed tenant=${tenantKey} batchWeek=${previousBatchWeek}:`,
        error,
      );
      return null;
    }),
  ]);

  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotEventIntent } = getModels(tenantReq, 'Event', 'PivotEventIntent');

  const catalogEvents = await Event.find(catalogEventsQuery(batchWeek))
    .select('name start_time customFields.pivot')
    .lean();

  const intentStatsByEventId = await loadIntentStatsByEventId(
    PivotEventIntent,
    catalogEvents.map((event) => event._id),
    { batchWeek },
  );

  const performanceEvents = catalogEvents.map((event) =>
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
  );

  const vsPrevWeek = previous
    ? {
        activeUsers: {
          current: current.activeUsers ?? 0,
          previous: previous.activeUsers ?? 0,
          delta: (current.activeUsers ?? 0) - (previous.activeUsers ?? 0),
        },
      }
    : null;

  const insights = buildTenantInsights({
    tenantKey,
    batchWeek,
    targetEventCount,
    eventCountsByStatus: current.eventCountsByStatus,
    performanceEvents,
    catalogEvents,
    vsPrevWeek,
    feedbackAvg: current.feedbackAvg,
    prevFeedbackAvg: previous?.feedbackAvg ?? null,
  });

  return {
    data: {
      tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenantKey,
      batchWeek,
      previousBatchWeek,
      targetEventCount,
      insights,
    },
  };
}

module.exports = {
  getTenantInsights,
  buildTenantInsights,
  curationHref,
  journeysHref,
  DEFAULT_TARGET_EVENT_COUNT,
  INTEREST_NO_TICKET_MIN,
  TAG_CONCENTRATION_RATIO,
};
