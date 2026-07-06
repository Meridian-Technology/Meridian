const { buildDropSchedulePayload } = require('../../services/pivotConfigService');

describe('pivotConfigService', () => {
  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotPilot: true,
    name: 'New York City',
    location: 'New York City',
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  describe('buildDropSchedulePayload', () => {
    it('returns resolved next drop for a batch week', () => {
      const payload = buildDropSchedulePayload(nycTenant, '2026-W23');
      expect(payload.batchWeek).toBe('2026-W23');
      expect(payload.timezone).toBe('America/New_York');
      expect(payload.source).toBe('default');
      expect(payload.nextDropAt).toBe('2026-06-04T22:00:00.000Z');
      expect(payload.nextDropFormatted).toMatch(/Thu Jun 4/);
    });

    it('reflects per-week override in payload', () => {
      const tenant = {
        ...nycTenant,
        pivotDropOverrides: [{ batchWeek: '2026-W23', dayOfWeek: 5, hour: 12, minute: 30 }],
      };
      const payload = buildDropSchedulePayload(tenant, '2026-W23');
      expect(payload.source).toBe('override');
      expect(payload.nextDropAt).toBe('2026-06-05T16:30:00.000Z');
    });
  });
});
