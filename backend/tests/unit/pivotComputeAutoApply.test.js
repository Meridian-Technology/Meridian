jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  connectToGlobalDatabase: jest.fn(),
}));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({ getTenantByKey: jest.fn() }));
jest.mock('../../services/pivotComputeResultApplyService', () => ({
  previewStoredComputeJob: jest.fn(),
  applyStoredComputeJob: jest.fn(),
}));
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  previewStoredComputeJob,
  applyStoredComputeJob,
} = require('../../services/pivotComputeResultApplyService');
const {
  maybeAutoApplyComputeJob,
  sweepPendingAutoApplyComputeJobs,
  guardrailSkipCode,
  MAX_AUTO_APPLY_ATTEMPTS,
  STARTUP_SWEEP_DISABLE_ENV,
} = require('../../services/pivotComputeAutoApplyService');

function lean(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function reviewableJob(overrides = {}) {
  return {
    externalJobId: 'job-123',
    tenantKey: 'nyc',
    kind: 'city-curation-refresh',
    status: 'review-required',
    origin: { type: 'schedule' },
    result: { embedded: { cityKey: 'nyc', events: [] } },
    ...overrides,
  };
}

describe('pivotComputeAutoApplyService', () => {
  let PivotComputeJob;

  beforeEach(() => {
    jest.clearAllMocks();
    PivotComputeJob = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    getGlobalModels.mockReturnValue({ PivotComputeJob });
    getTenantByKey.mockResolvedValue({
      pivotComputeApply: { trusted: true, autoApplyRefresh: true },
    });
  });

  it('records a policy skip without claiming or previewing the job', async () => {
    PivotComputeJob.findOne.mockReturnValue(lean(reviewableJob()));
    getTenantByKey.mockResolvedValue({ pivotComputeApply: { trusted: false } });

    const result = await maybeAutoApplyComputeJob({}, 'job-123');

    expect(result).toMatchObject({ attempted: false, outcome: 'skipped', skipCode: 'TENANT_NOT_TRUSTED' });
    expect(PivotComputeJob.findOneAndUpdate).not.toHaveBeenCalled();
    expect(previewStoredComputeJob).not.toHaveBeenCalled();
    expect(PivotComputeJob.updateOne).toHaveBeenCalledWith(
      { externalJobId: 'job-123' },
      expect.objectContaining({ $set: expect.objectContaining({ 'autoApply.skipCode': 'TENANT_NOT_TRUSTED' }) }),
    );
  });

  it('claims, previews, and applies trusted allowed jobs with the system idempotency key', async () => {
    const job = reviewableJob();
    PivotComputeJob.findOne.mockReturnValue(lean(job));
    PivotComputeJob.findOneAndUpdate.mockReturnValue(lean(job));
    previewStoredComputeJob.mockResolvedValue({
      preview: { applyAllowed: true, rows: [{ entityType: 'event', action: 'update' }] },
    });
    applyStoredComputeJob.mockResolvedValue({ async: false, accepted: true });

    const result = await maybeAutoApplyComputeJob({}, job.externalJobId);

    expect(result).toMatchObject({ attempted: true, outcome: 'applied', async: false });
    expect(PivotComputeJob.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review-required', 'autoApply.outcome': { $ne: 'applying' } }),
      expect.objectContaining({ $inc: { 'autoApply.attemptCount': 1 } }),
      { new: true },
    );
    expect(applyStoredComputeJob).toHaveBeenCalledWith(expect.any(Object), job.externalJobId, expect.objectContaining({
      tenantKey: 'nyc', actor: 'system:auto-apply', idempotencyKey: 'auto:apply:job-123',
    }));
    expect(PivotComputeJob.updateOne).toHaveBeenLastCalledWith(
      { externalJobId: 'job-123' },
      expect.objectContaining({ $set: expect.objectContaining({ 'autoApply.outcome': 'applied' }) }),
    );
  });

  it('leaves a claimed job for review when preview or guardrails block it', async () => {
    const job = reviewableJob({ kind: 'city-source-discovery' });
    PivotComputeJob.findOne.mockReturnValue(lean(job));
    PivotComputeJob.findOneAndUpdate.mockReturnValue(lean(job));
    getTenantByKey.mockResolvedValue({
      pivotComputeApply: { trusted: true, autoApplyDiscovery: true, maxNewSources: 0 },
    });
    previewStoredComputeJob.mockResolvedValue({
      preview: { applyAllowed: true, rows: [{ entityType: 'source', action: 'create' }] },
    });

    const result = await maybeAutoApplyComputeJob({}, job.externalJobId);

    expect(result).toMatchObject({ attempted: true, outcome: 'skipped', skipCode: 'MAX_NEW_SOURCES_EXCEEDED' });
    expect(applyStoredComputeJob).not.toHaveBeenCalled();
    expect(PivotComputeJob.updateOne).toHaveBeenLastCalledWith(
      { externalJobId: job.externalJobId },
      expect.objectContaining({ $set: expect.objectContaining({ 'autoApply.skipCode': 'MAX_NEW_SOURCES_EXCEEDED' }) }),
    );
  });

  it('leaves the job for review when native tags cannot be assigned', async () => {
    const job = reviewableJob();
    PivotComputeJob.findOne.mockReturnValue(lean(job));
    PivotComputeJob.findOneAndUpdate.mockReturnValue(lean(job));
    previewStoredComputeJob.mockResolvedValue({
      preview: { applyAllowed: true, rows: [{ entityType: 'event', action: 'create' }] },
    });
    applyStoredComputeJob.mockResolvedValue({
      async: false,
      skipCode: 'NATIVE_TAGS_REQUIRED',
      outcome: 'rejected',
    });

    const result = await maybeAutoApplyComputeJob({}, job.externalJobId);

    expect(result).toMatchObject({
      attempted: true,
      outcome: 'skipped',
      skipCode: 'NATIVE_TAGS_REQUIRED',
    });
    expect(PivotComputeJob.updateOne).toHaveBeenLastCalledWith(
      { externalJobId: job.externalJobId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'autoApply.outcome': 'skipped',
          'autoApply.skipCode': 'NATIVE_TAGS_REQUIRED',
        }),
      }),
    );
  });

  it('counts only create rows for optional discovery guardrails', () => {
    expect(MAX_AUTO_APPLY_ATTEMPTS).toBe(3);
    expect(guardrailSkipCode({ rows: [{ entityType: 'event', action: 'create' }] }, { maxEventCreates: 0 }))
      .toBe('MAX_EVENT_CREATES_EXCEEDED');
    expect(guardrailSkipCode({ rows: [{ entityType: 'source', action: 'update' }] }, { maxNewSources: 0 }))
      .toBeNull();
  });

  describe('startup sweep', () => {
    const previousDisableEnv = process.env[STARTUP_SWEEP_DISABLE_ENV];

    afterEach(() => {
      if (previousDisableEnv === undefined) {
        delete process.env[STARTUP_SWEEP_DISABLE_ENV];
      } else {
        process.env[STARTUP_SWEEP_DISABLE_ENV] = previousDisableEnv;
      }
    });

    function mockCandidateFind(jobs) {
      const query = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(jobs),
      };
      PivotComputeJob.find.mockReturnValue(query);
      return query;
    }

    it('skips entirely when DISABLE_PIVOT_COMPUTE_AUTO_APPLY_STARTUP_SWEEP=true', async () => {
      process.env[STARTUP_SWEEP_DISABLE_ENV] = 'true';

      const result = await sweepPendingAutoApplyComputeJobs({ globalDb: {} });

      expect(result).toMatchObject({
        skipped: true,
        skipCode: 'DISABLED',
        attempted: 0,
        candidates: 0,
      });
      expect(PivotComputeJob.find).not.toHaveBeenCalled();
      expect(applyStoredComputeJob).not.toHaveBeenCalled();
    });

    it('makes one auto-apply attempt per review-required candidate', async () => {
      delete process.env[STARTUP_SWEEP_DISABLE_ENV];
      const query = mockCandidateFind([
        { externalJobId: 'job-a' },
        { externalJobId: 'job-b' },
      ]);
      PivotComputeJob.findOne.mockImplementation(({ externalJobId }) => (
        lean(reviewableJob({ externalJobId }))
      ));
      PivotComputeJob.findOneAndUpdate.mockImplementation(({ externalJobId }) => (
        lean(reviewableJob({ externalJobId }))
      ));
      previewStoredComputeJob.mockResolvedValue({
        preview: { applyAllowed: true, rows: [{ entityType: 'event', action: 'update' }] },
      });
      applyStoredComputeJob.mockResolvedValue({ async: false, accepted: true });

      const now = new Date('2026-09-21T21:00:00.000Z');
      const result = await sweepPendingAutoApplyComputeJobs({ globalDb: {} }, { limit: 10, now });

      expect(PivotComputeJob.find).toHaveBeenCalledWith({
        status: 'review-required',
        'result.embedded': { $ne: null },
        $or: [
          { applicationAudit: null },
          { 'applicationAudit.appliedAt': null },
        ],
      });
      expect(query.limit).toHaveBeenCalledWith(10);
      expect(result).toMatchObject({ skipped: false, candidates: 2, attempted: 2 });
      expect(applyStoredComputeJob).toHaveBeenCalledTimes(2);
      expect(applyStoredComputeJob).toHaveBeenCalledWith(
        expect.any(Object),
        'job-a',
        expect.objectContaining({ actor: 'system:auto-apply', idempotencyKey: 'auto:apply:job-a' }),
      );
      expect(applyStoredComputeJob).toHaveBeenCalledWith(
        expect.any(Object),
        'job-b',
        expect.objectContaining({ actor: 'system:auto-apply', idempotencyKey: 'auto:apply:job-b' }),
      );
      expect(PivotComputeJob.findOne).toHaveBeenCalledTimes(2);
    });
  });
});
