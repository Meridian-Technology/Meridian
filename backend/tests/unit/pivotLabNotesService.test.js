jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: (raw, now = new Date()) => {
    const batchWeek = raw?.trim() || '2026-W26';
    if (!/^\d{4}-W\d{2}$/.test(batchWeek)) {
      return { error: 'invalid', status: 400, code: 'INVALID_BATCH_WEEK' };
    }
    return { batchWeek };
  },
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  getInterviewNotes,
  saveInterviewNotes,
} = require('../../services/pivotLabNotesService');

describe('pivotLabNotesService', () => {
  let PivotLabNotes;

  beforeEach(() => {
    PivotLabNotes = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    getGlobalModels.mockReturnValue({ PivotLabNotes });
  });

  it('returns empty notes when doc is missing', async () => {
    PivotLabNotes.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const result = await getInterviewNotes({ globalDb: {} }, { batchWeek: '2026-W26' });

    expect(result.data.batchWeek).toBe('2026-W26');
    expect(result.data.notes).toBe('');
  });

  it('saves notes with upsert', async () => {
    PivotLabNotes.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        batchWeek: '2026-W26',
        notes: 'Themes',
        updatedBy: 'ops@meridian.study',
        updatedAt: new Date('2026-06-26T12:00:00.000Z'),
      }),
    });

    const result = await saveInterviewNotes(
      { globalDb: {}, user: { email: 'ops@meridian.study' } },
      { batchWeek: '2026-W26', notes: 'Themes' },
    );

    expect(PivotLabNotes.findOneAndUpdate).toHaveBeenCalledWith(
      { batchWeek: '2026-W26' },
      { notes: 'Themes', updatedBy: 'ops@meridian.study' },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    expect(result.data.notes).toBe('Themes');
  });
});
