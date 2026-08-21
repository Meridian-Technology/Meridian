const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    req.user = {
      globalUserId: '507f191e810c19729de860ea',
      platformRoles: ['platform_admin'],
    };
    next();
  },
}));

jest.mock('../../middlewares/requirePlatformAdmin', () => ({
  requirePlatformAdmin: jest.fn((req, res, next) => next()),
}));

jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  rebuildWeeklySnapshot: jest.fn(),
  getWeeklySnapshot: jest.fn(),
}));

jest.mock('../../services/pivotAdminOverviewService', () => ({
  getPivotOverview: jest.fn(),
  getTenantOverview: jest.fn(),
  getTenantEventPerformance: jest.fn(),
}));

jest.mock('../../services/pivotTenantInsightsService', () => ({
  getTenantInsights: jest.fn(),
}));

jest.mock('../../services/pivotBatchReleaseService', () => ({
  releaseBatch: jest.fn(),
  unreleaseBatch: jest.fn(),
}));

jest.mock('../../services/pivotBatchReadinessService', () => ({
  getBatchReadiness: jest.fn(),
}));

jest.mock('../../services/pivotCurationJobService', () => ({
  listCurationJobs: jest.fn(),
  createCurationJob: jest.fn(),
  updateCurationJob: jest.fn(),
  deleteCurationJob: jest.fn(),
}));

jest.mock('../../services/pivotCurationRunService', () => ({
  startCurationJobRun: jest.fn(),
  getCurationRun: jest.fn(),
}));

jest.mock('../../services/pivotTenantJourneyService', () => ({
  getJourneyOverview: jest.fn(),
  getJourneyFunnel: jest.fn(),
  getJourneyPath: jest.fn(),
  searchJourneyUsers: jest.fn(),
  getUserJourneyHistory: jest.fn(),
  wipeUserWeekIntents: jest.fn(),
}));

jest.mock('../../services/pivotTenantOpsService', () => ({
  getTenantOpsBundle: jest.fn(),
}));

jest.mock('../../services/pivotFleetOpsService', () => ({
  getFleetOpsBundle: jest.fn(),
}));

jest.mock('../../services/pivotAdminDropDeckService', () => ({
  previewAdminDropDeck: jest.fn(),
}));

jest.mock('../../services/pivotRetentionService', () => ({
  getPivotRetention: jest.fn(),
}));

jest.mock('../../services/pivotLabEventsService', () => ({
  listPivotLabEvents: jest.fn(),
}));

jest.mock('../../services/pivotLabNotesService', () => ({
  getInterviewNotes: jest.fn(),
  saveInterviewNotes: jest.fn(),
}));

jest.mock('../../services/pivotIngestPreviewService', () => ({
  previewIngestUrl: jest.fn(),
}));

jest.mock('../../services/pivotIngestPublishService', () => ({
  publishIngestEvent: jest.fn(),
  updateIngestEvent: jest.fn(),
}));

jest.mock('../../services/pivotTagSuggestService', () => ({
  suggestPivotEventTags: jest.fn(),
  suggestPivotEventTagsBatch: jest.fn(),
  suggestAndApplyPivotEventTags: jest.fn(),
}));

jest.mock('../../services/pivotCatalogPurgeService', () => ({
  purgePivotCatalog: jest.fn(),
}));

jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
  seedPivotTagCatalog: jest.fn(),
}));

jest.mock('../../services/pivotSourceDiscoveryService', () => ({
  listCitySources: jest.fn(),
  startCitySourceDiscovery: jest.fn(),
  stopCitySourceDiscoveryRun: jest.fn(),
  previewCitySourceDiscovery: jest.fn(),
  updateCitySource: jest.fn(),
  updateCityDiscoveryConfig: jest.fn(),
  getCitySourceDiscoveryRun: jest.fn(),
  getLatestCitySourceDiscoveryRun: jest.fn(),
}));

jest.mock('../../services/pivotOrganizerBackfillService', () => ({
  backfillOrganizers: jest.fn(),
}));

jest.mock('../../services/pivotOrganizerCatalogService', () => ({
  listOrganizers: jest.fn(),
  getOrganizer: jest.fn(),
  listUnlinkedOrganizerEvents: jest.fn(),
  mergeOrganizers: jest.fn(),
  splitOrganizer: jest.fn(),
  claimOrganizer: jest.fn(),
}));

jest.mock('../../services/pivotCopyService', () => ({
  getCopyCatalog: jest.fn(),
  getCopyLayers: jest.fn(),
  getPlatformCopyLayers: jest.fn(),
  patchCopyPack: jest.fn(),
  resetCopyPack: jest.fn(),
}));

jest.mock('../../services/pivotLandingService', () => ({
  getTenantLaunchStats: jest.fn(),
  getFleetLaunchStats: jest.fn(),
  updateTenantLandingMode: jest.fn(),
}));

jest.mock('../../services/pivotLandingWaitlistService', () => ({
  listTenantWaitlist: jest.fn(),
  exportTenantWaitlistCsv: jest.fn(),
  deleteTenantWaitlistRow: jest.fn(),
}));

jest.mock('../../services/pivotLandingQrService', () => ({
  listTenantLandingQrs: jest.fn(),
  createTenantLandingQr: jest.fn(),
  updateLandingQr: jest.fn(),
  deactivateLandingQr: jest.fn(),
  wipeLandingQrScans: jest.fn(),
}));

const { requirePlatformAdmin } = require('../../middlewares/requirePlatformAdmin');
const {
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
} = require('../../services/pivotWeeklySnapshotService');
const {
  getPivotOverview,
  getTenantOverview,
  getTenantEventPerformance,
} = require('../../services/pivotAdminOverviewService');
const { getTenantInsights } = require('../../services/pivotTenantInsightsService');
const {
  releaseBatch,
  unreleaseBatch,
} = require('../../services/pivotBatchReleaseService');
const { getBatchReadiness } = require('../../services/pivotBatchReadinessService');
const {
  listCurationJobs,
  createCurationJob,
  updateCurationJob,
  deleteCurationJob,
} = require('../../services/pivotCurationJobService');
const {
  startCurationJobRun,
  getCurationRun,
} = require('../../services/pivotCurationRunService');
const {
  getJourneyOverview,
  getJourneyFunnel,
  getJourneyPath,
  searchJourneyUsers,
  getUserJourneyHistory,
  wipeUserWeekIntents,
} = require('../../services/pivotTenantJourneyService');
const { getTenantOpsBundle } = require('../../services/pivotTenantOpsService');
const { getFleetOpsBundle } = require('../../services/pivotFleetOpsService');
const { previewAdminDropDeck } = require('../../services/pivotAdminDropDeckService');
const { getPivotRetention } = require('../../services/pivotRetentionService');
const { listPivotLabEvents } = require('../../services/pivotLabEventsService');
const {
  getInterviewNotes,
  saveInterviewNotes,
} = require('../../services/pivotLabNotesService');
const { previewIngestUrl } = require('../../services/pivotIngestPreviewService');
const {
  publishIngestEvent,
  updateIngestEvent,
} = require('../../services/pivotIngestPublishService');
const {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
  suggestAndApplyPivotEventTags,
} = require('../../services/pivotTagSuggestService');
const { purgePivotCatalog } = require('../../services/pivotCatalogPurgeService');
const { listPivotTags, seedPivotTagCatalog } = require('../../services/pivotTagCatalogService');
const {
  updateCityDiscoveryConfig,
  previewCitySourceDiscovery,
  startCitySourceDiscovery,
} = require('../../services/pivotSourceDiscoveryService');
const { backfillOrganizers } = require('../../services/pivotOrganizerBackfillService');
const {
  listOrganizers,
  getOrganizer,
  listUnlinkedOrganizerEvents,
  mergeOrganizers,
  splitOrganizer,
  claimOrganizer,
} = require('../../services/pivotOrganizerCatalogService');
const {
  getCopyCatalog,
  getCopyLayers,
  getPlatformCopyLayers,
  patchCopyPack,
  resetCopyPack,
} = require('../../services/pivotCopyService');
const {
  getTenantLaunchStats,
  getFleetLaunchStats,
  updateTenantLandingMode,
} = require('../../services/pivotLandingService');
const {
  listTenantWaitlist,
  exportTenantWaitlistCsv,
  deleteTenantWaitlistRow,
} = require('../../services/pivotLandingWaitlistService');
const {
  listTenantLandingQrs,
  createTenantLandingQr,
  updateLandingQr,
  deactivateLandingQr,
  wipeLandingQrScans,
} = require('../../services/pivotLandingQrService');
const pivotAdminRoutes = require('../../routes/pivotAdminRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.globalDb = {};
    next();
  });
  app.use('/admin/pivot', pivotAdminRoutes);
  return app;
}

