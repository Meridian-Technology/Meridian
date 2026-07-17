const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const {
  getTenantOverview,
  getTenantEventPerformance,
} = require('./pivotAdminOverviewService');
const { getTenantInsights } = require('./pivotTenantInsightsService');
const { getBatchReadiness } = require('./pivotBatchReadinessService');
const {
  getJourneyOverview,
  getJourneyFunnel,
} = require('./pivotTenantJourneyService');
const {
  aggregateTenantRetention,
  normalizeWeeksParam,
} = require('./pivotRetentionService');
const { listPivotLabEvents } = require('./pivotLabEventsService');
const { listCurationJobs } = require('./pivotCurationJobService');
const { buildDropSchedulePayload } = require('./pivotConfigService');
const {
  resolvePivotDropConfig,
  resolvePivotStageAnchors,
  resolveStageForBatchWeek,
} = require('../utilities/pivotDropSchedule');
const { formatBatchWeekRangeLabel, shiftIsoWeek } = require('../utilities/pivotIsoWeek');

const ALL_SECTIONS = Object.freeze([
  'overview',
  'performance',
  'insights',
  'readiness',
  'retention',
  'journey',
  'funnel',
  'catalog',
  'jobs',
]);

const PRESETS = Object.freeze({
  overview: ['overview', 'performance', 'insights', 'readiness', 'retention'],
  journeys: ['journey', 'funnel'],
  /** Expanded server-side from resolved stage for the requested batchWeek. */
  curation: ['__curation__'],
});

const DEFAULT_PERFORMANCE_LIMIT = 10;
const CURATION_PERFORMANCE_LIMIT = 100;

function curationSectionsForStage(stage, { releaseWindow = false } = {}) {
  if (releaseWindow) {
    return ['overview', 'readiness', 'catalog', 'jobs'];
  }
  if (stage === 'live') {
    return ['overview', 'performance', 'journey', 'readiness', 'catalog', 'jobs'];
  }
  if (stage === 'post-mortem') {
    return ['overview', 'performance', 'journey'];
  }
  return ['overview', 'readiness', 'catalog', 'jobs'];
}

/**
 * Parse include query into a unique ordered section list.
 * Accepts presets (`overview`, `journeys`, `curation`) and/or section names.
 */
