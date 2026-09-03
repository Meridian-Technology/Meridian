jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getModelService');
jest.mock('../../services/pivotLocationBackfillService', () => ({
  runLocationBackfill: jest.fn(),
}));
jest.mock('../../services/googleLocationService', () => ({
  isGoogleLocationConfigured: jest.fn(() => true),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { runLocationBackfill } = require('../../services/pivotLocationBackfillService');
const {
  migrationUiEnabled,
  getRichLocationMigrationStatus,
  runRichLocationMigrationBatch,
  acquireLease,
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
  const Event = { countDocuments: jest.fn().mockResolvedValue(3) };
  const PivotLocationBackfillRun = {
    find: jest.fn(() => query([{ scope: 'live', status: 'completed' }])),
  };
  const PivotLocationMigrationLease = {
    find: jest.fn(() => query([])),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    create: jest.fn().mockResolvedValue({}),
  };
  return { Event, PivotLocationBackfillRun, PivotLocationMigrationLease };
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
    const result = await getRichLocationMigrationStatus({ tenant: TENANT });

    expect(result).toMatchObject({
      tenantKey: 'nyc',
      providerConfigured: true,
      needsReview: 3,
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
      { tenant: TENANT, input: { scope: 'live', asOf: '2026-09-03T12:00:00.000Z' } },
    );

    expect(result.status).toBe('completed');
    expect(runLocationBackfill).toHaveBeenCalledWith(expect.objectContaining({
      tenantKey: 'nyc',
      dryRun: true,
      batchSize: 25,
      maxProviderOperations: 25,
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
