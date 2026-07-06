jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: jest.fn(),
  serializePivotReferralCode: jest.fn((doc) => ({
    code: doc.code,
    redemptionCount: doc.redemptionCount,
    maxRedemptions: doc.maxRedemptions,
    cohortId: doc.cohortId,
    active: doc.active,
  })),
}));
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: jest.requireActual('../../services/pivotWeeklySnapshotService').normalizeBatchWeek,
  PUBLISHED_EVENT_QUERY: jest.requireActual('../../services/pivotWeeklySnapshotService').PUBLISHED_EVENT_QUERY,
  getWeeklySnapshot: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { isPivotTenant } = require('../../services/pivotReferralCodeService');
const { getWeeklySnapshot } = require('../../services/pivotWeeklySnapshotService');
const {
  aggregateRegisteredFeedback,
  getPivotOverview,
} = require('../../services/pivotAdminOverviewService');

describe('pivotAdminOverviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockImplementation(
      (tenant) => tenant?.pivotPilot === true || tenant?.tenantType === 'pivot',
    );
    getWeeklySnapshot.mockResolvedValue({ data: { generatedAt: new Date('2026-06-26T10:00:00.000Z') } });
  });

  describe('aggregateRegisteredFeedback', () => {
    it('counts feedback only from registered users', async () => {
      const eventIds = ['665a1b2c3d4e5f6789012345'];
      const PivotEventIntent = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              { userId: '507f191e810c19729de860ea', eventId: eventIds[0] },
            ]),
          }),
        }),
      };
      const UniversalFeedback = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                user: '507f191e810c19729de860ea',
                processId: eventIds[0],
                responses: { rating: 5 },
              },
              {
                user: '507f191e810c19729de860eb',
                processId: eventIds[0],
                responses: { rating: 2 },
              },
            ]),
          }),
        }),
      };

      const result = await aggregateRegisteredFeedback(
        PivotEventIntent,
        UniversalFeedback,
        '2026-W26',
        eventIds,
      );

      expect(result).toEqual({ feedbackCount: 1, feedbackAvg: 5 });
    });
  });

  describe('getPivotOverview', () => {
    it('returns separate rows for each pivot tenant', async () => {
      getMergedTenants.mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
        { tenantKey: 'brooklyn', tenantType: 'pivot', location: 'Brooklyn' },
        { tenantKey: 'rpi', tenantType: 'campus' },
      ]);

      getGlobalModels.mockReturnValue({
        PivotReferralCode: {
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { code: 'NYC-PILOT-A', redemptionCount: 2, maxRedemptions: 50, cohortId: 'a', active: true },
              ]),
            }),
          }),
        },
      });

      connectToDatabase.mockResolvedValue({});
      getModels.mockImplementation(() => ({
        Event: {
          countDocuments: jest.fn().mockResolvedValue(1),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([{ _id: '665a1b2c3d4e5f6789012345' }]),
            }),
          }),
        },
        PivotEventIntent: {
          countDocuments: jest.fn().mockResolvedValue(0),
          distinct: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue([]),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        },
        UniversalFeedback: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        },
      }));

      const result = await getPivotOverview({ globalDb: {} }, { batchWeek: '2026-W26' });

      expect(result.data.batchWeek).toBe('2026-W26');
      expect(result.data.tenants).toHaveLength(2);
      expect(result.data.tenants.map((row) => row.tenantKey)).toEqual(['nyc', 'brooklyn']);
      expect(result.data.tenants[0].referralCodes[0].code).toBe('NYC-PILOT-A');
      expect(result.data.snapshotGeneratedAt).toEqual(new Date('2026-06-26T10:00:00.000Z'));
    });
  });
});
