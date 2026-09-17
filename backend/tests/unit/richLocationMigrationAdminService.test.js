jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getModelService');
jest.mock('../../services/pivotLocationBackfillService', () => ({
  runLocationBackfill: jest.fn(),
}));
jest.mock('../../services/googleLocationService', () => ({
  isGoogleLocationConfigured: jest.fn(() => true),
  lookupCityBoundary: jest.fn(),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { runLocationBackfill } = require('../../services/pivotLocationBackfillService');
const googleLocationService = require('../../services/googleLocationService');
const {
  migrationUiEnabled,
  getRichLocationMigrationStatus,
  getHistoricLocationHeatmap,
  runRichLocationMigrationBatch,
  suggestCityBoundary,
  acquireLease,
  binHistoricPoints,
} = require('../../services/richLocationMigrationAdminService');

const TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  richLocationConstraints: {
    countryCode: 'US',
    bounds: { north: 41, south: 40, east: -73, west: -75 },
  },
  richLocationControls: { rollout: 'off', reads: true },
};

function query(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function models() {
  const Event = {
    countDocuments: jest.fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2),
    distinct: jest.fn().mockResolvedValue(['2026-W36', '2026-W37']),
  };
  const PivotLocationBackfillRun = {
    find: jest.fn(() => query([{ scope: 'live', status: 'completed' }])),
  };
  const PivotLocationMigrationLease = {
    find: jest.fn(() => query([])),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    create: jest.fn().mockResolvedValue({}),
  };
  const PivotLocationBackfillWeekRun = {
    findOne: jest.fn(() => query({ batchWeek: '2026-W37', status: 'batch_complete' })),
  };
  return {
    Event,
    PivotLocationBackfillRun,
    PivotLocationBackfillWeekRun,
    PivotLocationMigrationLease,
  };
}

describe('richLocationMigrationAdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({ models: {} });
  });

  test('requires an explicit server-side feature flag', () => {
    expect(migrationUiEnabled({})).toBe(false);
    expect(migrationUiEnabled({ ENABLE_RICH_LOCATION_MIGRATION_UI: 'false' })).toBe(false);
    expect(migrationUiEnabled({ ENABLE_RICH_LOCATION_MIGRATION_UI: 'true' })).toBe(true);
  });

  test('returns public migration state without exposing audit history', async () => {
    const doubles = models();
    getModels.mockReturnValue(doubles);
    const result = await getRichLocationMigrationStatus({
      tenant: TENANT,
      batchWeek: '2026-W37',
    });

    expect(result).toMatchObject({
      tenantKey: 'nyc',
      providerConfigured: true,
      batchWeek: '2026-W37',
      needsReview: 2,
      coverage: { total: 10, processed: 7, resolved: 5, needsReview: 2, remaining: 3, percent: 70 },
      weekRun: { batchWeek: '2026-W37', status: 'batch_complete' },
      controls: { rollout: 'off', reads: false, writes: false },
      runs: { live: { scope: 'live', status: 'completed' }, historical: null },
    });
    expect(result.runs.live).not.toHaveProperty('auditSummaries');
    expect(doubles.PivotLocationMigrationLease.find).toHaveBeenCalledWith(expect.objectContaining({
      expiresAt: { $gt: expect.any(Date) },
    }));
  });

  test('dry-run is the default and always releases its lease', async () => {
    const doubles = models();
    getModels.mockReturnValue(doubles);
    runLocationBackfill.mockResolvedValue({ status: 'completed', dryRun: true });

    const result = await runRichLocationMigrationBatch(
      { user: { email: 'operator@example.com' } },
      { tenant: TENANT, input: {
        scope: 'live',
        batchWeek: '2026-W37',
        asOf: '2026-09-03T12:00:00.000Z',
      } },
    );

    expect(result.status).toBe('completed');
    expect(runLocationBackfill).toHaveBeenCalledWith(expect.objectContaining({
      tenantKey: 'nyc',
      dryRun: true,
      batchSize: 25,
      maxProviderOperations: 25,
      batchWeek: '2026-W37',
    }));
    expect(doubles.PivotLocationMigrationLease.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantKey: 'nyc',
      actor: 'operator@example.com',
    }));
    expect(doubles.PivotLocationMigrationLease.deleteOne).toHaveBeenLastCalledWith({
      leaseId: expect.any(String),
    });
  });

  test('an applied batch requires the exact tenant-key confirmation', async () => {
    await expect(runRichLocationMigrationBatch(
      { user: {} },
      { tenant: TENANT, input: { apply: true, confirmTenantKey: 'brooklyn' } },
    )).rejects.toMatchObject({
      code: 'RICH_LOCATION_MIGRATION_CONFIRMATION_REQUIRED',
      status: 400,
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  test('requires the UI to select a batch week', async () => {
    await expect(runRichLocationMigrationBatch(
      { user: {} },
      { tenant: TENANT, input: {} },
    )).rejects.toMatchObject({
      code: 'RICH_LOCATION_MIGRATION_BATCH_WEEK_INVALID',
      status: 400,
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  test('suggests a city boundary from the tenant location without persisting it', async () => {
    googleLocationService.lookupCityBoundary.mockResolvedValue({
      formattedAddress: 'New York, NY, USA',
      countryCode: 'US',
      bounds: { north: 40.92, south: 40.48, east: -73.7, west: -74.26 },
      center: { latitude: 40.71, longitude: -74.01 },
      radiusKm: 28.4,
      matchCount: 1,
    });

    const result = await suggestCityBoundary({
      tenant: { ...TENANT, location: 'New York City', name: 'NYC' },
    });

    expect(result).toEqual({
      query: 'New York City',
      formattedAddress: 'New York, NY, USA',
      countryCode: 'US',
      bounds: { north: 40.92, south: 40.48, east: -73.7, west: -74.26 },
      center: { latitude: 40.71, longitude: -74.01 },
      radiusKm: 28.4,
      matchCount: 1,
      ambiguous: false,
    });
    expect(googleLocationService.lookupCityBoundary).toHaveBeenCalledWith('New York City', {
      countryCode: 'US',
    });
  });

  test('requires a city name when the tenant has no location label', async () => {
    await expect(suggestCityBoundary({ tenant: { tenantKey: 'nyc' } })).rejects.toMatchObject({
      code: 'GOOGLE_CITY_QUERY_INVALID',
      status: 400,
    });
    expect(googleLocationService.lookupCityBoundary).not.toHaveBeenCalled();
  });

  test('bins historic coordinates without a batch week', async () => {
    const Event = {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { richLocation: { coordinates: { coordinates: [-74.0, 40.7] } } },
          { richLocation: { coordinates: { coordinates: [-74.0, 40.7] } } },
          { richLocation: { coordinates: { coordinates: [-73.0, 41.5] } } },
        ]),
      })),
      countDocuments: jest.fn().mockResolvedValue(9),
    };
    getModels.mockReturnValue({ Event });

    const result = await getHistoricLocationHeatmap({ tenant: TENANT });
    const query = Event.find.mock.calls[0][0];

    expect(JSON.stringify(query)).not.toMatch(/batchWeek/);
    expect(query['customFields.pivot']).toEqual({ $exists: true });
    expect(result).toMatchObject({
      pointCount: 3,
      outsideCount: 1,
      unresolvedCount: 9,
      truncated: false,
      cityBounds: TENANT.richLocationConstraints.bounds,
    });
    expect(result.cells.some((cell) => cell.count >= 2)).toBe(true);
  });

  test('places denser points into the same heatmap cell', () => {
    const { cells, maxCount } = binHistoricPoints(
      [
        { latitude: 40.75, longitude: -74.1 },
        { latitude: 40.75, longitude: -74.1 },
        { latitude: 40.2, longitude: -73.2 },
      ],
      { north: 41, south: 40, east: -73, west: -75 },
      10,
      10,
    );
    expect(maxCount).toBe(2);
    expect(cells).toHaveLength(2);
  });

  test('reports a duplicate lease as a conflict', async () => {
    const Model = {
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      create: jest.fn().mockRejectedValue({ code: 11000 }),
    };
    await expect(acquireLease(Model, {
      tenantKey: 'nyc', scope: 'live', actor: 'admin',
    })).rejects.toMatchObject({
      code: 'RICH_LOCATION_MIGRATION_LOCKED',
      status: 409,
    });
  });
});
