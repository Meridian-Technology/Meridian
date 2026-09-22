jest.mock('../../connectionsManager', () => ({
  connectToGlobalDatabase: jest.fn(),
  connectToDatabase: jest.fn(),
}));

jest.mock('../../services/pivotWeeklyDropService', () => ({
  sendWeeklyDropPush: jest.fn(),
}));

const { sendWeeklyDropPush } = require('../../services/pivotWeeklyDropService');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const {
  registerMeridianJobHandler,
  resetMeridianJobHandlers,
  MeridianJobHandlerError,
} = require('../../services/meridianJobRegistry');
const { enqueueMeridianJob } = require('../../services/meridianJobEnqueueService');
const {
  MERIDIAN_JOB_BACKOFF_MS,
  backoffMsAfterFailedAttempt,
  claimDueMeridianJob,
  tickMeridianJobWorker,
  resetMeridianJobWorkerMutex,
  startMeridianJobWorkerLoop,
  stopMeridianJobWorkerLoop,
  shouldStartMeridianJobWorkerLoop,
  getMeridianJobPollMs,
  getMeridianOpsTenantKey,
} = require('../../services/meridianJobWorkerLoop');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');

describe('meridianJobWorker', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensureMeridianJobIndexes(req, { force: true });
  });

  afterEach(async () => {
    stopMeridianJobWorkerLoop();
    resetMeridianJobWorkerMutex();
    resetMeridianJobHandlers();
    registerWeeklyDropHandler();
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('uses 2m / 15m / 1h backoff across three attempts', () => {
    expect(MERIDIAN_JOB_BACKOFF_MS).toEqual([
      2 * 60 * 1000,
      15 * 60 * 1000,
      60 * 60 * 1000,
    ]);
    expect(backoffMsAfterFailedAttempt(1)).toBe(2 * 60 * 1000);
    expect(backoffMsAfterFailedAttempt(2)).toBe(15 * 60 * 1000);
    expect(backoffMsAfterFailedAttempt(3)).toBe(60 * 60 * 1000);
  });

  it('enqueues idempotently on runKey and does not create a second run', async () => {
    const first = await enqueueMeridianJob(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'sf',
      payload: { batchWeek: '2026-W12', dryRun: true },
      scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    });
    const second = await enqueueMeridianJob(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'sf',
      payload: { batchWeek: '2026-W12', dryRun: true },
      scheduledFor: new Date('2026-03-21T18:00:00.000Z'),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(String(second.run._id)).toBe(String(first.run._id));
    expect(first.run.runKey).toBe('weekly_drop:sf:2026-W12:dry');

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    expect(await MeridianJobRun.countDocuments()).toBe(1);
  });

  it('claims at most one due run atomically', async () => {
    registerMeridianJobHandler('probe', {
      category: 'notification',
      buildRunKey: ({ tenantKey, payload }) => `probe:${tenantKey}:${payload.n}`,
      execute: async () => ({ terminalStatus: 'succeeded', summary: { attempted: 0 } }),
    });

    await enqueueMeridianJob(req, {
      handlerKey: 'probe',
      tenantKey: 'sf',
      payload: { n: 1 },
      scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    });

    const now = new Date('2026-03-21T17:00:01.000Z');
    const [a, b] = await Promise.all([
      claimDueMeridianJob(req, { now }),
      claimDueMeridianJob(req, { now }),
    ]);
    const claimed = [a, b].filter((row) => row.run);
    const empty = [a, b].filter((row) => !row.run);
    expect(claimed).toHaveLength(1);
    expect(empty).toHaveLength(1);
    expect(claimed[0].run.status).toBe('running');
    expect(claimed[0].attempt.attemptNumber).toBe(1);
  });

  it('retries with 2m backoff then fails terminally after 3 attempts', async () => {
    registerMeridianJobHandler('flaky', {
      category: 'notification',
      buildRunKey: ({ tenantKey }) => `flaky:${tenantKey}`,
      execute: async () => {
        throw new Error('expo timeout');
      },
    });

    await enqueueMeridianJob(req, {
      handlerKey: 'flaky',
      tenantKey: 'sf',
      payload: {},
      scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    });

    const t1 = new Date('2026-03-21T17:00:00.000Z');
    const first = await tickMeridianJobWorker(req, { now: t1 });
    expect(first.outcome.status).toBe('retry_wait');
    expect(first.outcome.nextAttemptAt.toISOString()).toBe(
      new Date(t1.getTime() + 2 * 60 * 1000).toISOString(),
    );

    const tooSoon = await tickMeridianJobWorker(req, {
      now: new Date(t1.getTime() + 60 * 1000),
    });
    expect(tooSoon.claimed).toBe(false);

    const t2 = new Date(t1.getTime() + 2 * 60 * 1000);
    const second = await tickMeridianJobWorker(req, { now: t2 });
    expect(second.outcome.status).toBe('retry_wait');
    expect(second.outcome.nextAttemptAt.toISOString()).toBe(
      new Date(t2.getTime() + 15 * 60 * 1000).toISOString(),
    );

    const t3 = new Date(t2.getTime() + 15 * 60 * 1000);
    const third = await tickMeridianJobWorker(req, { now: t3 });
    expect(third.outcome.status).toBe('failed');

    const { MeridianJobRun, MeridianJobAttempt } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
    );
    const run = await MeridianJobRun.findOne({ type: 'flaky' }).lean();
    expect(run.status).toBe('failed');
    expect(run.attemptCount).toBe(3);
    expect(run.failureAlertSentAt).toBeTruthy();
    expect(await MeridianJobAttempt.countDocuments({ runId: run._id })).toBe(3);
  });

  it('does not retry non-retryable handler errors', async () => {
    registerMeridianJobHandler('policy', {
      category: 'notification',
      buildRunKey: ({ tenantKey }) => `policy:${tenantKey}`,
      execute: async () => {
        throw new MeridianJobHandlerError('Outside drop window. Pass force=true to send anyway.', {
          retryable: false,
          statusCode: 409,
          code: 'OUTSIDE_DROP_WINDOW',
        });
      },
    });

    await enqueueMeridianJob(req, {
      handlerKey: 'policy',
      tenantKey: 'sf',
      scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    });

    const result = await tickMeridianJobWorker(req, {
      now: new Date('2026-03-21T17:00:00.000Z'),
    });
    expect(result.outcome.status).toBe('failed');
    expect(result.outcome.retryable).toBe(false);
  });

  it('skips a second tick while a run is in flight (process mutex)', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    registerMeridianJobHandler('slow', {
      category: 'notification',
      buildRunKey: ({ tenantKey }) => `slow:${tenantKey}`,
      execute: async () => {
        await gate;
        return { terminalStatus: 'succeeded', summary: { attempted: 0 } };
      },
    });

    await enqueueMeridianJob(req, {
      handlerKey: 'slow',
      tenantKey: 'sf',
      scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    });

    const now = new Date('2026-03-21T17:00:00.000Z');
    const first = tickMeridianJobWorker(req, { now });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await tickMeridianJobWorker(req, { now });
    expect(second).toEqual({ skipped: true, reason: 'mutex' });
    release();
    const firstResult = await first;
    expect(firstResult.claimed).toBe(true);
    expect(firstResult.outcome.status).toBe('succeeded');
  });

  it('dry-runs weekly_drop without calling Expo and marks the run preview', async () => {
    sendWeeklyDropPush.mockResolvedValue({
      dryRun: true,
      pivotPushRecipientCount: 2,
      sampleMessage: { title: 'just go*' },
    });

    const enqueued = await enqueueMeridianJob(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'nyc',
      payload: { batchWeek: '2026-W23', dryRun: true, force: true },
      scheduledFor: new Date('2026-06-04T22:00:00.000Z'),
    });
    expect(enqueued.created).toBe(true);

    const tick = await tickMeridianJobWorker(req, {
      now: new Date('2026-06-04T22:00:00.000Z'),
    });
    expect(tick.outcome.status).toBe('preview');
    expect(sendWeeklyDropPush).toHaveBeenCalledWith(
      expect.anything(),
      'nyc',
      expect.objectContaining({
        batchWeek: '2026-W23',
        dryRun: true,
        force: true,
      }),
    );

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    const run = await MeridianJobRun.findById(enqueued.run._id).lean();
    expect(run.status).toBe('preview');
    expect(run.summary.message).toBe('dry-run');
    expect(run.summary.attempted).toBe(2);
  });
});

