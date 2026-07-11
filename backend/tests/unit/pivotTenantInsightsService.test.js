jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotLabEventsService', () => ({
  labEventsQuery: jest.requireActual('../../services/pivotLabEventsService').labEventsQuery,
  loadIntentStatsByEventId: jest.fn(),
}));
jest.mock('../../services/pivotAdminOverviewService', () => ({
  aggregateTenantOverview: jest.fn(),
  serializePerformanceEvent: jest.requireActual('../../services/pivotAdminOverviewService')
    .serializePerformanceEvent,
}));
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: jest.requireActual('../../services/pivotWeeklySnapshotService')
    .normalizeBatchWeek,
}));
jest.mock('../../services/pivotFeedService', () => ({
  PIVOT_EVENT_STATUSES: ['approved', 'not-applicable'],
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { loadIntentStatsByEventId } = require('../../services/pivotLabEventsService');
const { aggregateTenantOverview } = require('../../services/pivotAdminOverviewService');
const {
  buildTenantInsights,
  getTenantInsights,
  curationHref,
} = require('../../services/pivotTenantInsightsService');

describe('pivotTenantInsightsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildTenantInsights', () => {
    it('fires at least four rules on fixture data', () => {
      const insights = buildTenantInsights({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        targetEventCount: 40,
        eventCountsByStatus: {
          draft: 2,
          staged: 3,
          published: 5,
          other: 0,
          total: 10,
        },
        performanceEvents: [
          {
            eventId: 'e1',
            name: 'Silent Disco',
            interestedTotal: 8,
            externalOpen: 0,
          },
          {
            eventId: 'e2',
            name: 'Jazz Night',
            interestedTotal: 4,
            externalOpen: 0,
          },
        ],
        catalogEvents: [
          {
            _id: 'a',
            customFields: { pivot: { ingestStatus: 'published', tags: ['music'] } },
          },
          {
            _id: 'b',
            customFields: { pivot: { ingestStatus: 'staged', tags: ['music'] } },
          },
          {
            _id: 'c',
            customFields: { pivot: { ingestStatus: 'published', tags: ['music'] } },
          },
          {
            _id: 'd',
            customFields: { pivot: { ingestStatus: 'published', tags: [] } },
          },
          {
            _id: 'e',
            customFields: { pivot: { ingestStatus: 'staged', tags: [] } },
          },
        ],
        vsPrevWeek: {
          activeUsers: { current: 4, previous: 10, delta: -6 },
        },
        feedbackAvg: 3.2,
        prevFeedbackAvg: 4.1,
      });

      const ids = insights.map((row) => row.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'thin-catalog',
          'interest-no-ticket',
          'untagged-events',
          'tag-concentration',
          'low-feedback',
          'active-users-drop',
        ]),
      );
      expect(insights.length).toBeGreaterThanOrEqual(4);

      const untagged = insights.find((row) => row.id === 'untagged-events');
      expect(untagged.href).toContain('filter=untagged');
      expect(untagged.href).toContain('/platform-admin/pivot/nyc');
      expect(untagged.severity).toMatch(/warn|critical|info/);
    });

    it('returns an empty list when nothing needs attention', () => {
      const insights = buildTenantInsights({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        targetEventCount: 10,
        eventCountsByStatus: {
          draft: 0,
          staged: 2,
          published: 10,
          other: 0,
          total: 12,
        },
        performanceEvents: [
          { eventId: 'e1', name: 'Show', interestedTotal: 5, externalOpen: 3 },
        ],
        catalogEvents: [
          {
            _id: 'a',
            customFields: { pivot: { ingestStatus: 'published', tags: ['a'] } },
          },
          {
            _id: 'b',
            customFields: { pivot: { ingestStatus: 'published', tags: ['b'] } },
          },
          {
            _id: 'c',
            customFields: { pivot: { ingestStatus: 'published', tags: ['c'] } },
          },
        ],
        vsPrevWeek: {
          activeUsers: { current: 12, previous: 10, delta: 2 },
        },
        feedbackAvg: 4.5,
        prevFeedbackAvg: 4.4,
      });

      expect(insights).toEqual([]);
    });

    it('builds curation deep links with batchWeek', () => {
      expect(curationHref('brooklyn', '2026-W28', 'untagged')).toBe(
        '/platform-admin/pivot/brooklyn?page=1&batchWeek=2026-W28&filter=untagged',
      );
    });
  });

  describe('getTenantInsights', () => {
    it('returns TENANT_NOT_FOUND for unknown tenant', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await getTenantInsights(
        { globalDb: {} },
        { tenantKey: 'missing', batchWeek: '2026-W28' },
      );

      expect(result.code).toBe('TENANT_NOT_FOUND');
      expect(connectToDatabase).not.toHaveBeenCalled();
    });

    it('aggregates one city and returns insight cards', async () => {
      resolvePivotTenant.mockResolvedValue({
        tenant: { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      });
      aggregateTenantOverview
        .mockResolvedValueOnce({
          activeUsers: 4,
          feedbackAvg: 3.0,
          eventCountsByStatus: {
            draft: 1,
            staged: 1,
            published: 2,
            other: 0,
            total: 4,
          },
        })
        .mockResolvedValueOnce({
          activeUsers: 10,
          feedbackAvg: 4.2,
        });

      connectToDatabase.mockResolvedValue({});
      getModels.mockReturnValue({
        Event: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  _id: 'e1',
                  name: 'Silent Disco',
                  customFields: { pivot: { ingestStatus: 'published', tags: [] } },
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
            'e1',
            {
              interested: 5,
              registered: 0,
              passed: 1,
              externalOpens: 0,
              externalOpenUsers: 0,
            },
          ],
        ]),
      );

      const result = await getTenantInsights(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W28' },
      );

      expect(result.error).toBeUndefined();
      expect(result.data.tenantKey).toBe('nyc');
      expect(result.data.insights.length).toBeGreaterThanOrEqual(1);
      expect(result.data.insights.every((row) => row.id && row.severity && row.title)).toBe(true);
      expect(connectToDatabase).toHaveBeenCalledWith('nyc');
    });
  });
});
