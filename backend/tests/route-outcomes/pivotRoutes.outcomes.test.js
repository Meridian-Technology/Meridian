const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    req.user = {
      globalUserId: '507f191e810c19729de860ea',
      userId: '507f191e810c19729de860eb',
    };
    next();
  },
}));

jest.mock('../../services/pivotReferralCodeService', () => ({
  validateReferralCode: jest.fn(),
  redeemReferralCode: jest.fn(),
}));

jest.mock('../../services/pivotFeedService', () => ({
  getPivotFeed: jest.fn(),
}));

jest.mock('../../services/pivotIntentService', () => ({
  recordFeedAction: jest.fn(),
  recordExternalOpen: jest.fn(),
  confirmRegistered: jest.fn(),
  getWeekRecap: jest.fn(),
  resetWeekActions: jest.fn(),
}));

jest.mock('../../services/pivotFeedbackService', () => ({
  getPendingEventFeedback: jest.fn(),
  submitEventFeedback: jest.fn(),
}));

jest.mock('../../services/pivotConfigService', () => ({
  getPivotConfig: jest.fn(),
}));

jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
}));

jest.mock('../../services/pivotProfileService', () => ({
  getPivotProfileInterests: jest.fn(),
  updatePivotProfileInterests: jest.fn(),
}));

jest.mock('../../services/pivotFriendService', () => ({
  searchPivotFriends: jest.fn(),
  sendPivotFriendRequest: jest.fn(),
  listPivotFriends: jest.fn(),
  listPivotFriendRequests: jest.fn(),
  acceptPivotFriendRequest: jest.fn(),
  declinePivotFriendRequest: jest.fn(),
}));

const { validateReferralCode, redeemReferralCode } = require('../../services/pivotReferralCodeService');
const { getPivotFeed } = require('../../services/pivotFeedService');
const {
  recordFeedAction,
  recordExternalOpen,
  confirmRegistered,
  getWeekRecap,
  resetWeekActions,
} = require('../../services/pivotIntentService');
const {
  getPendingEventFeedback,
  submitEventFeedback,
} = require('../../services/pivotFeedbackService');
const { getPivotConfig } = require('../../services/pivotConfigService');
const { listPivotTags } = require('../../services/pivotTagCatalogService');
const {
  getPivotProfileInterests,
  updatePivotProfileInterests,
} = require('../../services/pivotProfileService');
const pivotRoutes = require('../../routes/pivotRoutes');

function buildBaseApp() {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', true);
  app.use((req, _res, next) => {
    req.globalDb = {};
    req.school = 'nyc';
    next();
  });
  app.use('/pivot', pivotRoutes);
  return app;
}

