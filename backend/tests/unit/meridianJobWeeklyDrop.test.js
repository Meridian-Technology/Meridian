jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  upsertStoredTenantRow: jest.fn(),
  serializeTenantForAdmin: jest.fn((tenant) => tenant),
}));

jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  rebuildWeeklySnapshot: jest.fn(),
}));

jest.mock('../../services/expoPushDeliveryService', () => {
  const actual = jest.requireActual('../../services/expoPushDeliveryService');
  return {
    ...actual,
    filterTenantUsersForExpoPushDelivery: jest.fn(),
    postExpoPushBatch: jest.fn(),
  };
});

jest.mock('../../services/getModelService', () => jest.fn());

const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { rebuildWeeklySnapshot } = require('../../services/pivotWeeklySnapshotService');
const {
  filterTenantUsersForExpoPushDelivery,
  postExpoPushBatch,
} = require('../../services/expoPushDeliveryService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const pivotDropPushRunSchema = require('../../schemas/pivotDropPushRun');
const {
  sendWeeklyDropPush,
  capPushRunRecipients,
} = require('../../services/pivotWeeklyDropService');
const {
  WEEKLY_DROP_COPY_KEY,
  DEV_GATE_ERROR,
  MAX_RUN_RECIPIENTS,
  mapWeeklyDropDeliveryStatus,
  buildMeridianWeeklyDropDeliveries,
  capDeliveryRows,
  persistWeeklyDropMeridianAudit,
} = require('../../services/meridianJobWeeklyDropAudit');
const { enqueueMeridianJob } = require('../../services/meridianJobEnqueueService');
const { tickMeridianJobWorker, resetMeridianJobWorkerMutex } = require('../../services/meridianJobWorkerLoop');
const { resetMeridianJobHandlers } = require('../../services/meridianJobRegistry');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');

const nycTenant = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  pivotDropTimezone: 'America/New_York',
  pivotDropDayOfWeek: 4,
  pivotDropHour: 18,
  pivotDropMinute: 0,
};

function emptyCrewModels() {
  const emptyFind = {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
  return {
    PivotCrewMembership: emptyFind,
    PivotCrewWeekState: emptyFind,
    PivotEventIntent: {
      distinct: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    PivotDeckSnapshot: emptyFind,
  };
}

function mockUsers(users) {
  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(users),
      }),
    }),
  };
}

