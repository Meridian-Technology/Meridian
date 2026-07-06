const mongoose = require('mongoose');
const pivotReferralCodeSchema = require('../../schemas/pivotReferralCode');

describe('PivotReferralCode schema', () => {
  const PivotReferralCode =
    mongoose.models.TestPivotReferralCode ||
    mongoose.model('TestPivotReferralCode', pivotReferralCodeSchema);

  it('normalizes code and tenantKey on validate', async () => {
    const doc = new PivotReferralCode({
      code: ' nyc-pilot-a ',
      tenantKey: ' NYC ',
      cohortId: 'pilot-a',
      maxRedemptions: 10,
    });

    await doc.validate();
    expect(doc.code).toBe('NYC-PILOT-A');
    expect(doc.tenantKey).toBe('nyc');
  });

  it('isRedeemable respects active, expiry, and max redemptions', () => {
    const active = new PivotReferralCode({
      code: 'TEST-ACTIVE',
      tenantKey: 'nyc',
      cohortId: 'a',
      maxRedemptions: 2,
      redemptionCount: 1,
      active: true,
    });
    expect(active.isRedeemable()).toBe(true);

    const inactive = new PivotReferralCode({
      code: 'TEST-INACTIVE',
      tenantKey: 'nyc',
      cohortId: 'a',
      maxRedemptions: 10,
      active: false,
    });
    expect(inactive.isRedeemable()).toBe(false);

    const expired = new PivotReferralCode({
      code: 'TEST-EXPIRED',
      tenantKey: 'nyc',
      cohortId: 'a',
      maxRedemptions: 10,
      expiresAt: new Date('2020-01-01'),
      active: true,
    });
    expect(expired.isRedeemable()).toBe(false);

    const maxed = new PivotReferralCode({
      code: 'TEST-MAXED',
      tenantKey: 'nyc',
      cohortId: 'a',
      maxRedemptions: 1,
      redemptionCount: 1,
      active: true,
    });
    expect(maxed.isRedeemable()).toBe(false);
  });

  it('rejects invalid batchWeek format', async () => {
    const doc = new PivotReferralCode({
      code: 'TEST-BAD-WEEK',
      tenantKey: 'nyc',
      cohortId: 'a',
      batchWeek: '2026-21',
    });

    await expect(doc.validate()).rejects.toThrow(/batchWeek/);
  });
});
