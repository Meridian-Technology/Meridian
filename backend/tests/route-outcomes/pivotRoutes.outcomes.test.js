const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = {
      globalUserId: '507f191e810c19729de860ea',
      userId: '507f191e810c19729de860eb',
    };
    next();
  }),
}));

jest.mock('../../services/pivotEntryService', () => ({
  listPivotCities: jest.fn(),
  resolvePivotEntry: jest.fn(),
  redeemPivotEntry: jest.fn(),
}));

jest.mock('../../services/pivotLandingDropService', () => ({
  getPivotLandingDrop: jest.fn(),
}));

jest.mock('../../services/pivotLandingService', () => ({
  recordLandingEvent: jest.fn(),
  getLandingConfig: jest.fn(),
}));

jest.mock('../../services/pivotLandingWaitlistService', () => ({
  joinWaitlist: jest.fn(),
}));

jest.mock('../../services/pivotLandingQrService', () => ({
  hopLandingQr: jest.fn(),
}));

jest.mock('../../services/pivotReferralCodeService', () => ({
  validateReferralCode: jest.fn(),
  redeemReferralCode: jest.fn(),
}));

jest.mock('../../services/pivotFeedService', () => ({
  getPivotFeed: jest.fn(),
  getPivotEventFriends: jest.fn(),
}));

jest.mock('../../services/pivotCrossCrewService', () => ({
  getPivotEventCrossCrewOverlap: jest.fn(),
}));

jest.mock('../../services/pivotExploreService', () => ({
  getPivotExplore: jest.fn(),
}));

jest.mock('../../services/pivotIntentService', () => ({
  recordFeedAction: jest.fn(),
  recordExternalOpen: jest.fn(),
  confirmRegistered: jest.fn(),
  getWeekRecap: jest.fn(),
  resetWeekActions: jest.fn(),
}));

jest.mock('../../services/pivotInteractionService', () => ({
  recordPivotImpressions: jest.fn(),
}));

jest.mock('../../services/pivotFeedbackService', () => ({
  getPendingEventFeedback: jest.fn(),
  submitEventFeedback: jest.fn(),
}));

jest.mock('../../services/pivotConfigService', () => ({
  getPivotConfig: jest.fn(),
}));

jest.mock('../../services/pivotCopyService', () => {
  const actual = jest.requireActual('../../services/pivotCopyService');
  return {
    ...actual,
    getPivotCopy: jest.fn(),
    getPlatformLandingCopy: jest.fn(),
  };
});

