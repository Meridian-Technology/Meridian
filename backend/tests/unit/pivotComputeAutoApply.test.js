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
  guardrailSkipCode,
  MAX_AUTO_APPLY_ATTEMPTS,
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

  it('counts only create rows for optional discovery guardrails', () => {
    expect(MAX_AUTO_APPLY_ATTEMPTS).toBe(3);
    expect(guardrailSkipCode({ rows: [{ entityType: 'event', action: 'create' }] }, { maxEventCreates: 0 }))
      .toBe('MAX_EVENT_CREATES_EXCEEDED');
    expect(guardrailSkipCode({ rows: [{ entityType: 'source', action: 'update' }] }, { maxNewSources: 0 }))
      .toBeNull();
  });
});
