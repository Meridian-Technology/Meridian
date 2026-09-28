jest.mock('../../services/getGlobalModelService', () => jest.fn());

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  correctedFields, loadApprovedHintsForJob, recordScrapeLearningRun,
  recordCatalogCorrection, recordManualReviewFeedback, decideExtractionRule,
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

  it('records a reasoned correction as a proposed rule, then approves it for its entrypoint', async () => {
    const doc = job();
    PivotCurationJob.findOne.mockResolvedValue(doc);
    const before = { _id: EVENT_ID, image: 'https://venue.example/logo.png',
      customFields: { pivot: { entrypointId: JOB_ID } } };
    await recordCatalogCorrection(req, { tenantKey: 'nyc', before,
      after: { ...before, image: 'https://venue.example/show.jpg' },
      correctionReasons: { image: 'venue_logo' } });
    expect(doc.extractionProfile.extractionRules).toMatchObject([{
      id: `${EVENT_ID}:image:venue_logo`, status: 'proposed',
      badValue: 'https://venue.example/logo.png',
    }]);
    expect(doc.extractionProfile.suggestedHints).toEqual([]);
    await decideExtractionRule(req, { tenantKey: 'nyc', jobId: JOB_ID,
      ruleId: `${EVENT_ID}:image:venue_logo`, action: 'approve' });
    expect(doc.extractionProfile.extractionRules[0].status).toBe('active');
  });

  it('can approve a proposed rule for every entrypoint of a linked source and disable it', async () => {
    const doc = job();
    doc.sourceId = SOURCE_ID;
    doc.extractionProfile.extractionRules = [{ id: 'rule-1', field: 'description',
      reason: 'date_not_description', badValue: 'Sep 26', status: 'proposed' }];
    const source = { extractionRules: [], save: jest.fn().mockResolvedValue(undefined) };
    PivotCurationJob.findOne.mockResolvedValue(doc);
    PivotCitySource.findOne.mockResolvedValue(source);
    await decideExtractionRule(req, { tenantKey: 'nyc', jobId: JOB_ID,
      ruleId: 'rule-1', action: 'approve', scope: 'source' });
    expect(doc.extractionProfile.extractionRules).toEqual([]);
    expect(source.extractionRules).toMatchObject([{ id: 'rule-1', status: 'active' }]);
    await decideExtractionRule(req, { tenantKey: 'nyc', jobId: JOB_ID,
      ruleId: 'rule-1', action: 'disable' });
    expect(source.extractionRules[0].status).toBe('disabled');
  });
});
