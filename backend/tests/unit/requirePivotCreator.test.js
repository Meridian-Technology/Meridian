const express = require('express');
const request = require('supertest');

jest.mock('../../services/pivotCreatorGrantService', () => ({
  getActiveCreatorGrant: jest.fn(),
  serializeGrant: jest.fn((grant) => ({
    id: String(grant._id || 'g1'),
    globalUserId: String(grant.globalUserId),
    userId: String(grant.globalUserId),
    tenantKey: grant.tenantKey,
    status: grant.status,
  })),
}));

jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));

const {
  getActiveCreatorGrant,
} = require('../../services/pivotCreatorGrantService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  requirePivotCreator,
} = require('../../middlewares/requirePivotCreator');

const GLOBAL_USER_ID = '507f191e810c19729de860ea';

function buildApp({ school = 'brooklyn', user } = {}) {
  const app = express();
  app.use((req, _res, next) => {
    req.school = school;
    req.globalDb = {};
    req.user =
      user === undefined
        ? { globalUserId: GLOBAL_USER_ID, userId: 'tenant-user-1' }
        : user;
    next();
  });
  app.get('/creator/ping', requirePivotCreator, (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        tenantKey: req.pivotCreator.tenantKey,
        globalUserId: req.pivotCreator.globalUserId,
        grantStatus: req.pivotCreator.grant.status,
      },
    });
  });
  return app;
}

describe('requirePivotCreator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'brooklyn', tenantType: 'pivot' },
    });
    getActiveCreatorGrant.mockResolvedValue({
      _id: 'g1',
      globalUserId: GLOBAL_USER_ID,
      tenantKey: 'brooklyn',
      status: 'active',
    });
  });

  it('allows an active grant and sets req.pivotCreator', async () => {
    const response = await request(buildApp()).get('/creator/ping');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tenantKey).toBe('brooklyn');
    expect(response.body.data.globalUserId).toBe(GLOBAL_USER_ID);
    expect(getActiveCreatorGrant).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      { globalUserId: GLOBAL_USER_ID, tenantKey: 'brooklyn' },
    );
  });

  it('denies missing/revoked grant with CREATOR_FORBIDDEN', async () => {
    getActiveCreatorGrant.mockResolvedValue(null);

    const response = await request(buildApp()).get('/creator/ping');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: 'CREATOR_FORBIDDEN',
    });
  });

  it('rejects campus / non-pivot tenants', async () => {
    resolvePivotTenant.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildApp({ school: 'rpi' })).get('/creator/ping');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NOT_PIVOT_TENANT');
  });

  it('rejects www host without a city tenant', async () => {
    const response = await request(buildApp({ school: 'www' })).get('/creator/ping');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CREATOR_TENANT_REQUIRED');
    expect(resolvePivotTenant).not.toHaveBeenCalled();
  });

  it('returns 401 when user is missing', async () => {
    const response = await request(buildApp({ user: null })).get('/creator/ping');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });
});
