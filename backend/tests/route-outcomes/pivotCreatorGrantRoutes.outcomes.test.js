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

jest.mock('../../services/pivotCreatorGrantService', () => ({
  listCreatorGrants: jest.fn(),
  grantCreator: jest.fn(),
  revokeCreator: jest.fn(),
}));

// Heavy pivot admin deps — stub so requiring the router stays light.
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
jest.mock('../../services/pivotCrewMetricsService', () => ({
  getTenantCrewMetrics: jest.fn(),
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
jest.mock('../../services/pivotAdminDropDeckService', () => ({
  previewAdminDropDeck: jest.fn(),
}));
jest.mock('../../services/pivotExploreService', () => ({
  getPivotExplorePreview: jest.fn(),
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
  publishBatchIngestEvents: jest.fn(),
  updateIngestEvent: jest.fn(),
}));
jest.mock('../../services/pivotIngestDuplicateService', () => ({
  annotateImportDuplicates: jest.fn(),
}));
jest.mock('../../services/pivotCatalogPurgeService', () => ({
  purgePivotCatalog: jest.fn(),
  deletePivotCatalogEvent: jest.fn(),
  purgePivotCatalogOutOfWeek: jest.fn(),
}));
jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
  seedPivotTagCatalog: jest.fn(),
}));
jest.mock('../../services/pivotTagSuggestService', () => ({
  suggestPivotEventTags: jest.fn(),
  suggestPivotEventTagsBatch: jest.fn(),
  suggestAndApplyPivotEventTags: jest.fn(),
}));
jest.mock('../../services/pivotTmdbService', () => ({
  searchTmdbMovies: jest.fn(),
  fetchTmdbMovieDetails: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn().mockResolvedValue([]),
}));

const { requirePlatformAdmin } = require('../../middlewares/requirePlatformAdmin');
const {
  listCreatorGrants,
  grantCreator,
  revokeCreator,
} = require('../../services/pivotCreatorGrantService');
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

describe('pivotAdminRoutes creator grants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requirePlatformAdmin.mockImplementation((req, res, next) => next());
  });

  it('GET /tenants/:tenantKey/creators returns grants', async () => {
    listCreatorGrants.mockResolvedValue({
      data: {
        tenantKey: 'brooklyn',
        grants: [
          {
            id: 'g1',
            globalUserId: '507f191e810c19729de860ea',
            status: 'active',
          },
        ],
      },
    });

    const response = await request(buildApp()).get('/admin/pivot/tenants/brooklyn/creators');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grants).toHaveLength(1);
    expect(listCreatorGrants).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      'brooklyn',
      expect.objectContaining({ status: undefined }),
    );
  });

  it('POST /tenants/:tenantKey/creators grants access', async () => {
    grantCreator.mockResolvedValue({
      data: {
        id: 'g1',
        globalUserId: '507f191e810c19729de860ea',
        status: 'active',
        tenantKey: 'brooklyn',
      },
      reactivated: false,
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/brooklyn/creators')
      .send({ email: 'host@example.com' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('active');
    expect(grantCreator).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      'brooklyn',
      { email: 'host@example.com' },
    );
  });

  it('DELETE /tenants/:tenantKey/creators/:globalUserId revokes access', async () => {
    revokeCreator.mockResolvedValue({
      data: {
        id: 'g1',
        globalUserId: '507f191e810c19729de860ea',
        status: 'revoked',
      },
    });

    const response = await request(buildApp()).delete(
      '/admin/pivot/tenants/brooklyn/creators/507f191e810c19729de860ea',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('revoked');
    expect(revokeCreator).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      'brooklyn',
      '507f191e810c19729de860ea',
    );
  });

  it('returns 403 when requirePlatformAdmin rejects', async () => {
    requirePlatformAdmin.mockImplementation((req, res) =>
      res.status(403).json({
        success: false,
        message: 'Platform admin required.',
        code: 'PLATFORM_ADMIN_REQUIRED',
      }),
    );

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/brooklyn/creators')
      .send({ email: 'host@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PLATFORM_ADMIN_REQUIRED');
    expect(grantCreator).not.toHaveBeenCalled();
  });

  it('surfaces service errors with stable codes', async () => {
    grantCreator.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp())
      .post('/admin/pivot/tenants/rpi/creators')
      .send({ email: 'host@example.com' });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });
});
