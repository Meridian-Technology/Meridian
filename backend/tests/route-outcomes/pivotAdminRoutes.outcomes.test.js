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
const { getPivotOverview } = require('../../services/pivotAdminOverviewService');
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
