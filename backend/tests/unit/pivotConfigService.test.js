jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

jest.mock('../../services/pivotCopyService', () => ({
  getCopyPointer: jest.fn(),
  EMPTY_COPY_POINTER: Object.freeze({
    revision: 'p0:t0',
    schemaVersion: 1,
  }),
}));

const { getTenantByKey } = require('../../services/tenantConfigService');
const { getCopyPointer } = require('../../services/pivotCopyService');
const { getPivotConfig, buildDropSchedulePayload } = require('../../services/pivotConfigService');
const { PIVOT_CREW_CONFIG_VERSION } = require('../../utilities/pivotCrewConfig');
const { PIVOT_MOBILE_STORE_URLS } = require('../../utilities/pivotMobileConfig');

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

  describe('getPivotConfig', () => {
    beforeEach(() => {
      getTenantByKey.mockReset();
      getCopyPointer.mockReset();
      getCopyPointer.mockResolvedValue({
        data: { revision: 'p0:t0', schemaVersion: 1 },
      });
    });

    it('includes merged crew defaults when tenant has no overrides', async () => {
      getTenantByKey.mockResolvedValue(nycTenant);

      const result = await getPivotConfig({ school: 'nyc' });

      expect(result.data.crew.version).toBe(PIVOT_CREW_CONFIG_VERSION);
      expect(result.data.crew.feedMix.personalInterestWeight).toBe(0.7);
      expect(result.data.crew.quorum.minSwipeParticipation).toBe(0.6);
    });

    it('merges tenant pivotCrewConfig overrides into crew payload', async () => {
      getTenantByKey.mockResolvedValue({
        ...nycTenant,
        pivotCrewConfig: {
          feedMix: { crewSignalWeight: 0.3 },
          nudges: { unfinishedSwipeReminderHours: 6 },
        },
      });

      const result = await getPivotConfig({ school: 'nyc' });

      expect(result.data.crew.feedMix.crewSignalWeight).toBe(0.3);
      expect(result.data.crew.feedMix.personalInterestWeight).toBe(0.7);
      expect(result.data.crew.nudges.unfinishedSwipeReminderHours).toBe(6);
      expect(result.data.crew.version).toBe(PIVOT_CREW_CONFIG_VERSION);
      expect(result.data.liveDropSchedule.batchWeek).toBe(result.data.liveBatchWeek);
    });

    it('includes mobile update gate defaults for backward-compatible clients', async () => {
      getTenantByKey.mockResolvedValue(nycTenant);

      const result = await getPivotConfig({ school: 'nyc' });

      expect(result.data.mobile.minAppVersion).toBe('1.0.0');
      expect(result.data.mobile.forceUpdate).toBe(false);
      expect(result.data.mobile.storeUrls).toEqual(PIVOT_MOBILE_STORE_URLS);
      expect(result.data.mobile.message).toMatch(/crew this week/i);
    });

    it('merges tenant pivotMobileConfig overrides into mobile payload', async () => {
      getTenantByKey.mockResolvedValue({
        ...nycTenant,
        pivotMobileConfig: {
          minAppVersion: '2.0.0',
          forceUpdate: true,
        },
      });

      const result = await getPivotConfig({ school: 'nyc' });

      expect(result.data.mobile.minAppVersion).toBe('2.0.0');
      expect(result.data.mobile.forceUpdate).toBe(true);
    });

    it('includes a copy pointer without overlay entries', async () => {
      getTenantByKey.mockResolvedValue(nycTenant);
      getCopyPointer.mockResolvedValue({
        data: { revision: 'p2:t1', schemaVersion: 1 },
      });

      const result = await getPivotConfig({ school: 'nyc' });

      expect(getCopyPointer).toHaveBeenCalledWith(
        expect.objectContaining({ school: 'nyc' }),
        { tenantKey: 'nyc' },
      );
      expect(result.data.copy).toEqual({
        revision: 'p2:t1',
        schemaVersion: 1,
      });
      expect(result.data.copy.entries).toBeUndefined();
      expect(result.data.copy.tokens).toBeUndefined();
    });

    it('keeps config successful when the copy pointer lookup fails', async () => {
      getTenantByKey.mockResolvedValue(nycTenant);
      getCopyPointer.mockResolvedValue({
        error: 'Global database context required.',
        status: 500,
      });

      const result = await getPivotConfig({ school: 'nyc' });

      expect(result.error).toBeUndefined();
      expect(result.data.copy).toEqual({
        revision: 'p0:t0',
        schemaVersion: 1,
      });
    });
  });
});
