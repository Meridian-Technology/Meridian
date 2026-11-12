jest.mock('../../services/getModelService', () => jest.fn());
const mockResolveRequestUser = jest.fn(async (req, decoded) => {
  req.user = {userId: decoded.userId};
});
jest.mock('../../events/backendRoot', () => ({
  require: (modulePath) => {
    if (modulePath === 'services/getModelService') {
      return require('../../services/getModelService');
    }
    if (modulePath === 'middlewares/verifyToken') {
      return {resolveRequestUser: mockResolveRequestUser};
    }
    if (modulePath === 'services/mobileAnalyticsMigration') {
      return require('../../services/mobileAnalyticsMigration');
    }
    if (modulePath === 'utilities/analyticsHash') {
      return require('../../utilities/analyticsHash');
    }
    throw new Error(`Unexpected backend module: ${modulePath}`);
  },
}));

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
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

const USER_A = '507f191e810c19729de860ea';
const USER_B = '507f191e810c19729de860eb';

function tokenFor(userId, options = {}) {
  return jwt.sign({userId}, process.env.JWT_SECRET, options);
}

function appWithInsert(insertMany, {school = 'nyc', cookies = {}} = {}) {
  getModels.mockReturnValue({AnalyticsEvent: {insertMany}});
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.school = school;
    req.ip = '127.0.0.1';
    req.cookies = cookies;
    next();
  });
  app.use(analyticsRoutes);
  return app;
}

describe('analytics ingestion acknowledgement', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalHashSecret = process.env.ANALYTICS_HASH_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.ANALYTICS_HASH_SECRET = 'test-analytics-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.ANALYTICS_HASH_SECRET = originalHashSecret;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    if (originalHashSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
  });

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

  describe('user attribution', () => {
    async function storedUserIds(events, {authorization, cookies, school} = {}) {
      const insertMany = jest.fn(async docs => docs);
      let call = request(appWithInsert(insertMany, {cookies, school})).post('/v1/events');
      if (authorization) call = call.set('Authorization', authorization);
      const response = await call.send({events});
      expect(response.status).toBe(200);
      return insertMany.mock.calls[0][0].map(doc => doc.user_id);
    }

    it('drops a user_id the request cannot prove', async () => {
      expect(await storedUserIds([event('spoofed', {user_id: USER_A})])).toEqual([null]);
    });

    it('keeps a user_id that matches the bearer token', async () => {
      const ids = await storedUserIds(
        [event('mine', {user_id: USER_A})],
        {authorization: `Bearer ${tokenFor(USER_A)}`},
      );
      expect(ids).toEqual([USER_A]);
    });

    it('drops a user_id that names someone other than the bearer', async () => {
      const ids = await storedUserIds(
        [event('theirs', {user_id: USER_B})],
        {authorization: `Bearer ${tokenFor(USER_A)}`},
      );
      expect(ids).toEqual([null]);
    });

    it('verifies web events from the access-token cookie', async () => {
      const ids = await storedUserIds(
        [event('web', {platform: 'web', user_id: USER_A})],
        {cookies: {accessToken: tokenFor(USER_A)}},
      );
      expect(ids).toEqual([USER_A]);
    });

    it('still attributes queued events after the access token has expired', async () => {
      const expired = tokenFor(USER_A, {expiresIn: -60});
      const ids = await storedUserIds(
        [event('late', {user_id: USER_A})],
        {authorization: `Bearer ${expired}`},
      );
      expect(ids).toEqual([USER_A]);
    });

    it('ignores tokens signed with another secret', async () => {
      const forged = jwt.sign({userId: USER_A}, 'not-the-secret');
      const ids = await storedUserIds(
        [event('forged', {user_id: USER_A})],
        {authorization: `Bearer ${forged}`},
      );
      expect(ids).toEqual([null]);
    });

    it('fills an omitted user_id from the verified user', async () => {
      const {user_id: _omitted, ...withoutUser} = event('omitted');
      const ids = await storedUserIds(
        [withoutUser],
        {authorization: `Bearer ${tokenFor(USER_A)}`},
      );
      expect(ids).toEqual([USER_A]);
    });

    it('stores no user ids on the platform host', async () => {
      const ids = await storedUserIds(
        [event('www', {user_id: USER_A})],
        {authorization: `Bearer ${tokenFor(USER_A)}`, school: 'www'},
      );
      expect(ids).toEqual([null]);
    });
  });

  it('stores a keyed IP hash, not a plain SHA-256 of the address', async () => {
    const insertMany = jest.fn(async docs => docs);
    await request(appWithInsert(insertMany)).post('/v1/events').send({events: [event('ip')]});

    const stored = insertMany.mock.calls[0][0][0];
    expect(stored.ip_hash).toMatch(/^k1:[a-f0-9]{32}$/);
    expect(stored.ip_hash).not.toContain(
      crypto.createHash('sha256').update('127.0.0.1').digest('hex').slice(0, 32),
    );
  });
});
