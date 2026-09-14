jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotBatchService', () => ({
  ensurePivotBatch: jest.fn().mockResolvedValue({ data: {} }),
  serializePivotBatch: jest.fn((doc) => doc),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { ensurePivotBatch } = require('../../services/pivotBatchService');
const {
  normalizeEventIds,
  updateBatchSelectionPolicy,
} = require('../../services/pivotEditorialPolicyService');

describe('pivotEditorialPolicyService', () => {
  const eventA = '665a000000000000000000a1';
  const eventB = '665a000000000000000000b2';
  const now = new Date('2026-09-13T18:00:00.000Z');
  const req = { user: { email: 'editor@example.com' } };
  let Event;
  let PivotBatch;

  beforeEach(() => {
    jest.clearAllMocks();
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'oakland', pivotDeckConfig: { hardMax: 2 } },
    });
    connectToDatabase.mockResolvedValue({ name: 'tenant-db' });
    Event = {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: eventA }, { _id: eventB }]),
      })),
    };
    PivotBatch = {
      findOneAndUpdate: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({
          batchWeek: '2026-W38',
          selectionPolicy: { mode: 'editorial', eventIds: [eventA, eventB] },
        }),
      })),
    };
    getModels.mockReturnValue({ Event, PivotBatch });
  });

  it('normalizes unique ObjectIds and rejects malformed ids', () => {
    expect(normalizeEventIds([eventA, eventA, eventB])).toEqual({ eventIds: [eventA, eventB] });
    expect(normalizeEventIds(['not-an-id'])).toEqual(expect.objectContaining({
      status: 400,
      code: 'INVALID_EVENT_IDS',
    }));
  });

  it('stores a validated exact editorial set with audit metadata', async () => {
    const result = await updateBatchSelectionPolicy(req, {
      tenantKey: 'oakland',
      batchWeek: '2026-W38',
      mode: 'editorial',
      eventIds: [eventA, eventB],
      now,
    });

    expect(Event.find).toHaveBeenCalledWith(expect.objectContaining({
      _id: { $in: [eventA, eventB] },
      'customFields.pivot.batchWeek': '2026-W38',
      'customFields.pivot.ingestStatus': 'published',
      'customFields.pivot.rankingOverride.tier': { $ne: 'hidden' },
    }));
    expect(ensurePivotBatch).toHaveBeenCalledWith(
      expect.objectContaining({ db: { name: 'tenant-db' } }),
      { batchWeek: '2026-W38' },
    );
    expect(PivotBatch.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: '2026-W38' },
      { $set: { selectionPolicy: {
        mode: 'editorial',
        eventIds: [eventA, eventB],
        updatedBy: 'editor@example.com',
        updatedAt: now,
      } } },
      { new: true, runValidators: true },
    );
    expect(result.data.batch.selectionPolicy.mode).toBe('editorial');
  });

  it('rejects incomplete, hidden, unpublished, or wrong-week exact sets', async () => {
    Event.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: eventA }]),
    });

    const result = await updateBatchSelectionPolicy(req, {
      tenantKey: 'oakland',
      batchWeek: '2026-W38',
      mode: 'editorial',
      eventIds: [eventA, eventB],
      now,
    });

    expect(result).toEqual(expect.objectContaining({ status: 400, code: 'INVALID_EDITORIAL_SET' }));
    expect(PivotBatch.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('enforces the deck hard maximum and allows returning to personalization', async () => {
    const tooLarge = await updateBatchSelectionPolicy(req, {
      tenantKey: 'oakland',
      batchWeek: '2026-W38',
      mode: 'editorial',
      eventIds: [eventA, eventB, '665a000000000000000000c3'],
      now,
    });
    expect(tooLarge).toEqual(expect.objectContaining({
      status: 400,
      code: 'EDITORIAL_SET_TOO_LARGE',
    }));

    await updateBatchSelectionPolicy(req, {
      tenantKey: 'oakland',
      batchWeek: '2026-W38',
      mode: 'personalized',
      eventIds: [eventA],
      now,
    });
    expect(Event.find).not.toHaveBeenCalled();
    expect(PivotBatch.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: '2026-W38' },
      { $set: { selectionPolicy: {
        mode: 'personalized',
        updatedBy: 'editor@example.com',
        updatedAt: now,
      } } },
      { new: true, runValidators: true },
    );
  });
});
