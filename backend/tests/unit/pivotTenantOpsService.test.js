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
jest.mock('../../utilities/pivotDropSchedule', () => ({
  resolvePivotDropInstant: jest.fn(),
}));

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
    it('classifies past / live / future', () => {
      const anchors = { liveWeek: '2026-W28' };
      expect(resolveStageForWeek('2026-W27', anchors)).toBe('post-mortem');
      expect(resolveStageForWeek('2026-W28', anchors)).toBe('live');
      expect(resolveStageForWeek('2026-W29', anchors)).toBe('curate');
    });
  });

  describe('curationSectionsForStage', () => {
    it('returns monitor vs curate sections', () => {
      expect(curationSectionsForStage('post-mortem')).toContain('performance');
      expect(curationSectionsForStage('curate')).toContain('catalog');
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
      expect(result.data.anchors.liveWeek).toBeTruthy();
      expect(result.data.overview.kpis.activeUsers).toBe(3);
      expect(result.data.performance.events).toHaveLength(1);
      expect(result.data.retention.tenant.tenantKey).toBe('nyc');
      expect(getJourneyOverview).not.toHaveBeenCalled();
      expect(listCurationJobs).not.toHaveBeenCalled();
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

    it('curation preset for future week loads catalog + jobs', async () => {
      // Force live = W27 so W28 is curate
      resolvePivotDropInstant.mockReturnValue({
        dropAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      const result = await getTenantOpsBundle(
        { globalDb: {} },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          include: 'curation',
          now: new Date('2026-07-06T12:00:00.000Z'), // Monday of W28, drop still pending
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
