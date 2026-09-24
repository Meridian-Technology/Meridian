const mongoose = require('mongoose');
const getGlobalModels = require('../../services/getGlobalModelService');
const meridianJobRunSchema = require('../../schemas/meridianJobRun');
const meridianJobAttemptSchema = require('../../schemas/meridianJobAttempt');
const meridianJobDeliverySchema = require('../../schemas/meridianJobDelivery');
const {
  ensureMeridianJobIndexes,
  dropMeridianJobIndexes,
} = require('../../services/ensureMeridianJobIndexes');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const {
  MERIDIAN_JOB_RUN_INDEX_NAMES,
  MERIDIAN_JOB_RUN_STATUSES,
  MERIDIAN_JOB_RUN_CATEGORIES,
  MAX_PAYLOAD_BYTES,
} = meridianJobRunSchema;
const { MERIDIAN_JOB_ATTEMPT_INDEX_NAMES } = meridianJobAttemptSchema;
const {
  MERIDIAN_JOB_DELIVERY_INDEX_NAMES,
  MERIDIAN_JOB_DELIVERY_STATUSES,
} = meridianJobDeliverySchema;

const MeridianJobRun = mongoose.models.MeridianJobRunSchemaTest
  || mongoose.model('MeridianJobRunSchemaTest', meridianJobRunSchema);
const MeridianJobAttempt = mongoose.models.MeridianJobAttemptSchemaTest
  || mongoose.model('MeridianJobAttemptSchemaTest', meridianJobAttemptSchema);
const MeridianJobDelivery = mongoose.models.MeridianJobDeliverySchemaTest
  || mongoose.model('MeridianJobDeliverySchemaTest', meridianJobDeliverySchema);

function baseRun(overrides = {}) {
  return {
    runKey: 'weekly_drop:sf:2026-W12',
    category: 'notification',
    type: 'weekly_drop',
    tenantKey: 'SF',
    status: 'pending',
    scheduledFor: new Date('2026-03-21T17:00:00.000Z'),
    payload: { batchWeek: '2026-W12', dryRun: false },
    ...overrides,
  };
}

describe('MeridianJobRun schema', () => {
  it('normalizes tenantKey, defaults nextAttemptAt, and retains observability fields', async () => {
    const scheduledFor = new Date('2026-03-21T17:00:00.000Z');
    const run = new MeridianJobRun(baseRun({
      scheduledFor,
      summary: { attempted: 10, accepted: 8, failed: 1, skipped: 1, recipientOverflowCount: 0 },
      failureAlertSentAt: null,
      pivotDropPushRunId: new mongoose.Types.ObjectId(),
    }));

    await expect(run.validate()).resolves.toBeUndefined();
    expect(run.tenantKey).toBe('sf');
    expect(run.nextAttemptAt).toEqual(scheduledFor);
    expect(run.maxAttempts).toBe(3);
    expect(run.attemptCount).toBe(0);
    expect(run.summary.accepted).toBe(8);
    expect(MERIDIAN_JOB_RUN_CATEGORIES).toEqual(['notification', 'compute_surface']);
    expect(MERIDIAN_JOB_RUN_STATUSES).toEqual([
      'pending', 'running', 'retry_wait', 'succeeded', 'failed', 'preview',
    ]);
  });

  it('rejects unknown status/category and oversized payload', async () => {
    const badStatus = new MeridianJobRun(baseRun({ status: 'leased' }));
    await expect(badStatus.validate()).rejects.toThrow(/status/);

    const badCategory = new MeridianJobRun(baseRun({ category: 'relay' }));
    await expect(badCategory.validate()).rejects.toThrow(/category/);

    const oversized = new MeridianJobRun(baseRun({
      payload: { blob: 'x'.repeat(MAX_PAYLOAD_BYTES) },
    }));
    await expect(oversized.validate()).rejects.toThrow(/payload exceeds/);
  });

  it('requires runKey uniqueness index for idempotent enqueue', () => {
    expect(MERIDIAN_JOB_RUN_INDEX_NAMES).toEqual([
      'meridian_job_run_run_key_unique',
      'meridian_job_run_claim_queue',
      'meridian_job_run_tenant_createdAt',
      'meridian_job_run_tenant_status_updatedAt',
      'meridian_job_run_type_createdAt',
    ]);

    const indexes = new Map(
      meridianJobRunSchema.indexes().map(([keys, options]) => [options.name, { keys, options }]),
    );
    expect(indexes.get('meridian_job_run_run_key_unique').options.unique).toBe(true);
    expect(indexes.get('meridian_job_run_claim_queue').keys).toEqual({
      status: 1,
      nextAttemptAt: 1,
    });
  });
});

describe('MeridianJobAttempt schema', () => {
  it('stores per-retry status, error, and timestamps', async () => {
    const attempt = new MeridianJobAttempt({
      runId: new mongoose.Types.ObjectId(),
      attemptNumber: 1,
      status: 'failed',
      error: 'Expo timeout',
      startedAt: new Date('2026-03-21T17:00:00.000Z'),
      finishedAt: new Date('2026-03-21T17:00:02.000Z'),
    });

    await expect(attempt.validate()).resolves.toBeUndefined();
    expect(attempt.error).toBe('Expo timeout');
  });

  it('rejects attempt numbers above the retry cap', async () => {
    const attempt = new MeridianJobAttempt({
      runId: new mongoose.Types.ObjectId(),
      attemptNumber: 4,
      status: 'pending',
    });
    await expect(attempt.validate()).rejects.toThrow(/attemptNumber/);
  });
});

