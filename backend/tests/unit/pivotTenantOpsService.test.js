jest.mock('../../services/pivotAdminOverviewService', () => ({
  getTenantOverview: jest.fn(),
  getTenantEventPerformance: jest.fn(),
}));
jest.mock('../../services/pivotTenantInsightsService', () => ({
  getTenantInsights: jest.fn(),
}));
jest.mock('../../services/pivotBatchReadinessService', () => ({
  getBatchReadiness: jest.fn(),
}));
jest.mock('../../services/pivotTenantJourneyService', () => ({
  getJourneyOverview: jest.fn(),
  getJourneyFunnel: jest.fn(),
}));
jest.mock('../../services/pivotRetentionService', () => ({
  aggregateTenantRetention: jest.fn(),
  normalizeWeeksParam: jest.fn((raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 6;
    return Math.min(12, Math.max(2, Math.trunc(n)));
  }),
}));
jest.mock('../../services/pivotLabEventsService', () => ({
  listPivotLabEvents: jest.fn(),
}));
jest.mock('../../services/pivotCurationJobService', () => ({
  listCurationJobs: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotConfigService', () => ({
  buildDropSchedulePayload: jest.fn(() => ({
    batchWeek: '2026-W28',
    nextDropAt: '2026-07-09T22:00:00.000Z',
    nextDropFormatted: 'Thu Jul 9, 6:00 PM EDT',
  })),
}));
jest.mock('../../utilities/pivotDropSchedule', () => {
  const actual = jest.requireActual('../../utilities/pivotDropSchedule');
  return {
    ...actual,
    resolvePivotDropInstant: jest.fn(),
  };
});

const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  getTenantOverview,
  getTenantEventPerformance,
} = require('../../services/pivotAdminOverviewService');
const { getTenantInsights } = require('../../services/pivotTenantInsightsService');
const { getBatchReadiness } = require('../../services/pivotBatchReadinessService');
const {
  getJourneyOverview,
  getJourneyFunnel,
} = require('../../services/pivotTenantJourneyService');
const { aggregateTenantRetention } = require('../../services/pivotRetentionService');
const { listPivotLabEvents } = require('../../services/pivotLabEventsService');
const { listCurationJobs } = require('../../services/pivotCurationJobService');
const { resolvePivotDropInstant } = require('../../utilities/pivotDropSchedule');
const {
  getTenantOpsBundle,
  parseInclude,
  resolveStageForWeek,
  curationSectionsForStage,
} = require('../../services/pivotTenantOpsService');

const TENANT = {
  tenantKey: 'nyc',
  location: 'New York',
  pivotPilot: true,
  pivotDropTimezone: 'America/New_York',
  pivotDropDayOfWeek: 4,
  pivotDropHour: 18,
  pivotDropMinute: 0,
};

