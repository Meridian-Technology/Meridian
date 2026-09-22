const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob } = require('../../services/pivotComputeJobStore');
const {
  COMPUTE_RUN_ID_PREFIX,
  computeRunId,
  parseComputeRunId,
  mapComputeStatusToMeridian,
  adaptComputeJobToRun,
  adaptComputeAttemptToMeridian,
  listAdaptedComputeJobRuns,
  getAdaptedComputeJobRun,
} = require('../../services/meridianComputeJobRunAdapter');

function buildCreateInput(overrides = {}) {
  return {
    externalJobId: 'job:discovery-iowacity-adapter-001',
    kind: 'city-source-discovery',
    cityKey: 'iowacity',
    contractVersion: '1',
    contextVersion: 'ctx:iowacity.discovery.v1',
    implementationRevision: 'meridian-backend@test',
    createIdempotencyKey: 'idem:adapter-discovery-iowacity-001',
    requestedAt: '2026-09-21T20:00:00.000Z',
    origin: {
      type: 'admin',
      requestedBy: 'admin@example.com',
    },
    options: { tags: ['live-music'] },
    ...overrides,
  };
}

describe('meridianComputeJobRunAdapter', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('maps compute statuses onto the meridian run vocabulary', () => {
    expect(mapComputeStatusToMeridian('completed')).toBe('succeeded');
    expect(mapComputeStatusToMeridian('retryable')).toBe('retry_wait');
    expect(mapComputeStatusToMeridian('review-required')).toBe('preview');
    expect(mapComputeStatusToMeridian('leased')).toBe('running');
    expect(mapComputeStatusToMeridian('cancelled')).toBe('failed');
  });

  it('adapts a job into run list shape without Relay schedule metadata or lease tokens', () => {
    const run = adaptComputeJobToRun({
      id: '507f191e810c19729de860ea',
      externalJobId: 'job:refresh-nyc-1',
      tenantKey: 'nyc',
      cityKey: 'nyc',
      kind: 'city-curation-refresh',
      status: 'failed',
      attemptCount: 2,
      contextVersion: 'ctx:v1',
      origin: {
        type: 'schedule',
        scheduleId: 'relay-sched',
        scheduleOccurrenceId: 'occ-1',
        requestedBy: 'relay',
      },
      scheduleOccurrenceId: 'occ-1',
      lease: { token: 'lease-secret', workerId: 'w1' },
      failure: { code: 'EXECUTION_FAILED', message: 'worker boom' },
      requestedAt: '2026-09-21T20:00:00.000Z',
      createdAt: '2026-09-21T20:00:00.000Z',
    });

    expect(run).toMatchObject({
      id: 'compute:job:refresh-nyc-1',
      runKey: 'job:refresh-nyc-1',
      category: 'compute_surface',
      type: 'city-curation-refresh',
      tenantKey: 'nyc',
      status: 'failed',
      computeStatus: 'failed',
      source: 'compute',
      readOnly: true,
      lastError: 'EXECUTION_FAILED: worker boom',
    });
    expect(run.inspectorHref).toBe(
      '/platform-admin/pivot/nyc?page=10&computeJobId=job%3Arefresh-nyc-1',
    );
    expect(run.payload).toEqual({
      kind: 'city-curation-refresh',
      originType: 'schedule',
      requestedBy: 'relay',
      contextVersion: 'ctx:v1',
      readOnly: true,
    });
    expect(JSON.stringify(run)).not.toMatch(/scheduleId|scheduleOccurrenceId|lease-secret|relay-sched/);
  });

  it('maps the latest compute attempt into meridian attempt shape without tokens', () => {
    const attempt = adaptComputeAttemptToMeridian({
      id: 'att-1',
      externalJobId: 'job:refresh-nyc-1',
      attemptNumber: 2,
      status: 'failed',
      leaseToken: 'secret-lease',
      failure: { code: 'TIMEOUT', message: 'heartbeat lost' },
      startedAt: '2026-09-21T20:01:00.000Z',
      finishedAt: '2026-09-21T20:02:00.000Z',
    });
    expect(attempt).toMatchObject({
      runId: 'compute:job:refresh-nyc-1',
      attemptNumber: 2,
      status: 'failed',
      computeStatus: 'failed',
      error: 'TIMEOUT: heartbeat lost',
    });
    expect(attempt).not.toHaveProperty('leaseToken');
  });

  it('lists adapted runs and details with empty deliveries', async () => {
    const created = await createComputeJob(req, buildCreateInput());
    const { PivotComputeJob, PivotComputeJobAttempt } = getGlobalModels(
      req,
      'PivotComputeJob',
      'PivotComputeJobAttempt',
    );
    await PivotComputeJob.updateOne(
      { externalJobId: created.job.externalJobId },
      {
        $set: {
          status: 'failed',
          failure: { code: 'EXECUTION_FAILED', message: 'boom' },
          attemptCount: 1,
          completedAt: new Date('2026-09-21T20:05:00.000Z'),
        },
      },
    );
    await PivotComputeJobAttempt.create({
      computeJobId: created.job.id,
      externalJobId: created.job.externalJobId,
      attemptNumber: 1,
      status: 'failed',
      workerId: 'worker-1',
      leaseToken: 'lease-token-secret',
      leasedAt: new Date('2026-09-21T20:01:00.000Z'),
      startedAt: new Date('2026-09-21T20:01:00.000Z'),
      finishedAt: new Date('2026-09-21T20:05:00.000Z'),
      leaseExpiresAt: new Date('2026-09-21T20:10:00.000Z'),
      failure: { code: 'EXECUTION_FAILED', message: 'boom' },
    });

    const listed = await listAdaptedComputeJobRuns(req, { tenantKey: 'iowacity' });
    expect(listed.runs).toHaveLength(1);
    expect(listed.runs[0]).toMatchObject({
      id: computeRunId(created.job.externalJobId),
      type: 'city-source-discovery',
      status: 'failed',
      tenantKey: 'iowacity',
      source: 'compute',
      lastError: 'EXECUTION_FAILED: boom',
    });
    expect(listed.runs[0].payload).not.toHaveProperty('scheduleId');
    expect(listed.runs[0].payload).not.toHaveProperty('scheduleOccurrenceId');

    const detail = await getAdaptedComputeJobRun(req, `${COMPUTE_RUN_ID_PREFIX}${created.job.externalJobId}`);
    expect(detail.source).toBe('compute');
    expect(detail.deliveries).toEqual([]);
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0].status).toBe('failed');
    expect(JSON.stringify(detail)).not.toMatch(/lease-token-secret/);

    await expect(getAdaptedComputeJobRun(req, created.job.externalJobId, { tenantKey: 'nyc' }))
      .rejects.toMatchObject({ status: 404, code: 'COMPUTE_JOB_NOT_FOUND' });
    expect(parseComputeRunId(detail.run.id)).toBe(created.job.externalJobId);
  });

  it('maps meridian failed filter onto compute failed/cancelled/expired', async () => {
    await createComputeJob(req, buildCreateInput({
      externalJobId: 'job:ok',
      createIdempotencyKey: 'idem:ok',
    }));
    const failed = await createComputeJob(req, buildCreateInput({
      externalJobId: 'job:fail',
      createIdempotencyKey: 'idem:fail',
    }));
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne(
      { externalJobId: failed.job.externalJobId },
      { $set: { status: 'failed' } },
    );
    const stored = await PivotComputeJob.find({}).select('externalJobId status').lean();
    expect(stored.map((row) => `${row.externalJobId}:${row.status}`).sort()).toEqual([
      'job:fail:failed',
      'job:ok:pending',
    ]);

    const listed = await listAdaptedComputeJobRuns(req, { status: 'failed' });
    expect(listed.runs.map((row) => row.externalJobId)).toEqual(['job:fail']);
    expect(listed.runs[0].status).toBe('failed');
  });
});