describe('pivotAdminRoutes snapshots', () => {
  beforeEach(() => {
    rebuildWeeklySnapshot.mockReset();
    getWeeklySnapshot.mockReset();
    getPivotOverview.mockReset();
    listPivotLabEvents.mockReset();
    getInterviewNotes.mockReset();
    saveInterviewNotes.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /admin/pivot/snapshots/rebuild returns snapshot payload', async () => {
    const generatedAt = new Date('2026-06-26T12:00:00.000Z');
    rebuildWeeklySnapshot.mockResolvedValue({
      data: {
        batchWeek: '2026-W26',
        generatedAt,
        tenants: [],
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/snapshots/rebuild')
      .send({ batchWeek: '2026-W26' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.batchWeek).toBe('2026-W26');
    expect(rebuildWeeklySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ batchWeek: '2026-W26' }),
    );
  });

  it('GET /admin/pivot/snapshots/:batchWeek returns stored snapshot with generatedAt', async () => {
    const generatedAt = new Date('2026-06-26T12:00:00.000Z');
    getWeeklySnapshot.mockResolvedValue({
      data: {
        batchWeek: '2026-W26',
        generatedAt,
        tenants: [{ tenantKey: 'nyc', eventCount: 3 }],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/snapshots/2026-W26');

    expect(response.status).toBe(200);
    expect(response.body.data.generatedAt).toBe(generatedAt.toISOString());
    expect(getWeeklySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ batchWeek: '2026-W26' }),
    );
  });

  it('GET /admin/pivot/snapshots/:batchWeek returns 404 when missing', async () => {
    getWeeklySnapshot.mockResolvedValue({
      error: 'No snapshot found for this batch week.',
      status: 404,
      code: 'SNAPSHOT_NOT_FOUND',
    });

    const response = await request(buildApp()).get('/admin/pivot/snapshots/2026-W99');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SNAPSHOT_NOT_FOUND');
  });
});

describe('pivotAdminRoutes overview', () => {
  beforeEach(() => {
    getPivotOverview.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/overview returns combined tenant rows', async () => {
    getPivotOverview.mockResolvedValue({
      data: {
        batchWeek: '2026-W26',
        snapshotGeneratedAt: new Date('2026-06-26T10:00:00.000Z'),
        tenants: [
          { tenantKey: 'nyc', eventCount: 3 },
          { tenantKey: 'brooklyn', eventCount: 1 },
        ],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/overview?batchWeek=2026-W26');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tenants).toHaveLength(2);
    expect(getPivotOverview).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ batchWeek: '2026-W26' }),
    );
  });

  it('GET /admin/pivot/overview returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/overview');
    expect(response.status).toBe(403);
    expect(getPivotOverview).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes fleet ops', () => {
  beforeEach(() => {
    getFleetOpsBundle.mockReset();
    getPivotOverview.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/ops returns rolled-up fleet payload', async () => {
    getFleetOpsBundle.mockResolvedValue({
      data: {
        cityDisplayName: 'All cities',
        batchWeek: '2026-W28',
        overview: { kpis: { activeUsers: 16 } },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/ops?batchWeek=2026-W28&include=overview',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.overview.kpis.activeUsers).toBe(16);
    expect(getFleetOpsBundle).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        batchWeek: '2026-W28',
        include: 'overview',
      }),
    );
    expect(getPivotOverview).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/ops returns 400 for invalid week', async () => {
    getFleetOpsBundle.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildApp()).get('/admin/pivot/ops?batchWeek=nope&include=overview');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
  });

  it('GET /admin/pivot/ops returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/ops?include=overview');
    expect(response.status).toBe(403);
    expect(getFleetOpsBundle).not.toHaveBeenCalled();
    expect(getPivotOverview).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes tenant overview + performance', () => {
  beforeEach(() => {
    getTenantOverview.mockReset();
    getTenantEventPerformance.mockReset();
    getTenantInsights.mockReset();
    getTenantOpsBundle.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/tenants/:tenantKey/ops returns bundled payload', async () => {
    getTenantOpsBundle.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        stage: 'live',
        include: ['overview', 'performance'],
        overview: { kpis: { activeUsers: 3 } },
        performance: { events: [] },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/ops?batchWeek=2026-W28&include=overview',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.stage).toBe('live');
    expect(getTenantOpsBundle).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        include: 'overview',
      }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/ops returns 400 when include missing', async () => {
    getTenantOpsBundle.mockResolvedValue({
      error: 'include is required (preset or comma-separated sections).',
      status: 400,
      code: 'INCLUDE_REQUIRED',
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/ops?batchWeek=2026-W28',
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INCLUDE_REQUIRED');
  });

  it('GET /admin/pivot/tenants/:tenantKey/overview returns one-tenant payload', async () => {
    getTenantOverview.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        kpis: { activeUsers: 3, eventCount: 2 },
        funnel: [{ key: 'swipes', value: 12 }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/overview?batchWeek=2026-W26',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tenantKey).toBe('nyc');
    expect(response.body.data.kpis.activeUsers).toBe(3);
    expect(getTenantOverview).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', batchWeek: '2026-W26' }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/overview returns 404 for unknown tenant', async () => {
    getTenantOverview.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/missing/overview');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET /admin/pivot/tenants/:tenantKey/overview returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/overview');
    expect(response.status).toBe(403);
    expect(getTenantOverview).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/tenants/:tenantKey/events/performance returns ranked events', async () => {
    getTenantEventPerformance.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        sortBy: 'interestedTotal',
        events: [{ eventId: 'e1', interestedTotal: 10 }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/events/performance?batchWeek=2026-W26&limit=5',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.sortBy).toBe('interestedTotal');
    expect(response.body.data.events).toHaveLength(1);
    expect(getTenantEventPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        limit: '5',
      }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/events/performance returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/events/performance',
    );
    expect(response.status).toBe(403);
    expect(getTenantEventPerformance).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/tenants/:tenantKey/insights returns insight cards', async () => {
    getTenantInsights.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        insights: [
          {
            id: 'untagged-events',
            severity: 'warn',
            title: 'Events missing tags',
            href: '/platform-admin/pivot/nyc?page=1&batchWeek=2026-W28&filter=untagged',
          },
        ],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/insights?batchWeek=2026-W28',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.insights).toHaveLength(1);
    expect(getTenantInsights).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', batchWeek: '2026-W28' }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/insights returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/insights');
    expect(response.status).toBe(403);
    expect(getTenantInsights).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes batch release', () => {
  beforeEach(() => {
    releaseBatch.mockReset();
    unreleaseBatch.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST .../batches/:batchWeek/release returns counts', async () => {
    releaseBatch.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        releasedCount: 5,
        skippedCount: 0,
        batchStatus: 'released',
        partial: false,
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/batches/2026-W28/release')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.releasedCount).toBe(5);
    expect(response.body.data.batchStatus).toBe('released');
    expect(releaseBatch).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
      }),
    );
  });

  it('POST .../batches/:batchWeek/release supports partial eventIds', async () => {
    releaseBatch.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        releasedCount: 1,
        skippedCount: 1,
        batchStatus: 'released',
        partial: true,
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/batches/2026-W28/release')
      .send({ eventIds: ['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346'] });

    expect(response.status).toBe(200);
    expect(response.body.data.partial).toBe(true);
    expect(releaseBatch).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventIds: ['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346'],
      }),
    );
  });

  it('POST .../batches/:batchWeek/release returns 404 for unknown tenant', async () => {
    releaseBatch.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/missing/batches/2026-W28/release')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('POST .../batches/:batchWeek/release returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/batches/2026-W28/release')
      .send({});

    expect(response.status).toBe(403);
    expect(releaseBatch).not.toHaveBeenCalled();
  });

  it('POST .../batches/:batchWeek/unrelease requires confirm and returns warning', async () => {
    unreleaseBatch.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        unreleasedCount: 3,
        skippedCount: 0,
        batchStatus: 'curating',
        remainingPublished: 0,
        warning: 'Unrelease removes events from the live feed.',
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/batches/2026-W28/unrelease')
      .send({ confirm: 'UNRELEASE' });

    expect(response.status).toBe(200);
    expect(response.body.data.unreleasedCount).toBe(3);
    expect(response.body.data.warning).toMatch(/live feed/i);
    expect(unreleaseBatch).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        confirm: 'UNRELEASE',
      }),
    );
  });

  it('POST .../batches/:batchWeek/unrelease returns CONFIRMATION_REQUIRED', async () => {
    unreleaseBatch.mockResolvedValue({
      error: 'Type UNRELEASE to confirm.',
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/batches/2026-W28/unrelease')
      .send({ confirm: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CONFIRMATION_REQUIRED');
  });
});

describe('pivotAdminRoutes batch readiness', () => {
  beforeEach(() => {
    getBatchReadiness.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET .../batches/:batchWeek/readiness returns score payload', async () => {
    getBatchReadiness.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        score: 72,
        targetEventCount: 40,
        components: [{ key: 'eventCount', value: 28, status: 'below' }],
        ctas: [{ id: 'add-events', label: 'Add 12 more events' }],
        formula: { version: 'v0' },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/batches/2026-W28/readiness',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.score).toBe(72);
    expect(response.body.data.formula.version).toBe('v0');
    expect(getBatchReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
      }),
    );
  });

  it('GET readiness returns 404 for unknown tenant', async () => {
    getBatchReadiness.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/missing/batches/2026-W28/readiness',
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET readiness returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/batches/2026-W28/readiness',
    );

    expect(response.status).toBe(403);
    expect(getBatchReadiness).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes curation-jobs', () => {
  const JOB_ID = '665a1b2c3d4e5f6789012345';

  beforeEach(() => {
    listCurationJobs.mockReset();
    createCurationJob.mockReset();
    updateCurationJob.mockReset();
    deleteCurationJob.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/curation-jobs lists jobs for one city', async () => {
    listCurationJobs.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        jobs: [
          {
            _id: JOB_ID,
            tenantKey: 'nyc',
            label: 'Partiful explore',
            provider: 'partiful',
          },
        ],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/curation-jobs',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.jobs).toHaveLength(1);
    expect(listCurationJobs).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc' }),
    );
  });

  it('GET /tenants/:tenantKey/curation-jobs returns 404 for unknown tenant', async () => {
    listCurationJobs.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/missing/curation-jobs',
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('POST /tenants/:tenantKey/curation-jobs creates a job', async () => {
    createCurationJob.mockResolvedValue({
      data: {
        job: {
          _id: JOB_ID,
          tenantKey: 'nyc',
          label: 'Partiful explore',
          url: 'https://partiful.com/explore/brooklyn',
          provider: 'partiful',
        },
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/curation-jobs')
      .send({
        label: 'Partiful explore',
        url: 'https://partiful.com/explore/brooklyn',
        provider: 'partiful',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.job._id).toBe(JOB_ID);
    expect(createCurationJob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tenantKey: 'nyc',
        label: 'Partiful explore',
        url: 'https://partiful.com/explore/brooklyn',
        provider: 'partiful',
      }),
    );
  });

  it('POST /tenants/:tenantKey/curation-jobs rejects unsupported hosts', async () => {
    createCurationJob.mockResolvedValue({
      error: 'URL must be a Partiful or Luma event or explore link.',
      status: 400,
      code: 'UNSUPPORTED_HOST',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/curation-jobs')
      .send({
        label: 'Bad',
        url: 'https://example.com/x',
        provider: 'partiful',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_HOST');
  });

  it('PATCH /tenants/:tenantKey/curation-jobs/:jobId updates a job', async () => {
    updateCurationJob.mockResolvedValue({
      data: {
        job: {
          _id: JOB_ID,
          tenantKey: 'nyc',
          label: 'Renamed',
          enabled: false,
        },
      },
    });

    const response = await request(buildApp())
      .patch(`/admin/pivot/tenants/nyc/curation-jobs/${JOB_ID}`)
      .send({ label: 'Renamed', enabled: false });

    expect(response.status).toBe(200);
    expect(response.body.data.job.label).toBe('Renamed');
    expect(updateCurationJob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tenantKey: 'nyc',
        jobId: JOB_ID,
        label: 'Renamed',
        enabled: false,
      }),
    );
  });

  it('DELETE /tenants/:tenantKey/curation-jobs/:jobId is idempotent', async () => {
    deleteCurationJob.mockResolvedValue({
      data: { tenantKey: 'nyc', jobId: JOB_ID, deleted: false },
    });

    const response = await request(buildApp()).delete(
      `/admin/pivot/tenants/nyc/curation-jobs/${JOB_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(false);
    expect(deleteCurationJob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ tenantKey: 'nyc', jobId: JOB_ID }),
    );
  });

  it('curation-jobs routes return 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/curation-jobs',
    );

    expect(response.status).toBe(403);
    expect(listCurationJobs).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes curation-runs', () => {
  const JOB_ID = '665a1b2c3d4e5f6789012345';
  const RUN_ID = '665a1b2c3d4e5f6789012999';

  beforeEach(() => {
    startCurationJobRun.mockReset();
    getCurationRun.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /tenants/:tenantKey/curation-jobs/:jobId/run starts a queued run', async () => {
    startCurationJobRun.mockResolvedValue({
      data: {
        run: {
          _id: RUN_ID,
          tenantKey: 'nyc',
          jobId: JOB_ID,
          batchWeek: '2026-W28',
          status: 'queued',
          maxEvents: 120,
        },
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/curation-jobs/${JOB_ID}/run`)
      .send({ batchWeek: '2026-W28', maxEvents: 120 });

    expect(response.status).toBe(200);
    expect(response.body.data.run.status).toBe('queued');
    expect(startCurationJobRun).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
        maxEvents: 120,
      }),
    );
  });

  it('GET /tenants/:tenantKey/curation-runs/:runId returns run status', async () => {
    getCurationRun.mockResolvedValue({
      data: {
        run: {
          _id: RUN_ID,
          tenantKey: 'nyc',
          status: 'running',
          stats: { discovered: 40, upserted: 12, skipped: 1, failed: 0 },
        },
      },
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/curation-runs/${RUN_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.run.status).toBe('running');
    expect(getCurationRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ tenantKey: 'nyc', runId: RUN_ID }),
    );
  });

  it('GET curation-runs returns 404 for unknown run', async () => {
    getCurationRun.mockResolvedValue({
      error: 'Curation run not found.',
      status: 404,
      code: 'RUN_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/curation-runs/${RUN_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RUN_NOT_FOUND');
  });

  it('POST run returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/curation-jobs/${JOB_ID}/run`)
      .send({ batchWeek: '2026-W28' });

    expect(response.status).toBe(403);
    expect(startCurationJobRun).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes retention', () => {
  beforeEach(() => {
    getPivotRetention.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/retention returns week-over-week rows', async () => {
    getPivotRetention.mockResolvedValue({
      data: {
        batchWeek: '2026-W27',
        weeks: ['2026-W26', '2026-W27'],
        tenants: [
          {
            tenantKey: 'nyc',
            cityDisplayName: 'New York City',
            weeks: [
              { batchWeek: '2026-W26', activeUsers: 4, returningUsers: null, retentionRate: null },
              { batchWeek: '2026-W27', activeUsers: 3, returningUsers: 2, retentionRate: 50 },
            ],
          },
        ],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/retention?batchWeek=2026-W27&weeks=2',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tenants[0].weeks[1].retentionRate).toBe(50);
    expect(getPivotRetention).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ batchWeek: '2026-W27', weeks: '2' }),
    );
  });

  it('GET /admin/pivot/retention surfaces service errors', async () => {
    getPivotRetention.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildApp()).get('/admin/pivot/retention?batchWeek=bad');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
  });
});

describe('pivotAdminRoutes lab', () => {
  beforeEach(() => {
    listPivotLabEvents.mockReset();
    getInterviewNotes.mockReset();
    saveInterviewNotes.mockReset();
    previewIngestUrl.mockReset();
    publishIngestEvent.mockReset();
    updateIngestEvent.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/events returns catalog rows', async () => {
    listPivotLabEvents.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        events: [{ _id: '1', name: 'Test Event' }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/events?tenantKey=nyc&batchWeek=2026-W26',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.events).toHaveLength(1);
  });

  it('GET /admin/pivot/interview-notes returns notes doc', async () => {
    getInterviewNotes.mockResolvedValue({
      data: { batchWeek: '2026-W26', notes: 'Pilot themes' },
    });

    const response = await request(buildApp()).get('/admin/pivot/interview-notes?batchWeek=2026-W26');
    expect(response.status).toBe(200);
    expect(response.body.data.notes).toBe('Pilot themes');
  });

  it('PUT /admin/pivot/interview-notes saves notes', async () => {
    saveInterviewNotes.mockResolvedValue({
      data: { batchWeek: '2026-W26', notes: 'Updated' },
    });

    const response = await request(buildApp())
      .put('/admin/pivot/interview-notes')
      .send({ batchWeek: '2026-W26', notes: 'Updated' });

    expect(response.status).toBe(200);
    expect(saveInterviewNotes).toHaveBeenCalled();
  });

  it('POST /admin/pivot/ingest/preview returns draft payload', async () => {
    previewIngestUrl.mockResolvedValue({
      data: {
        mode: 'single',
        draft: {
          name: 'Sunset Listening Party',
          hostName: 'Brooklyn Board Game Cafe',
          source: 'partiful',
        },
        warnings: [],
        provider: 'partiful',
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/preview')
      .send({ url: 'https://partiful.com/e/sunset-listening' });

    expect(response.status).toBe(200);
    expect(response.body.data.draft.hostName).toBe('Brooklyn Board Game Cafe');
    expect(previewIngestUrl).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        url: 'https://partiful.com/e/sunset-listening',
        tenantKey: undefined,
      }),
    );
  });

  it('POST /admin/pivot/ingest/preview forwards tenantKey for duplicate checks', async () => {
    previewIngestUrl.mockResolvedValue({
      data: {
        mode: 'single',
        draft: { name: 'Test Event' },
        warnings: [],
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/preview')
      .send({
        url: 'https://partiful.com/e/sunset-listening',
        tenantKey: 'nyc',
      });

    expect(response.status).toBe(200);
    expect(previewIngestUrl).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        url: 'https://partiful.com/e/sunset-listening',
        tenantKey: 'nyc',
      }),
    );
  });

  it('POST /admin/pivot/ingest/preview returns 400 for invalid URL', async () => {
    previewIngestUrl.mockResolvedValue({
      error: 'Invalid URL.',
      status: 400,
      code: 'INVALID_URL',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/preview')
      .send({ url: 'not-a-url' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_URL');
  });

  it('POST /admin/pivot/ingest publishes catalog event', async () => {
    publishIngestEvent.mockResolvedValue({
      data: {
        event: {
          _id: '507f1f77bcf86cd799439012',
          organizerName: 'Brooklyn Board Game Cafe',
        },
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest')
      .send({
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe' },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.event.organizerName).toBe('Brooklyn Board Game Cafe');
  });

  it('PATCH /admin/pivot/ingest/:eventId updates host overrides', async () => {
    updateIngestEvent.mockResolvedValue({
      data: {
        event: {
          _id: '507f1f77bcf86cd799439012',
          organizerName: 'Updated Host',
        },
      },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/ingest/507f1f77bcf86cd799439012')
      .send({
        tenantKey: 'nyc',
        overrides: { hostName: 'Updated Host' },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.event.organizerName).toBe('Updated Host');
  });
});

describe('pivotAdminRoutes GET /admin/pivot/tags', () => {
  beforeEach(() => {
    listPivotTags.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('returns catalog tags for platform admin', async () => {
    listPivotTags.mockResolvedValue({
      data: {
        tags: [
          { slug: 'live-music', label: 'live music' },
          { slug: 'board-games', label: 'board games' },
        ],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/tags');

    expect(response.status).toBe(200);
    expect(response.body.data.tags).toHaveLength(2);
    expect(listPivotTags).toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes POST /admin/pivot/tags/seed', () => {
  beforeEach(() => {
    seedPivotTagCatalog.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('seeds catalog tags for platform admin', async () => {
    seedPivotTagCatalog.mockResolvedValue({
      data: {
        upserted: 18,
        activeCount: 18,
        totalCount: 18,
        legacyNotInSeed: 0,
        tags: [{ slug: 'live-music', label: 'live music' }],
      },
    });

    const response = await request(buildApp()).post('/admin/pivot/tags/seed').send({});

    expect(response.status).toBe(200);
    expect(response.body.data.upserted).toBe(18);
    expect(seedPivotTagCatalog).toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes POST /admin/pivot/ingest/suggest-tags', () => {
  beforeEach(() => {
    suggestPivotEventTags.mockReset();
    suggestPivotEventTagsBatch.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('returns suggested tags for a single event draft', async () => {
    suggestPivotEventTags.mockResolvedValue({
      data: { tags: ['live-music'], model: 'claude-sonnet-4-6' },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/suggest-tags')
      .send({ event: { name: 'Sunset Listening Party' } });

    expect(response.status).toBe(200);
    expect(response.body.data.tags).toEqual(['live-music']);
  });

  it('returns batch suggestions when events array is provided', async () => {
    suggestPivotEventTagsBatch.mockResolvedValue({
      data: {
        suggestions: [{ tags: ['board-games'] }],
        failures: [],
        suggestedCount: 1,
        failedCount: 0,
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/suggest-tags')
      .send({ events: [{ name: 'Game Night' }] });

    expect(response.status).toBe(200);
    expect(response.body.data.suggestions).toHaveLength(1);
    expect(suggestPivotEventTagsBatch).toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes POST /admin/pivot/ingest/suggest-and-apply-tags', () => {
  beforeEach(() => {
    suggestAndApplyPivotEventTags.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('applies suggested tags server-side', async () => {
    suggestAndApplyPivotEventTags.mockResolvedValue({
      data: { attempted: 2, updated: 2, failed: 0, skipped: 0, results: [] },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/ingest/suggest-and-apply-tags')
      .send({ tenantKey: 'nyc', eventIds: ['a', 'b'], onlyTagless: true });

    expect(response.status).toBe(200);
    expect(response.body.data.updated).toBe(2);
    expect(suggestAndApplyPivotEventTags).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantKey: 'nyc',
        eventIds: ['a', 'b'],
        onlyTagless: true,
      }),
    );
  });
});

describe('pivotAdminRoutes dev purge', () => {
  beforeEach(() => {
    purgePivotCatalog.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /admin/pivot/dev/purge-catalog returns deleted counts', async () => {
    purgePivotCatalog.mockResolvedValue({
      data: {
        tenants: [{ tenantKey: 'nyc', deleted: { events: 5, intents: 12 } }],
        totals: { events: 5, intents: 12, weeklySnapshots: 1 },
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/dev/purge-catalog')
      .send({ confirm: 'PURGE', tenantKey: 'nyc' });

    expect(response.status).toBe(200);
    expect(response.body.data.totals.events).toBe(5);
    expect(purgePivotCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ confirm: 'PURGE', tenantKey: 'nyc' }),
    );
  });

  it('POST /admin/pivot/dev/purge-catalog returns service error status', async () => {
    purgePivotCatalog.mockResolvedValue({
      error: 'Not available in production.',
      status: 404,
      code: 'NOT_FOUND',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/dev/purge-catalog')
      .send({ confirm: 'PURGE' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

describe('pivotAdminRoutes journeys', () => {
  const USER_ID = '507f191e810c19729de860eb';

  beforeEach(() => {
    getJourneyOverview.mockReset();
    getJourneyFunnel.mockReset();
    getJourneyPath.mockReset();
    searchJourneyUsers.mockReset();
    getUserJourneyHistory.mockReset();
    wipeUserWeekIntents.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/journeys/overview returns compact KPIs', async () => {
    getJourneyOverview.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        kpis: { activeUsers: 10, medianCardsSeen: 5 },
        funnel: [{ key: 'swipes', value: 40 }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/journeys/overview?batchWeek=2026-W28',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.kpis.activeUsers).toBe(10);
    expect(getJourneyOverview).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', batchWeek: '2026-W28' }),
    );
  });

  it('GET /tenants/:tenantKey/journeys/funnel returns pivot-named steps', async () => {
    getJourneyFunnel.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        steps: [
          { key: 'deck_open', event: 'pivot_card_view', count: 10 },
          { key: 'card_interested', event: 'pivot_card_interested', count: 6 },
          { key: 'external_open', event: 'pivot_external_open', count: 3 },
          { key: 'registered', event: 'pivot_confirm_registered', count: 1 },
        ],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/journeys/funnel?batchWeek=2026-W28',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.steps).toHaveLength(4);
    expect(response.body.data.steps[0].event).toBe('pivot_card_view');
  });

  it('GET /tenants/:tenantKey/journeys/path returns thin next-steps', async () => {
    getJourneyPath.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        startingPoint: 'pivot_card_view',
        startCount: 12,
        nextSteps: [{ event: 'pivot_card_interested', count: 7 }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/journeys/path?batchWeek=2026-W28&startingPoint=deck_open',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.nextSteps[0].event).toBe('pivot_card_interested');
    expect(getJourneyPath).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startingPoint: 'deck_open' }),
    );
  });

  it('GET /tenants/:tenantKey/journeys/users searches by query', async () => {
    searchJourneyUsers.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        users: [{ userId: USER_ID, name: 'Ada', intentCount: 2 }],
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/journeys/users?query=Ada&batchWeek=2026-W28',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.users[0].name).toBe('Ada');
    expect(searchJourneyUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ query: 'Ada', batchWeek: '2026-W28' }),
    );
  });

  it('GET /tenants/:tenantKey/journeys/users/:userId/history returns intents', async () => {
    getUserJourneyHistory.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        user: { userId: USER_ID, name: 'Ada' },
        intents: [{ eventId: '665a1b2c3d4e5f6789012345', status: 'interested' }],
        analytics: [],
      },
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/journeys/users/${USER_ID}/history?batchWeek=2026-W28`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.intents).toHaveLength(1);
    expect(getUserJourneyHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER_ID, batchWeek: '2026-W28' }),
    );
  });

  it('POST /tenants/:tenantKey/users/:userId/wipe-week wipes with confirm', async () => {
    wipeUserWeekIntents.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        userId: USER_ID,
        batchWeek: '2026-W28',
        deletedCount: 3,
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/users/${USER_ID}/wipe-week`)
      .send({ batchWeek: '2026-W28', confirm: 'WIPE' });

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCount).toBe(3);
    expect(wipeUserWeekIntents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        batchWeek: '2026-W28',
        confirm: 'WIPE',
      }),
    );
  });

  it('POST wipe-week returns CONFIRM_REQUIRED when confirm missing', async () => {
    wipeUserWeekIntents.mockResolvedValue({
      error: 'Confirmation required. Send confirm: "WIPE".',
      status: 400,
      code: 'CONFIRM_REQUIRED',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/users/${USER_ID}/wipe-week`)
      .send({ batchWeek: '2026-W28' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CONFIRM_REQUIRED');
  });

  it('GET journeys/funnel returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/journeys/funnel',
    );

    expect(response.status).toBe(403);
    expect(getJourneyFunnel).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes drop deck preview', () => {
  const USER_ID = '507f191e810c19729de860eb';

  beforeEach(() => {
    previewAdminDropDeck.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/drop-deck/preview returns the scored deck', async () => {
    previewAdminDropDeck.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        user: { userId: USER_ID, name: 'Ada' },
        rebuild: false,
        frozen: true,
        batchWeek: '2026-W28',
        events: [{ _id: '665a000000000000000000a1', name: 'Jazz Night', dropDeckScore: { total: 2.2 } }],
      },
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/drop-deck/preview?userId=${USER_ID}&batchWeek=2026-W28`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.frozen).toBe(true);
    expect(response.body.data.events).toHaveLength(1);
    expect(previewAdminDropDeck).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        userId: USER_ID,
        batchWeek: '2026-W28',
      }),
    );
  });

  it('GET /tenants/:tenantKey/drop-deck/preview passes rebuild and service errors', async () => {
    previewAdminDropDeck.mockResolvedValue({
      error: 'User not found in this city.',
      status: 404,
      code: 'USER_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/drop-deck/preview?userId=${USER_ID}&rebuild=true`,
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('USER_NOT_FOUND');
    expect(previewAdminDropDeck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER_ID, rebuild: 'true' }),
    );
  });
});

describe('pivotAdminRoutes discovery-config', () => {
  beforeEach(() => {
    updateCityDiscoveryConfig.mockReset();
    previewCitySourceDiscovery.mockReset();
    startCitySourceDiscovery.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('PATCH /tenants/:tenantKey/sources/discovery-config saves a flow patch', async () => {
    updateCityDiscoveryConfig.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        discovery: {
          flow: 'native-only',
          lumaSlug: 'nyc',
          runFirecrawl: false,
          maxOutboundCalls: 0,
        },
      },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/sources/discovery-config')
      .send({ flow: 'native-only' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.discovery.flow).toBe('native-only');
    expect(updateCityDiscoveryConfig).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', flow: 'native-only' }),
    );
  });

  it('PATCH /tenants/:tenantKey/sources/discovery-config rejects a bad flow', async () => {
    updateCityDiscoveryConfig.mockResolvedValue({
      error: 'flow must be one of: native-then-firecrawl, native-only, firecrawl-only.',
      status: 400,
      code: 'INVALID_DISCOVERY_FLOW',
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/sources/discovery-config')
      .send({ flow: 'agentic' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_DISCOVERY_FLOW');
  });

  it('PATCH /tenants/:tenantKey/sources/discovery-config returns NO_CHANGES', async () => {
    updateCityDiscoveryConfig.mockResolvedValue({
      error: 'No discovery config changes.',
      status: 400,
      code: 'NO_CHANGES',
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/sources/discovery-config')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NO_CHANGES');
  });

  it('GET /tenants/:tenantKey/sources/discovery-plan returns a native-only zero-credit plan', async () => {
    previewCitySourceDiscovery.mockResolvedValue({
      data: {
        plan: {
          flow: 'native-only',
          runFirecrawl: false,
          maxOutboundCalls: 0,
          queries: 0,
        },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/sources/discovery-plan?flow=native-only',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.plan.maxOutboundCalls).toBe(0);
    expect(response.body.data.plan.runFirecrawl).toBe(false);
  });

  it('POST /tenants/:tenantKey/sources/discover still 503s hybrid without a scrape key', async () => {
    startCitySourceDiscovery.mockResolvedValue({
      error:
        'Website scraping is not configured. Set FIRECRAWL_API_KEY in the backend environment to run generic-site curation jobs.',
      status: 503,
      code: 'SITE_SCRAPE_NOT_CONFIGURED',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/sources/discover')
      .send({ flow: 'native-then-firecrawl' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
  });
});

describe('pivotAdminRoutes organizer list', () => {
  beforeEach(() => {
    listOrganizers.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/organizers returns the city catalog', async () => {
    listOrganizers.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        organizers: [
          {
            id: '507f1f77bcf86cd799439011',
            canonicalName: 'Alice Chen',
            aliases: ['Alice'],
            providers: ['partiful'],
            eventCount: 4,
            weeksActive: ['2026-W33', '2026-W30'],
            claimStatus: 'unclaimed',
            imageUrl: null,
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        sort: 'events',
        audience: 'detail-only',
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/organizers?q=alice&sort=events',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.organizers).toHaveLength(1);
    expect(response.body.data.audience).toBe('detail-only');
    expect(listOrganizers).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        q: 'alice',
        sort: 'events',
      }),
    );
  });

  it('GET /tenants/:tenantKey/organizers returns 404 for unknown tenant', async () => {
    listOrganizers.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/missing/organizers');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET /tenants/:tenantKey/organizers returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/organizers');
    expect(response.status).toBe(403);
    expect(listOrganizers).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes organizer unlinked', () => {
  beforeEach(() => {
    listUnlinkedOrganizerEvents.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/organizers/unlinked returns leftovers and proposals', async () => {
    listUnlinkedOrganizerEvents.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        events: [
          {
            id: 'evt-1',
            name: 'Soup night',
            hostName: 'Alice & Bob',
            kind: 'leftover',
            batchWeek: '2026-W30',
          },
        ],
        total: 1,
        leftover: 1,
        ambiguous: 0,
        proposals: [],
        lastBackfill: { linked: 6, ambiguous: 1, unlinked: 2 },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/organizers/unlinked?kind=leftover',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.events[0].kind).toBe('leftover');
    expect(listUnlinkedOrganizerEvents).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', kind: 'leftover' }),
    );
  });

  it('GET unlinked returns 404 for unknown tenant', async () => {
    listUnlinkedOrganizerEvents.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/missing/organizers/unlinked',
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET unlinked returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/organizers/unlinked',
    );
    expect(response.status).toBe(403);
    expect(listUnlinkedOrganizerEvents).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes organizer detail', () => {
  const organizerId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    getOrganizer.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/organizers/:organizerId returns the dossier', async () => {
    getOrganizer.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        organizer: { id: organizerId, canonicalName: 'Alice Chen' },
        events: [{ id: 'evt-1', name: 'August set', batchWeek: '2026-W33' }],
        audience: {
          interested: 2,
          registered: 1,
          passed: 1,
          externalOpens: 3,
          repeatUsers: 1,
        },
      },
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/organizers/${organizerId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.audience.interested).toBe(2);
    expect(getOrganizer).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', organizerId }),
    );
  });

  it('GET detail returns 404 when the organizer is missing', async () => {
    getOrganizer.mockResolvedValue({
      error: 'Organizer not found.',
      status: 404,
      code: 'ORGANIZER_NOT_FOUND',
    });

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/organizers/${organizerId}`,
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ORGANIZER_NOT_FOUND');
  });

  it('GET detail returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get(
      `/admin/pivot/tenants/nyc/organizers/${organizerId}`,
    );
    expect(response.status).toBe(403);
    expect(getOrganizer).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes organizer backfill', () => {
  beforeEach(() => {
    backfillOrganizers.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /tenants/:tenantKey/organizers/backfill returns outcome counts', async () => {
    backfillOrganizers.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        scanned: 10,
        linked: 6,
        skipped: 2,
        ambiguous: 1,
        unlinked: 1,
        createdOrganizers: 4,
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/organizers/backfill')
      .send({ force: false });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.linked).toBe(6);
    expect(response.body.data.createdOrganizers).toBe(4);
    expect(backfillOrganizers).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc', force: false }),
    );
  });

  it('POST /tenants/:tenantKey/organizers/backfill returns 404 for unknown tenant', async () => {
    backfillOrganizers.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/missing/organizers/backfill')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('POST /tenants/:tenantKey/organizers/backfill returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).post(
      '/admin/pivot/tenants/nyc/organizers/backfill',
    );
    expect(response.status).toBe(403);
    expect(backfillOrganizers).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes organizer merge / split', () => {
  const targetId = '507f1f77bcf86cd799439011';
  const sourceId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    mergeOrganizers.mockReset();
    splitOrganizer.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /tenants/:tenantKey/organizers/:organizerId/merge returns the rewritten target', async () => {
    mergeOrganizers.mockResolvedValue({
      data: {
        alreadyMerged: false,
        eventsRewritten: 3,
        target: { id: targetId, canonicalName: 'Alice Chen' },
        source: { id: sourceId, status: 'merged', mergedInto: targetId },
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/merge`)
      .send({ sourceOrganizerId: sourceId });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.eventsRewritten).toBe(3);
    expect(mergeOrganizers).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        organizerId: targetId,
        sourceOrganizerId: sourceId,
      }),
    );
  });

  it('POST merge returns 409 when two claimed organizers conflict', async () => {
    mergeOrganizers.mockResolvedValue({
      error: 'Cannot merge two organizers claimed by different users.',
      status: 409,
      code: 'ORGANIZER_ALREADY_CLAIMED',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/merge`)
      .send({ sourceOrganizerId: sourceId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORGANIZER_ALREADY_CLAIMED');
  });

  it('POST merge returns 404 when an organizer is missing', async () => {
    mergeOrganizers.mockResolvedValue({
      error: 'Organizer not found.',
      status: 404,
      code: 'ORGANIZER_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/merge`)
      .send({ sourceOrganizerId: sourceId });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ORGANIZER_NOT_FOUND');
  });

  it('POST merge returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/merge`)
      .send({ sourceOrganizerId: sourceId });

    expect(response.status).toBe(403);
    expect(mergeOrganizers).not.toHaveBeenCalled();
  });

  it('POST /tenants/:tenantKey/organizers/:organizerId/split returns the new organizer', async () => {
    splitOrganizer.mockResolvedValue({
      data: {
        eventsRewritten: 1,
        created: { id: sourceId, canonicalName: 'Alice Partiful' },
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/split`)
      .send({ eventIds: ['507f1f77bcf86cd799439099'], newCanonicalName: 'Alice Partiful' });

    expect(response.status).toBe(200);
    expect(response.body.data.created.canonicalName).toBe('Alice Partiful');
    expect(splitOrganizer).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        organizerId: targetId,
        eventIds: ['507f1f77bcf86cd799439099'],
        newCanonicalName: 'Alice Partiful',
      }),
    );
  });

  it('POST split returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${targetId}/split`)
      .send({ eventIds: ['507f1f77bcf86cd799439099'] });

    expect(response.status).toBe(403);
    expect(splitOrganizer).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes organizer claim', () => {
  const organizerId = '507f1f77bcf86cd799439011';
  const globalUserId = '507f191e810c19729de860ea';

  beforeEach(() => {
    claimOrganizer.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('POST /tenants/:tenantKey/organizers/:organizerId/claim attaches the grant user', async () => {
    claimOrganizer.mockResolvedValue({
      data: {
        alreadyClaimed: false,
        organizer: {
          id: organizerId,
          claimStatus: 'claimed',
          claimedByUserId: globalUserId,
        },
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ globalUserId });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.organizer.claimStatus).toBe('claimed');
    expect(claimOrganizer).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        organizerId,
        globalUserId,
        unclaim: false,
      }),
    );
  });

  it('POST claim returns 409 when another user already claimed', async () => {
    claimOrganizer.mockResolvedValue({
      error: 'Organizer is already claimed by another user.',
      status: 409,
      code: 'ORGANIZER_ALREADY_CLAIMED',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ globalUserId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORGANIZER_ALREADY_CLAIMED');
  });

  it('POST claim returns 409 when the user has no active grant', async () => {
    claimOrganizer.mockResolvedValue({
      error: 'An active creator grant is required for this user and city.',
      status: 409,
      code: 'CREATOR_GRANT_REQUIRED',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ globalUserId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CREATOR_GRANT_REQUIRED');
  });

  it('POST claim with unclaim:true clears the claim', async () => {
    claimOrganizer.mockResolvedValue({
      data: {
        unclaimed: true,
        organizer: { id: organizerId, claimStatus: 'unclaimed', claimedByUserId: null },
      },
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ unclaim: true });

    expect(response.status).toBe(200);
    expect(claimOrganizer).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        organizerId,
        unclaim: true,
      }),
    );
  });

  it('POST claim returns 404 when the organizer is missing', async () => {
    claimOrganizer.mockResolvedValue({
      error: 'Organizer not found.',
      status: 404,
      code: 'ORGANIZER_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ globalUserId });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ORGANIZER_NOT_FOUND');
  });

  it('POST claim returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .post(`/admin/pivot/tenants/nyc/organizers/${organizerId}/claim`)
      .send({ globalUserId });

    expect(response.status).toBe(403);
    expect(claimOrganizer).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes copy (Task 4.1)', () => {
  beforeEach(() => {
    getCopyCatalog.mockReset();
    getPlatformCopyLayers.mockReset();
    patchCopyPack.mockReset();
    resetCopyPack.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/copy/catalog returns shipped keys', async () => {
    getCopyCatalog.mockReturnValue({
      data: {
        schemaVersion: 1,
        tokens: [{ name: 'group.singular', shipped: 'circle' }],
        keys: [{ path: 'ticker.week', kind: 'string', shipped: 'swipe' }],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/copy/catalog');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.keys[0].path).toBe('ticker.week');
    expect(getCopyCatalog).toHaveBeenCalled();
  });

  it('GET /admin/pivot/copy/catalog returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/copy/catalog');
    expect(response.status).toBe(403);
    expect(getCopyCatalog).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/copy returns platform layers', async () => {
    getPlatformCopyLayers.mockResolvedValue({
      data: {
        scope: 'platform',
        revision: 1,
        entries: {
          'ticker.week': {
            shipped: 'swipe',
            platform: 'override',
            effective: 'override',
          },
        },
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/copy');

    expect(response.status).toBe(200);
    expect(response.body.data.revision).toBe(1);
    expect(getPlatformCopyLayers).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
    );
  });

  it('PATCH /admin/pivot/copy writes a sparse platform pack', async () => {
    patchCopyPack.mockResolvedValue({
      data: { scope: 'platform', revision: 1, entries: { 'ticker.week': 'this week' } },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/copy')
      .send({ entries: { 'ticker.week': 'this week' } });

    expect(response.status).toBe(200);
    expect(response.body.data.revision).toBe(1);
    expect(patchCopyPack).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        scope: 'platform',
        entries: { 'ticker.week': 'this week' },
      }),
    );
  });

  it('PATCH /admin/pivot/copy returns 400 for an unknown key', async () => {
    patchCopyPack.mockResolvedValue({
      error: 'entries key is not in the shipped catalog: ticker.notARealKey',
      status: 400,
      code: 'UNKNOWN_COPY_KEY',
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/copy')
      .send({ entries: { 'ticker.notARealKey': 'nope' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNKNOWN_COPY_KEY');
  });

  it('PATCH /admin/pivot/copy returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .patch('/admin/pivot/copy')
      .send({ entries: { 'ticker.week': 'nope' } });

    expect(response.status).toBe(403);
    expect(patchCopyPack).not.toHaveBeenCalled();
  });

  it('DELETE /admin/pivot/copy resets a stored key', async () => {
    resetCopyPack.mockResolvedValue({
      data: { scope: 'platform', revision: 2, entries: {} },
    });

    const response = await request(buildApp())
      .delete('/admin/pivot/copy')
      .send({ keys: ['ticker.week'] });

    expect(response.status).toBe(200);
    expect(response.body.data.revision).toBe(2);
    expect(resetCopyPack).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        scope: 'platform',
        entries: ['ticker.week'],
      }),
    );
  });

  it('DELETE /admin/pivot/copy returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .delete('/admin/pivot/copy')
      .send({ keys: ['ticker.week'] });

    expect(response.status).toBe(403);
    expect(resetCopyPack).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes tenant copy (Task 5.1)', () => {
  beforeEach(() => {
    getCopyLayers.mockReset();
    patchCopyPack.mockReset();
    resetCopyPack.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/tenants/:tenantKey/copy returns tenant layers', async () => {
    getCopyLayers.mockResolvedValue({
      data: {
        scope: 'tenant',
        tenantKey: 'nyc',
        revision: 1,
        compositeRevision: 'p1:t1',
        entries: {
          'ticker.week': {
            shipped: 'swipe',
            platform: 'all cities',
            tenant: 'nyc week',
            effective: 'nyc week',
          },
        },
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/copy');

    expect(response.status).toBe(200);
    expect(response.body.data.tenantKey).toBe('nyc');
    expect(response.body.data.entries['ticker.week'].tenant).toBe('nyc week');
    expect(getCopyLayers).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ scope: 'tenant', tenantKey: 'nyc' }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/copy returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/copy');
    expect(response.status).toBe(403);
    expect(getCopyLayers).not.toHaveBeenCalled();
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/copy writes a sparse tenant pack', async () => {
    patchCopyPack.mockResolvedValue({
      data: {
        scope: 'tenant',
        tenantKey: 'nyc',
        revision: 1,
        entries: { 'ticker.week': 'nyc week' },
      },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/copy')
      .send({ entries: { 'ticker.week': 'nyc week' } });

    expect(response.status).toBe(200);
    expect(response.body.data.tenantKey).toBe('nyc');
    expect(patchCopyPack).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
      }),
    );
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/copy returns 400 for an unknown key', async () => {
    patchCopyPack.mockResolvedValue({
      error: 'entries key is not in the shipped catalog: ticker.notARealKey',
      status: 400,
      code: 'UNKNOWN_COPY_KEY',
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/copy')
      .send({ entries: { 'ticker.notARealKey': 'nope' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNKNOWN_COPY_KEY');
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/copy returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/copy')
      .send({ entries: { 'ticker.week': 'nope' } });

    expect(response.status).toBe(403);
    expect(patchCopyPack).not.toHaveBeenCalled();
  });

  it('DELETE /admin/pivot/tenants/:tenantKey/copy resets a stored key', async () => {
    resetCopyPack.mockResolvedValue({
      data: { scope: 'tenant', tenantKey: 'nyc', revision: 2, entries: {} },
    });

    const response = await request(buildApp())
      .delete('/admin/pivot/tenants/nyc/copy')
      .send({ keys: ['ticker.week'] });

    expect(response.status).toBe(200);
    expect(response.body.data.revision).toBe(2);
    expect(resetCopyPack).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: ['ticker.week'],
      }),
    );
  });

  it('DELETE /admin/pivot/tenants/:tenantKey/copy returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp())
      .delete('/admin/pivot/tenants/nyc/copy')
      .send({ keys: ['ticker.week'] });

    expect(response.status).toBe(403);
    expect(resetCopyPack).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes launch APIs (Task 4.1)', () => {
  beforeEach(() => {
    getTenantLaunchStats.mockReset();
    getFleetLaunchStats.mockReset();
    updateTenantLandingMode.mockReset();
    listTenantWaitlist.mockReset();
    exportTenantWaitlistCsv.mockReset();
    deleteTenantWaitlistRow.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/tenants/:tenantKey/launch returns KPI payload', async () => {
    getTenantLaunchStats.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        landingMode: 'waitlist',
        totals: { views: 10, waitlistSignups: 2, storeClicks: 5, conversionRate: 0.2 },
      },
    });

    const response = await request(buildApp()).get(
      '/admin/pivot/tenants/nyc/launch?from=2026-08-01&to=2026-08-19',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totals.conversionRate).toBe(0.2);
    expect(getTenantLaunchStats).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        from: '2026-08-01',
        to: '2026-08-19',
      }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/launch returns 403 for non-platform-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/launch');

    expect(response.status).toBe(403);
    expect(getTenantLaunchStats).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/tenants/:tenantKey/launch returns 404 for unknown city', async () => {
    getTenantLaunchStats.mockResolvedValue({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/missing/launch');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET /admin/pivot/tenants/:tenantKey/waitlist returns emails for platform admin', async () => {
    listTenantWaitlist.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        items: [{ email: 'alex@example.com', source: 'direct', friendsJoined: 0 }],
        pagination: { page: 1, limit: 50, total: 1 },
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/waitlist?page=1');

    expect(response.status).toBe(200);
    expect(response.body.data.items[0].email).toBe('alex@example.com');
    expect(response.headers['cache-control']).toMatch(/no-store/);
  });

  it('GET /admin/pivot/tenants/:tenantKey/waitlist returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/waitlist');

    expect(response.status).toBe(403);
    expect(listTenantWaitlist).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/tenants/:tenantKey/waitlist.csv is an admin CSV, not JSON', async () => {
    exportTenantWaitlistCsv.mockResolvedValue({
      contentType: 'text/csv; charset=utf-8',
      filename: 'justgo-waitlist-nyc.csv',
      body: 'createdAt,email,source,qrName,refCode,friendsJoined\n2026-08-10T12:00:00.000Z,alex@example.com,direct,,,0',
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/waitlist.csv');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toContain('justgo-waitlist-nyc.csv');
    expect(response.headers['cache-control']).toMatch(/no-store/);
    expect(response.text).toContain('alex@example.com');
    expect(response.body).not.toEqual(expect.objectContaining({ success: true }));
  });

  it('GET /admin/pivot/tenants/:tenantKey/waitlist.csv returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/waitlist.csv');

    expect(response.status).toBe(403);
    expect(exportTenantWaitlistCsv).not.toHaveBeenCalled();
  });

  it('DELETE /admin/pivot/tenants/:tenantKey/waitlist/:id removes a row without echoing the email', async () => {
    deleteTenantWaitlistRow.mockResolvedValue({
      data: { tenantKey: 'nyc', id: '507f1f77bcf86cd799439011', deleted: true },
    });

    const response = await request(buildApp()).delete(
      '/admin/pivot/tenants/nyc/waitlist/507f1f77bcf86cd799439011',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      tenantKey: 'nyc',
      id: '507f1f77bcf86cd799439011',
      deleted: true,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/alex@example\.com/i);
    expect(response.headers['cache-control']).toMatch(/no-store/);
    expect(deleteTenantWaitlistRow).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({
        tenantKey: 'nyc',
        id: '507f1f77bcf86cd799439011',
      }),
    );
  });

  it('DELETE /admin/pivot/tenants/:tenantKey/waitlist/:id returns 404 WAITLIST_NOT_FOUND', async () => {
    deleteTenantWaitlistRow.mockResolvedValue({
      error: 'Waitlist signup not found.',
      status: 404,
      code: 'WAITLIST_NOT_FOUND',
    });

    const response = await request(buildApp()).delete(
      '/admin/pivot/tenants/nyc/waitlist/507f1f77bcf86cd799439011',
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('WAITLIST_NOT_FOUND');
  });

  it('DELETE /admin/pivot/tenants/:tenantKey/waitlist/:id returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).delete(
      '/admin/pivot/tenants/nyc/waitlist/507f1f77bcf86cd799439011',
    );

    expect(response.status).toBe(403);
    expect(deleteTenantWaitlistRow).not.toHaveBeenCalled();
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/landing-mode updates mode', async () => {
    updateTenantLandingMode.mockResolvedValue({
      data: { tenantKey: 'nyc', landingMode: 'launched', publicUrl: 'https://justgo.lol/nyc' },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/landing-mode')
      .send({ landingMode: 'launched' });

    expect(response.status).toBe(200);
    expect(response.body.data.landingMode).toBe('launched');
    expect(updateTenantLandingMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantKey: 'nyc', landingMode: 'launched' }),
    );
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/landing-mode returns 400 for invalid mode', async () => {
    updateTenantLandingMode.mockResolvedValue({
      error: 'landingMode must be waitlist or launched.',
      status: 400,
      code: 'INVALID_LANDING_MODE',
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/landing-mode')
      .send({ landingMode: 'preview' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_LANDING_MODE');
  });

  it('PATCH /admin/pivot/tenants/:tenantKey/landing-mode returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp())
      .patch('/admin/pivot/tenants/nyc/landing-mode')
      .send({ landingMode: 'launched' });

    expect(response.status).toBe(403);
    expect(updateTenantLandingMode).not.toHaveBeenCalled();
  });

  it('GET /admin/pivot/launch returns fleet rollup', async () => {
    getFleetLaunchStats.mockResolvedValue({
      data: {
        totals: { views: 30, conversionRate: 0.4 },
        cities: [{ tenantKey: 'nyc' }, { tenantKey: 'sf' }],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/launch');

    expect(response.status).toBe(200);
    expect(response.body.data.cities).toHaveLength(2);
    expect(getFleetLaunchStats).toHaveBeenCalled();
  });

  it('GET /admin/pivot/launch returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/launch');

    expect(response.status).toBe(403);
    expect(getFleetLaunchStats).not.toHaveBeenCalled();
  });
});

describe('pivotAdminRoutes landing QRs (Task 5.1)', () => {
  beforeEach(() => {
    listTenantLandingQrs.mockReset();
    createTenantLandingQr.mockReset();
    updateLandingQr.mockReset();
    deactivateLandingQr.mockReset();
    wipeLandingQrScans.mockReset();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /admin/pivot/tenants/:tenantKey/landing-qrs returns city QRs', async () => {
    listTenantLandingQrs.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        items: [
          {
            name: 'poster-a',
            tenantKey: 'nyc',
            payloadUrl: 'https://justgo.lol/qr/poster-a',
            isActive: true,
          },
        ],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/landing-qrs');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items[0].payloadUrl).toBe('https://justgo.lol/qr/poster-a');
    expect(listTenantLandingQrs).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ tenantKey: 'nyc' }),
    );
  });

  it('GET /admin/pivot/tenants/:tenantKey/landing-qrs returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).get('/admin/pivot/tenants/nyc/landing-qrs');

    expect(response.status).toBe(403);
    expect(listTenantLandingQrs).not.toHaveBeenCalled();
  });

  it('POST /admin/pivot/tenants/:tenantKey/landing-qrs creates a named QR', async () => {
    createTenantLandingQr.mockResolvedValue({
      status: 201,
      data: {
        name: 'troy',
        tenantKey: 'troy',
        payloadUrl: 'https://justgo.lol/qr/troy',
        fgColor: '#1A1714',
      },
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/troy/landing-qrs')
      .send({ name: 'troy', description: 'City posters' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('troy');
    expect(createTenantLandingQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantKey: 'troy', name: 'troy' }),
    );
  });

  it('POST /admin/pivot/tenants/:tenantKey/landing-qrs returns 409 on duplicate name', async () => {
    createTenantLandingQr.mockResolvedValue({
      error: 'That QR name is already taken.',
      status: 409,
      code: 'QR_NAME_TAKEN',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/landing-qrs')
      .send({ name: 'poster-a' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QR_NAME_TAKEN');
  });

  it('POST /admin/pivot/tenants/:tenantKey/landing-qrs returns 404 for a campus school', async () => {
    createTenantLandingQr.mockResolvedValue({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/rpi/landing-qrs')
      .send({ name: 'union-poster' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('POST /admin/pivot/tenants/:tenantKey/landing-qrs returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/nyc/landing-qrs')
      .send({ name: 'poster-a' });

    expect(response.status).toBe(403);
    expect(createTenantLandingQr).not.toHaveBeenCalled();
  });

  it('PATCH /admin/pivot/landing-qrs/:name updates style and deactivates', async () => {
    updateLandingQr.mockResolvedValue({
      data: { name: 'poster-a', isActive: false, fgColor: '#FFD23F' },
    });

    const response = await request(buildApp())
      .patch('/admin/pivot/landing-qrs/poster-a')
      .send({ isActive: false, fgColor: '#FFD23F' });

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
    expect(updateLandingQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'poster-a', isActive: false, fgColor: '#FFD23F' }),
    );
  });

  it('DELETE /admin/pivot/landing-qrs/:name deactivates instead of deleting', async () => {
    deactivateLandingQr.mockResolvedValue({
      data: { name: 'poster-a', isActive: false },
    });

    const response = await request(buildApp()).delete('/admin/pivot/landing-qrs/poster-a');

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
    expect(deactivateLandingQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'poster-a' }),
    );
  });

  it('POST /admin/pivot/landing-qrs/:name/wipe-scans clears counters', async () => {
    wipeLandingQrScans.mockResolvedValue({
      data: {
        name: 'poster-a',
        scans: 0,
        uniqueScans: 0,
        wiped: { scans: 4, uniqueScans: 3, eventsDeleted: 2 },
      },
    });

    const response = await request(buildApp()).post(
      '/admin/pivot/landing-qrs/poster-a/wipe-scans',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.scans).toBe(0);
    expect(response.body.data.wiped.scans).toBe(4);
    expect(wipeLandingQrScans).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'poster-a' }),
    );
  });

  it('POST /admin/pivot/landing-qrs/:name/wipe-scans returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp()).post(
      '/admin/pivot/landing-qrs/poster-a/wipe-scans',
    );

    expect(response.status).toBe(403);
    expect(wipeLandingQrScans).not.toHaveBeenCalled();
  });

  it('PATCH /admin/pivot/landing-qrs/:name returns 403 for non-admin', async () => {
    requirePlatformAdmin.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: 'Platform admin required.' }),
    );

    const response = await request(buildApp())
      .patch('/admin/pivot/landing-qrs/poster-a')
      .send({ isActive: false });

    expect(response.status).toBe(403);
    expect(updateLandingQr).not.toHaveBeenCalled();
  });
});
