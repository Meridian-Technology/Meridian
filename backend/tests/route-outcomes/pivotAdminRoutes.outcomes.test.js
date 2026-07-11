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
}));

jest.mock('../../services/pivotCatalogPurgeService', () => ({
  purgePivotCatalog: jest.fn(),
}));

jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
  seedPivotTagCatalog: jest.fn(),
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
} = require('../../services/pivotTagSuggestService');
const { purgePivotCatalog } = require('../../services/pivotCatalogPurgeService');
const { listPivotTags, seedPivotTagCatalog } = require('../../services/pivotTagCatalogService');
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
