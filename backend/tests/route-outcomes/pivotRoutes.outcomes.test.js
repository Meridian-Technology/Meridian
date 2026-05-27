const express = require('express');
const request = require('supertest');

jest.mock('../../services/pivotReferralCodeService', () => ({
  validateReferralCode: jest.fn(),
}));

const { validateReferralCode } = require('../../services/pivotReferralCodeService');
const pivotRoutes = require('../../routes/pivotRoutes');

describe('pivotRoutes POST /pivot/referral/validate', () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.set('trust proxy', true);
    app.use('/pivot', pivotRoutes);
    return app;
  }

  beforeEach(() => {
    validateReferralCode.mockReset();
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

    const response = await request(buildApp())
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

    const response = await request(buildApp())
      .post('/pivot/referral/validate')
      .send({ code: 'BAD-CODE' });

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Invalid referral code/);
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
 */
