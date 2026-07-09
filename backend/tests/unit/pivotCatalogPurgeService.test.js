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
  purgePivotCatalog,
  PURGE_CONFIRM_TOKEN,
} = require('../../services/pivotCatalogPurgeService');

describe('pivotCatalogPurgeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPivotTenant.mockReturnValue(true);
    connectToDatabase.mockResolvedValue({});
  });

  function buildTenantModels(eventIds = ['665a1b2c3d4e5f6789012345']) {
    const Event = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(eventIds.map((_id) => ({ _id }))),
        }),
      }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: eventIds.length }),
    };
    const PivotEventIntent = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
    };
    const UniversalFeedback = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    const FormResponse = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    const EventAnalytics = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const EventQR = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    const AnalyticsEvent = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 4 }),
    };

    getModels.mockReturnValue({
      Event,
      PivotEventIntent,
      UniversalFeedback,
      FormResponse,
      EventAnalytics,
      EventQR,
      AnalyticsEvent,
    });

    return {
      Event,
      PivotEventIntent,
      UniversalFeedback,
      FormResponse,
      EventAnalytics,
      EventQR,
      AnalyticsEvent,
    };
  }

  it('runs in production (no environment gate)', async () => {
    process.env.NODE_ENV = 'production';
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
    ]);
    buildTenantModels();
    getGlobalModels.mockReturnValue({
      PivotWeeklySnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
    });

    const result = await purgePivotCatalog(
      { globalDb: {} },
      { confirm: PURGE_CONFIRM_TOKEN, tenantKey: 'nyc' },
    );

    expect(result.code).toBeUndefined();
    expect(result.data.tenants).toHaveLength(1);
  });

  it('rejects an invalid batchWeek', async () => {
    const result = await purgePivotCatalog(
      {},
      { confirm: PURGE_CONFIRM_TOKEN, batchWeek: 'not-a-week' },
    );

    expect(result.code).toBe('INVALID_BATCH_WEEK');
  });

  it('scopes a weekly purge to the batch week', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
    ]);
    const models = buildTenantModels();
    const snapshotDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    getGlobalModels.mockReturnValue({
      PivotWeeklySnapshot: { deleteMany: snapshotDeleteMany },
    });

    const result = await purgePivotCatalog(
      { globalDb: {} },
      { confirm: PURGE_CONFIRM_TOKEN, tenantKey: 'nyc', batchWeek: '2026-W21' },
    );

    expect(result.data.batchWeek).toBe('2026-W21');
    expect(result.data.scope).toBe('week');
    expect(models.Event.find).toHaveBeenCalledWith(
      expect.objectContaining({ 'customFields.pivot.batchWeek': '2026-W21' }),
    );
    expect(models.PivotEventIntent.deleteMany).toHaveBeenCalledWith({
      batchWeek: '2026-W21',
    });
    expect(models.UniversalFeedback.deleteMany).toHaveBeenCalledWith({
      feature: 'pivot_event',
      'metadata.batchWeek': '2026-W21',
    });
    expect(snapshotDeleteMany).toHaveBeenCalledWith({ batchWeek: '2026-W21' });
  });

  it('requires PURGE confirmation token', async () => {
    const result = await purgePivotCatalog({}, { confirm: 'nope' });

    expect(result.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('purges catalog events and related tenant data', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
    ]);
    const models = buildTenantModels();
    getGlobalModels.mockReturnValue({
      PivotWeeklySnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      },
    });

    const result = await purgePivotCatalog(
      { globalDb: {} },
      { confirm: PURGE_CONFIRM_TOKEN, tenantKey: 'nyc' },
    );

    expect(result.data.tenants).toHaveLength(1);
    expect(result.data.tenants[0].deleted.events).toBe(1);
    expect(models.PivotEventIntent.deleteMany).toHaveBeenCalledWith({
      eventId: { $in: ['665a1b2c3d4e5f6789012345'] },
    });
    expect(models.UniversalFeedback.deleteMany).toHaveBeenCalledWith({
      feature: 'pivot_event',
      processId: { $in: ['665a1b2c3d4e5f6789012345'] },
    });
    expect(models.AnalyticsEvent.deleteMany).toHaveBeenCalledWith({
      'properties.event_id': { $in: ['665a1b2c3d4e5f6789012345'] },
    });
    expect(result.data.totals.weeklySnapshots).toBe(2);
  });

  it('purges all pivot tenants when tenantKey is omitted', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      { tenantKey: 'brooklyn', tenantType: 'pivot', location: 'Brooklyn' },
    ]);
    buildTenantModels();
    getGlobalModels.mockReturnValue({
      PivotWeeklySnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
    });

    const result = await purgePivotCatalog({ globalDb: {} }, { confirm: PURGE_CONFIRM_TOKEN });

    expect(connectToDatabase).toHaveBeenCalledTimes(2);
    expect(result.data.tenants).toHaveLength(2);
    expect(result.data.totals.events).toBe(2);
  });
});
