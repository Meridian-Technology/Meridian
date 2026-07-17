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
  authorizeRoles: () => (_req, _res, next) => next(),
}));

jest.mock('../../middlewares/requireAdmin', () => ({
  requireAdmin: (req, res, next) => next(),
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

jest.mock('../../services/platformAdminInviteService', () => ({
  listPlatformAdmins: jest.fn(),
  nominatePlatformAdmin: jest.fn(),
  approvePlatformAdminInvite: jest.fn(),
  revokePlatformAdminInvite: jest.fn(),
}));

jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../socket', () => ({
  getConnections: jest.fn(() => []),
  disconnectSocket: jest.fn(),
  disconnectAll: jest.fn(),
}));
jest.mock('../../utilities/sessionUtils', () => ({
  createSession: jest.fn(),
}));
jest.mock('../../utilities/cookieUtils', () => ({
  getCookieDomain: jest.fn(() => undefined),
}));

const {
  listPlatformAdmins,
  nominatePlatformAdmin,
  approvePlatformAdminInvite,
  revokePlatformAdminInvite,
} = require('../../services/platformAdminInviteService');

const adminRoutes = require('../../routes/adminRoutes');

function buildApp(userOverrides = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.school = 'nyc';
    req.globalDb = {};
    req.user = {
      userId: 'u1',
      globalUserId: 'gu-actor',
      platformRoles: ['platform_admin'],
      ...userOverrides,
    };
    next();
  });
  app.use(adminRoutes);
  return app;
}

describe('adminRoutes platform admin nominations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /admin/platform-admins returns admins and nominations', async () => {
    listPlatformAdmins.mockResolvedValue({
      admins: [{ globalUserId: 'gu1', email: 'a@example.com' }],
      nominations: [{ id: 'inv1', email: 'b@example.com', status: 'pending_signup' }],
    });

    const response = await request(buildApp()).get('/admin/platform-admins');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.admins).toHaveLength(1);
    expect(response.body.data.nominations[0].status).toBe('pending_signup');
  });

  it('POST /admin/platform-admins/nominate nominates email', async () => {
    nominatePlatformAdmin.mockResolvedValue({
      data: {
        id: 'inv1',
        email: 'ops@example.com',
        status: 'pending_signup',
      },
    });

    const response = await request(buildApp())
      .post('/admin/platform-admins/nominate')
      .send({ email: 'ops@example.com' });

    expect(response.status).toBe(200);
    expect(nominatePlatformAdmin).toHaveBeenCalled();
    expect(response.body.data.status).toBe('pending_signup');
  });

  it('POST nominate returns 403 for non-platform-admin', async () => {
    const response = await request(buildApp({ platformRoles: [] }))
      .post('/admin/platform-admins/nominate')
      .send({ email: 'ops@example.com' });

    expect(response.status).toBe(403);
    expect(nominatePlatformAdmin).not.toHaveBeenCalled();
  });

  it('POST nominations/:id/approve grants admin', async () => {
    approvePlatformAdminInvite.mockResolvedValue({
      data: { globalUserId: 'gu1', email: 'ops@example.com', inviteId: 'inv1' },
    });

    const response = await request(buildApp()).post(
      '/admin/platform-admins/nominations/inv1/approve',
    );

    expect(response.status).toBe(200);
    expect(approvePlatformAdminInvite).toHaveBeenCalledWith(
      expect.anything(),
      { inviteId: 'inv1' },
    );
    expect(response.body.data.email).toBe('ops@example.com');
  });

  it('DELETE nominations/:id cancels nomination', async () => {
    revokePlatformAdminInvite.mockResolvedValue({
      data: { id: 'inv1', email: 'ops@example.com', status: 'revoked' },
    });

    const response = await request(buildApp()).delete(
      '/admin/platform-admins/nominations/inv1',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('revoked');
  });

  it('approve surfaces service errors', async () => {
    approvePlatformAdminInvite.mockResolvedValue({
      error: 'This nomination is still awaiting signup.',
      status: 409,
      code: 'NOT_READY_FOR_APPROVAL',
    });

    const response = await request(buildApp()).post(
      '/admin/platform-admins/nominations/inv1/approve',
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NOT_READY_FOR_APPROVAL');
  });
});