jest.mock('../../services/pivotWeekRitualService', () => ({
  getPivotWeekRitual: jest.fn(),
  RITUAL_MIN_APP_VERSION: '2.0.0',
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

const {
  listPivotCities,
  resolvePivotEntry,
  redeemPivotEntry,
} = require('../../services/pivotEntryService');
const { getPivotLandingDrop } = require('../../services/pivotLandingDropService');
const { recordLandingEvent, getLandingConfig } = require('../../services/pivotLandingService');
const { joinWaitlist } = require('../../services/pivotLandingWaitlistService');
const { hopLandingQr } = require('../../services/pivotLandingQrService');
const {
  pivotLandingEventRateLimit,
  pivotLandingWaitlistRateLimit,
  pivotLandingQrHopRateLimit,
  LANDING_EVENT_MAX_PER_WINDOW,
  WAITLIST_MAX_PER_WINDOW,
  QR_HOP_MAX_PER_WINDOW,
} = require('../../middlewares/pivotLandingDropRateLimit');
const { validateReferralCode, redeemReferralCode } = require('../../services/pivotReferralCodeService');
const { getPivotFeed } = require('../../services/pivotFeedService');
const { getPivotEventCrossCrewOverlap } = require('../../services/pivotCrossCrewService');
const { getPivotExplore } = require('../../services/pivotExploreService');
const {
  recordFeedAction,
  recordExternalOpen,
  confirmRegistered,
  getWeekRecap,
  resetWeekActions,
} = require('../../services/pivotIntentService');
const { recordPivotImpressions } = require('../../services/pivotInteractionService');
const {
  getPendingEventFeedback,
  submitEventFeedback,
} = require('../../services/pivotFeedbackService');
const { getPivotConfig } = require('../../services/pivotConfigService');
const { getPivotCopy, getPlatformLandingCopy } = require('../../services/pivotCopyService');
const { verifyToken } = require('../../middlewares/verifyToken');
const { getPivotWeekRitual } = require('../../services/pivotWeekRitualService');
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

describe('pivotRoutes GET /pivot/cities', () => {
  beforeEach(() => {
    listPivotCities.mockReset();
  });

  it('returns 200 with city list', async () => {
    listPivotCities.mockResolvedValue({
      data: {
        cities: [
          {
            tenantKey: 'nyc',
            subdomain: 'nyc',
            cityDisplayName: 'New York City',
            status: 'active',
            statusMessage: '',
          },
        ],
      },
    });

    const response = await request(buildBaseApp()).get('/pivot/cities');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cities).toHaveLength(1);
  });
});

describe('pivotRoutes GET /pivot/landing/config', () => {
  beforeEach(() => {
    getLandingConfig.mockReset();
    verifyToken.mockClear();
  });

  it('returns 200 with waitlist and launched cities without auth', async () => {
    getLandingConfig.mockResolvedValue({
      data: {
        cities: [
          {
            tenantKey: 'nyc',
            cityDisplayName: 'New York City',
            landingMode: 'waitlist',
            nextDropAt: '2026-08-13T22:00:00.000Z',
          },
          {
            tenantKey: 'sf',
            cityDisplayName: 'San Francisco',
            landingMode: 'launched',
            nextDropAt: '2026-08-15T02:30:00.000Z',
          },
        ],
      },
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/config');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cities).toEqual([
      {
        tenantKey: 'nyc',
        cityDisplayName: 'New York City',
        landingMode: 'waitlist',
        nextDropAt: '2026-08-13T22:00:00.000Z',
      },
      {
        tenantKey: 'sf',
        cityDisplayName: 'San Francisco',
        landingMode: 'launched',
        nextDropAt: '2026-08-15T02:30:00.000Z',
      },
    ]);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(getLandingConfig).toHaveBeenCalledWith(expect.any(Object), { tenantKey: undefined });
  });

  it('passes tenantKey so a scoped city is included', async () => {
    getLandingConfig.mockResolvedValue({
      data: {
        cities: [
          { tenantKey: 'troy', cityDisplayName: 'Troy', landingMode: 'waitlist' },
        ],
      },
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/config?tenantKey=troy');
    expect(response.statusCode).toBe(200);
    expect(getLandingConfig).toHaveBeenCalledWith(expect.any(Object), { tenantKey: 'troy' });
  });

  it('returns 404 TENANT_NOT_FOUND for an unknown tenantKey', async () => {
    getLandingConfig.mockResolvedValue({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/config?tenantKey=paris');
    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('pivotRoutes GET /pivot/landing/drop', () => {
  beforeEach(() => {
    getPivotLandingDrop.mockReset();
  });

  it('returns 200 with card-only drop events', async () => {
    getPivotLandingDrop.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        cityDisplayName: 'New York City',
        batchWeek: '2026-W33',
        dropAt: '2026-08-13T22:00:00.000Z',
        events: [
          {
            id: 'fri',
            name: 'friday night market',
            hostName: 'public records',
            startTime: '2026-08-14T23:00:00.000Z',
            location: 'brooklyn',
            tag: 'live-music',
          },
        ],
      },
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/drop?tenantKey=nyc');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.events[0]).not.toHaveProperty('description');
    expect(response.body.data.events[0]).not.toHaveProperty('externalLink');
    expect(getPivotLandingDrop).toHaveBeenCalledWith(
      expect.anything(),
      { tenantKey: 'nyc' },
    );
  });

  it('returns 404 when the city is missing', async () => {
    getPivotLandingDrop.mockResolvedValue({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/drop?tenantKey=missing');
    expect(response.statusCode).toBe(404);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('pivotRoutes POST /pivot/landing/event', () => {
  beforeEach(() => {
    recordLandingEvent.mockReset();
    pivotLandingEventRateLimit.reset();
    verifyToken.mockClear();
  });

  it('returns 200 success on a valid view without auth', async () => {
    recordLandingEvent.mockResolvedValue({ data: {} });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/event')
      .send({ type: 'view', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(verifyToken).not.toHaveBeenCalled();
    expect(recordLandingEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ type: 'view', visitorId: 'visitor-abc' }),
    );
  });

  it('returns 400 with INVALID_TYPE for an invalid type', async () => {
    recordLandingEvent.mockResolvedValue({
      error: 'type must be view or store_click.',
      status: 400,
      code: 'INVALID_TYPE',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/event')
      .send({ type: 'waitlist_submit', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('INVALID_TYPE');
  });

  it('returns 429 after the per-IP burst', async () => {
    recordLandingEvent.mockResolvedValue({ data: {} });
    const app = buildBaseApp();
    const payload = { type: 'view', visitorId: 'visitor-abc' };

    for (let i = 0; i < LANDING_EVENT_MAX_PER_WINDOW; i += 1) {
      const ok = await request(app).post('/pivot/landing/event').send(payload);
      expect(ok.statusCode).toBe(200);
    }

    const limited = await request(app).post('/pivot/landing/event').send(payload);
    expect(limited.statusCode).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.body.code).toBe('LANDING_EVENT_RATE_LIMIT');
  });
});

describe('pivotRoutes POST /pivot/landing/waitlist', () => {
  beforeEach(() => {
    joinWaitlist.mockReset();
    pivotLandingWaitlistRateLimit.reset();
    verifyToken.mockClear();
  });

  it('returns 200 with shareUrl without auth', async () => {
    joinWaitlist.mockResolvedValue({
      data: {
        shareUrl: 'https://justgo.lol/nyc?ref=abc123xyzz',
        friendsJoined: 0,
        tenantKey: 'nyc',
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/waitlist')
      .send({ email: 'alex@example.com', tenantKey: 'nyc', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        shareUrl: 'https://justgo.lol/nyc?ref=abc123xyzz',
        friendsJoined: 0,
        tenantKey: 'nyc',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/alex@example\.com/i);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(joinWaitlist).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ email: 'alex@example.com', tenantKey: 'nyc' }),
    );
  });

  it('returns 409 WAITLIST_DUPLICATE for the same email+city', async () => {
    joinWaitlist.mockResolvedValue({
      error: 'This email is already on the waitlist for this city.',
      status: 409,
      code: 'WAITLIST_DUPLICATE',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/waitlist')
      .send({ email: 'alex@example.com', tenantKey: 'nyc', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('WAITLIST_DUPLICATE');
  });

  it('returns 400 INVALID_EMAIL for garbage addresses', async () => {
    joinWaitlist.mockResolvedValue({
      error: 'Enter a valid email address.',
      status: 400,
      code: 'INVALID_EMAIL',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/waitlist')
      .send({ email: 'nope', tenantKey: 'nyc', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_EMAIL');
  });

  it('returns 400 CITY_REQUIRED when generic signup omits city', async () => {
    joinWaitlist.mockResolvedValue({
      error: 'City is required.',
      status: 400,
      code: 'CITY_REQUIRED',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/waitlist')
      .send({ email: 'alex@example.com', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('CITY_REQUIRED');
  });

  it('returns 429 after the per-IP burst', async () => {
    joinWaitlist.mockResolvedValue({
      data: { shareUrl: 'https://justgo.lol/nyc?ref=abc', friendsJoined: 0, tenantKey: 'nyc' },
    });
    const app = buildBaseApp();
    const payload = { email: 'alex@example.com', tenantKey: 'nyc', visitorId: 'visitor-abc' };

    for (let i = 0; i < WAITLIST_MAX_PER_WINDOW; i += 1) {
      const ok = await request(app).post('/pivot/landing/waitlist').send(payload);
      expect(ok.statusCode).toBe(200);
    }

    const limited = await request(app).post('/pivot/landing/waitlist').send(payload);
    expect(limited.statusCode).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.body.code).toBe('WAITLIST_RATE_LIMIT');
  });
});

describe('pivotRoutes POST /pivot/landing/qr-scan (Task 5.2)', () => {
  beforeEach(() => {
    hopLandingQr.mockReset();
    pivotLandingQrHopRateLimit.reset();
    verifyToken.mockClear();
  });

  it('returns 200 with city redirect and src=qr without auth', async () => {
    hopLandingQr.mockResolvedValue({
      data: {
        name: 'poster-a',
        tenantKey: 'troy',
        redirectUrl: 'https://justgo.lol/troy?src=qr&qr=poster-a',
        path: '/troy',
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/qr-scan')
      .send({ name: 'poster-a', visitorId: 'visitor-abc', unique: true });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.redirectUrl).toContain('src=qr');
    expect(response.body.data.redirectUrl).toContain('qr=poster-a');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(hopLandingQr).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ name: 'poster-a', visitorId: 'visitor-abc' }),
    );
  });

  it('returns 404 QR_NOT_FOUND when the code is missing', async () => {
    hopLandingQr.mockResolvedValue({
      error: 'QR code not found.',
      status: 404,
      code: 'QR_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/qr-scan')
      .send({ name: 'missing' });

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('QR_NOT_FOUND');
  });

  it('returns 400 QR_INACTIVE and does not look like a redirect', async () => {
    hopLandingQr.mockResolvedValue({
      error: 'QR code is inactive.',
      status: 400,
      code: 'QR_INACTIVE',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/landing/qr-scan')
      .send({ name: 'poster-a', visitorId: 'visitor-abc' });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('QR_INACTIVE');
    expect(response.body.data).toBeUndefined();
  });

  it('returns 429 after the per-IP burst', async () => {
    hopLandingQr.mockResolvedValue({
      data: {
        name: 'poster-a',
        tenantKey: 'troy',
        redirectUrl: 'https://justgo.lol/troy?src=qr&qr=poster-a',
        path: '/troy',
      },
    });
    const app = buildBaseApp();
    const payload = { name: 'poster-a', visitorId: 'visitor-abc', unique: true };

    for (let i = 0; i < QR_HOP_MAX_PER_WINDOW; i += 1) {
      const ok = await request(app).post('/pivot/landing/qr-scan').send(payload);
      expect(ok.statusCode).toBe(200);
    }

    const limited = await request(app).post('/pivot/landing/qr-scan').send(payload);
    expect(limited.statusCode).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.body.code).toBe('LANDING_QR_RATE_LIMIT');
  });
});

describe('pivotRoutes GET /pivot/landing/copy', () => {
  beforeEach(() => {
    getPlatformLandingCopy.mockReset();
    getPlatformLandingCopy.mockResolvedValue({
      data: {
        revision: 'p0:t0',
        schemaVersion: 1,
        tokens: {},
        entries: {},
      },
    });
  });

  it('returns 200 sparse overlay without auth', async () => {
    getPlatformLandingCopy.mockResolvedValue({
      data: {
        revision: 'p2:t0',
        schemaVersion: 1,
        tokens: { 'brand.name': 'block' },
        entries: { 'landing.web.cta': 'get block' },
      },
    });

    const response = await request(buildBaseApp()).get('/pivot/landing/copy');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.entries).toEqual({ 'landing.web.cta': 'get block' });
    expect(response.body.data.entries).not.toHaveProperty('ticker.week');
    expect(getPlatformLandingCopy).toHaveBeenCalled();
  });

  it('returns 200 empty overlay when the pack is missing', async () => {
    const response = await request(buildBaseApp()).get('/pivot/landing/copy');
    expect(response.statusCode).toBe(200);
    expect(response.body.data.entries).toEqual({});
  });
});

describe('pivotRoutes POST /pivot/entry', () => {
  beforeEach(() => {
    resolvePivotEntry.mockReset();
  });

  it('returns 200 with entry payload', async () => {
    resolvePivotEntry.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        subdomain: 'nyc',
        cityDisplayName: 'New York City',
        batchWeek: null,
        referralAttribution: false,
      },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/entry')
      .send({ tenantKey: 'nyc' });

    expect(response.statusCode).toBe(200);
    expect(resolvePivotEntry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ tenantKey: 'nyc' }),
    );
  });
});

describe('pivotRoutes POST /pivot/entry/redeem', () => {
  beforeEach(() => {
    redeemPivotEntry.mockReset();
  });

  it('returns 200 for open entry redeem', async () => {
    redeemPivotEntry.mockResolvedValue({
      data: { entered: true, referralRedeemed: false },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/entry/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.statusCode).toBe(200);
    expect(response.body.data.entered).toBe(true);
  });
});

describe('pivotRoutes GET /pivot/referral/preview', () => {
  beforeEach(() => {
    validateReferralCode.mockReset();
  });

  it('returns valid preview for redeemable code', async () => {
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
      .get('/pivot/referral/preview')
      .query({ code: 'NYC-PILOT-A' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      valid: true,
      cityDisplayName: 'New York City',
    });
    expect(validateReferralCode).toHaveBeenCalledWith(expect.any(Object), 'NYC-PILOT-A');
  });

  it('returns invalid preview without leaking error details', async () => {
    validateReferralCode.mockResolvedValue({
      error: 'Invalid referral code.',
      status: 404,
      code: 'REFERRAL_CODE_NOT_FOUND',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/referral/preview')
      .query({ code: 'BAD-CODE' });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toEqual({
      valid: false,
      cityDisplayName: null,
    });
  });
});

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
    expect(redeemReferralCode).toHaveBeenCalledWith(
      expect.any(Object),
      'NYC-PILOT-A',
      expect.objectContaining({ referredByUserId: undefined })
    );
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

describe('pivotRoutes GET /pivot/explore', () => {
  beforeEach(() => {
    getPivotExplore.mockReset();
  });

  it('returns 200 with explore payload', async () => {
    getPivotExplore.mockResolvedValue({
      data: {
        batchWeek: '2026-W22',
        cityDisplayName: 'Brooklyn',
        total: 24,
        limit: 40,
        offset: 0,
        filters: {
          tags: [],
          night: null,
          friendsOnly: false,
          excludePassed: true,
          q: null,
        },
        rails: [
          { id: 'friends', title: 'friends going', retrieval: 'friends_rail' },
          { id: 'tonight', title: 'tonight', retrieval: 'filter' },
        ],
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
      .get('/pivot/explore?batchWeek=2026-W22&limit=40&offset=0')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.total).toBe(24);
    expect(response.body.data.filters.excludePassed).toBe(true);
    expect(response.body.data.rails).toHaveLength(2);
    expect(response.body.data.events).toHaveLength(1);
    expect(getPivotExplore).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        batchWeek: '2026-W22',
        limit: '40',
        offset: '0',
        tags: undefined,
        night: undefined,
        friendsOnly: undefined,
        excludePassed: undefined,
        q: undefined,
      }),
    );
  });

  it('returns service error status when explore rejects', async () => {
    getPivotExplore.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/explore?batchWeek=bad-week')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
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

describe('pivotRoutes POST /pivot/interactions/impressions', () => {
  beforeEach(() => {
    recordPivotImpressions.mockReset();
  });

  it('returns 200 with accepted count', async () => {
    recordPivotImpressions.mockReturnValue({
      data: { accepted: 2, skipped: 0, received: 2 },
    });

    const response = await request(buildBaseApp())
      .post('/pivot/interactions/impressions')
      .set('Authorization', 'Bearer test-token')
      .send({
        batchWeek: '2026-W28',
        impressions: [
          { eventId: '665a1b2c3d4e5f6789012345', rankInFeed: 0 },
          { eventId: '665a1b2c3d4e5f6789012346', rankInFeed: 1 },
        ],
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      accepted: 2,
      skipped: 0,
      received: 2,
    });
    expect(recordPivotImpressions).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ userId: '507f191e810c19729de860eb' }),
      }),
      expect.objectContaining({
        batchWeek: '2026-W28',
        impressions: expect.any(Array),
      }),
    );
  });

  it('returns 400 when impressions is missing', async () => {
    const response = await request(buildBaseApp())
      .post('/pivot/interactions/impressions')
      .set('Authorization', 'Bearer test-token')
      .send({ batchWeek: '2026-W28' });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(recordPivotImpressions).not.toHaveBeenCalled();
  });

  it('returns service error status', async () => {
    recordPivotImpressions.mockReturnValue({
      error: 'At most 50 impressions per request.',
      status: 400,
      code: 'IMPRESSION_BATCH_TOO_LARGE',
    });

    const response = await request(buildBaseApp())
      .post('/pivot/interactions/impressions')
      .set('Authorization', 'Bearer test-token')
      .send({
        impressions: [{ eventId: '665a1b2c3d4e5f6789012345', rankInFeed: 0 }],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('IMPRESSION_BATCH_TOO_LARGE');
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
        crewPicks: [
          {
            crewId: '665a1b2c3d4e5f6789012346',
            crewName: 'Friday Plans',
            judgementStatus: 'confirmed',
            event: {
              id: '665a1b2c3d4e5f6789012347',
              name: 'Jazz Night',
              startTime: '2026-07-24T22:00:00.000Z',
            },
          },
        ],
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/week-recap?batchWeek=2026-W22')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.crewPicks).toHaveLength(1);
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

describe('pivotRoutes GET /pivot/events/:eventId/cross-crew-overlap', () => {
  beforeEach(() => {
    getPivotEventCrossCrewOverlap.mockReset();
  });

  it('returns overlap payload for an event', async () => {
    getPivotEventCrossCrewOverlap.mockResolvedValue({
      data: {
        batchWeek: '2026-W22',
        crossCrewOverlap: true,
        surfaceCopyKey: 'another_crew_going',
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/events/665a1b2c3d4e5f6789012345/cross-crew-overlap?batchWeek=2026-W22')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.crossCrewOverlap).toBe(true);
    expect(getPivotEventCrossCrewOverlap).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      '665a1b2c3d4e5f6789012345',
      { batchWeek: '2026-W22' },
    );
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

describe('pivotRoutes GET /pivot/week-ritual', () => {
  beforeEach(() => {
    getPivotWeekRitual.mockReset();
  });

  it('returns 426 when X-App-Version is missing', async () => {
    const response = await request(buildBaseApp())
      .get('/pivot/week-ritual')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(426);
    expect(response.body.code).toBe('APP_UPGRADE_REQUIRED');
    expect(getPivotWeekRitual).not.toHaveBeenCalled();
  });

  it('returns 426 when X-App-Version is below ritual minimum', async () => {
    const response = await request(buildBaseApp())
      .get('/pivot/week-ritual')
      .set('Authorization', 'Bearer test-token')
      .set('X-App-Version', '1.9.9');

    expect(response.statusCode).toBe(426);
    expect(response.body.minAppVersion).toBe('2.0.0');
  });

  it('returns 200 with ritual payload for supported app versions', async () => {
    getPivotWeekRitual.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        phase: 'swiping',
        deck: { remaining: 2, complete: false, holdUntil: null },
        crews: [{ crewId: '665a1b2c3d4e5f6789012345', name: 'Friday Plans' }],
        decideQueueOrder: [],
        actions: { openDeck: true, openDecide: false, openRecap: false },
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/week-ritual?batchWeek=2026-W30')
      .set('Authorization', 'Bearer test-token')
      .set('X-App-Version', '2.0.0');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.phase).toBe('swiping');
    expect(getPivotWeekRitual).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ batchWeek: '2026-W30' }),
    );
  });

  it('returns 400 when ritual service rejects batchWeek', async () => {
    getPivotWeekRitual.mockResolvedValue({
      error: 'batchWeek must be ISO format YYYY-Www.',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/week-ritual?batchWeek=bad')
      .set('Authorization', 'Bearer test-token')
      .set('X-App-Version', '2.0.0');

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_WEEK');
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
        copy: {
          revision: 'p1:t0',
          schemaVersion: 1,
        },
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/config?batchWeek=2026-W23')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.dropSchedule.batchWeek).toBe('2026-W23');
    expect(response.body.data.copy).toEqual({
      revision: 'p1:t0',
      schemaVersion: 1,
    });
    expect(response.body.data.copy.entries).toBeUndefined();
    expect(response.body.data.entries).toBeUndefined();
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

describe('pivotRoutes GET /pivot/copy', () => {
  const sparsePack = {
    revision: 'p1:t0',
    schemaVersion: 1,
    tokens: { 'group.singular': 'crew' },
    entries: { 'ticker.week': 'this week' },
  };

  beforeEach(() => {
    getPivotCopy.mockReset();
    verifyToken.mockImplementation((req, _res, next) => {
      req.user = {
        globalUserId: '507f191e810c19729de860ea',
        userId: '507f191e810c19729de860eb',
      };
      next();
    });
  });

  afterEach(() => {
    verifyToken.mockImplementation((req, _res, next) => {
      req.user = {
        globalUserId: '507f191e810c19729de860ea',
        userId: '507f191e810c19729de860eb',
      };
      next();
    });
  });

  it('returns 200 with a sparse overlay (no catalog dump)', async () => {
    getPivotCopy.mockResolvedValue({ data: sparsePack });

    const response = await request(buildBaseApp())
      .get('/pivot/copy?schemaVersion=1')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(sparsePack);
    expect(Object.keys(response.body.data).sort()).toEqual([
      'entries',
      'revision',
      'schemaVersion',
      'tokens',
    ]);
    expect(response.headers.etag).toBe('"p1:t0"');
    expect(getPivotCopy).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ schemaVersion: '1' }),
    );
  });

  it('returns 200 for an empty overlay', async () => {
    getPivotCopy.mockResolvedValue({
      data: {
        revision: 'p0:t0',
        schemaVersion: 1,
        tokens: {},
        entries: {},
      },
    });

    const response = await request(buildBaseApp())
      .get('/pivot/copy')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.entries).toEqual({});
    expect(response.body.data.tokens).toEqual({});
    expect(response.headers.etag).toBe('"p0:t0"');
  });

  it('returns 304 when If-None-Match matches the revision ETag', async () => {
    getPivotCopy.mockResolvedValue({ data: sparsePack });

    const response = await request(buildBaseApp())
      .get('/pivot/copy')
      .set('Authorization', 'Bearer test-token')
      .set('If-None-Match', '"p1:t0"');

    expect(response.statusCode).toBe(304);
    expect(response.body).toEqual({});
    expect(response.headers.etag).toBe('"p1:t0"');
  });

  it('returns 400 when copy service rejects a non-pivot tenant', async () => {
    getPivotCopy.mockResolvedValue({
      error: 'Pivot copy is only available for pivot city tenants.',
      status: 400,
    });

    const response = await request(buildBaseApp())
      .get('/pivot/copy')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('returns 400 when schemaVersion is invalid', async () => {
    getPivotCopy.mockResolvedValue({
      error: 'schemaVersion must be a positive integer.',
      status: 400,
      code: 'INVALID_SCHEMA_VERSION',
    });

    const response = await request(buildBaseApp())
      .get('/pivot/copy?schemaVersion=nope')
      .set('Authorization', 'Bearer test-token');

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_SCHEMA_VERSION');
  });

  it('returns 401 when verifyToken rejects a missing token', async () => {
    verifyToken.mockImplementation((_req, res) =>
      res.status(401).json({
        success: false,
        message: 'No access token provided',
        code: 'NO_TOKEN',
      }),
    );

    const response = await request(buildBaseApp()).get('/pivot/copy');

    expect(response.statusCode).toBe(401);
    expect(response.body.code).toBe('NO_TOKEN');
    expect(getPivotCopy).not.toHaveBeenCalled();
  });

  it('returns 403 when verifyToken rejects a bad token', async () => {
    verifyToken.mockImplementation((_req, res) =>
      res.status(403).json({
        success: false,
        message: 'Invalid access token',
        code: 'INVALID_TOKEN',
      }),
    );

    const response = await request(buildBaseApp())
      .get('/pivot/copy')
      .set('Authorization', 'Bearer bad');

    expect(response.statusCode).toBe(403);
    expect(getPivotCopy).not.toHaveBeenCalled();
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