describe('meridianJobWeeklyDrop dual-write', () => {
  let mongo;
  let req;
  const connectionsManager = require('../../connectionsManager');

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = {
      db: mongo.connection,
      globalDb: mongo.globalConnection,
      school: 'nyc',
    };
    jest.spyOn(connectionsManager, 'connectToDatabase').mockImplementation(async () => mongo.connection);
    jest.spyOn(connectionsManager, 'connectToGlobalDatabase').mockImplementation(async () => mongo.globalConnection);
    await ensureMeridianJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    resetMeridianJobWorkerMutex();
    resetMeridianJobHandlers();
    registerWeeklyDropHandler();
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
    jest.clearAllMocks();
    connectionsManager.connectToDatabase.mockImplementation(async () => mongo.connection);
    connectionsManager.connectToGlobalDatabase.mockImplementation(async () => mongo.globalConnection);
    getTenantByKey.mockResolvedValue(nycTenant);
    rebuildWeeklySnapshot.mockResolvedValue({ data: { batchWeek: '2026-W23' } });
    filterTenantUsersForExpoPushDelivery.mockImplementation(async (_tenant, users) => ({
      users,
      blockedCount: 0,
      gateActive: false,
    }));
    getModels.mockImplementation((modelReq) => {
      const db = modelReq?.db || mongo.connection;
      const PivotDropPushRun = db.models.PivotDropPushRun
        || db.model('PivotDropPushRun', pivotDropPushRunSchema, 'pivot_drop_push_runs');
      return {
        Event: { countDocuments: jest.fn().mockResolvedValue(3) },
        User: mockUsers([
          {
            _id: '1',
            username: 'ari',
            name: 'Ari',
            pushToken: 'ExponentPushToken[a]',
            pushAppEdition: 'pivot',
            pushAppProduct: 'justgo',
          },
          {
            _id: '2',
            username: 'ben',
            name: 'Ben',
            pushToken: 'ExponentPushToken[b]',
            pushAppEdition: 'pivot',
            pushAppProduct: 'campus',
          },
        ]),
        PivotDropPushRun,
        ...emptyCrewModels(),
      };
    });
  });

  afterAll(async () => {
    connectionsManager.connectToDatabase.mockRestore?.();
    connectionsManager.connectToGlobalDatabase.mockRestore?.();
    await mongo.cleanup();
  });

  it('maps Expo outcomes including blocked_dev_gate', () => {
    expect(mapWeeklyDropDeliveryStatus({ ticket: { status: 'accepted' } })).toBe('accepted');
    expect(mapWeeklyDropDeliveryStatus({ ticket: { status: 'failed', message: 'boom' } })).toBe('failed');
    expect(mapWeeklyDropDeliveryStatus({ dryRun: true })).toBe('skipped');
    expect(mapWeeklyDropDeliveryStatus({ blockedDevGate: true })).toBe('blocked_dev_gate');
  });

  it('caps meridian deliveries at PivotDropPushRun 500 + overflow', () => {
    expect(MAX_RUN_RECIPIENTS).toBe(500);
    const rows = Array.from({ length: 503 }, (_, index) => ({ userId: String(index) }));
    const capped = capDeliveryRows(rows, MAX_RUN_RECIPIENTS);
    expect(capped.deliveries).toHaveLength(500);
    expect(capped.recipientOverflowCount).toBe(3);
    expect(capPushRunRecipients(rows, MAX_RUN_RECIPIENTS).recipientOverflowCount).toBe(3);
  });

  it('dry-run creates a preview run, attempt, and skipped deliveries without Expo', async () => {
    const result = await sendWeeklyDropPush(req, 'nyc', {
      batchWeek: '2026-W23',
      dryRun: true,
      force: true,
    });

    expect(result.dryRun).toBe(true);
    expect(postExpoPushBatch).not.toHaveBeenCalled();
    expect(result.meridianJobRunId).toBeTruthy();

    const { MeridianJobRun, MeridianJobAttempt, MeridianJobDelivery } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
      'MeridianJobDelivery',
    );
    const run = await MeridianJobRun.findById(result.meridianJobRunId).lean();
    expect(run.status).toBe('preview');
    expect(run.type).toBe('weekly_drop');
    expect(run.pivotDropPushRunId).toBeFalsy();
    expect(run.summary.message).toBe('dry-run');
    expect(run.summary.skipped).toBe(2);
    expect(await MeridianJobAttempt.countDocuments({ runId: run._id })).toBe(1);
    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((row) => row.deliveryStatus === 'skipped')).toBe(true);
    expect(deliveries[0].copyKey).toBe(WEEKLY_DROP_COPY_KEY);
    expect(deliveries[0].title).toBeTruthy();
    expect(deliveries[0].body).toBeTruthy();

    const PivotDropPushRun = mongo.connection.models.PivotDropPushRun
      || mongo.connection.model('PivotDropPushRun', pivotDropPushRunSchema, 'pivot_drop_push_runs');
    expect(await PivotDropPushRun.countDocuments()).toBe(0);
  });

  it('send dual-writes PivotDropPushRun, attempt, and per-user deliveries', async () => {
    postExpoPushBatch
      .mockResolvedValueOnce({
        sent: 1,
        failed: 0,
        errors: [],
        tickets: [{ status: 'accepted', message: null }],
      })
      .mockResolvedValueOnce({
        sent: 0,
        failed: 1,
        errors: ['DeviceNotRegistered'],
        tickets: [{ status: 'failed', message: 'DeviceNotRegistered' }],
      });

    const result = await sendWeeklyDropPush(req, 'nyc', {
      batchWeek: '2026-W23',
      force: true,
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.pivotDropPushRunId).toBeTruthy();
    expect(result.meridianJobRunId).toBeTruthy();

    const { MeridianJobRun, MeridianJobAttempt, MeridianJobDelivery } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobAttempt',
      'MeridianJobDelivery',
    );
    const run = await MeridianJobRun.findById(result.meridianJobRunId).lean();
    expect(run.status).toBe('succeeded');
    expect(String(run.pivotDropPushRunId)).toBe(String(result.pivotDropPushRunId));
    expect(run.summary).toMatchObject({
      attempted: 2,
      accepted: 1,
      failed: 1,
      skipped: 0,
      recipientOverflowCount: 0,
    });
    expect(await MeridianJobAttempt.countDocuments({ runId: run._id })).toBe(1);

    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).sort({ userId: 1 }).lean();
    expect(deliveries.map((row) => row.deliveryStatus).sort()).toEqual(['accepted', 'failed']);
    expect(deliveries.find((row) => row.userId === '2')).toMatchObject({
      product: 'campus',
      deliveryStatus: 'failed',
      error: 'DeviceNotRegistered',
    });
    expect(deliveries.every((row) => row.title && row.body && !row.to)).toBe(true);

    const PivotDropPushRun = mongo.connection.models.PivotDropPushRun;
    const pushRun = await PivotDropPushRun.findById(result.pivotDropPushRunId).lean();
    expect(pushRun.recipients).toHaveLength(2);
    expect(pushRun.recipientOverflowCount).toBe(0);
    expect(pushRun.accepted).toBe(1);
    expect(pushRun.failed).toBe(1);
  });

  it('records blocked_dev_gate deliveries for gated recipients', async () => {
    filterTenantUsersForExpoPushDelivery.mockImplementation(async (_tenant, users) => ({
      users: users.filter((user) => user._id === '1'),
      blockedCount: 1,
      gateActive: true,
    }));
    postExpoPushBatch.mockResolvedValue({
      sent: 1,
      failed: 0,
      errors: [],
      tickets: [{ status: 'accepted', message: null }],
    });

    const result = await sendWeeklyDropPush(req, 'nyc', {
      batchWeek: '2026-W23',
      force: true,
    });

    const { MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobDelivery');
    const deliveries = await MeridianJobDelivery.find({ runId: result.meridianJobRunId }).lean();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.find((row) => row.userId === '2')).toMatchObject({
      deliveryStatus: 'blocked_dev_gate',
      error: DEV_GATE_ERROR,
      sentAt: null,
    });
    expect(deliveries.find((row) => row.userId === '1').deliveryStatus).toBe('accepted');
    expect(result.skipped).toBe(1);
  });

  it('persists overflow count when deliveries exceed 500', async () => {
    const users = Array.from({ length: 502 }, (_, index) => ({
      _id: String(index + 1),
      username: `u${index}`,
      name: `User ${index}`,
      pushAppProduct: 'justgo',
    }));
    const audit = await persistWeeklyDropMeridianAudit(req, {
      tenantKey: 'nyc',
      batchWeek: '2026-W23',
      dryRun: true,
      pushCopy: { title: 'just go*', body: 'What are you doing this week? Just go.' },
      allowedRecipients: users,
      blockedRecipients: [],
      messages: users.map(() => ({
        title: 'just go*',
        body: 'What are you doing this week? Just go.',
        data: { audience: 'solo' },
      })),
      ticketOutcomes: [],
    });

    expect(audit.deliveryCount).toBe(500);
    expect(audit.recipientOverflowCount).toBe(2);
    const { MeridianJobDelivery, MeridianJobRun } = getGlobalModels(
      req,
      'MeridianJobDelivery',
      'MeridianJobRun',
    );
    expect(await MeridianJobDelivery.countDocuments({ runId: audit.meridianJobRunId })).toBe(500);
    const run = await MeridianJobRun.findById(audit.meridianJobRunId).lean();
    expect(run.summary.recipientOverflowCount).toBe(2);
    expect(run.summary.attempted).toBe(502);
  });

  it('attaches deliveries to an existing worker-claimed run instead of creating a second run', async () => {
    postExpoPushBatch.mockImplementation(async (messages) => ({
      sent: messages.length,
      failed: 0,
      errors: [],
      tickets: messages.map(() => ({ status: 'accepted', message: null })),
    }));

    const enqueued = await enqueueMeridianJob(req, {
      handlerKey: 'weekly_drop',
      tenantKey: 'nyc',
      payload: { batchWeek: '2026-W23', dryRun: false, force: true },
      scheduledFor: new Date('2026-06-04T22:00:00.000Z'),
    });
    const tick = await tickMeridianJobWorker(req, {
      now: new Date('2026-06-04T22:00:00.000Z'),
    });
    expect(tick.outcome.status).toBe('succeeded');

    const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
      req,
      'MeridianJobRun',
      'MeridianJobDelivery',
    );
    expect(await MeridianJobRun.countDocuments()).toBe(1);
    const run = await MeridianJobRun.findById(enqueued.run._id).lean();
    expect(run.status).toBe('succeeded');
    expect(run.pivotDropPushRunId).toBeTruthy();
    expect(await MeridianJobDelivery.countDocuments({ runId: run._id })).toBe(2);
  });
});
