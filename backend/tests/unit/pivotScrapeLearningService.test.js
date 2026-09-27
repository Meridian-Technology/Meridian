jest.mock('../../services/getGlobalModelService', () => jest.fn());

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  correctedFields, loadApprovedHintsForJob, recordScrapeLearningRun,
  recordCatalogCorrection, recordManualReviewFeedback,
} = require('../../services/pivotScrapeLearningService');

const JOB_ID = '665a1b2c3d4e5f6789012345';
const SOURCE_ID = '665a1b2c3d4e5f6789012346';
const EVENT_ID = '665a1b2c3d4e5f6789012347';
const req = {};

function job() {
  return {
    _id: JOB_ID, tenantKey: 'nyc', provider: 'generic-site',
    extractionProfile: { promptHints: ['Read the section date.'], suggestedHints: [], learningRuns: [] },
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('pivotScrapeLearningService', () => {
  let PivotCurationJob;
  let PivotCitySource;

  beforeEach(() => {
    PivotCurationJob = { findOne: jest.fn() };
    PivotCitySource = { findOne: jest.fn() };
    getGlobalModels.mockReturnValue({ PivotCurationJob, PivotCitySource });
  });

  it('merges source and entrypoint guidance without duplicates', async () => {
    PivotCitySource.findOne.mockReturnValue({ select: () => ({ lean: async () => ({
      promptHints: ['Read the section date.', 'Use the detail page for the time.'],
    }) }) });
    const hints = await loadApprovedHintsForJob(req, 'nyc', {
      sourceId: SOURCE_ID, extractionProfile: { promptHints: ['read the section date.', 'Ignore sold-out events.'] },
    });
    expect(PivotCitySource.findOne).toHaveBeenCalledWith({ _id: SOURCE_ID, tenantKey: 'nyc' });
    expect(hints).toEqual([
      'read the section date.', 'Ignore sold-out events.', 'Use the detail page for the time.',
    ]);
  });

  it('records a run once and keeps review feedback with that run', async () => {
    const doc = job();
    PivotCurationJob.findOne.mockResolvedValue(doc);
    const options = { tenantKey: 'nyc', jobId: JOB_ID, runKey: 'local:one',
      stats: { discovered: 8, upserted: 5, failed: 1 }, hintCount: 2, estimatedCredits: 5 };
    expect(await recordScrapeLearningRun(req, options)).toBe(true);
    expect(await recordScrapeLearningRun(req, options)).toBe(false);
    const feedback = await recordManualReviewFeedback(req, {
      tenantKey: 'nyc', jobId: JOB_ID, missed: 2, discarded: 1, reviewSeconds: 90,
    });
    expect(feedback.error).toBeUndefined();
    expect(doc.extractionProfile.learningRuns).toMatchObject([{
      runKey: 'local:one', discovered: 8, upserted: 5, failed: 1,
      hintCount: 2, missed: 2, discarded: 1, reviewSeconds: 90,
    }]);
    expect(doc.save).toHaveBeenCalledTimes(2);
  });

  it('turns changed catalog fields into reviewable guidance, without embedding event values', async () => {
    const doc = job();
    doc.extractionProfile.learningRuns.push({ runKey: 'local:one', corrections: 0, reviewSeconds: 0 });
    PivotCurationJob.findOne.mockResolvedValue(doc);
    const before = { _id: EVENT_ID, location: 'Old venue', description: 'Old copy',
      customFields: { pivot: { entrypointId: JOB_ID } } };
    const after = { ...before, location: 'New venue', description: 'Updated copy' };
    expect(correctedFields(before, after)).toEqual(['location', 'description']);
    const result = await recordCatalogCorrection(req, { tenantKey: 'nyc', before, after, reviewSeconds: 43 });
    expect(result.fields).toEqual(['location', 'description']);
    expect(doc.extractionProfile.suggestedHints).toHaveLength(2);
    expect(doc.extractionProfile.suggestedHints[0].text).not.toContain('New venue');
    expect(doc.extractionProfile.learningRuns[0]).toMatchObject({ corrections: 2, reviewSeconds: 43 });
    await recordCatalogCorrection(req, { tenantKey: 'nyc', before, after });
    expect(doc.extractionProfile.suggestedHints).toHaveLength(2);
  });

  it('rejects invalid manual feedback before querying MongoDB', async () => {
    expect((await recordManualReviewFeedback(req, { tenantKey: 'nyc', jobId: 'bad' })).status).toBe(400);
    expect((await recordManualReviewFeedback(req, { tenantKey: 'nyc', jobId: JOB_ID, missed: -1 })).status).toBe(400);
    expect(PivotCurationJob.findOne).not.toHaveBeenCalled();
  });
});
