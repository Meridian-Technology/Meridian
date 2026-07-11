const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { labEventsQuery } = require('./pivotLabEventsService');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');
const {
  DEFAULT_TARGET_EVENT_COUNT,
  getPivotBatch,
  serializePivotBatch,
} = require('./pivotBatchService');
const { buildDropSchedulePayload } = require('./pivotConfigService');
const { curationHref } = require('./pivotTenantInsightsService');

const FORMULA_VERSION = 'v0';
const DEFAULT_BENCHMARK_WEEKS = 4;
const TIME_BUFFER_FULL_HOURS = 72;
const BENCHMARK_TOLERANCE = 0.05;

const WEIGHTS = {
  eventCount: 0.4,
  tagCoverage: 0.25,
  hostCompleteness: 0.2,
  diversity: 0.1,
  timeBuffer: 0.05,
};

function catalogEventsQuery(batchWeek) {
  return {
    ...labEventsQuery(batchWeek),
    status: { $in: PIVOT_EVENT_STATUSES },
  };
}

function isDeckEligible(ingestStatus) {
  return ingestStatus === 'published' || ingestStatus === 'staged';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Pure catalog metrics for a week's events (lean Event docs with customFields.pivot).
 */
function computeCatalogMetrics(events = []) {
  const rows = Array.isArray(events) ? events : [];
  const deck = rows.filter((e) => isDeckEligible(e.customFields?.pivot?.ingestStatus));
  const staged = rows.filter((e) => e.customFields?.pivot?.ingestStatus === 'staged');
  const draft = rows.filter((e) => e.customFields?.pivot?.ingestStatus === 'draft');
  const published = rows.filter((e) => e.customFields?.pivot?.ingestStatus === 'published');

  const tagged = deck.filter((e) => (e.customFields?.pivot?.tags || []).length > 0);
  const withHost = deck.filter((e) =>
    String(e.customFields?.pivot?.host?.name || '').trim(),
  );
  const withQuality = deck.filter(
    (e) => String(e.description || '').trim() && e.image,
  );

  const tagCounts = new Map();
  for (const e of deck) {
    for (const tag of e.customFields?.pivot?.tags || []) {
      const slug = String(tag || '').trim().toLowerCase();
      if (!slug) continue;
      tagCounts.set(slug, (tagCounts.get(slug) || 0) + 1);
    }
  }
  const uniqueTags = tagCounts.size;
  const topTagCount = tagCounts.size ? Math.max(...tagCounts.values()) : 0;
  const diversityRatio = deck.length ? uniqueTags / Math.max(deck.length, 1) : 0;
  const concentrationRatio = deck.length ? topTagCount / deck.length : 0;

  return {
    draftCount: draft.length,
    stagedCount: staged.length,
    publishedCount: published.length,
    deckCount: deck.length,
    readyCount: draft.length + staged.length + published.length,
    tagCoveragePct: deck.length ? tagged.length / deck.length : 0,
    hostCompletenessPct: deck.length ? withHost.length / deck.length : 0,
    qualityPct: deck.length ? withQuality.length / deck.length : 0,
    uniqueTags,
    diversityRatio,
    concentrationRatio,
    untaggedCount: Math.max(0, deck.length - tagged.length),
    missingHostCount: Math.max(0, deck.length - withHost.length),
  };
}

function compareToBenchmark(value, benchmark, { relative = false } = {}) {
  if (benchmark == null || Number.isNaN(benchmark)) {
    return {
      value,
      benchmark: null,
      delta: null,
      status: 'on',
    };
  }
  const delta = value - benchmark;
  let status = 'on';
  if (relative) {
    const denom = Math.abs(benchmark) || 1;
    const ratio = delta / denom;
    if (ratio < -BENCHMARK_TOLERANCE) status = 'below';
    else if (ratio > BENCHMARK_TOLERANCE) status = 'above';
  } else if (delta < -BENCHMARK_TOLERANCE) {
    status = 'below';
  } else if (delta > BENCHMARK_TOLERANCE) {
    status = 'above';
  }
  return {
    value: round2(value),
    benchmark: round2(benchmark),
    delta: round2(delta),
    status,
  };
}

function normalizeEventCount(readyCount, targetEventCount) {
  if (!targetEventCount) return 0;
  return Math.min(1, readyCount / targetEventCount);
}

function normalizeTimeBuffer(hoursUntilDrop) {
  if (hoursUntilDrop == null || Number.isNaN(hoursUntilDrop)) return 0;
  if (hoursUntilDrop <= 0) return 0;
  return Math.min(1, hoursUntilDrop / TIME_BUFFER_FULL_HOURS);
}

function buildComponents({
  metrics,
  targetEventCount,
  hoursUntilDrop,
  benchmarks,
}) {
  const eventNorm = normalizeEventCount(metrics.readyCount, targetEventCount);
  const timeNorm = normalizeTimeBuffer(hoursUntilDrop);

  const eventCmp = compareToBenchmark(
    metrics.readyCount,
    benchmarks?.readyCount,
    { relative: true },
  );
  const tagCmp = compareToBenchmark(
    metrics.tagCoveragePct,
    benchmarks?.tagCoveragePct,
  );
  const hostCmp = compareToBenchmark(
    metrics.hostCompletenessPct,
    benchmarks?.hostCompletenessPct,
  );
  const divCmp = compareToBenchmark(
    metrics.diversityRatio,
    benchmarks?.diversityRatio,
  );
  const timeCmp = compareToBenchmark(
    hoursUntilDrop ?? 0,
    benchmarks?.hoursUntilDrop,
    { relative: true },
  );

  return [
    {
      key: 'eventCount',
      label: 'Catalog events (draft+staged+published)',
      weight: WEIGHTS.eventCount,
      normalized: round2(eventNorm),
      target: targetEventCount,
      ...eventCmp,
    },
    {
      key: 'tagCoverage',
      label: 'Tag coverage (staged+published)',
      weight: WEIGHTS.tagCoverage,
      normalized: round2(metrics.tagCoveragePct),
      unit: 'ratio',
      ...tagCmp,
    },
    {
      key: 'hostCompleteness',
      label: 'Host completeness',
      weight: WEIGHTS.hostCompleteness,
      normalized: round2(metrics.hostCompletenessPct),
      unit: 'ratio',
      ...hostCmp,
    },
    {
      key: 'diversity',
      label: 'Tag diversity',
      weight: WEIGHTS.diversity,
      normalized: round2(Math.min(1, metrics.diversityRatio)),
      unit: 'ratio',
      uniqueTags: metrics.uniqueTags,
      ...divCmp,
    },
    {
      key: 'timeBuffer',
      label: 'Hours until drop',
      weight: WEIGHTS.timeBuffer,
      normalized: round2(timeNorm),
      unit: 'hours',
      ...timeCmp,
    },
  ];
}

function scoreFromComponents(components) {
  const raw = components.reduce(
    (sum, c) => sum + (c.normalized || 0) * (c.weight || 0),
    0,
  );
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

function buildCtas({ tenantKey, batchWeek, metrics, targetEventCount }) {
  const ctas = [];
  const shortfall = Math.max(0, targetEventCount - metrics.readyCount);
  if (shortfall > 0) {
    ctas.push({
      id: 'add-events',
      label: `Add ${shortfall} more event${shortfall === 1 ? '' : 's'}`,
      href: curationHref(tenantKey, batchWeek),
      action: { type: 'open_curation', label: 'Open curation' },
    });
  }
  if (metrics.untaggedCount > 0) {
    ctas.push({
      id: 'tag-events',
      label: `Tag ${metrics.untaggedCount} event${metrics.untaggedCount === 1 ? '' : 's'}`,
      href: curationHref(tenantKey, batchWeek, 'untagged'),
      action: { type: 'open_curation', filter: 'untagged', label: 'Fix tags' },
    });
  }
  if (metrics.missingHostCount > 0) {
    ctas.push({
      id: 'fix-hosts',
      label: `Add host on ${metrics.missingHostCount} event${metrics.missingHostCount === 1 ? '' : 's'}`,
      href: curationHref(tenantKey, batchWeek, 'missing-host'),
      action: { type: 'open_curation', filter: 'missing-host', label: 'Fix hosts' },
    });
  }
  if (metrics.draftCount > 0) {
    ctas.push({
      id: 'stage-drafts',
      label: `Stage ${metrics.draftCount} draft${metrics.draftCount === 1 ? '' : 's'}`,
      href: curationHref(tenantKey, batchWeek, 'draft'),
      action: { type: 'open_curation', filter: 'draft', label: 'Review drafts' },
    });
  }
  return ctas;
}

/**
 * Pure readiness builder — unit-testable without DB.
 */
function buildBatchReadiness(context) {
  const {
    tenantKey,
    batchWeek,
    metrics,
    targetEventCount = DEFAULT_TARGET_EVENT_COUNT,
    hoursUntilDrop = 0,
    dropSchedule = null,
    batch = null,
    benchmarks = null,
    benchmarkWeeksUsed = 0,
  } = context;

  const components = buildComponents({
    metrics,
    targetEventCount,
    hoursUntilDrop,
    benchmarks,
  });
  const score = scoreFromComponents(components);
  const ctas = buildCtas({
    tenantKey,
    batchWeek,
    metrics,
    targetEventCount,
  });

  return {
    tenantKey,
    batchWeek,
    score,
    targetEventCount,
    hoursUntilDrop: round2(hoursUntilDrop),
    dropSchedule,
    batch,
    metrics: {
      readyCount: metrics.readyCount,
      draftCount: metrics.draftCount,
      stagedCount: metrics.stagedCount,
      publishedCount: metrics.publishedCount,
      deckCount: metrics.deckCount,
      tagCoveragePct: round2(metrics.tagCoveragePct),
      hostCompletenessPct: round2(metrics.hostCompletenessPct),
      qualityPct: round2(metrics.qualityPct),
      uniqueTags: metrics.uniqueTags,
      diversityRatio: round2(metrics.diversityRatio),
      untaggedCount: metrics.untaggedCount,
      missingHostCount: metrics.missingHostCount,
    },
    formula: {
      version: FORMULA_VERSION,
      weights: { ...WEIGHTS },
      timeBufferFullHours: TIME_BUFFER_FULL_HOURS,
      description:
        'Weighted sum of normalized components: event count vs target (40%), tag coverage (25%), host completeness (20%), tag diversity (10%), hours-until-drop buffer (5%, full credit at 72h).',
    },
    components,
    ctas,
    benchmarkWeeksUsed,
  };
}

async function loadWeekEvents(Event, batchWeek) {
  return Event.find(catalogEventsQuery(batchWeek))
    .select('description image customFields.pivot')
    .lean();
}

async function loadBenchmarkMetrics(Event, PivotBatch, { excludeWeek, limit, now }) {
  const released = await PivotBatch.find({ status: 'released' })
    .sort({ batchWeek: -1 })
    .limit(Math.max(limit * 2, limit))
    .select('batchWeek')
    .lean();

  const weeks = [];
  for (const row of released) {
    if (!row?.batchWeek || row.batchWeek === excludeWeek) continue;
    weeks.push(row.batchWeek);
    if (weeks.length >= limit) break;
  }

  const metricsList = [];
  for (const week of weeks) {
    const events = await loadWeekEvents(Event, week);
    metricsList.push(computeCatalogMetrics(events));
  }

  if (!metricsList.length) {
    return { benchmarks: null, benchmarkWeeksUsed: 0 };
  }

  return {
    benchmarks: {
      readyCount: avg(metricsList.map((m) => m.readyCount)),
      tagCoveragePct: avg(metricsList.map((m) => m.tagCoveragePct)),
      hostCompletenessPct: avg(metricsList.map((m) => m.hostCompletenessPct)),
      diversityRatio: avg(metricsList.map((m) => m.diversityRatio)),
      // Past released weeks are already past drop — no meaningful hours buffer avg.
      hoursUntilDrop: null,
    },
    benchmarkWeeksUsed: metricsList.length,
    now,
  };
}

async function getBatchReadiness(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { batchWeek } = normalized;
  const now = options.now || new Date();

  let benchmarkWeeks = DEFAULT_BENCHMARK_WEEKS;
  if (options.benchmarkWeeks != null && options.benchmarkWeeks !== '') {
    const n = Number(options.benchmarkWeeks);
    if (!Number.isFinite(n) || n < 1 || n > 12) {
      return {
        error: 'benchmarkWeeks must be an integer from 1 to 12.',
        status: 400,
        code: 'INVALID_BENCHMARK_WEEKS',
      };
    }
    benchmarkWeeks = Math.floor(n);
  }

  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event, PivotBatch } = getModels(tenantReq, 'Event', 'PivotBatch');

  const [events, batchResult, benchmarkResult] = await Promise.all([
    loadWeekEvents(Event, batchWeek),
    getPivotBatch(tenantReq, batchWeek),
    loadBenchmarkMetrics(Event, PivotBatch, {
      excludeWeek: batchWeek,
      limit: benchmarkWeeks,
      now,
    }),
  ]);

  if (batchResult.error) return batchResult;

  const metrics = computeCatalogMetrics(events);
  const targetEventCount =
    batchResult.data?.targetEventCount ?? DEFAULT_TARGET_EVENT_COUNT;

  let dropSchedule = null;
  let hoursUntilDrop = 0;
  try {
    dropSchedule = buildDropSchedulePayload(tenantResult.tenant, batchWeek, now);
    hoursUntilDrop = Math.max(
      0,
      (new Date(dropSchedule.nextDropAt).getTime() - now.getTime()) / 3_600_000,
    );
  } catch {
    dropSchedule = null;
    hoursUntilDrop = 0;
  }

  const data = buildBatchReadiness({
    tenantKey,
    batchWeek,
    metrics,
    targetEventCount,
    hoursUntilDrop,
    dropSchedule,
    batch: batchResult.data || serializePivotBatch(null),
    benchmarks: benchmarkResult.benchmarks,
    benchmarkWeeksUsed: benchmarkResult.benchmarkWeeksUsed,
  });

  return { data };
}

module.exports = {
  getBatchReadiness,
  buildBatchReadiness,
  computeCatalogMetrics,
  WEIGHTS,
  FORMULA_VERSION,
  DEFAULT_BENCHMARK_WEEKS,
  TIME_BUFFER_FULL_HOURS,
};
