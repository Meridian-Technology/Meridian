jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../events/backendRoot', () => ({
  require: (modulePath) => {
    if (modulePath === 'services/getModelService') {
      return require('../../services/getModelService');
    }
    if (modulePath === 'middlewares/verifyToken') {
      return {resolveRequestUser: jest.fn()};
    }
    if (modulePath === 'services/mobileAnalyticsMigration') {
      return {normalizeAnalyticsUserId: value => value || null};
    }
    throw new Error(`Unexpected backend module: ${modulePath}`);
  },
}));

const express = require('express');
const request = require('supertest');
const getModels = require('../../services/getModelService');
const analyticsRoutes = require('../../events/routes/analyticsRoutes');

function event(id, overrides = {}) {
  return {
    event_id: id,
    event: 'pivot_card_view',
    ts: '2026-09-01T00:00:00.000Z',
    anonymous_id: 'anonymous-1',
    user_id: null,
    session_id: 'session-1',
    platform: 'ios',
    app: 'justgo',
    app_version: '1.0.0',
    build: '1',
    env: 'prod',
    ...overrides,
  };
}

function appWithInsert(insertMany) {
  getModels.mockReturnValue({AnalyticsEvent: {insertMany}});
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.school = 'nyc';
    req.ip = '127.0.0.1';
    next();
  });
  app.use(analyticsRoutes);
  return app;
}

describe('analytics ingestion acknowledgement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('acknowledges stored and rejected event IDs without assigning anonymous events to the bearer user', async () => {
    const insertMany = jest.fn(async docs => docs);
    const response = await request(appWithInsert(insertMany))
      .post('/v1/events')
      .send({events: [event('good'), event('bad', {platform: 'desktop'})]});

    expect(response.status).toBe(200);
    expect(response.body.acceptedEventIds).toEqual(['good']);
    expect(response.body.rejectedEventIds).toEqual(['bad']);
    expect(response.body.retryEventIds).toEqual([]);
    expect(insertMany.mock.calls[0][0][0].user_id).toBeNull();
  });

  it('returns a retryable error when the write result is unknown', async () => {
    const response = await request(appWithInsert(jest.fn().mockRejectedValue(new Error('database unavailable'))))
      .post('/v1/events')
      .send({events: [event('retry-me')]});

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Analytics write failed');
  });

  it('treats duplicates as delivered while retrying other indexed write failures', async () => {
    const insertMany = jest.fn().mockRejectedValue({
      writeErrors: [{index: 0, err: {code: 11000}}, {index: 1, err: {code: 121}}],
    });
    const response = await request(appWithInsert(insertMany))
      .post('/v1/events')
      .send({events: [event('duplicate'), event('retry'), event('stored')]});

    expect(response.status).toBe(200);
    expect(response.body.acceptedEventIds).toEqual(['duplicate', 'stored']);
    expect(response.body.retryEventIds).toEqual(['retry']);
    expect(response.body.inserted).toBe(1);
    expect(response.body.duplicates).toBe(1);
  });

  it('scrubs nested sensitive fields and uses the city host as the tenant', async () => {
    const insertMany = jest.fn(async docs => docs);
    const response = await request(appWithInsert(insertMany))
      .post('/v1/events')
      .send({events: [event('private', {
        context: {screen: 'Explore', access_token: 'secret'},
        properties: {tenantKey: 'other-city', items: [{emailAddress: 'a@example.com', category: 'music'}]},
      })]});

    expect(response.status).toBe(200);
    const stored = insertMany.mock.calls[0][0][0];
    expect(stored.context).toEqual({screen: 'Explore'});
    expect(stored.properties).toEqual({tenantKey: 'nyc', items: [{category: 'music'}]});
  });

  it('does not acknowledge a partial result without indexed failures', async () => {
    const response = await request(appWithInsert(jest.fn(async docs => docs.slice(0, 1))))
      .post('/v1/events')
      .send({events: [event('one'), event('two')]});

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Incomplete analytics write result');
  });
});
