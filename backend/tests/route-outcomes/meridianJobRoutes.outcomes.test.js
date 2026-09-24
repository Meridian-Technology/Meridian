const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, _res, next) => {
    req.user = req.user || {
      userId: 'u1',
      globalUserId: 'gu-actor',
      platformRoles: ['platform_admin'],
    };
    next();
  },
}));

jest.mock('../../middlewares/requirePlatformAdmin', () => ({
  requirePlatformAdmin: (req, res, next) => {
    const roles = req.user?.platformRoles || [];
    if (!roles.includes('platform_admin') && !roles.includes('root')) {
      return res.status(403).json({ success: false, message: 'Platform admin required.' });
    }
    return next();
  },
}));

jest.mock('../../services/meridianJobAdminService', () => ({
  listMeridianJobRuns: jest.fn(),
  getMeridianJobRun: jest.fn(),
  enqueueMeridianJobAdmin: jest.fn(),
  listEnqueueableMeridianJobHandlers: jest.fn(),
}));

const {
  listMeridianJobRuns,
  getMeridianJobRun,
  enqueueMeridianJobAdmin,
  listEnqueueableMeridianJobHandlers,
} = require('../../services/meridianJobAdminService');
const meridianJobAdminRoutes = require('../../routes/meridianJobAdminRoutes');

function buildApp(userOverrides = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.school = 'www';
    req.globalDb = {};
    req.user = {
      userId: 'u1',
      globalUserId: 'gu-actor',
      platformRoles: ['platform_admin'],
      ...userOverrides,
    };
    next();
  });
  app.use(meridianJobAdminRoutes);
  return app;
}