describe('MeridianJobDelivery schema', () => {
  it('persists resolved copy and blocked_dev_gate delivery status', async () => {
    const delivery = new MeridianJobDelivery({
      runId: new mongoose.Types.ObjectId(),
      tenantKey: 'SF',
      userId: 'user-1',
      username: 'ada',
      name: 'Ada Lovelace',
      product: 'justgo',
      copyKey: 'notifications.weeklyDrop',
      title: 'Your week in SF',
      body: '12 things worth leaving the house for.',
      deliveryStatus: 'blocked_dev_gate',
      sentAt: null,
    });

    await expect(delivery.validate()).resolves.toBeUndefined();
    expect(delivery.tenantKey).toBe('sf');
    expect(MERIDIAN_JOB_DELIVERY_STATUSES).toContain('blocked_dev_gate');
  });

  it('rejects unknown product or deliveryStatus', async () => {
    const badProduct = new MeridianJobDelivery({
      runId: new mongoose.Types.ObjectId(),
      tenantKey: 'sf',
      userId: 'user-1',
      product: 'sms',
      deliveryStatus: 'accepted',
    });
    await expect(badProduct.validate()).rejects.toThrow(/product/);

    const badStatus = new MeridianJobDelivery({
      runId: new mongoose.Types.ObjectId(),
      tenantKey: 'sf',
      userId: 'user-1',
      product: 'campus',
      deliveryStatus: 'sent',
    });
    await expect(badStatus.validate()).rejects.toThrow(/deliveryStatus/);
  });
});

describe('Meridian job global registration and indexes', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensureMeridianJobIndexes(req, { force: true });
  });

  afterEach(async () => {
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('registers run, attempt, and delivery models on the global connection', () => {
    const models = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
      'MeridianJobDelivery',
    );
    expect(models.MeridianJobRun.collection.name).toBe('meridian_job_runs');
    expect(models.MeridianJobAttempt.collection.name).toBe('meridian_job_attempts');
    expect(models.MeridianJobDelivery.collection.name).toBe('meridian_job_deliveries');
  });

  it('enforces unique runKey and unique attempt number per run', async () => {
    const { MeridianJobRun: Run, MeridianJobAttempt: Attempt } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
    );

    await Run.create(baseRun());
    await expect(Run.create(baseRun({ payload: { batchWeek: 'dup' } }))).rejects.toThrow(
      /duplicate key|E11000/i,
    );

    const run = await Run.findOne({ runKey: baseRun().runKey });
    await Attempt.create({ runId: run._id, attemptNumber: 1, status: 'running' });
    await expect(
      Attempt.create({ runId: run._id, attemptNumber: 1, status: 'failed' }),
    ).rejects.toThrow(/duplicate key|E11000/i);
  });

  it('quarantines duplicate runKeys so the unique index can build', async () => {
    await dropMeridianJobIndexes(req);
    const { MeridianJobRun: Run } = getGlobalModels(req, 'MeridianJobRun');
    const runKey = 'solo_swipe_reminder:ic:none:2026-09-22T14:30';
    const kept = await Run.create(baseRun({
      runKey,
      type: 'solo_swipe_reminder',
      tenantKey: 'ic',
      status: 'succeeded',
    }));
    await Run.collection.insertOne({
      runKey,
      category: 'notification',
      type: 'solo_swipe_reminder',
      tenantKey: 'ic',
      status: 'pending',
      scheduledFor: new Date('2026-09-22T21:30:00.000Z'),
      nextAttemptAt: new Date('2026-09-22T21:30:00.000Z'),
      attemptCount: 0,
      payload: {},
      summary: null,
      createdAt: new Date(kept.createdAt.getTime() + 1000),
      updatedAt: new Date(),
    });

    const result = await ensureMeridianJobIndexes(req, { force: true });
    expect(result.quarantinedRunKeys).toBe(1);

    const rows = await Run.find({ type: 'solo_swipe_reminder' }).sort({ createdAt: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(rows[0].runKey).toBe(runKey);
    expect(rows[0].status).toBe('succeeded');
    expect(rows[1].runKey).toMatch(new RegExp(`^${runKey}:dup:`));
    expect(rows[1].status).toBe('preview');
    expect(rows[1].summary.message).toBe('quarantined duplicate runKey');

    const names = (await Run.collection.indexes()).map((row) => row.name);
    expect(names).toContain('meridian_job_run_run_key_unique');
  });

  it('supports reversible index migration via drop helper', async () => {
    await dropMeridianJobIndexes(req);
    const { MeridianJobRun: Run, MeridianJobDelivery: Delivery } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobDelivery',
    );
    const runNames = (await Run.collection.indexes()).map((row) => row.name);
    const deliveryNames = (await Delivery.collection.indexes()).map((row) => row.name);
    expect(runNames).not.toContain('meridian_job_run_run_key_unique');
    expect(deliveryNames).not.toContain('meridian_job_delivery_run_createdAt');

    await ensureMeridianJobIndexes(req, { force: true });
    const restoredRun = (await Run.collection.indexes()).map((row) => row.name);
    const restoredDelivery = (await Delivery.collection.indexes()).map((row) => row.name);
    expect(restoredRun).toContain('meridian_job_run_run_key_unique');
    expect(restoredDelivery).toEqual(expect.arrayContaining([...MERIDIAN_JOB_DELIVERY_INDEX_NAMES]));
    expect(MERIDIAN_JOB_ATTEMPT_INDEX_NAMES).toEqual([
      'meridian_job_attempt_run_attempt_unique',
      'meridian_job_attempt_run_createdAt',
    ]);
  });
});
