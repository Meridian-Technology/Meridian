jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../middlewares/requireAdmin', () => ({
  requireAdmin: jest.fn((req, res) => res.status(403).json({ message: 'Admin access required' })),
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const getModels = require('../../services/getModelService');
const { requireAdmin } = require('../../middlewares/requireAdmin');
const analyticsRoutes = require('../../routes/analytics');

const REPORT_ROUTES = [
  '/visits-by-day', '/visits-by-hour', '/visits-by-all',
  '/users-by-day', '/users-by-hour', '/users-by-all',
  '/searches-by-day', '/searches-by-hour', '/searches-by-all',
  '/repeated-visits-by-day', '/repeated-visits-by-hour', '/repeated-visits-by-all',
  '/summary',
];

function app() {
  const server = express();
  server.use(express.json());
  server.use(cookieParser());
  server.use(analyticsRoutes);
  return server;
}

describe('legacy analytics report routes', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getModels.mockReturnValue({ User: { findById: () => ({ select: () => ({ lean: async () => ({}) }) }) } });
  });

  it.each(REPORT_ROUTES)('%s needs a session', async (path) => {
    const response = await request(app()).get(path).query({ startDate: '2026-09-01' });

    expect(response.status).toBe(401);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it.each(REPORT_ROUTES)('%s needs an admin', async (path) => {
    const token = jwt.sign({ userId: '507f191e810c19729de860ea' }, process.env.JWT_SECRET);
    const response = await request(app())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .query({ startDate: '2026-09-01' });

    expect(response.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it('still accepts anonymous visit logging from the app shell', async () => {
    const save = jest.fn().mockResolvedValue({});
    getModels.mockReturnValue({ Visit: jest.fn(() => ({ save })) });

    const response = await request(app()).post('/log-visit');

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });
});
