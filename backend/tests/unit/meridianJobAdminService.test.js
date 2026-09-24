const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const { resetMeridianJobHandlers } = require('../../services/meridianJobRegistry');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');
const {
  serializeMeridianJobDelivery,
  serializeMeridianJobRun,
  listMeridianJobRuns,
  getMeridianJobRun,
  enqueueMeridianJobAdmin,
  listEnqueueableMeridianJobHandlers,
} = require('../../services/meridianJobAdminService');

describe('meridianJobAdminService', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensureMeridianJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    resetMeridianJobHandlers();
    registerWeeklyDropHandler();
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('omits pushToken and Expo `to` from serialized deliveries and payload', () => {
    const delivery = serializeMeridianJobDelivery({
      _id: new mongoose.Types.ObjectId(),
      runId: new mongoose.Types.ObjectId(),
      tenantKey: 'nyc',
      userId: '1',
      username: 'ari',
      name: 'Ari',
      product: 'justgo',
      copyKey: 'notifications.weeklyDrop',
      title: 'just go*',
      body: 'What are you doing this week? Just go.',
      deliveryStatus: 'accepted',
      pushToken: 'ExponentPushToken[secret]',
      to: 'ExponentPushToken[secret]',
    });
    expect(delivery).not.toHaveProperty('pushToken');
    expect(delivery).not.toHaveProperty('to');
    expect(delivery.userId).toBe('1');

    const run = serializeMeridianJobRun({
      _id: new mongoose.Types.ObjectId(),
      runKey: 'weekly_drop:nyc:2026-W23',
      category: 'notification',
      type: 'weekly_drop',
      tenantKey: 'nyc',
      status: 'succeeded',
      payload: { batchWeek: '2026-W23', pushToken: 'ExponentPushToken[secret]' },
    });
    expect(run.payload).toEqual({ batchWeek: '2026-W23' });
    expect(run.payload).not.toHaveProperty('pushToken');
  });

  it('filters fleet runs by tenant, type, status, and createdAt range', async () => {
    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    const [nycFailed, sfOk, nycOld] = await MeridianJobRun.create([
      {
        runKey: 'weekly_drop:nyc:2026-W23',
        category: 'notification',
        type: 'weekly_drop',
        tenantKey: 'nyc',
        status: 'failed',
        scheduledFor: new Date('2026-06-04T22:00:00.000Z'),
      },
      {
        runKey: 'weekly_drop:sf:2026-W23',
        category: 'notification',
        type: 'weekly_drop',
        tenantKey: 'sf',
        status: 'succeeded',
        scheduledFor: new Date('2026-06-04T22:00:00.000Z'),
      },
      {
        runKey: 'weekly_drop:nyc:2026-W22',
        category: 'notification',
        type: 'weekly_drop',
        tenantKey: 'nyc',
        status: 'preview',
        scheduledFor: new Date('2026-05-28T22:00:00.000Z'),
      },
    ]);
    await MeridianJobRun.collection.bulkWrite([
      { updateOne: { filter: { _id: nycFailed._id }, update: { $set: { createdAt: new Date('2026-06-04T22:01:00.000Z') } } } },
      { updateOne: { filter: { _id: sfOk._id }, update: { $set: { createdAt: new Date('2026-06-04T22:02:00.000Z') } } } },
      { updateOne: { filter: { _id: nycOld._id }, update: { $set: { createdAt: new Date('2026-05-28T22:01:00.000Z') } } } },
    ]);

    const listed = await listMeridianJobRuns(req, {
      tenantKey: 'NYC',
      type: 'weekly_drop',
      status: 'failed',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T00:00:00.000Z',
    });
    expect(listed.runs).toHaveLength(1);
    expect(listed.runs[0]).toMatchObject({
      tenantKey: 'nyc',
      status: 'failed',
      runKey: 'weekly_drop:nyc:2026-W23',
    });
  });

  it('returns attempts and paginated deliveries for a run', async () => {
    const { MeridianJobRun, MeridianJobAttempt, MeridianJobDelivery } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
      'MeridianJobDelivery',
    );
    const run = await MeridianJobRun.create({
      runKey: 'weekly_drop:nyc:2026-W23:direct:1',
      category: 'notification',
      type: 'weekly_drop',
      tenantKey: 'nyc',
      status: 'succeeded',
      scheduledFor: new Date('2026-06-04T22:00:00.000Z'),
    });
    await MeridianJobAttempt.create({
      runId: run._id,
      attemptNumber: 1,
      status: 'succeeded',
      startedAt: new Date('2026-06-04T22:00:00.000Z'),
      finishedAt: new Date('2026-06-04T22:00:05.000Z'),
    });
    await MeridianJobDelivery.create([
      {
        runId: run._id,
        tenantKey: 'nyc',
        userId: '1',
        username: 'ari',
        product: 'justgo',
        title: 'just go*',
        body: 'body',
        deliveryStatus: 'accepted',
        createdAt: new Date('2026-06-04T22:00:03.000Z'),
      },
      {
        runId: run._id,
        tenantKey: 'nyc',
        userId: '2',
        username: 'ben',
        product: 'campus',
        title: 'just go*',
        body: 'body',
        deliveryStatus: 'failed',
        error: 'DeviceNotRegistered',
        createdAt: new Date('2026-06-04T22:00:04.000Z'),
      },
    ]);

    const detail = await getMeridianJobRun(req, String(run._id), {
      deliveriesLimit: 1,
      deliveryStatus: 'failed',
    });
    expect(detail.attempts).toHaveLength(1);
    expect(detail.deliveries).toHaveLength(1);
    expect(detail.deliveries[0]).toMatchObject({
      userId: '2',
      deliveryStatus: 'failed',
    });
    expect(detail.deliveries[0]).not.toHaveProperty('pushToken');

    await expect(getMeridianJobRun(req, String(run._id), { tenantKey: 'sf' }))
      .rejects.toMatchObject({ status: 404, code: 'MERIDIAN_JOB_RUN_NOT_FOUND' });
  });

  it('enqueues weekly_drop idempotently for admins', async () => {
    const first = await enqueueMeridianJobAdmin(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'sf',
      payload: { batchWeek: '2026-W12', dryRun: true },
      triggeredBy: 'gu-actor',
    });
    const second = await enqueueMeridianJobAdmin(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'SF',
      payload: { batchWeek: '2026-W12', dryRun: true },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.run.runKey).toBe('weekly_drop:sf:2026-W12:dry');
    expect(first.run.payload.triggeredBy).toBe('gu-actor');
    await expect(enqueueMeridianJobAdmin(req, {
      handlerKey: 'not_a_handler',
      tenantKey: 'sf',
    })).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_HANDLER' });
  });

  it('lists registered handlers for the definition editor', () => {
    expect(listEnqueueableMeridianJobHandlers()).toEqual(
      expect.arrayContaining([
        { handlerKey: 'weekly_drop', category: 'notification' },
      ]),
    );
  });
});
