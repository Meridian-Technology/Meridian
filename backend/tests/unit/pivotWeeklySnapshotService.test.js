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
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { isPivotTenant } = require('../../services/pivotReferralCodeService');
const {
  aggregateTenantMetrics,
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
  normalizeBatchWeek,
} = require('../../services/pivotWeeklySnapshotService');

describe('pivotWeeklySnapshotService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockImplementation(
      (tenant) => tenant?.pivotPilot === true || tenant?.tenantType === 'pivot',
    );
  });

  describe('normalizeBatchWeek', () => {
    it('defaults to current ISO week when omitted', () => {
      const now = new Date('2026-06-26T12:00:00.000Z');
      expect(normalizeBatchWeek(undefined, now)).toEqual({ batchWeek: '2026-W26' });
    });

    it('rejects invalid batch week', () => {
      expect(normalizeBatchWeek('bad-week')).toMatchObject({
        code: 'INVALID_BATCH_WEEK',
        status: 400,
      });
    });
  });

  describe('aggregateTenantMetrics', () => {
    it('aggregates tenant metrics for a batch week', async () => {
      const eventIds = ['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346'];
      connectToDatabase.mockResolvedValue({});

      getModels.mockReturnValue({
        Event: {
          countDocuments: jest.fn().mockResolvedValue(2),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(eventIds.map((_id) => ({ _id }))),
            }),
          }),
        },
        PivotEventIntent: {
          countDocuments: jest
            .fn()
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(4),
          distinct: jest
            .fn()
            .mockImplementation((_field, filter) =>
              Promise.resolve(filter?.externalOpenAt ? ['u1', 'u2'] : ['u1', 'u2', 'u3']),
            ),
          aggregate: jest.fn().mockResolvedValue([{ total: 7 }]),
        },
        AnalyticsEvent: {
          countDocuments: jest.fn().mockImplementation((filter) => {
            const names = filter?.event?.$in || [];
            if (names.includes('pivot_calendar_add')) return Promise.resolve(5);
            if (names.includes('pivot_invite_share')) return Promise.resolve(2);
            return Promise.resolve(4);
          }),
        },
        UniversalFeedback: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { responses: { rating: 4 } },
                { responses: { rating: 5 } },
              ]),
            }),
          }),
        },
      });

      const result = await aggregateTenantMetrics(
        { tenantKey: 'nyc', name: 'NYC', location: 'New York City', tenantType: 'pivot' },
        '2026-W26',
      );

      expect(result).toEqual({
        tenantKey: 'nyc',
        cityDisplayName: 'New York City',
        eventCount: 2,
        interestedCount: 3,
        registeredCount: 2,
        externalOpenCount: 7,
        externalOpenUsers: 2,
        calendarAdds: 5,
        inviteShares: 2,
        interestsSaved: 4,
        swipeCount: 9,
        feedbackAvg: 4.5,
        activeUsers: 3,
      });
    });
  });

  describe('rebuildWeeklySnapshot', () => {
    it('upserts snapshot for pivot tenants', async () => {
      const generatedAt = new Date('2026-06-26T12:00:00.000Z');
      const savedDoc = {
        batchWeek: '2026-W26',
        generatedAt,
        tenants: [
          {
            tenantKey: 'nyc',
            cityDisplayName: 'New York City',
            eventCount: 1,
            interestedCount: 0,
            registeredCount: 0,
            externalOpenCount: 0,
            swipeCount: 0,
            feedbackAvg: null,
            activeUsers: 0,
          },
        ],
        updatedAt: generatedAt,
        createdAt: generatedAt,
      };

      getMergedTenants.mockResolvedValue([
        { tenantKey: 'rpi', tenantType: 'campus' },
        { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      ]);

      connectToDatabase.mockResolvedValue({});
      getModels.mockReturnValue({
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
        },
        AnalyticsEvent: {
          countDocuments: jest.fn().mockResolvedValue(0),
        },
        UniversalFeedback: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        },
      });

      const findOneAndUpdate = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(savedDoc),
      });
      getGlobalModels.mockReturnValue({
        PivotWeeklySnapshot: { findOneAndUpdate },
      });

      const result = await rebuildWeeklySnapshot(
        { globalDb: {} },
        { batchWeek: '2026-W26', now: generatedAt },
      );

      expect(isPivotTenant).toHaveBeenCalled();
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { batchWeek: '2026-W26' },
        expect.objectContaining({
          $set: expect.objectContaining({
            generatedAt,
            tenants: expect.arrayContaining([
              expect.objectContaining({ tenantKey: 'nyc', eventCount: 1 }),
            ]),
          }),
        }),
        expect.objectContaining({ upsert: true }),
      );
      expect(result.data.batchWeek).toBe('2026-W26');
      expect(result.data.generatedAt).toEqual(generatedAt);
    });
  });

  describe('getWeeklySnapshot', () => {
    it('returns 404 when snapshot missing', async () => {
      getGlobalModels.mockReturnValue({
        PivotWeeklySnapshot: {
          findOne: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
        },
      });

      const result = await getWeeklySnapshot({ globalDb: {} }, { batchWeek: '2026-W26' });
      expect(result).toMatchObject({ code: 'SNAPSHOT_NOT_FOUND', status: 404 });
    });
  });
});
