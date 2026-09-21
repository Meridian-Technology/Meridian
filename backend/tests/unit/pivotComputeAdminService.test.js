const {
  createAdminComputeJob,
  listAdminComputeJobs,
  getAdminComputeJob,
  submitManualComputeResult,
  cancelAdminComputeJob,
  retryAdminComputeJob,
} = require('../../services/pivotComputeAdminService');
const {
  createComputeJob,
  claimNextPendingJob,
  startComputeJob,
  submitComputeJobResult,
} = require('../../services/pivotComputeJobStore');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');

describe('pivotComputeAdminService', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('creates and lists admin compute jobs with redacted lease tokens', async () => {
    const jobRequest = loadFixture('job-request-discovery-valid.json');
    const notifyWake = jest.fn().mockResolvedValue({ status: 'accepted' });
    const created = await createAdminComputeJob(req, {
      request: jobRequest,
      actor: 'admin@example.com',
      notifyWake,
    });
    expect(created.created).toBe(true);
    expect(created.job.status).toBe('pending');
    expect(created.wake).toEqual({ status: 'accepted' });
    expect(notifyWake).toHaveBeenCalledWith({ externalJobId: jobRequest.jobId });

    const listed = await listAdminComputeJobs(req, { cityKey: 'iowacity' });
    expect(listed.jobs).toHaveLength(1);
    expect(listed.jobs[0].externalJobId).toBe(jobRequest.jobId);
  });

  it('keeps a newly created job pending when wake delivery throws', async () => {
    const jobRequest = loadFixture('job-request-discovery-valid.json');
    const created = await createAdminComputeJob(req, {
      request: jobRequest,
      actor: 'admin@example.com',
      notifyWake: jest.fn().mockRejectedValue(new Error('Mini unavailable')),
    });

    expect(created.created).toBe(true);
    expect(created.job.status).toBe('pending');
    expect(created.wake).toEqual({ status: 'failed', code: 'COMPUTE_WAKE_FAILED' });
  });

  it('submits manual results for review and preserves duplicate idempotency', async () => {
    const result = loadFixture('result-discovery-valid-completed.json');
    const first = await submitManualComputeResult(req, {
      result,
      actor: 'admin@example.com',
    });
    expect(first.created).toBe(true);
    expect(first.job.status).toBe('review-required');
    expect(first.job.result.embedded).toBeUndefined();
    expect(first.job.result.hasEmbeddedResult).toBe(true);
    expect(first.job.result.embeddedByteSize).toBeGreaterThan(0);

    const second = await submitManualComputeResult(req, {
      result,
      actor: 'admin@example.com',
    });
    expect(second.duplicate).toBe(true);
    expect(second.created).toBe(false);
  });

  it('returns job detail with masked attempt lease tokens', async () => {
    const jobRequest = loadFixture('job-request-discovery-valid.json');
    await createAdminComputeJob(req, { request: jobRequest, actor: 'admin@example.com' });
    const claim = await claimNextPendingJob(req, {
      kind: jobRequest.kind,
      workerId: 'worker-1',
      capability: {
        contractVersion: '1',
        implementationRevision: 'relay-worker@test',
        supportedContractVersions: ['1'],
        supportedKinds: [jobRequest.kind],
      },
      now: new Date(),
    });
    await startComputeJob(req, {
      externalJobId: jobRequest.jobId,
      leaseToken: claim.job.lease.token,
      workerId: 'worker-1',
      now: new Date(),
    });
    await submitComputeJobResult(req, {
      externalJobId: jobRequest.jobId,
      leaseToken: claim.job.lease.token,
      workerId: 'worker-1',
      result: loadFixture('result-discovery-valid-completed.json'),
      now: new Date(),
    });

    const detail = await getAdminComputeJob(req, jobRequest.jobId);
    expect(detail.job.status).toBe('review-required');
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0].leaseToken).toMatch(/^.{0,4}…/);
    expect(detail.job.lease).toBeNull();
  });

  it('omits apply-manifest rows from list payloads and includes them when includeApplyManifest is true', async () => {
    const jobRequest = loadFixture('job-request-discovery-valid.json');
    await createAdminComputeJob(req, { request: jobRequest, actor: 'admin@example.com' });
    const generatedAt = new Date('2026-09-21T00:00:00.000Z');
    const { PivotComputeJob } = require('../../services/getGlobalModelService')(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne(
      { externalJobId: jobRequest.jobId },
      {
        $set: {
          applicationAudit: {
            outcome: 'completed',
            buckets: [{ entityType: 'event', disposition: 'created', count: 1 }],
            rows: [{ entityType: 'event', disposition: 'created', name: 'Jazz Night' }],
            rowOverflowCount: 0,
            manifestGeneratedAt: generatedAt,
          },
        },
      },
    );

    const listed = await listAdminComputeJobs(req, { cityKey: 'iowacity' });
    expect(listed.jobs[0].applicationAudit.buckets).toHaveLength(1);
    expect(listed.jobs[0].applicationAudit.rows).toBeUndefined();
    expect(listed.jobs[0].applicationAudit.manifestGeneratedAt).toEqual(generatedAt);

    const trimmed = await getAdminComputeJob(req, jobRequest.jobId, { includeApplyManifest: false });
    expect(trimmed.job.applicationAudit.rows).toBeUndefined();

    const detailed = await getAdminComputeJob(req, jobRequest.jobId, { includeApplyManifest: true });
    expect(detailed.job.applicationAudit.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Jazz Night' }),
    ]));
  });

  it('cancels pending jobs and retries retryable failures', async () => {
    const jobRequest = loadFixture('job-request-discovery-valid.json');
    await createAdminComputeJob(req, { request: jobRequest, actor: 'admin@example.com' });

    const cancelled = await cancelAdminComputeJob(req, {
      externalJobId: jobRequest.jobId,
      actor: 'admin@example.com',
    });
    expect(cancelled.job.status).toBe('cancelled');

    const manual = loadFixture('result-discovery-valid-completed.json');
    manual.jobId = 'job:manual-retry-001';
    manual.idempotencyKey = 'idem:manual-retry-001';
    await submitManualComputeResult(req, { result: manual, actor: 'admin@example.com' });

    const { PivotComputeJob } = require('../../services/getGlobalModelService')(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne(
      { externalJobId: manual.jobId },
      { $set: { status: 'retryable' } },
    );

    const notifyWake = jest.fn().mockResolvedValue({ status: 'accepted' });
    const retried = await retryAdminComputeJob(req, {
      externalJobId: manual.jobId,
      contextVersion: 'ctx:iowacity.discovery.v9',
      notifyWake,
    });
    expect(retried.job.status).toBe('pending');
    expect(retried.job.contextVersion).toBe('ctx:iowacity.discovery.v9');
    expect(notifyWake).toHaveBeenCalledWith({ externalJobId: manual.jobId });
  });

  it('stamps carousel export jobs with the stored deck revision', async () => {
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    const deck = await PivotCarouselDeck.create({
      tenantKey: 'iowacity',
      title: 'issue',
      slides: [{ type: 'cover' }, { type: 'back' }],
      updatedAt: new Date('2026-09-11T19:58:00.123Z'),
    });
    const jobRequest = loadFixture('job-request-carousel-valid.json');
    jobRequest.options.deckId = String(deck._id);
    jobRequest.options.deckRevision = '2026-09-11T19:58:00Z';

    const created = await createAdminComputeJob(req, {
      request: jobRequest,
      actor: 'admin@example.com',
      notifyWake: jest.fn().mockResolvedValue({ status: 'accepted' }),
    });

    expect(created.created).toBe(true);
    expect(created.job.options.deckRevision).toBe(new Date(deck.updatedAt).toISOString());
  });
});
