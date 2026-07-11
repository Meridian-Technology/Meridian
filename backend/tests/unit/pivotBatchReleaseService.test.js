jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: jest.requireActual('../../services/pivotWeeklySnapshotService')
    .normalizeBatchWeek,
  rebuildWeeklySnapshot: jest.fn(),
}));
jest.mock('../../services/pivotBatchService', () => ({
  ensurePivotBatch: jest.fn(),
  serializePivotBatch: jest.requireActual('../../services/pivotBatchService').serializePivotBatch,
  DEFAULT_TARGET_EVENT_COUNT: 40,
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { rebuildWeeklySnapshot } = require('../../services/pivotWeeklySnapshotService');
const { ensurePivotBatch } = require('../../services/pivotBatchService');
const {
  releaseBatch,
  unreleaseBatch,
  UNRELEASE_CONFIRM_TOKEN,
  normalizeEventIds,
} = require('../../services/pivotBatchReleaseService');

const TENANT = { tenantKey: 'nyc', location: 'New York City', name: 'NYC' };
const BATCH_WEEK = '2026-W28';
const EVENT_A = '665a1b2c3d4e5f6789012345';
const EVENT_B = '665a1b2c3d4e5f6789012346';
const NOW = new Date('2026-07-09T18:00:00.000Z');

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: {
      email: 'ops@meridian.app',
      globalUserId: '507f191e810c19729de860ea',
    },
    ...overrides,
  };
}

describe('normalizeEventIds', () => {
  it('returns null when omitted (release all)', () => {
    expect(normalizeEventIds(undefined)).toEqual({ eventIds: null });
    expect(normalizeEventIds(null)).toEqual({ eventIds: null });
  });

  it('rejects non-array and empty array', () => {
    expect(normalizeEventIds('x').code).toBe('INVALID_EVENT_IDS');
    expect(normalizeEventIds([]).code).toBe('INVALID_EVENT_IDS');
  });

  it('rejects invalid ObjectIds', () => {
    expect(normalizeEventIds(['nope']).code).toBe('INVALID_EVENT_IDS');
  });

  it('dedupes valid ids', () => {
    const result = normalizeEventIds([EVENT_A, EVENT_A, EVENT_B]);
    expect(result.eventIds).toHaveLength(2);
    expect(String(result.eventIds[0])).toBe(EVENT_A);
  });
});

describe('releaseBatch', () => {
  let Event;
  let PivotBatch;

  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();
    rebuildWeeklySnapshot.mockReset();
    ensurePivotBatch.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    ensurePivotBatch.mockResolvedValue({
      data: { batchWeek: BATCH_WEEK, status: 'curating' },
    });
    rebuildWeeklySnapshot.mockResolvedValue({
      data: { batchWeek: BATCH_WEEK, tenants: [] },
    });

    Event = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
      countDocuments: jest.fn(),
    };
    PivotBatch = {
      findOneAndUpdate: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: '665a1b2c3d4e5f6789019999',
          batchWeek: BATCH_WEEK,
          status: 'released',
          targetEventCount: 40,
          releasedAt: NOW,
          releasedBy: 'ops@meridian.app',
        }),
      })),
    };
    getModels.mockReturnValue({ Event, PivotBatch });
  });

  it('returns 404 when tenant is not a pivot city', async () => {
    resolvePivotTenant.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const result = await releaseBatch(mockReq(), {
      tenantKey: 'missing',
      batchWeek: BATCH_WEEK,
    });

    expect(result.code).toBe('TENANT_NOT_FOUND');
    expect(Event.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid batchWeek', async () => {
    const result = await releaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: 'not-a-week',
    });
    expect(result.code).toBe('INVALID_BATCH_WEEK');
  });

  it('flips all staged events to published and records audit fields', async () => {
    const result = await releaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
      now: NOW,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.releasedCount).toBe(3);
    expect(result.data.skippedCount).toBe(0);
    expect(result.data.batchStatus).toBe('released');
    expect(result.data.partial).toBe(false);
    expect(result.data.batch.releasedBy).toBe('ops@meridian.app');
    expect(result.data.snapshot).toEqual({ rebuilt: true, batchWeek: BATCH_WEEK });

    expect(Event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': BATCH_WEEK,
        'customFields.pivot.ingestStatus': 'staged',
      }),
      { $set: { 'customFields.pivot.ingestStatus': 'published' } },
    );
    expect(Event.updateMany.mock.calls[0][0]._id).toBeUndefined();

    expect(PivotBatch.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: BATCH_WEEK },
      {
        $set: {
          status: 'released',
          releasedAt: NOW,
          releasedBy: 'ops@meridian.app',
        },
      },
      expect.objectContaining({ new: true }),
    );
    expect(rebuildWeeklySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ globalDb: {} }),
      expect.objectContaining({ batchWeek: BATCH_WEEK }),
    );
  });

  it('supports partial release via eventIds and reports skippedCount', async () => {
    Event.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await releaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
      eventIds: [EVENT_A, EVENT_B],
      now: NOW,
      rebuildSnapshot: false,
    });

    expect(result.data.releasedCount).toBe(1);
    expect(result.data.skippedCount).toBe(1);
    expect(result.data.partial).toBe(true);
    expect(result.data.snapshot).toBeNull();
    expect(Event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $in: expect.any(Array) },
        'customFields.pivot.ingestStatus': 'staged',
      }),
      expect.any(Object),
    );
    expect(rebuildWeeklySnapshot).not.toHaveBeenCalled();
  });
});

