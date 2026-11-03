const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob, findJobByExternalId } = require('../../services/pivotComputeJobStore');
const {
  LOCAL_WORKER_ID,
  scheduleDevelopmentComputeJob,
  runDevelopmentComputeJob,
  createDevelopmentComputeQueue,
  localIdempotencyKey,
} = require('../../services/pivotComputeDevRunner');

function pendingDiscoveryJob(overrides = {}) {
  return {
    externalJobId: 'job:discovery-iowacity-001',
    kind: 'city-source-discovery',
    status: 'pending',
    cityKey: 'iowacity',
    ...overrides,
  };
}

describe('pivotComputeDevRunner', () => {
  it('queues discovery and refresh only in development', () => {
    const enqueue = jest.fn().mockReturnValue(true);
    const discovery = pendingDiscoveryJob();
    const refresh = pendingDiscoveryJob({
      externalJobId: 'job:refresh-iowacity-001',
      kind: 'city-curation-refresh',
    });

    expect(scheduleDevelopmentComputeJob(discovery, {
      env: { NODE_ENV: 'production' },
      enqueue,
    })).toBe(false);
    expect(scheduleDevelopmentComputeJob(pendingDiscoveryJob({ kind: 'carousel-export' }), {
      env: { NODE_ENV: 'development' },
      enqueue,
    })).toBe(false);
    expect(scheduleDevelopmentComputeJob(discovery, {
      env: { NODE_ENV: 'test' },
      enqueue,
    })).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();

    expect(scheduleDevelopmentComputeJob(discovery, {
      env: { NODE_ENV: 'development' },
      enqueue,
    })).toBe(true);
    expect(scheduleDevelopmentComputeJob(refresh, {
      env: { NODE_ENV: 'development' },
      enqueue,
    })).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('runs one queued job at a time and ignores a duplicate enqueue', async () => {
    const order = [];
    let releaseFirst;
    const first = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const queue = createDevelopmentComputeQueue(async (job) => {
      order.push(`start:${job.externalJobId}`);
      if (job.externalJobId === 'a') await first;
      order.push(`end:${job.externalJobId}`);
    });

    expect(queue.enqueue({ externalJobId: 'a' })).toBe(true);
    expect(queue.enqueue({ externalJobId: 'a' })).toBe(false);
    expect(queue.enqueue({ externalJobId: 'b' })).toBe(true);
    await new Promise((resolve) => { setImmediate(resolve); });
    expect(order).toEqual(['start:a']);

    releaseFirst();
    await first;
    await new Promise((resolve) => { setImmediate(resolve); });
    await new Promise((resolve) => { setImmediate(resolve); });
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  describe('in-process execution', () => {
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

    async function createPendingJob() {
      const request = loadFixture('job-request-discovery-valid.json');
      const created = await createComputeJob(req, {
        externalJobId: request.jobId,
        kind: request.kind,
        cityKey: request.cityKey,
        contractVersion: request.contractVersion,
        contextVersion: request.contextVersion,
        implementationRevision: request.implementationRevision,
        createIdempotencyKey: request.idempotencyKey,
        requestedAt: request.requestedAt,
        origin: { type: 'admin', requestedBy: 'admin@example.com' },
        options: request.options,
      });
      return created.job;
    }

    it('submits a completed local scrape for review', async () => {
      const job = await createPendingJob();
      const result = loadFixture('result-discovery-valid-completed.json');
      result.idempotencyKey = localIdempotencyKey(job.externalJobId, null);
      const executeOffloadedCitySourceDiscovery = jest.fn(async () => ({ data: { result } }));

      const outcome = await runDevelopmentComputeJob({
        externalJobId: job.externalJobId,
        tenantKey: job.cityKey,
        kind: job.kind,
      }, {
        connect: async () => req,
        heartbeatMs: 60_000,
        buildContext: async () => ({ contextVersion: result.basedOnContextVersion }),
        executeOffloadedCitySourceDiscovery,
      });

      expect(outcome).toEqual({ ran: true, externalJobId: job.externalJobId });
      expect(executeOffloadedCitySourceDiscovery).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.externalJobId,
        idempotencyKey: result.idempotencyKey,
        expectedContextVersion: result.basedOnContextVersion,
      }));
      const stored = await findJobByExternalId(req, job.externalJobId);
      expect(stored.status).toBe('review-required');
      expect(stored.result.embedded.outcome).toBe('completed');
      expect(stored.lease).toBeNull();
    });

    it('stores a retryable failure when the local scrape throws', async () => {
      const job = await createPendingJob();
      const failure = new Error('scrape blew up');
      failure.code = 'SCRAPE_FAILED';

      const outcome = await runDevelopmentComputeJob({
        externalJobId: job.externalJobId,
        tenantKey: job.cityKey,
        kind: job.kind,
      }, {
        connect: async () => req,
        heartbeatMs: 60_000,
        buildContext: async () => ({ contextVersion: job.contextVersion }),
        executeOffloadedCitySourceDiscovery: async () => {
          throw failure;
        },
      });

      expect(outcome.failed).toBe(true);
      const stored = await findJobByExternalId(req, job.externalJobId);
      expect(stored.status).toBe('retryable');
      expect(stored.failure).toEqual(expect.objectContaining({
        code: 'SCRAPE_FAILED',
        retryable: true,
      }));
      expect(stored.lease?.workerId || null).toBeNull();
      expect(LOCAL_WORKER_ID).toBe('dev-local');
    });
  });
});
