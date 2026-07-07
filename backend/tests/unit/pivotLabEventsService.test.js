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
  listPivotLabEvents,
  serializeLabEvent,
  loadIntentStatsByEventId,
} = require('../../services/pivotLabEventsService');

describe('pivotLabEventsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockImplementation((tenant) => tenant?.tenantType === 'pivot');
    connectToDatabase.mockResolvedValue({});
  });

  describe('serializeLabEvent', () => {
    it('defaults intentStats to zeros when no stats map is provided', () => {
      const row = serializeLabEvent({ _id: 'e1', name: 'Show', customFields: {} });
      expect(row.intentStats).toEqual({
        interested: 0,
        registered: 0,
        passed: 0,
        externalOpens: 0,
        externalOpenUsers: 0,
      });
    });
  });

  describe('loadIntentStatsByEventId', () => {
    it('returns an empty map without querying when there are no events', async () => {
      const PivotEventIntent = { aggregate: jest.fn() };
      const stats = await loadIntentStatsByEventId(PivotEventIntent, []);
      expect(stats.size).toBe(0);
      expect(PivotEventIntent.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('listPivotLabEvents', () => {
    it('merges per-event intent stats into catalog rows', async () => {
      getMergedTenants.mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      ]);

      const events = [
        {
          _id: 'e1',
          name: 'Rooftop Jazz',
          customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W27' } },
        },
        {
          _id: 'e2',
          name: 'Board Games',
          customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W27' } },
        },
      ];

      getModels.mockReturnValue({
        Event: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(events),
              }),
            }),
          }),
        },
        PivotEventIntent: {
          aggregate: jest.fn().mockResolvedValue([
            {
              _id: 'e1',
              interested: 5,
              registered: 2,
              passed: 7,
              externalOpens: 4,
              externalOpenUsers: 3,
            },
          ]),
        },
      });

      const result = await listPivotLabEvents(
        { globalDb: {} },
        { tenantKey: 'nyc', batchWeek: '2026-W27' },
      );

      expect(result.data.events).toHaveLength(2);
      expect(result.data.events[0].intentStats).toEqual({
        interested: 5,
        registered: 2,
        passed: 7,
        externalOpens: 4,
        externalOpenUsers: 3,
      });
      expect(result.data.events[1].intentStats).toEqual({
        interested: 0,
        registered: 0,
        passed: 0,
        externalOpens: 0,
        externalOpenUsers: 0,
      });
    });
  });
});
