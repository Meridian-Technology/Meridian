const { toIsoWeek } = require('../utilities/pivotIsoWeek');

const PILOT_TENANT_KEY = 'nyc';

/** Legacy Brooklyn pilot codes removed when re-seeding for NYC. */
const LEGACY_PILOT_CODE_PREFIXES = ['BK-PILOT'];

/**
 * Seed rows for Pivot pilot referral codes (Task 0.3).
 * Includes active cohort codes plus inactive/expired rows for validation testing.
 */
function getPivotPilotReferralSeedRows() {
  const currentBatchWeek = toIsoWeek();

  return [
    {
      code: 'NYC-PILOT-A',
      tenantKey: PILOT_TENANT_KEY,
      cohortId: 'pilot-a',
      maxRedemptions: 50,
      redemptionCount: 0,
      active: true,
      batchWeek: currentBatchWeek,
      expiresAt: null,
    },
    {
      code: 'NYC-PILOT-B',
      tenantKey: PILOT_TENANT_KEY,
      cohortId: 'pilot-b',
      maxRedemptions: 50,
      redemptionCount: 0,
      active: true,
      batchWeek: currentBatchWeek,
      expiresAt: null,
    },
    {
      code: 'NYC-PILOT-C',
      tenantKey: PILOT_TENANT_KEY,
      cohortId: 'pilot-c',
      maxRedemptions: 25,
      redemptionCount: 0,
      active: true,
      batchWeek: null,
      expiresAt: null,
    },
    {
      code: 'NYC-PILOT-INACTIVE',
      tenantKey: PILOT_TENANT_KEY,
      cohortId: 'pilot-inactive-test',
      maxRedemptions: 50,
      redemptionCount: 0,
      active: false,
      batchWeek: currentBatchWeek,
      expiresAt: null,
    },
    {
      code: 'NYC-PILOT-EXPIRED',
      tenantKey: PILOT_TENANT_KEY,
      cohortId: 'pilot-expired-test',
      maxRedemptions: 50,
      redemptionCount: 0,
      active: true,
      batchWeek: currentBatchWeek,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  ];
}

module.exports = {
  PILOT_TENANT_KEY,
  LEGACY_PILOT_CODE_PREFIXES,
  getPivotPilotReferralSeedRows,
};
