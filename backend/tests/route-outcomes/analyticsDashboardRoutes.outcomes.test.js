/**
 * Analytics Dashboard route-outcome tests.
 * Tests /dashboard/* routes with in-memory MongoDB, ensuring multi-tenant compatibility (req.db, req.school).
 * Routes live in Events-Backend but are mounted through Meridian's events router.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const analyticsEventSchema = require('../../events/schemas/analyticsEvent');
const { createMongoMemoryConnection, getOrCreateModel } = require('../helpers/mongoMemory');

jest.mock('../../events/backendRoot', () => {
  const path = require('path');
  const backendPath = path.resolve(__dirname, '../..');
  const schema = require(path.join(backendPath, 'events/schemas/analyticsEvent'));
  const { getOrCreateModel } = require(path.join(backendPath, 'tests/helpers/mongoMemory'));
  const getModels = (req, ...names) => {
    const models = {
      AnalyticsEvent: getOrCreateModel(req.db, 'AnalyticsEvent', schema, 'analytics_events'),
    };
    return names.reduce((acc, name) => {
      if (models[name]) acc[name] = models[name];
      return acc;
    }, {});
  };
  return {
    require: (modulePath) => {
      if (modulePath === 'middlewares/verifyToken') {
        return { verifyToken: (req, res, next) => next() };
      }
      if (modulePath === 'middlewares/requireAdmin') {
        return { requireAdmin: (req, res, next) => next() };
      }
      if (modulePath === 'services/getModelService') {
        return getModels;
      }
      return require(path.join(backendPath, modulePath));
    },
  };
});

const analyticsDashboardRoutes = require('../../events/routes/analyticsDashboardRoutes');

describe('analytics dashboard route outcome tests (multi-tenant)', () => {
  let mongo;
  let app;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    mongo = await createMongoMemoryConnection();

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.db = mongo.connection;
      req.school = 'rpi';
      next();
    });
    app.use(analyticsDashboardRoutes);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await mongo.reset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  test('GET /dashboard/overview returns metrics with empty data (multi-tenant: req.db, req.school)', async () => {
    const response = await request(app).get('/dashboard/overview?timeRange=30d');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.uniqueUsers).toBeDefined();
    expect(response.body.data.sessions).toBeDefined();
    expect(response.body.data.timeRange).toBe('30d');
  });

  test('GET /dashboard/path-starting-points returns screens and events', async () => {
    const response = await request(app).get('/dashboard/path-starting-points?timeRange=30d');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.screens).toEqual(expect.any(Array));
    expect(response.body.data.events).toEqual(expect.any(Array));
  });
});
