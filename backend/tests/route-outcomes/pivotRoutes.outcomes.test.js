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

const { validateReferralCode, redeemReferralCode } = require('../../services/pivotReferralCodeService');
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
 */
