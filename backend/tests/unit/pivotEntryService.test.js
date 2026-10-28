jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
  getTenantByKey: jest.fn(),
}));

jest.mock('../../services/pivotReferralCodeService', () => ({
  validateReferralCode: jest.fn(),
  redeemReferralCode: jest.fn(),
}));

jest.mock('../../services/pivotProfileService', () => ({
  reactivatePivotParticipationByGlobalUserId: jest.fn(),
}));

const { getMergedTenants, getTenantByKey } = require('../../services/tenantConfigService');
const { validateReferralCode, redeemReferralCode } = require('../../services/pivotReferralCodeService');
const {
  reactivatePivotParticipationByGlobalUserId,
} = require('../../services/pivotProfileService');
const {
  listPivotCities,
  resolvePivotEntry,
  redeemPivotEntry,
} = require('../../services/pivotEntryService');

describe('pivotEntryService.listPivotCities', () => {
  beforeEach(() => {
    getMergedTenants.mockReset();
  });

  it('returns active pivot tenants only', async () => {
    getMergedTenants.mockResolvedValue([
      {
        tenantKey: 'rpi',
        subdomain: 'rpi',
        name: 'RPI',
        location: 'Troy, NY',
        status: 'active',
        tenantType: 'campus',
      },
      {
        tenantKey: 'nyc',
        subdomain: 'nyc',
        name: 'New York City',
        location: 'New York City',
        status: 'active',
        tenantType: 'pivot',
      },
      {
        tenantKey: 'la',
        subdomain: 'la',
        name: 'Los Angeles',
        location: 'Los Angeles',
        status: 'coming_soon',
        tenantType: 'pivot',
      },
    ]);

    const result = await listPivotCities({});
    expect(result.data.cities).toEqual([
      {
        tenantKey: 'nyc',
        subdomain: 'nyc',
        cityDisplayName: 'New York City',
        status: 'active',
        statusMessage: '',
        // No stored drop schedule: the pilot default.
        timeZone: 'America/New_York',
        latitude: expect.closeTo(40.71, 1),
        longitude: expect.closeTo(-74.01, 1),
      },
    ]);
  });

  it('carries each city\'s drop time zone and where it is', async () => {
    getMergedTenants.mockResolvedValue([
      {
        tenantKey: 'sf',
        location: 'San Francisco, California',
        status: 'active',
        tenantType: 'pivot',
        pivotDropTimezone: 'America/Los_Angeles',
        pivotDropDayOfWeek: 0,
        pivotDropHour: 18,
      },
    ]);

    const [city] = (await listPivotCities({})).data.cities;
    expect(city.timeZone).toBe('America/Los_Angeles');
    expect(city.latitude).toBeCloseTo(37.77, 1);
    expect(city.longitude).toBeCloseTo(-122.42, 1);
  });

  it('leaves the place empty for a city the directory has no match for', async () => {
    getMergedTenants.mockResolvedValue([
      {
        tenantKey: 'qq',
        location: 'Qqzzyx, Nowhere',
        status: 'active',
        tenantType: 'pivot',
      },
    ]);

    const [city] = (await listPivotCities({})).data.cities;
    expect(city.latitude).toBeNull();
    expect(city.longitude).toBeNull();
  });
});

describe('pivotEntryService.resolvePivotEntry', () => {
  beforeEach(() => {
    getTenantByKey.mockReset();
    validateReferralCode.mockReset();
  });

  it('resolves open entry without referral code', async () => {
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      name: 'New York City',
      location: 'New York City',
      status: 'active',
      tenantType: 'pivot',
    });

    const result = await resolvePivotEntry({}, { tenantKey: 'nyc' });
    expect(result.data).toMatchObject({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      cityDisplayName: 'New York City',
      referralAttribution: false,
    });
    expect(validateReferralCode).not.toHaveBeenCalled();
  });

  it('attaches referral metadata when code matches tenant', async () => {
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      name: 'New York City',
      location: 'New York City',
      status: 'active',
      tenantType: 'pivot',
    });
    validateReferralCode.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        cohortId: 'pilot-a',
        batchWeek: '2026-W21',
      },
    });

    const result = await resolvePivotEntry({}, {
      tenantKey: 'nyc',
      referralCode: 'NYC-PILOT-A',
    });

    expect(result.data).toMatchObject({
      tenantKey: 'nyc',
      code: 'NYC-PILOT-A',
      cohortId: 'pilot-a',
      referralAttribution: true,
    });
  });

  it('still opens entry when referral code is invalid', async () => {
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      subdomain: 'nyc',
      name: 'New York City',
      location: 'New York City',
      status: 'active',
      tenantType: 'pivot',
    });
    validateReferralCode.mockResolvedValue({
      error: 'Invalid referral code.',
      status: 404,
    });

    const result = await resolvePivotEntry({}, {
      tenantKey: 'nyc',
      referralCode: 'BAD',
    });

    expect(result.data.referralAttribution).toBe(false);
    expect(result.data.code).toBeUndefined();
  });
});

describe('pivotEntryService.redeemPivotEntry', () => {
  beforeEach(() => {
    redeemReferralCode.mockReset();
    reactivatePivotParticipationByGlobalUserId.mockReset();
  });

  it('records open entry without referral redemption', async () => {
    const req = {
      user: { globalUserId: '507f1f77bcf86cd799439011' },
    };

    const result = await redeemPivotEntry(req, {});
    expect(reactivatePivotParticipationByGlobalUserId).toHaveBeenCalled();
    expect(redeemReferralCode).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      entered: true,
      referralRedeemed: false,
    });
  });

  it('delegates to referral redeem when code provided', async () => {
    const req = {
      user: { globalUserId: '507f1f77bcf86cd799439011' },
    };
    redeemReferralCode.mockResolvedValue({
      data: { redeemed: true, redemptionCount: 1, maxRedemptions: 50 },
    });

    await redeemPivotEntry(req, { referralCode: 'NYC-PILOT-A' });
    expect(redeemReferralCode).toHaveBeenCalledWith(
      req,
      'NYC-PILOT-A',
      expect.any(Object),
    );
  });
});
