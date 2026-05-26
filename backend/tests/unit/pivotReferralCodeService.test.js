const {
  validateCreatePayload,
  validateUpdatePayload,
  isPivotTenant,
} = require('../../services/pivotReferralCodeService');

describe('pivotReferralCodeService', () => {
  describe('isPivotTenant', () => {
    it('returns true for pivot tenant types', () => {
      expect(isPivotTenant({ tenantType: 'pivot' })).toBe(true);
      expect(isPivotTenant({ pivotPilot: true })).toBe(true);
      expect(isPivotTenant({ tenantType: 'campus', pivotPilot: false })).toBe(false);
    });
  });

  describe('validateCreatePayload', () => {
    it('accepts valid payload', () => {
      const out = validateCreatePayload({
        code: 'nyc-pilot-a',
        cohortId: 'pilot-a',
        batchWeek: '2026-W21',
      });
      expect(out.error).toBeUndefined();
      expect(out.row.code).toBe('nyc-pilot-a');
      expect(out.row.batchWeek).toBe('2026-W21');
    });

    it('rejects invalid batch week', () => {
      const out = validateCreatePayload({ code: 'X', cohortId: 'a', batchWeek: 'bad' });
      expect(out.error).toMatch(/batchWeek/);
    });
  });

  describe('validateUpdatePayload', () => {
    it('rejects empty patch', () => {
      const out = validateUpdatePayload({});
      expect(out.error).toMatch(/No valid fields/);
    });
  });
});