describe('unreleaseBatch', () => {
  let Event;
  let PivotBatch;

  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();
    rebuildWeeklySnapshot.mockReset();
    ensurePivotBatch.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    ensurePivotBatch.mockResolvedValue({
      data: { batchWeek: BATCH_WEEK, status: 'curating' },
    });
    rebuildWeeklySnapshot.mockResolvedValue({
      data: { batchWeek: BATCH_WEEK, tenants: [] },
    });

    Event = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    PivotBatch = {
      findOneAndUpdate: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: '665a1b2c3d4e5f6789019999',
          batchWeek: BATCH_WEEK,
          status: 'curating',
          targetEventCount: 40,
          releasedAt: null,
          releasedBy: null,
        }),
      })),
    };
    getModels.mockReturnValue({ Event, PivotBatch });
  });

  it('requires typed UNRELEASE confirm token', async () => {
    const result = await unreleaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
      confirm: 'yes',
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('CONFIRMATION_REQUIRED');
    expect(Event.updateMany).not.toHaveBeenCalled();
  });

  it('flips published → staged and clears batch release audit when none remain', async () => {
    const result = await unreleaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
      confirm: UNRELEASE_CONFIRM_TOKEN,
      now: NOW,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.unreleasedCount).toBe(2);
    expect(result.data.batchStatus).toBe('curating');
    expect(result.data.remainingPublished).toBe(0);
    expect(result.data.warning).toMatch(/already swiped/i);

    expect(Event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': BATCH_WEEK,
        'customFields.pivot.ingestStatus': 'published',
      }),
      { $set: { 'customFields.pivot.ingestStatus': 'staged' } },
    );
    expect(PivotBatch.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: BATCH_WEEK },
      {
        $set: {
          status: 'curating',
          releasedAt: null,
          releasedBy: null,
        },
      },
      expect.objectContaining({ new: true }),
    );
  });

  it('keeps batch released when some published events remain after partial unrelease', async () => {
    Event.updateMany.mockResolvedValue({ modifiedCount: 1 });
    Event.countDocuments.mockResolvedValue(2);
    PivotBatch.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '665a1b2c3d4e5f6789019999',
        batchWeek: BATCH_WEEK,
        status: 'released',
        targetEventCount: 40,
        releasedAt: NOW,
        releasedBy: 'ops@meridian.app',
      }),
    });

    const result = await unreleaseBatch(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
      confirm: UNRELEASE_CONFIRM_TOKEN,
      eventIds: [EVENT_A],
      now: NOW,
      rebuildSnapshot: false,
    });

    expect(result.data.unreleasedCount).toBe(1);
    expect(result.data.skippedCount).toBe(0);
    expect(result.data.remainingPublished).toBe(2);
    expect(result.data.batchStatus).toBe('released');
    expect(PivotBatch.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: BATCH_WEEK },
      { $set: { status: 'released' } },
      expect.any(Object),
    );
  });
});
