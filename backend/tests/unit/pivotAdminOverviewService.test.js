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
  aggregateEngagementMetrics: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotLabEventsService', () => ({
  labEventsQuery: jest.requireActual('../../services/pivotLabEventsService').labEventsQuery,
  loadIntentStatsByEventId: jest.fn(),
}));
jest.mock('../../services/pivotFeedService', () => ({
  PIVOT_EVENT_STATUSES: ['approved', 'published'],
}));
jest.mock('../../services/pivotCreatorAdminNotifyService', () => ({
  isLiveCreatorBatchWeek: jest.fn(),
  buildCreatorListingCurationHref: jest.fn(
    ({ tenantKey, batchWeek, emphasizeLive = false } = {}) => {
      const params = new URLSearchParams({
        page: '1',
        batchWeek,
        filter: 'draft',
        source: 'justgo',
      });
      if (emphasizeLive) params.set('alert', 'live-week-host');
      return `/platform-admin/pivot/${tenantKey}?${params.toString()}`;
    },
  ),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { isPivotTenant } = require('../../services/pivotReferralCodeService');
const {
  getWeeklySnapshot,
  aggregateEngagementMetrics,
} = require('../../services/pivotWeeklySnapshotService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { loadIntentStatsByEventId } = require('../../services/pivotLabEventsService');
const {
  isLiveCreatorBatchWeek,
} = require('../../services/pivotCreatorAdminNotifyService');
const {
  aggregateRegisteredFeedback,
  aggregateHostCreatedCountsByStatus,
  buildHostLiveWeekAlert,
  buildFunnelStages,
  buildVsPrevWeek,
  comparePerformanceRows,
  getPivotOverview,
  getTenantOverview,
  getTenantEventPerformance,
  serializePerformanceEvent,
} = require('../../services/pivotAdminOverviewService');

describe('pivotAdminOverviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockImplementation(
      (tenant) => tenant?.pivotPilot === true || tenant?.tenantType === 'pivot',
    );
    isLiveCreatorBatchWeek.mockResolvedValue({
      isLive: false,
      publishedCount: 0,
      batchStatus: null,
      reasons: [],
    });
    getWeeklySnapshot.mockResolvedValue({ data: { generatedAt: new Date('2026-06-26T10:00:00.000Z') } });
    aggregateEngagementMetrics.mockResolvedValue({
      calendarAdds: 3,
      inviteShares: 1,
      interestsSaved: 2,
    });
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
      expect(result.data.tenants[0]).toMatchObject({
        externalOpenUsers: 0,
        calendarAdds: 3,
        inviteShares: 1,
        interestsSaved: 2,
      });
      expect(result.data.snapshotGeneratedAt).toEqual(new Date('2026-06-26T10:00:00.000Z'));
    });
  });

  describe('buildFunnelStages', () => {
    it('matches Lab FunnelChart definitions', () => {
      expect(
        buildFunnelStages({
          swipeCount: 20,
          interestedCount: 5,
          registeredCount: 3,
          externalOpenUsers: 4,
        }),
      ).toEqual([
        { key: 'swipes', label: 'Swipes', value: 20, hint: 'cards acted on' },
        { key: 'interested', label: 'Interested', value: 8, hint: 'right swipes' },
        { key: 'openers', label: 'Ticket openers', value: 4, hint: 'unique users' },
        { key: 'going', label: 'Going', value: 3, hint: 'self-confirmed' },
      ]);
    });
  });

  describe('buildVsPrevWeek', () => {
    it('computes deltas for KPI keys', () => {
      const deltas = buildVsPrevWeek(
        { activeUsers: 10, eventCount: 5, feedbackAvg: 4.5, interestedCount: 2 },
        { activeUsers: 8, eventCount: 5, feedbackAvg: 4.0, interestedCount: 3 },
      );
      expect(deltas.activeUsers).toEqual({ current: 10, previous: 8, delta: 2 });
      expect(deltas.eventCount).toEqual({ current: 5, previous: 5, delta: 0 });
      expect(deltas.feedbackAvg).toEqual({ current: 4.5, previous: 4, delta: 0.5 });
    });
  });

  describe('serializePerformanceEvent / comparePerformanceRows', () => {
    it('ranks by interestedTotal then externalOpen', () => {
      const a = serializePerformanceEvent(
        { _id: 'a', name: 'A', customFields: { pivot: { ingestStatus: 'published' } } },
        { interested: 2, registered: 1, passed: 1, externalOpens: 1, externalOpenUsers: 1 },
      );
      const b = serializePerformanceEvent(
        { _id: 'b', name: 'B', customFields: { pivot: { ingestStatus: 'draft' } } },
        { interested: 5, registered: 0, passed: 5, externalOpens: 0, externalOpenUsers: 0 },
      );
      expect(a.interestedTotal).toBe(3);
      expect(a.interestRate).toBe(0.75);
      expect(a.ticketOpenRate).toBeCloseTo(0.333, 2);
      expect(comparePerformanceRows(a, b)).toBeGreaterThan(0);
      expect([b, a].sort(comparePerformanceRows).map((row) => row.eventId)).toEqual(['b', 'a']);
    });
  });

  describe('aggregateHostCreatedCountsByStatus', () => {
    it('maps justgo ingest statuses onto hostDraft/hostStaged/hostPublished', async () => {
      const Event = {
        aggregate: jest.fn().mockResolvedValue([
          { _id: 'draft', count: 3 },
          { _id: 'staged', count: 1 },
          { _id: 'published', count: 2 },
        ]),
      };

      const counts = await aggregateHostCreatedCountsByStatus(Event, '2026-W32');
      expect(counts).toEqual({
        hostDraft: 3,
        hostStaged: 1,
        hostPublished: 2,
        other: 0,
        total: 6,
      });
      expect(Event.aggregate).toHaveBeenCalledWith([
        expect.objectContaining({
          $match: expect.objectContaining({
            'customFields.pivot.batchWeek': '2026-W32',
            'customFields.pivot.source': 'justgo',
          }),
        }),
        expect.any(Object),
      ]);
    });
  });

  describe('buildHostLiveWeekAlert', () => {
    it('is active only when the week is live/released and host drafts exist', () => {
      const active = buildHostLiveWeekAlert({
        tenantKey: 'nyc',
        batchWeek: '2026-W32',
        hostCreatedCounts: { hostDraft: 2, hostStaged: 0, hostPublished: 1 },
        liveWeek: {
          isLive: true,
          publishedCount: 4,
          batchStatus: 'released',
          reasons: ['published_events', 'batch_released'],
        },
      });
      expect(active.active).toBe(true);
      expect(active.hostDraft).toBe(2);
      expect(active.curationHref).toContain('source=justgo');
      expect(active.curationHref).toContain('filter=draft');

      const quiet = buildHostLiveWeekAlert({
        tenantKey: 'nyc',
        batchWeek: '2026-W32',
        hostCreatedCounts: { hostDraft: 2, hostStaged: 0, hostPublished: 0 },
        liveWeek: { isLive: false, publishedCount: 0, batchStatus: null, reasons: [] },
      });
      expect(quiet.active).toBe(false);

      const liveNoDrafts = buildHostLiveWeekAlert({
        tenantKey: 'nyc',
        batchWeek: '2026-W32',
        hostCreatedCounts: { hostDraft: 0, hostStaged: 1, hostPublished: 2 },
        liveWeek: {
          isLive: true,
          publishedCount: 2,
          batchStatus: 'released',
          reasons: ['batch_released'],
        },
      });
      expect(liveNoDrafts.active).toBe(false);
    });
  });

  describe('getTenantOverview', () => {
    function mockTenantModels({
      publishedCount = 2,
      statusRows = [
        { _id: 'published', count: 2 },
        { _id: 'draft', count: 1 },
      ],
      hostRows = [
        { _id: 'draft', count: 2 },
        { _id: 'staged', count: 1 },
        { _id: 'published', count: 0 },
      ],
    } = {}) {
      connectToDatabase.mockResolvedValue({});
      getModels.mockImplementation(() => ({
        Event: {
          countDocuments: jest.fn().mockResolvedValue(publishedCount),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(
                Array.from({ length: publishedCount }, (_, i) => ({
                  _id: `665a1b2c3d4e5f678901234${i}`,
                })),
              ),
            }),
          }),
          aggregate: jest
            .fn()
            .mockResolvedValueOnce(statusRows)
            .mockResolvedValueOnce(hostRows),
        },
        PivotEventIntent: {
          countDocuments: jest.fn().mockImplementation((filter) => {
            if (filter.status === 'interested') return Promise.resolve(4);
            if (filter.status === 'registered') return Promise.resolve(2);
            if (filter.status === 'passed') return Promise.resolve(6);
            return Promise.resolve(0);
          }),
          distinct: jest.fn().mockImplementation((_field, filter) => {
            if (filter.externalOpenAt) {
              return Promise.resolve(['u1', 'u2']);
            }
            return Promise.resolve(['u1', 'u2', 'u3']);
          }),
          aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 7 }]),
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
      getGlobalModels.mockReturnValue({
        PivotReferralCode: {
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        },
      });
    }

    it('returns metrics for one tenant with funnel and status breakdown', async () => {
      resolvePivotTenant.mockResolvedValue({
        tenant: { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      });
      mockTenantModels();
      isLiveCreatorBatchWeek.mockResolvedValue({
        isLive: true,
        publishedCount: 2,
        batchStatus: 'released',
        reasons: ['published_events', 'batch_released'],
      });

      const result = await getTenantOverview(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W26' },
      );

      expect(result.error).toBeUndefined();
      expect(result.data.tenantKey).toBe('nyc');
      expect(result.data.batchWeek).toBe('2026-W26');
      expect(result.data.previousBatchWeek).toBe('2026-W25');
      expect(result.data.kpis).toMatchObject({
        activeUsers: 3,
        eventCount: 2,
        interestedCount: 4,
        registeredCount: 2,
        externalOpenCount: 7,
        externalOpenUsers: 2,
        swipeCount: 12,
        eventCountsByStatus: {
          draft: 1,
          staged: 0,
          published: 2,
          other: 0,
          total: 3,
        },
        hostDraft: 2,
        hostStaged: 1,
        hostPublished: 0,
      });
      expect(result.data.hostLiveWeekAlert).toMatchObject({
        active: true,
        isLiveWeek: true,
        hostDraft: 2,
      });
      expect(result.data.hostLiveWeekAlert.curationHref).toContain('source=justgo');
      expect(result.data.funnel[0]).toMatchObject({ key: 'swipes', value: 12 });
      expect(result.data.funnel[1]).toMatchObject({ key: 'interested', value: 6 });
      expect(result.data.eventsByDay).toHaveLength(7);
      expect(result.data.eventsByDay[0]).toEqual(
        expect.objectContaining({
          date: expect.any(String),
          weekday: expect.any(String),
          count: expect.any(Number),
        }),
      );
      expect(result.data.dropSchedule.batchWeek).toBe('2026-W26');
      expect(result.data.vsPrevWeek).toBeTruthy();
      expect(resolvePivotTenant).toHaveBeenCalledWith(
        expect.objectContaining({ globalDb: {} }),
        'nyc',
      );
      // Only one city connection — not a fleet loop.
      expect(connectToDatabase.mock.calls.every(([key]) => key === 'nyc')).toBe(true);
    });

    it('keeps live-week alert inactive when the week is not released/live', async () => {
      resolvePivotTenant.mockResolvedValue({
        tenant: { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      });
      mockTenantModels({
        hostRows: [{ _id: 'draft', count: 4 }],
      });
      isLiveCreatorBatchWeek.mockResolvedValue({
        isLive: false,
        publishedCount: 0,
        batchStatus: null,
        reasons: [],
      });

      const result = await getTenantOverview(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W26' },
      );

      expect(result.data.kpis.hostDraft).toBe(4);
      expect(result.data.hostLiveWeekAlert.active).toBe(false);
      expect(result.data.hostLiveWeekAlert.isLiveWeek).toBe(false);
    });

    it('returns TENANT_NOT_FOUND for unknown pivot tenant', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await getTenantOverview(
        { globalDb: {} },
        { tenantKey: 'missing', batchWeek: '2026-W26' },
      );

      expect(result).toMatchObject({
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });
      expect(connectToDatabase).not.toHaveBeenCalled();
    });

    it('rejects invalid batchWeek', async () => {
      const result = await getTenantOverview(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: 'not-a-week' },
      );
      expect(result.code).toBe('INVALID_BATCH_WEEK');
      expect(resolvePivotTenant).not.toHaveBeenCalled();
    });
  });

  describe('getTenantEventPerformance', () => {
    it('returns events sorted by interestedTotal', async () => {
      resolvePivotTenant.mockResolvedValue({
        tenant: { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      });
      connectToDatabase.mockResolvedValue({});
      getModels.mockReturnValue({
        Event: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  _id: 'e-low',
                  name: 'Quiet Night',
                  customFields: { pivot: { ingestStatus: 'published' } },
                },
                {
                  _id: 'e-high',
                  name: 'Hot Show',
                  customFields: { pivot: { ingestStatus: 'published' } },
                },
              ]),
            }),
          }),
        },
        PivotEventIntent: {},
      });
      loadIntentStatsByEventId.mockResolvedValue(
        new Map([
          [
            'e-low',
            { interested: 1, registered: 0, passed: 4, externalOpens: 0, externalOpenUsers: 0 },
          ],
          [
            'e-high',
            { interested: 8, registered: 2, passed: 1, externalOpens: 5, externalOpenUsers: 4 },
          ],
        ]),
      );

      const result = await getTenantEventPerformance(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W26', limit: 10 },
      );

      expect(result.data.sortBy).toBe('interestedTotal');
      expect(result.data.events.map((row) => row.eventId)).toEqual(['e-high', 'e-low']);
      expect(result.data.events[0]).toMatchObject({
        interestedTotal: 10,
        reached: 11,
        externalOpen: 5,
        interestRate: 0.909,
      });
      expect(loadIntentStatsByEventId).toHaveBeenCalledWith(
        expect.anything(),
        ['e-low', 'e-high'],
        { batchWeek: '2026-W26' },
      );
    });

    it('returns TENANT_NOT_FOUND for wrong tenantKey', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await getTenantEventPerformance(
        { globalDb: {} },
        { tenantKey: 'rpi', batchWeek: '2026-W26' },
      );

      expect(result.code).toBe('TENANT_NOT_FOUND');
    });
  });
});