describe('pivotTenantOpsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    // Drop already passed for current week → live = current, curate = next
    resolvePivotDropInstant.mockReturnValue({
      dropAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    getTenantOverview.mockResolvedValue({
      data: { tenantKey: 'nyc', batchWeek: '2026-W28', kpis: { activeUsers: 3 } },
    });
    getTenantEventPerformance.mockResolvedValue({
      data: { events: [{ eventId: 'e1' }] },
    });
    getTenantInsights.mockResolvedValue({ data: { insights: [] } });
    getBatchReadiness.mockResolvedValue({ data: { score: 80 } });
    getJourneyOverview.mockResolvedValue({
      data: { kpis: { medianCardsSeen: 4 } },
    });
    getJourneyFunnel.mockResolvedValue({ data: { steps: [] } });
    aggregateTenantRetention.mockResolvedValue({
      tenantKey: 'nyc',
      weeks: [{ batchWeek: '2026-W28', activeUsers: 3 }],
    });
    listPivotLabEvents.mockResolvedValue({ data: { events: [] } });
    listCurationJobs.mockResolvedValue({ data: { jobs: [] } });
  });

  describe('parseInclude', () => {
    it('expands overview preset', () => {
      expect(parseInclude('overview').sections).toEqual([
        'overview',
        'performance',
        'insights',
        'readiness',
        'retention',
      ]);
    });

    it('expands curation by stage', () => {
      expect(parseInclude('curation', { stage: 'live' }).sections).toEqual([
        'overview',
        'performance',
        'journey',
        'readiness',
        'catalog',
        'jobs',
      ]);
      expect(parseInclude('curation', { stage: 'curate' }).sections).toEqual([
        'overview',
        'readiness',
        'catalog',
        'jobs',
      ]);
    });

    it('rejects unknown sections', () => {
      expect(parseInclude('nope').code).toBe('INVALID_INCLUDE');
    });
  });

  describe('resolveStageForWeek', () => {
    it('classifies past / live / future relative to drop-cycle live week', () => {
      expect(resolveStageForWeek('2026-W27', TENANT, new Date('2026-07-13T22:00:00.000Z'))).toBe(
        'post-mortem',
      );
      expect(resolveStageForWeek('2026-W28', TENANT, new Date('2026-07-13T22:00:00.000Z'))).toBe(
        'live',
      );
      expect(resolveStageForWeek('2026-W29', TENANT, new Date('2026-07-13T22:00:00.000Z'))).toBe(
        'curate',
      );
    });

    it('treats the drop-cycle live week as live after the drop instant', () => {
      expect(
        resolveStageForWeek('2026-W29', TENANT, new Date('2026-07-17T23:00:00.000Z')),
      ).toBe('live');
    });
  });

  describe('curationSectionsForStage', () => {
    it('returns monitor-only sections for post-mortem', () => {
      expect(curationSectionsForStage('post-mortem')).toEqual([
        'overview',
        'performance',
        'journey',
      ]);
    });

    it('returns monitor plus publish sections for live', () => {
      expect(curationSectionsForStage('live')).toContain('catalog');
      expect(curationSectionsForStage('live')).toContain('performance');
    });
  });

  describe('getTenantOpsBundle', () => {
    it('loads overview preset sections in parallel', async () => {
      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          include: 'overview',
          now: new Date('2026-07-10T18:00:00.000Z'),
        },
      );

      expect(result.data.tenantKey).toBe('nyc');
      expect(result.data.batchWeek).toBe('2026-W28');
      expect(result.data.stage).toBeTruthy();
      expect(result.data.anchors.liveWeek).toBe('2026-W28');
      expect(result.data.anchors.curateWeek).toBe('2026-W29');
      expect(result.data.overview.kpis.activeUsers).toBe(3);
      expect(result.data.performance.events).toHaveLength(1);
      expect(result.data.retention.tenant.tenantKey).toBe('nyc');
      expect(getJourneyOverview).not.toHaveBeenCalled();
      expect(listCurationJobs).not.toHaveBeenCalled();
    });

    it('defaults omitted batchWeek to drop-gated live week before the drop instant', async () => {
      resolvePivotDropInstant.mockImplementation((_tenant, batchWeek) => ({
        dropAt:
          batchWeek === '2026-W29'
            ? new Date('2099-01-01T00:00:00.000Z')
            : new Date('2020-01-01T00:00:00.000Z'),
      }));

      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          include: 'overview',
          now: new Date('2026-07-13T16:00:00.000Z'),
        },
      );

      expect(result.data.batchWeek).toBe('2026-W28');
      expect(result.data.anchors.liveWeek).toBe('2026-W28');
      expect(result.data.anchors.curateWeek).toBe('2026-W29');
      expect(result.data.anchors.dropPending).toBe(true);
    });

    it('loads journeys preset', async () => {
      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          include: 'journeys',
          now: new Date('2026-07-10T18:00:00.000Z'),
        },
      );

      expect(result.data.journey.kpis.medianCardsSeen).toBe(4);
      expect(result.data.funnel.steps).toEqual([]);
      expect(getTenantOverview).not.toHaveBeenCalled();
    });

    it('curation preset during release window loads catalog for the upcoming batch', async () => {
      resolvePivotDropInstant.mockReturnValue({
        dropAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W29',
          include: 'curation',
          now: new Date('2026-07-13T22:00:00.000Z'),
        },
      );

      expect(result.data.stage).toBe('curate');
      expect(result.data.releaseWindow).toBe(true);
      expect(result.data.catalog).toEqual({ events: [] });
      expect(result.data.jobs).toEqual({ jobs: [] });
      expect(getTenantEventPerformance).not.toHaveBeenCalled();
    });

    it('curation preset for the live drop-cycle week loads monitor and publish sections', async () => {
      resolvePivotDropInstant.mockReturnValue({
        dropAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          include: 'curation',
          now: new Date('2026-07-13T22:00:00.000Z'),
        },
      );

      expect(result.data.stage).toBe('live');
      expect(result.data.releaseWindow).toBe(false);
      expect(result.data.catalog).toEqual({ events: [] });
      expect(result.data.performance.events).toHaveLength(1);
      expect(getBatchReadiness).toHaveBeenCalled();
      expect(listCurationJobs).toHaveBeenCalled();
    });

    it('curation preset for a future week loads catalog + jobs', async () => {
      resolvePivotDropInstant.mockReturnValue({
        dropAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W29',
          include: 'curation',
          now: new Date('2026-07-06T12:00:00.000Z'),
        },
      );

      expect(result.data.stage).toBe('curate');
      expect(result.data.catalog).toEqual({ events: [] });
      expect(result.data.jobs).toEqual({ jobs: [] });
      expect(result.data.readiness.score).toBe(80);
      expect(getTenantEventPerformance).not.toHaveBeenCalled();
    });

    it('returns INCLUDE_REQUIRED when missing', async () => {
      const result = await getTenantOpsBundle(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W28' },
      );
      expect(result.code).toBe('INCLUDE_REQUIRED');
    });
  });
});