describe('meridianJobAdminRoutes outcomes', () => {
  beforeEach(() => {
    listMeridianJobRuns.mockReset();
    getMeridianJobRun.mockReset();
    enqueueMeridianJobAdmin.mockReset();
    listEnqueueableMeridianJobHandlers.mockReset();
  });

  it('lists fleet runs with tenant, type, status, and time filters', async () => {
    listMeridianJobRuns.mockResolvedValue({
      runs: [{ id: 'run-1', type: 'weekly_drop', status: 'failed', tenantKey: 'nyc' }],
      nextCursor: null,
    });

    const response = await request(buildApp())
      .get('/admin/meridian/jobs/runs')
      .query({
        tenantKey: 'nyc',
        type: 'weekly_drop',
        status: 'failed',
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T00:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.runs).toHaveLength(1);
    expect(listMeridianJobRuns).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantKey: 'nyc',
        type: 'weekly_drop',
        status: 'failed',
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T00:00:00.000Z',
      }),
    );
  });

  it('returns run detail with attempts and paginated deliveries without push tokens', async () => {
    getMeridianJobRun.mockResolvedValue({
      run: { id: '507f191e810c19729de860ea', type: 'weekly_drop', status: 'succeeded' },
      attempts: [{ attemptNumber: 1, status: 'succeeded' }],
      deliveries: [{
        userId: '1',
        username: 'ari',
        product: 'justgo',
        deliveryStatus: 'accepted',
        title: 'just go*',
        body: 'What are you doing this week? Just go.',
      }],
      deliveriesNextCursor: null,
    });

    const response = await request(buildApp())
      .get('/admin/meridian/jobs/runs/507f191e810c19729de860ea')
      .query({ deliveriesLimit: '20', deliveryStatus: 'accepted' });

    expect(response.status).toBe(200);
    expect(response.body.data.attempts).toHaveLength(1);
    expect(response.body.data.deliveries[0]).toMatchObject({
      userId: '1',
      deliveryStatus: 'accepted',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/pushToken|ExponentPushToken/);
    expect(getMeridianJobRun).toHaveBeenCalledWith(
      expect.anything(),
      '507f191e810c19729de860ea',
      expect.objectContaining({
        deliveriesLimit: '20',
        deliveryStatus: 'accepted',
      }),
    );
  });

  it('enqueues a manual run for platform admins', async () => {
    enqueueMeridianJobAdmin.mockResolvedValue({
      created: true,
      run: { id: 'run-2', type: 'weekly_drop', status: 'pending', tenantKey: 'sf' },
    });

    const response = await request(buildApp())
      .post('/admin/meridian/jobs/runs/enqueue')
      .send({
        handlerKey: 'weekly_drop',
        tenantKey: 'sf',
        payload: { batchWeek: '2026-W23', dryRun: true, force: true },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.created).toBe(true);
    expect(enqueueMeridianJobAdmin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        handlerKey: 'weekly_drop',
        tenantKey: 'sf',
        triggeredBy: 'gu-actor',
        payload: { batchWeek: '2026-W23', dryRun: true, force: true },
      }),
    );
  });

  it('rejects enqueue without platform_admin', async () => {
    const response = await request(buildApp({ platformRoles: ['user'] }))
      .post('/admin/meridian/jobs/runs/enqueue')
      .send({ handlerKey: 'weekly_drop', tenantKey: 'sf' });

    expect(response.status).toBe(403);
    expect(enqueueMeridianJobAdmin).not.toHaveBeenCalled();
  });

  it('rejects fleet list without platform_admin', async () => {
    const response = await request(buildApp({ platformRoles: [] }))
      .get('/admin/meridian/jobs/runs');

    expect(response.status).toBe(403);
    expect(listMeridianJobRuns).not.toHaveBeenCalled();
  });

  it('mirrors tenant-scoped list and does not expose tenant enqueue', async () => {
    listMeridianJobRuns.mockResolvedValue({ runs: [], nextCursor: null });

    const listResponse = await request(buildApp())
      .get('/admin/platform/tenants/NYC/meridian/jobs/runs')
      .query({ type: 'weekly_drop' });

    expect(listResponse.status).toBe(200);
    expect(listMeridianJobRuns).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantKey: 'nyc', type: 'weekly_drop' }),
    );

    const enqueueResponse = await request(buildApp())
      .post('/admin/platform/tenants/nyc/meridian/jobs/runs/enqueue')
      .send({ handlerKey: 'weekly_drop' });
    expect(enqueueResponse.status).toBe(404);
  });

  it('scopes tenant run detail to the path tenantKey', async () => {
    getMeridianJobRun.mockResolvedValue({
      run: { id: '507f191e810c19729de860ea', tenantKey: 'nyc' },
      attempts: [],
      deliveries: [],
      deliveriesNextCursor: null,
    });

    const response = await request(buildApp())
      .get('/admin/platform/tenants/nyc/meridian/jobs/runs/507f191e810c19729de860ea');

    expect(response.status).toBe(200);
    expect(getMeridianJobRun).toHaveBeenCalledWith(
      expect.anything(),
      '507f191e810c19729de860ea',
      expect.objectContaining({ tenantKey: 'nyc' }),
    );
  });

  it('lists registered handlers for the definition editor dropdown', async () => {
    listEnqueueableMeridianJobHandlers.mockReturnValue([
      { handlerKey: 'weekly_drop', category: 'notification' },
      { handlerKey: 'ritual_crew_scan', category: 'notification' },
    ]);

    const response = await request(buildApp())
      .get('/admin/meridian/jobs/handlers');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { handlerKey: 'weekly_drop', category: 'notification' },
      { handlerKey: 'ritual_crew_scan', category: 'notification' },
    ]);
    expect(listEnqueueableMeridianJobHandlers).toHaveBeenCalled();
  });

  it('rejects handler list without platform_admin', async () => {
    const response = await request(buildApp({ platformRoles: [] }))
      .get('/admin/meridian/jobs/handlers');

    expect(response.status).toBe(403);
    expect(listEnqueueableMeridianJobHandlers).not.toHaveBeenCalled();
  });

  it('maps admin service errors onto HTTP status', async () => {
    const error = new Error('Unsupported job status filter: leased');
    error.status = 400;
    error.code = 'INVALID_STATUS_FILTER';
    listMeridianJobRuns.mockRejectedValue(error);

    const response = await request(buildApp())
      .get('/admin/meridian/jobs/runs')
      .query({ status: 'leased' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_STATUS_FILTER',
    });
  });
});
