jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  normalizeReferralCodeInput,
  validateReferralCode,
} = require('../../services/pivotReferralCodeService');

describe('pivotReferralCodeService.validateReferralCode', () => {
  const req = {};
  let findOne;

  beforeEach(() => {
    findOne = jest.fn();
    getGlobalModels.mockReturnValue({
      PivotReferralCode: { findOne },
    });
    getTenantByKey.mockReset();
  });

  it('normalizes code input', () => {
    expect(normalizeReferralCodeInput('  nyc-pilot-a  ')).toBe('NYC-PILOT-A');
  });

  it('rejects missing code', async () => {
    const result = await validateReferralCode(req, '   ');
    expect(result.status).toBe(400);
    expect(result.code).toBe('REFERRAL_CODE_REQUIRED');
  });

  it('returns tenant metadata for redeemable code', async () => {
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        code: 'NYC-PILOT-A',
        tenantKey: 'nyc',
        cohortId: 'pilot-a',
        active: true,
        expiresAt: null,
        redemptionCount: 0,
        maxRedemptions: 50,
        batchWeek: '2026-W21',
      }),
    });
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      location: 'New York City',
      name: 'NYC Pivot',
      tenantType: 'pivot',
    });

    const result = await validateReferralCode(req, 'nyc-pilot-a');

    expect(findOne).toHaveBeenCalledWith({ code: 'NYC-PILOT-A' });
    expect(result.data).toEqual({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      cohortId: 'pilot-a',
      cityDisplayName: 'New York City',
      batchWeek: '2026-W21',
    });
  });

  it('returns 404 for unknown code', async () => {
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await validateReferralCode(req, 'NO-SUCH-CODE');
    expect(result.status).toBe(404);
    expect(result.code).toBe('REFERRAL_CODE_NOT_FOUND');
  });

  it('returns 403 for inactive code', async () => {
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        code: 'NYC-PILOT-INACTIVE',
        tenantKey: 'nyc',
        active: false,
        expiresAt: null,
        redemptionCount: 0,
        maxRedemptions: 50,
      }),
    });

    const result = await validateReferralCode(req, 'NYC-PILOT-INACTIVE');
    expect(result.status).toBe(403);
    expect(result.code).toBe('REFERRAL_CODE_INACTIVE');
  });

  it('returns 403 for expired code', async () => {
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        code: 'NYC-PILOT-EXPIRED',
        tenantKey: 'nyc',
        active: true,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        redemptionCount: 0,
        maxRedemptions: 50,
      }),
    });

    const result = await validateReferralCode(req, 'NYC-PILOT-EXPIRED');
    expect(result.status).toBe(403);
    expect(result.code).toBe('REFERRAL_CODE_EXPIRED');
  });

  it('returns 403 when redemption limit reached', async () => {
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        code: 'NYC-PILOT-A',
        tenantKey: 'nyc',
        active: true,
        expiresAt: null,
        redemptionCount: 50,
        maxRedemptions: 50,
      }),
    });

    const result = await validateReferralCode(req, 'NYC-PILOT-A');
    expect(result.status).toBe(403);
    expect(result.code).toBe('REFERRAL_CODE_MAXED');
  });
});
