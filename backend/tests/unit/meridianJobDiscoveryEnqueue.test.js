jest.mock('../../services/expoPushDeliveryService', () => {
  const actual = jest.requireActual('../../services/expoPushDeliveryService');
  return {
    ...actual,
    sendExpoPushToRecipients: jest.fn(),
  };
});

jest.mock('../../services/getModelService', () => jest.fn());

jest.mock('../../services/pivotCopyService', () => ({
  getMergedCopyPackOrEmpty: jest.fn(async () => ({ entries: {}, tokens: {} })),
}));

const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const { upsertStoredTenantRow } = require('../../services/tenantConfigService');
const { resetMeridianJobHandlers } = require('../../services/meridianJobRegistry');
const { enqueueMeridianJob } = require('../../services/meridianJobEnqueueService');
const { resetMeridianJobWorkerMutex } = require('../../services/meridianJobWorkerLoop');
const { sendExpoPushToRecipients } = require('../../services/expoPushDeliveryService');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');
const {
  registerSoloSwipeReminderHandler,
  buildSoloSwipeReminderRunKey,
  isSoloSwipeCandidate,
  executeSoloSwipeReminder,
  SOLO_SWIPE_REMINDER_HANDLER_KEY,
  ensureSoloSwipeReminderDefinition,
  sendSoloSwipeRemindersForTenant,
} = require('../../services/meridianJobHandlers/soloSwipeReminder');
const {
  registerEventDiscoveryEnqueueHandler,
  buildEventDiscoveryRunKey,
  discoveryDayBucket,
  ensureEventDiscoveryDefinition,
  enqueueEventDiscoveryOnCatalogPublish,
  executeEventDiscovery,
  EVENT_DISCOVERY_HANDLER_KEY,
  EVENT_DISCOVERY_DEFINITION_KEY,
} = require('../../services/meridianJobHandlers/eventDiscoveryEnqueue');
const {
  evaluateMeridianNotificationSchedules,
} = require('../../services/meridianNotificationDefinitionService');
const { previewNotificationEligibility } = require('../../services/meridianNotificationEligibilityService');

const USER_A = new mongoose.Types.ObjectId();

async function seedPivotTenant(req, tenantKey, timezone) {
  return upsertStoredTenantRow(req, {
    tenantKey,
    name: tenantKey.toUpperCase(),
    subdomain: tenantKey,
    location: tenantKey,
    status: 'active',
    tenantType: 'pivot',
    pivotPilot: true,
    pivotDropTimezone: timezone,
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  });
}

