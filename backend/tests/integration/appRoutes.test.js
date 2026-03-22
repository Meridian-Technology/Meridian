const express = require('express');
const request = require('supertest');

jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => next(),
  authorizeRoles: () => (req, res, next) => next(),
}));

jest.mock('../../socket', () => ({
  getConnections: jest.fn(() => []),
  disconnectSocket: jest.fn(() => true),
  disconnectAll: jest.fn(() => 0),
}));

jest.mock('../../utilities/sessionUtils', () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
}));

const { connectToDatabase } = require('../../connectionsManager');
const adminRoutes = require('../../routes/adminRoutes');

describe('adminRoutes integration tests', () => {
  function buildApp() {
    const app = express();
    app.use((req, _res, next) => {
      req.school = 'rpi';
      next();
    });
    app.use(adminRoutes);
    return app;
  }

  test('GET /health returns healthy statuses when database ping succeeds', async () => {
    connectToDatabase.mockResolvedValue({
      db: {
        admin: () => ({
          ping: jest.fn().mockResolvedValue({ ok: 1 }),
        }),
      },
    });

    const response = await request(buildApp()).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.statuses.backend.status).toBe(true);
    expect(response.body.statuses.database.status).toBe(true);
    expect(response.body.subDomain).toBe('rpi');
    expect(connectToDatabase).toHaveBeenCalledWith('rpi');
  });

  test('GET /health returns error payload when database check fails', async () => {
    connectToDatabase.mockRejectedValue(new Error('db unavailable'));

    const response = await request(buildApp()).get('/health');

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Site health check failed');
    expect(response.body.details).toBe('db unavailable');
  });
});
