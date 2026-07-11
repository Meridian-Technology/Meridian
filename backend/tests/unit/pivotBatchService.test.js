jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  ensurePivotBatch,
  getPivotBatch,
  serializePivotBatch,
} = require('../../services/pivotBatchService');

describe('pivotBatchService', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('rejects invalid batchWeek', async () => {
    const result = await ensurePivotBatch({ db: {} }, { batchWeek: 'nope' });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BATCH_WEEK');
  });

  it('upserts a curating batch on first curation', async () => {
    const leanDoc = {
      _id: '665a1b2c3d4e5f6789019999',
      batchWeek: '2026-W28',
      status: 'curating',
      targetEventCount: 40,
      releasedAt: null,
      releasedBy: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const findOneAndUpdate = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(leanDoc),
    }));
    getModels.mockReturnValue({ PivotBatch: { findOneAndUpdate } });

    const result = await ensurePivotBatch({ db: {} }, { batchWeek: '2026-W28' });

    expect(result.data).toEqual(serializePivotBatch(leanDoc));
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: '2026-W28' },
      {
        $setOnInsert: expect.objectContaining({
          batchWeek: '2026-W28',
          status: 'curating',
          targetEventCount: 40,
          releasedAt: null,
          releasedBy: null,
        }),
      },
      expect.objectContaining({ upsert: true, new: true }),
    );
  });

  it('returns null when batch does not exist', async () => {
    getModels.mockReturnValue({
      PivotBatch: {
        findOne: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue(null),
        })),
      },
    });

    const result = await getPivotBatch({ db: {} }, '2026-W28');
    expect(result.data).toBeNull();
  });
});