function mockUsers(users) {
  getModels.mockReturnValue({
    User: {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(users),
        }),
      }),
    },
    PivotCrewMembership: {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    PivotCrewWeekState: {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    PivotEventIntent: {
      distinct: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    PivotDeckSnapshot: {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
  });
}

describe('meridianJobDiscoveryEnqueue', () => {
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
    resetMeridianJobHandlers();
    registerWeeklyDropHandler();
    registerSoloSwipeReminderHandler();
    registerEventDiscoveryEnqueueHandler();
    resetMeridianJobWorkerMutex();
    sendExpoPushToRecipients.mockReset();
    sendExpoPushToRecipients.mockResolvedValue({
      sent: 1,
      failed: 0,
      tickets: [{ status: 'accepted' }],
      errors: [],
    });
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
    connectionsManager.connectToDatabase.mockImplementation(async () => mongo.connection);
    connectionsManager.connectToGlobalDatabase.mockImplementation(async () => mongo.globalConnection);
    mockUsers([{
      _id: USER_A,
      username: 'ari',
      name: 'Ari',
      pushToken: 'ExponentPushToken[test]',
      pushAppProduct: 'justgo',
      pushAppEdition: 'pivot',
    }]);
  });

  afterEach(() => {
    resetMeridianJobWorkerMutex();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('builds idempotent run keys for solo week buckets and per-user discovery days', () => {
    expect(buildSoloSwipeReminderRunKey({
      tenantKey: 'NYC',
      payload: { batchWeek: '2026-W23', timeBucket: '2026-06-05T18:00' },
    })).toBe('solo_swipe_reminder:nyc:2026-W23:2026-06-05T18:00');

    expect(buildEventDiscoveryRunKey({
      tenantKey: 'NYC',
      payload: { userId: String(USER_A), dayBucket: '2026-09-21' },
    })).toBe(`event_discovery:nyc:${String(USER_A)}:2026-09-21`);

    expect(isSoloSwipeCandidate({ hasCrew: true, deckComplete: false })).toBe(false);
    expect(isSoloSwipeCandidate({ hasCrew: false, deckComplete: false })).toBe(true);
    expect(discoveryDayBucket(new Date('2026-09-21T22:00:00.000Z'), 'America/New_York'))
      .toBe('2026-09-21');
  });

  it('seeds event_discovery disabled and skips catalog-publish enqueue until enabled', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    const seeded = await ensureEventDiscoveryDefinition(req);
    expect(seeded.definitionKey).toBe(EVENT_DISCOVERY_DEFINITION_KEY);
    expect(seeded.enabled).toBe(false);

    const now = new Date('2026-09-21T22:00:00.000Z');
    const disabledHook = await enqueueEventDiscoveryOnCatalogPublish(req, {
      tenantKey: 'nyc',
      batchWeek: '2026-W39',
      userIds: [String(USER_A)],
      now,
    });
    expect(disabledHook.skipped).toBe('definition_disabled');
    expect(disabledHook.enqueued).toEqual([]);

    const scheduled = await evaluateMeridianNotificationSchedules(req, { now });
    expect(scheduled.enqueued.filter((row) => row.handlerKey === EVENT_DISCOVERY_HANDLER_KEY))
      .toHaveLength(0);

    const { MeridianNotificationDefinition } = getGlobalModels(req, 'MeridianNotificationDefinition');
    await MeridianNotificationDefinition.updateOne(
      { _id: seeded._id },
      { $set: { enabled: true } },
    );

    const first = await enqueueEventDiscoveryOnCatalogPublish(req, {
      tenantKey: 'nyc',
      batchWeek: '2026-W39',
      userIds: [String(USER_A)],
      now,
    });
    expect(first.skipped).toBeNull();
    expect(first.enqueued).toEqual([
      expect.objectContaining({
        userId: String(USER_A),
        created: true,
        runKey: `event_discovery:nyc:${String(USER_A)}:2026-09-21`,
      }),
    ]);

    const second = await enqueueEventDiscoveryOnCatalogPublish(req, {
      tenantKey: 'nyc',
      batchWeek: '2026-W39',
      userIds: [String(USER_A)],
      now,
    });
    expect(second.enqueued[0].created).toBe(false);
    expect(second.enqueued[0].runKey).toBe(first.enqueued[0].runKey);
  });

  it('sends discovery pushes through Expo and writes deliveries', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    const { MeridianNotificationDefinition } = getGlobalModels(req, 'MeridianNotificationDefinition');
    const seeded = await ensureEventDiscoveryDefinition(req);
    await MeridianNotificationDefinition.updateOne(
      { _id: seeded._id },
      { $set: { enabled: true } },
    );

    const { run } = await enqueueEventDiscoveryOnCatalogPublish(req, {
      tenantKey: 'nyc',
      userIds: [String(USER_A)],
      now: new Date('2026-09-21T22:00:00.000Z'),
    }).then(async (hook) => {
      const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
      return { run: await MeridianJobRun.findById(hook.enqueued[0].runId) };
    });

    const outcome = await executeEventDiscovery({ run, req });
    expect(outcome.terminalStatus).toBe('succeeded');
    expect(sendExpoPushToRecipients).toHaveBeenCalled();

    const { MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobDelivery');
    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      userId: String(USER_A),
      deliveryStatus: 'accepted',
      copyKey: 'notifications.definition.body',
    });
    expect(deliveries[0]).not.toHaveProperty('pushToken');
    expect(deliveries[0].title).toBeTruthy();
    expect(deliveries[0].body).toBeTruthy();
  });

  it('sends solo swipe reminders and writes deliveries', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await upsertStoredTenantRow(req, {
      tenantKey: 'nyc',
      name: 'NYC',
      subdomain: 'nyc',
      location: 'nyc',
      status: 'active',
      tenantType: 'pivot',
      pivotPilot: true,
      pivotDropTimezone: 'America/New_York',
      pivotDropDayOfWeek: 4,
      pivotDropHour: 18,
      pivotDropMinute: 0,
      pivotCrewConfig: { nudges: { unfinishedSwipeReminderHours: 0 } },
    });
    await ensureSoloSwipeReminderDefinition(req);

    const { run } = await enqueueMeridianJob(req, {
      handlerKey: SOLO_SWIPE_REMINDER_HANDLER_KEY,
      tenantKey: 'nyc',
      payload: {
        batchWeek: '2026-W23',
        timeBucket: '2026-06-05T22:00',
        now: '2026-06-05T22:00:00.000Z',
      },
      scheduledFor: new Date('2026-06-05T22:00:00.000Z'),
    });

    const outcome = await executeSoloSwipeReminder({ run, req });
    expect(outcome.terminalStatus).toBe('succeeded');
    expect(sendExpoPushToRecipients).toHaveBeenCalled();

    const { MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobDelivery');
    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      userId: String(USER_A),
      deliveryStatus: 'accepted',
      copyKey: 'notifications.ritual.swipe.body',
    });
    expect(deliveries[0].body).toBeTruthy();
  });

  it('lists solo swipe eligibility before the nudge window without sending', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await ensureSoloSwipeReminderDefinition(req);
    const now = new Date('2026-06-04T23:00:00.000Z');

    const blocked = await sendSoloSwipeRemindersForTenant(req, {
      tenantKey: 'nyc',
      now,
      rules: [{
        outcome: 'send',
        conditions: [
          { attribute: 'hasCrew', operator: 'is', value: false },
          { attribute: 'deckComplete', operator: 'is', value: false },
        ],
      }],
    });
    expect(blocked.data.skipped).toBe('before_nudge_window');

    const preview = await previewNotificationEligibility(req, {
      handlerKey: 'solo_swipe_reminder',
      tenantKey: 'nyc',
    });
    expect(preview.people).toEqual([
      expect.objectContaining({ userId: String(USER_A), username: 'ari', name: 'Ari' }),
    ]);
    expect(preview.count).toBe(1);
    expect(sendExpoPushToRecipients).not.toHaveBeenCalled();

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    expect(await MeridianJobRun.countDocuments()).toBe(0);
  });
});