describe('meridianJobWorker boot guards', () => {
  afterEach(() => {
    stopMeridianJobWorkerLoop();
  });

  it('does not start the poll loop in Jest (NODE_ENV=test)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(shouldStartMeridianJobWorkerLoop()).toBe(false);
    expect(startMeridianJobWorkerLoop()).toBeNull();
  });

  it('honors DISABLE_MERIDIAN_JOB_WORKER outside test', () => {
    expect(shouldStartMeridianJobWorkerLoop({
      env: { NODE_ENV: 'production', DISABLE_MERIDIAN_JOB_WORKER: 'true' },
    })).toBe(false);
    expect(shouldStartMeridianJobWorkerLoop({
      env: { NODE_ENV: 'production' },
    })).toBe(true);
  });

  it('starts when tests opt in with force=true', () => {
    const timer = startMeridianJobWorkerLoop({ force: true, pollMs: 60000 });
    expect(timer).toBeTruthy();
  });

  it('defaults poll interval to 30000ms and ops tenant to sf', () => {
    expect(getMeridianJobPollMs({})).toBe(30000);
    expect(getMeridianOpsTenantKey({})).toBe('sf');
    expect(getMeridianOpsTenantKey({ MERIDIAN_OPS_TENANT_KEY: 'NYC' })).toBe('nyc');
  });
});
