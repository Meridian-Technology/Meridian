jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { isPivotTenant } = require('../../services/pivotReferralCodeService');
const {
  getPivotRetention,
  normalizeWeeksParam,
} = require('../../services/pivotRetentionService');

describe('pivotRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockImplementation(
      (tenant) => tenant?.pivotPilot === true || tenant?.tenantType === 'pivot',
    );
    connectToDatabase.mockResolvedValue({});
  });

  describe('normalizeWeeksParam', () => {
    it('defaults to 6 and clamps to [2, 12]', () => {
      expect(normalizeWeeksParam(undefined)).toBe(6);
      expect(normalizeWeeksParam('not-a-number')).toBe(6);
      expect(normalizeWeeksParam('1')).toBe(2);
      expect(normalizeWeeksParam('99')).toBe(12);
      expect(normalizeWeeksParam('4')).toBe(4);
    });
  });

  describe('getPivotRetention', () => {
    it('computes returning users against the prior week', async () => {
      getMergedTenants.mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
        { tenantKey: 'rpi', tenantType: 'campus' },
      ]);

      const usersByWeek = {
        '2026-W25': ['u1', 'u2', 'u3', 'u4'],
        '2026-W26': ['u2', 'u3', 'u5'],
      };
      getModels.mockReturnValue({
        PivotEventIntent: {
          distinct: jest
            .fn()
            .mockImplementation((_field, filter) =>
              Promise.resolve(usersByWeek[filter.batchWeek] || []),
            ),
        },
      });

      const result = await getPivotRetention(
        { globalDb: {} },
        { batchWeek: '2026-W26', weeks: 2 },
      );

      expect(result.data.batchWeek).toBe('2026-W26');
      expect(result.data.weeks).toEqual(['2026-W25', '2026-W26']);
      expect(result.data.tenants).toHaveLength(1);

      const [firstWeek, secondWeek] = result.data.tenants[0].weeks;
      expect(firstWeek).toEqual({
        batchWeek: '2026-W25',
        activeUsers: 4,
        returningUsers: null,
        retentionRate: null,
      });
      expect(secondWeek).toEqual({
        batchWeek: '2026-W26',
        activeUsers: 3,
        returningUsers: 2,
        retentionRate: 50,
      });
    });

    it('spans an ISO year boundary', async () => {
      getMergedTenants.mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot' },
      ]);
      getModels.mockReturnValue({
        PivotEventIntent: {
          distinct: jest.fn().mockResolvedValue([]),
        },
      });

      const result = await getPivotRetention(
        { globalDb: {} },
        { batchWeek: '2026-W02', weeks: 4 },
      );

      expect(result.data.weeks).toEqual(['2025-W51', '2025-W52', '2026-W01', '2026-W02']);
    });

    it('marks a tenant row when aggregation fails', async () => {
      getMergedTenants.mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot' },
      ]);
      getModels.mockReturnValue({
        PivotEventIntent: {
          distinct: jest.fn().mockRejectedValue(new Error('db down')),
        },
      });

      const result = await getPivotRetention(
        { globalDb: {} },
        { batchWeek: '2026-W26', weeks: 3 },
      );

      expect(result.data.tenants[0].error).toBe('AGGREGATION_FAILED');
      expect(result.data.tenants[0].weeks).toHaveLength(3);
      expect(result.data.tenants[0].weeks[2]).toMatchObject({
        batchWeek: '2026-W26',
        activeUsers: 0,
      });
    });

    it('rejects an invalid batch week', async () => {
      const result = await getPivotRetention({ globalDb: {} }, { batchWeek: 'nope' });
      expect(result).toMatchObject({ code: 'INVALID_BATCH_WEEK', status: 400 });
    });
  });
});