function parseInclude(raw, { stage, releaseWindow = false } = {}) {
  const tokens = String(raw || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (!tokens.length) {
    return {
      error: 'include is required (preset or comma-separated sections).',
      status: 400,
      code: 'INCLUDE_REQUIRED',
    };
  }

  const sections = [];
  const seen = new Set();

  const push = (name) => {
    if (seen.has(name)) return;
    if (!ALL_SECTIONS.includes(name)) {
      return {
        error: `Unknown include section: ${name}`,
        status: 400,
        code: 'INVALID_INCLUDE',
      };
    }
    seen.add(name);
    sections.push(name);
    return null;
  };

  for (const token of tokens) {
    if (token === 'curation' || token === '__curation__') {
      for (const name of curationSectionsForStage(stage || 'curate', { releaseWindow })) {
        const err = push(name);
        if (err) return err;
      }
      continue;
    }
    if (PRESETS[token] && token !== 'curation') {
      for (const name of PRESETS[token]) {
        const err = push(name);
        if (err) return err;
      }
      continue;
    }
    const err = push(token);
    if (err) return err;
  }

  if (!sections.length) {
    return {
      error: 'include resolved to no sections.',
      status: 400,
      code: 'INCLUDE_REQUIRED',
    };
  }

  return { sections };
}

function wants(sections, name) {
  return sections.includes(name);
}

/**
 * Single round-trip bundle for Overview / Journeys / Curation dashboards.
 *
 * @param {object} req
 * @param {{
 *   tenantKey: string,
 *   batchWeek?: string,
 *   include?: string,
 *   performanceLimit?: number|string,
 *   retentionWeeks?: number|string,
 *   now?: Date,
 * }} options
 */
async function getTenantOpsBundle(req, options = {}) {
  const now = options.now || new Date();

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const anchors = resolvePivotStageAnchors(tenant, now);
  const defaultBatchWeek = anchors.liveWeek;
  const normalized = normalizeBatchWeek(
    options.batchWeek?.trim() || defaultBatchWeek,
    now,
  );
  if (normalized.error) return normalized;

  const { batchWeek } = normalized;
  const dropConfig = resolvePivotDropConfig(tenant);
  const stage = resolveStageForBatchWeek(batchWeek, tenant, now);
  const releaseWindow =
    Boolean(anchors.dropPending) && batchWeek === anchors.curateWeek;

  const includeRaw = options.include;
  const parsed = parseInclude(includeRaw, { stage, releaseWindow });
  if (parsed.error) return parsed;
  const { sections } = parsed;

  const isCurationPreset = String(includeRaw || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .includes('curation');

  const performanceLimit = isCurationPreset
    ? options.performanceLimit ?? CURATION_PERFORMANCE_LIMIT
    : options.performanceLimit ?? DEFAULT_PERFORMANCE_LIMIT;

  const retentionWeeks = normalizeWeeksParam(options.retentionWeeks);

  let dropSchedule = null;
  try {
    dropSchedule = buildDropSchedulePayload(tenant, batchWeek, now);
  } catch {
    dropSchedule = null;
  }

  const weekRangeLabel = formatBatchWeekRangeLabel(batchWeek, {
    dropDayOfWeek: dropConfig.dayOfWeek,
    timeZone: dropConfig.timezone,
  });

  const tasks = {};

  if (wants(sections, 'overview')) {
    tasks.overview = getTenantOverview(req, {
      tenantKey,
      batchWeek,
      now,
    });
  }
  if (wants(sections, 'performance')) {
    tasks.performance = getTenantEventPerformance(req, {
      tenantKey,
      batchWeek,
      limit: performanceLimit,
      now,
    });
  }
  if (wants(sections, 'insights')) {
    tasks.insights = getTenantInsights(req, { tenantKey, batchWeek, now });
  }
  if (wants(sections, 'readiness')) {
    tasks.readiness = getBatchReadiness(req, { tenantKey, batchWeek, now });
  }
  if (wants(sections, 'retention')) {
    const weekList = Array.from({ length: retentionWeeks }, (_, index) =>
      shiftIsoWeek(batchWeek, index - (retentionWeeks - 1)),
    );
    tasks.retention = aggregateTenantRetention(tenant, weekList).then((row) => ({
      data: {
        batchWeek,
        weeks: weekList,
        tenant: row,
      },
    }));
  }
  if (wants(sections, 'journey')) {
    tasks.journey = getJourneyOverview(req, { tenantKey, batchWeek, now });
  }
  if (wants(sections, 'funnel')) {
    tasks.funnel = getJourneyFunnel(req, { tenantKey, batchWeek, now });
  }
  if (wants(sections, 'catalog')) {
    tasks.catalog = listPivotLabEvents(req, { tenantKey, batchWeek, now });
  }
  if (wants(sections, 'jobs')) {
    tasks.jobs = listCurationJobs(req, { tenantKey });
  }

  const keys = Object.keys(tasks);
  const settled = await Promise.all(
    keys.map(async (key) => {
      try {
        const result = await tasks[key];
        return [key, result];
      } catch (error) {
        console.error(
          `[pivotTenantOps] section=${key} failed tenant=${tenantKey} batchWeek=${batchWeek}:`,
          error,
        );
        return [
          key,
          {
            error: 'Section failed to load.',
            status: 500,
            code: 'SECTION_FAILED',
          },
        ];
      }
    }),
  );

  const data = {
    tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenantKey,
    batchWeek,
    stage,
    releaseWindow,
    anchors: {
      liveWeek: anchors.liveWeek,
      curateWeek: anchors.curateWeek,
      postMortemWeek: anchors.postMortemWeek,
      currentWeek: anchors.currentWeek,
      dropPending: anchors.dropPending,
      currentWeekDropAt: anchors.currentWeekDropAt,
    },
    weekRange: {
      label: weekRangeLabel,
      dropDayOfWeek: dropConfig.dayOfWeek,
      timeZone: dropConfig.timezone,
    },
    dropSchedule,
    include: sections,
  };

  for (const [key, result] of settled) {
    if (result?.error) {
      data[key] = {
        error: result.error,
        code: result.code || 'SECTION_FAILED',
      };
      continue;
    }
    data[key] = result?.data ?? null;
  }

  return { data };
}

module.exports = {
  getTenantOpsBundle,
  parseInclude,
  resolveStageAnchors: resolvePivotStageAnchors,
  resolveStageForWeek: resolveStageForBatchWeek,
  curationSectionsForStage,
  formatIsoWeekRangeLabel: formatBatchWeekRangeLabel,
  ALL_SECTIONS,
  PRESETS,
};