describe('pivotRoutes POST /pivot/referral/validate', () => {
  beforeEach(() => {
    validateReferralCode.mockReset();
    redeemReferralCode.mockReset();
    getPivotFeed.mockReset();
  });

  it('returns 200 with tenant payload for valid code', async () => {
    validateReferralCode.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        subdomain: 'nyc',
        cohortId: 'pilot-a',
        cityDisplayName: 'New York City',
        batchWeek: '2026-W21',
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/referral/validate')
      .send({ code: 'NYC-PILOT-A' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.subdomain).toBe('nyc');
    expect(validateReferralCode).toHaveBeenCalledWith(expect.any(Object), 'NYC-PILOT-A');
  });

  it('returns 404 for invalid code', async () => {
    validateReferralCode.mockResolvedValue({
      error: 'Invalid referral code.',
      status: 404,
      code: 'REFERRAL_CODE_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/referral/validate')
      .send({ code: 'BAD-CODE' });

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Invalid referral code/);
  });
});

describe('pivotRoutes POST /pivot/referral/redeem', () => {
  beforeEach(() => {
    validateReferralCode.mockReset();
    redeemReferralCode.mockReset();
    getPivotFeed.mockReset();
  });

  it('returns 200 with redeem payload', async () => {
    redeemReferralCode.mockResolvedValue({
      data: {
        redeemed: true,
        alreadyRedeemed: false,
        redemptionCount: 1,
        maxRedemptions: 50,
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/referral/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'NYC-PILOT-A' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.redemptionCount).toBe(1);
    expect(redeemReferralCode).toHaveBeenCalledWith(expect.any(Object), 'NYC-PILOT-A');
  });

  it('returns 403 when service rejects', async () => {
    redeemReferralCode.mockResolvedValue({
      error: 'Sign in against the pilot city (nyc) before redeeming this code.',
      status: 403,
      code: 'TENANT_MISMATCH',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/referral/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'NYC-PILOT-A' });

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe('TENANT_MISMATCH');
  });
});

describe('pivotRoutes GET /pivot/feed', () => {
  beforeEach(() => {
    getPivotFeed.mockReset();
  });

  it('returns 200 with feed payload', async () => {
    getPivotFeed.mockResolvedValue({
      data: {
        batchWeek: '2026-W22',
        cityDisplayName: 'New York City',
        events: [
          {
            _id: '665a1b2c3d4e5f6789012345',
            name: 'Friday Night Board Games',
            displayHost: { name: 'Brooklyn Board Game Cafe' },
            userIntent: null,
            friendsInterested: [],
            friendsGoing: [],
          },
        ],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/feed?batchWeek=2026-W22')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.events[0].displayHost.name).toBe(
      'Brooklyn Board Game Cafe',
    );
    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ batchWeek: '2026-W22' }),
    );
  });

  it('forwards excludeEventIds query to the feed service', async () => {
    getPivotFeed.mockResolvedValue({
      data: { batchWeek: '2026-W22', cityDisplayName: 'New York City', events: [] },
    });

    await request(buildBaseApp())
      .get('/pivot/feed?excludeEventIds=665a1b2c3d4e5f6789012345,665a1b2c3d4e5f6789012346')
      .set('Authorization', 'Bearer test-token');

    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({
        excludeEventIds: '665a1b2c3d4e5f6789012345,665a1b2c3d4e5f6789012346',
      }),
    );
  });

  it('returns empty feed with 200', async () => {
    getPivotFeed.mockResolvedValue({
      data: {
        batchWeek: '2026-W22',
        cityDisplayName: 'New York City',
        events: [],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/feed')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.events).toEqual([]);
  });

  it('returns service error status', async () => {
    getPivotFeed.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/feed?batchWeek=bad-week')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
  });
});

describe('pivotRoutes POST /pivot/feed/action', () => {
  beforeEach(() => {
    recordFeedAction.mockReset();
  });

  it('returns 200 with persisted intent', async () => {
    recordFeedAction.mockResolvedValue({
      data: { eventId: '665a1b2c3d4e5f6789012345', status: 'interested', batchWeek: '2026-W22' },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/feed/action')
      .set('Authorization', 'Bearer test-token')
      .send({ eventId: '665a1b2c3d4e5f6789012345', action: 'interested' });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.status).toBe('interested');
    expect(recordFeedAction).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ action: 'interested' }),
    );
  });

  it('returns 400 for invalid action', async () => {
    recordFeedAction.mockResolvedValue({
      error: "action must be 'interested' or 'pass'.",
      status: 400,
      code: 'INVALID_ACTION',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/feed/action')
      .set('Authorization', 'Bearer test-token')
      .send({ eventId: '665a1b2c3d4e5f6789012345', action: 'going' });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_ACTION');
  });
});

describe('pivotRoutes POST /pivot/intent/:eventId/external-open', () => {
  beforeEach(() => {
    recordExternalOpen.mockReset();
  });

  it('returns 200 with external open count', async () => {
    recordExternalOpen.mockResolvedValue({
      data: {
        eventId: '665a1b2c3d4e5f6789012345',
        status: 'interested',
        externalOpenCount: 1,
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/intent/665a1b2c3d4e5f6789012345/external-open')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.statusCode).toBe(200);
    expect(response.body.data.externalOpenCount).toBe(1);
    expect(recordExternalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      '665a1b2c3d4e5f6789012345',
      expect.any(Object),
    );
  });
});

describe('pivotRoutes POST /pivot/intent/:eventId/registered', () => {
  beforeEach(() => {
    confirmRegistered.mockReset();
  });

  it('returns 200 with registered status', async () => {
    confirmRegistered.mockResolvedValue({
      data: { eventId: '665a1b2c3d4e5f6789012345', status: 'registered', batchWeek: '2026-W22' },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/intent/665a1b2c3d4e5f6789012345/registered')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.status).toBe('registered');
    expect(confirmRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      '665a1b2c3d4e5f6789012345',
      {},
    );
  });

  it('returns 404 when event is not a pivot catalog event', async () => {
    confirmRegistered.mockResolvedValue({
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/intent/665a1b2c3d4e5f6789012345/registered')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(404);
    expect(response.body.code).toBe('EVENT_NOT_FOUND');
  });
});

describe('pivotRoutes GET /pivot/week-recap', () => {
  beforeEach(() => {
    getWeekRecap.mockReset();
  });

  it('returns 200 with recap events', async () => {
    getWeekRecap.mockResolvedValue({
      data: {
        batchWeek: '2026-W22',
        events: [
          {
            _id: '665a1b2c3d4e5f6789012345',
            displayHost: { name: 'Venue' },
            externalLink: 'https://partiful.com/e/x',
            userIntent: 'interested',
          },
        ],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/week-recap?batchWeek=2026-W22')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.events).toHaveLength(1);
    expect(getWeekRecap).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      { batchWeek: '2026-W22' },
    );
  });

  it('returns service error status', async () => {
    getWeekRecap.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/week-recap?batchWeek=bad')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
  });
});

describe('pivotRoutes GET /pivot/feedback/pending', () => {
  beforeEach(() => {
    getPendingEventFeedback.mockReset();
  });

  it('returns pending events payload', async () => {
    getPendingEventFeedback.mockResolvedValue({
      data: {
        events: [
          {
            _id: '665a1b2c3d4e5f6789012345',
            name: 'Board Game Night',
            batchWeek: '2026-W26',
          },
        ],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/feedback/pending')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.events[0].name).toBe('Board Game Night');
  });
});

describe('pivotRoutes POST /pivot/feedback', () => {
  beforeEach(() => {
    submitEventFeedback.mockReset();
  });

  it('returns 404 for unknown event', async () => {
    submitEventFeedback.mockResolvedValue({
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/feedback')
      .set('Authorization', 'Bearer test-token')
      .send({ eventId: '665a1b2c3d4e5f6789012345', rating: 4 });

    expect(response.statusCode).toBe(404);
    expect(response.body.code).toBe('EVENT_NOT_FOUND');
  });

  it('returns 200 on successful submit', async () => {
    submitEventFeedback.mockResolvedValue({
      data: { eventId: '665a1b2c3d4e5f6789012345', rating: 5 },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/feedback')
      .set('Authorization', 'Bearer test-token')
      .send({ eventId: '665a1b2c3d4e5f6789012345', rating: 5 });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.rating).toBe(5);
  });

  it('returns 400 when eventId is missing', async () => {
    const response = await request(buildBaseApp())
      .post('/pivot/feedback')
      .set('Authorization', 'Bearer test-token')
      .send({ rating: 4 });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(submitEventFeedback).not.toHaveBeenCalled();
  });
});

describe('pivotRoutes POST /pivot/dev/reset-week-actions', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetWeekActions.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 404 outside development', async () => {
    process.env.NODE_ENV = 'production';

    const response = await request(buildBaseApp())
      .post('/pivot/dev/reset-week-actions')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.statusCode).toBe(404);
    expect(resetWeekActions).not.toHaveBeenCalled();
  });

  it('returns 200 with deleted count in development', async () => {
    process.env.NODE_ENV = 'development';
    resetWeekActions.mockResolvedValue({
      data: { batchWeek: '2026-W22', deletedCount: 2 },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/dev/reset-week-actions')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.statusCode).toBe(200);
    expect(response.body.data.deletedCount).toBe(2);
    expect(resetWeekActions).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ batchWeek: undefined }),
    );
  });
});

describe('pivotRoutes GET /pivot/config', () => {
  beforeEach(() => {
    getPivotConfig.mockReset();
  });

  it('returns 200 with drop schedule payload', async () => {
    getPivotConfig.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        cityDisplayName: 'New York City',
        dropSchedule: {
          batchWeek: '2026-W23',
          nextDropAt: '2026-06-04T22:00:00.000Z',
          nextDropFormatted: 'Thu Jun 4, 6:00 PM EDT',
        },
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/config?batchWeek=2026-W23')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.dropSchedule.batchWeek).toBe('2026-W23');
    expect(getPivotConfig).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ batchWeek: '2026-W23' }),
    );
  });

  it('returns 400 when config service rejects tenant', async () => {
    getPivotConfig.mockResolvedValue({
      error: 'Pivot config is only available for pivot city tenants.',
      status: 400,
    });

    const response = await request(buildBaseApp())
      .get('/pivot/config')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

describe('pivotRoutes GET /pivot/profile/interests', () => {
  beforeEach(() => {
    getPivotProfileInterests.mockReset();
  });

  it('returns saved interest tags', async () => {
    getPivotProfileInterests.mockResolvedValue({
      data: { interestTags: ['live-music', 'social'] },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/profile/interests')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.interestTags).toEqual(['live-music', 'social']);
  });

  it('returns service error status', async () => {
    getPivotProfileInterests.mockResolvedValue({
      error: 'User not found.',
      status: 404,
      code: 'USER_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/profile/interests')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(404);
    expect(response.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('pivotRoutes PUT /pivot/profile/interests', () => {
  beforeEach(() => {
    updatePivotProfileInterests.mockReset();
  });

  it('persists interest tags and returns payload', async () => {
    updatePivotProfileInterests.mockResolvedValue({
      data: { interestTags: ['board-games'] },
    });

    const response = await request(buildBaseApp())
      .put('/pivot/profile/interests')
      .set('Authorization', 'Bearer test-token')
      .send({ interestTags: ['board-games'] });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.interestTags).toEqual(['board-games']);
    expect(updatePivotProfileInterests).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      { interestTags: ['board-games'] },
    );
  });

  it('returns 400 for invalid catalog slug', async () => {
    updatePivotProfileInterests.mockResolvedValue({
      error: 'Unknown catalog tag(s): fake-tag',
      status: 400,
      code: 'INVALID_TAG',
    });

    const response = await request(buildBaseApp())
      .put('/pivot/profile/interests')
      .set('Authorization', 'Bearer test-token')
      .send({ interestTags: ['fake-tag'] });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_TAG');
  });
});

describe('pivotRoutes GET /pivot/tags', () => {
  beforeEach(() => {
    listPivotTags.mockReset();
  });

  it('returns active catalog tags for authenticated user', async () => {
    listPivotTags.mockResolvedValue({
      data: {
        tags: [
          { slug: 'live-music', label: 'live music' },
          { slug: 'board-games', label: 'board games' },
        ],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/tags')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tags).toHaveLength(2);
    expect(response.body.data.tags[0].slug).toBe('live-music');
    expect(listPivotTags).toHaveBeenCalledWith(expect.objectContaining({ school: 'nyc' }));
  });

  it('returns 500 when tag service fails', async () => {
    listPivotTags.mockResolvedValue({
      error: 'Global database context required.',
      status: 500,
    });

    const response = await request(buildBaseApp())
      .get('/pivot/tags')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
  });
});

/**
 * Manual curl checks (local dev, after `npm run seed:pivot-referral-codes`):
 *
 * curl -s -X POST http://localhost:5001/pivot/referral/validate \
 *   -H 'Content-Type: application/json' \
 *   -d '{"code":"NYC-PILOT-A"}'
 *
 * curl -s -X POST http://localhost:5001/pivot/referral/validate \
 *   -H 'Content-Type: application/json' \
 *   -d '{"code":"NYC-PILOT-EXPIRED"}'
 *
 * Redeem (requires real JWT for a user + X-Tenant nyc locally):
 *
 * curl -s -X POST http://localhost:5001/pivot/referral/redeem \
 *   -H 'Content-Type: application/json' \
 *   -H 'Authorization: Bearer <access_token>' \
 *   -H 'X-Tenant: nyc' \
 *   -d '{"code":"NYC-PILOT-A"}'
 *
 * Feed (Task 3.1 — after npm run seed:pivot-feed-events):
 *
 * curl -s 'http://localhost:5001/pivot/feed' \
 *   -H 'Authorization: Bearer <access_token>' \
 *   -H 'X-Tenant: nyc'
 */
