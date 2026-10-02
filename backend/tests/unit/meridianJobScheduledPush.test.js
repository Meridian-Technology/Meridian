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

jest.mock('../../services/pivotComputeAdminNotifyService', () => ({
  resolveAdminEmails: jest.fn(async () => ['a@meridian.study', 'b@meridian.study']),
}));

const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const { upsertStoredTenantRow } = require('../../services/tenantConfigService');
const { resetMeridianJobHandlers } = require('../../services/meridianJobRegistry');
const { enqueueMeridianJob } = require('../../services/meridianJobEnqueueService');
const { sendExpoPushToRecipients } = require('../../services/expoPushDeliveryService');
const {
  buildScheduledPushRunKey,
  executeScheduledPush,
  registerScheduledPushHandler,
} = require('../../services/meridianJobHandlers/scheduledPush');
const {
  createMeridianNotificationDefinition,
  evaluateMeridianNotificationSchedules,
} = require('../../services/meridianNotificationDefinitionService');
const { previewNotificationEligibility } = require('../../services/meridianNotificationEligibilityService');
const { sendMeridianNotificationNow } = require('../../services/meridianNotificationSendNowService');
const { resolveAdminEmails } = require('../../services/pivotComputeAdminNotifyService');
const {
  previewOneTimeSend,
  sendOneTime,
  listOneTimeSends,
  cancelOneTimeSend,
} = require('../../services/meridianOneTimeSendService');

const USER_A = new mongoose.Types.ObjectId();
// Friday 2026-06-05 16:00 UTC = 12:00 New York.
const NOW = new Date('2026-06-05T16:00:00.000Z');

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

function emptyQuery(result = []) {
  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(result) }),
    }),
  };
}

function mockUsers(users) {
  getModels.mockReturnValue({
    User: emptyQuery(users),
    PivotCrewMembership: emptyQuery(),
    PivotCrewWeekState: emptyQuery(),
    PivotEventIntent: { ...emptyQuery(), distinct: jest.fn().mockResolvedValue([]) },
    PivotDeckSnapshot: emptyQuery(),
  });
}

describe('scheduled_push', () => {
  let mongo;
  let req;
  const connectionsManager = require('../../connectionsManager');

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { db: mongo.connection, globalDb: mongo.globalConnection, school: 'nyc' };
    jest.spyOn(connectionsManager, 'connectToDatabase').mockImplementation(async () => mongo.connection);
    jest.spyOn(connectionsManager, 'connectToGlobalDatabase').mockImplementation(async () => mongo.globalConnection);
    await ensureMeridianJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    resetMeridianJobHandlers();
    registerScheduledPushHandler();
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
    await seedPivotTenant(req, 'nyc', 'America/New_York');
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('keys runs by city, schedule, and slot', () => {
    expect(buildScheduledPushRunKey({
      tenantKey: 'NYC',
      payload: { definitionKey: 'friday_lunch', timeBucket: '2026-06-05T12:00' },
    })).toBe('scheduled_push:nyc:friday_lunch:2026-06-05T12:00');
    expect(buildScheduledPushRunKey({
      tenantKey: 'nyc',
      payload: { definitionKey: 'friday_lunch', timeBucket: '2026-06-05T12:00', dryRun: true },
    })).toBe('scheduled_push:nyc:friday_lunch:2026-06-05T12:00:dry');
  });

  it('needs a message body', async () => {
    await expect(createMeridianNotificationDefinition(req, {
      definitionKey: 'no_message',
      handlerKey: 'scheduled_push',
      scheduleCron: '0 12 * * 5',
    })).rejects.toMatchObject({ code: 'SCHEDULED_PUSH_BODY_REQUIRED' });
  });

  it('runs each schedule separately with its own message', async () => {
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'friday_lunch',
      handlerKey: 'scheduled_push',
      enabled: true,
      scheduleCron: '0 12 * * 5',
      copyBodyFallback: 'Plans for tonight?',
      rules: [],
    });
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'friday_tickets',
      handlerKey: 'scheduled_push',
      enabled: true,
      scheduleCron: '0 12 * * 5',
      copyTitleFallback: 'last call',
      copyBodyFallback: 'Tickets are going fast.',
      rules: [],
    });

    const { enqueued } = await evaluateMeridianNotificationSchedules(req, { now: NOW });
    expect(enqueued.map((row) => row.runKey).sort()).toEqual([
      'scheduled_push:nyc:friday_lunch:2026-06-05T12:00',
      'scheduled_push:nyc:friday_tickets:2026-06-05T12:00',
    ]);
    expect(enqueued.every((row) => row.created)).toBe(true);

    const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobRun', 'MeridianJobDelivery');
    const run = await MeridianJobRun.findOne({ 'payload.definitionKey': 'friday_tickets' });
    expect(run.payload.batchWeek).toMatch(/^\d{4}-W\d{2}$/);

    const outcome = await executeScheduledPush({ run, req });
    expect(outcome.terminalStatus).toBe('succeeded');
    expect(sendExpoPushToRecipients).toHaveBeenCalledTimes(1);
    const [, , messages] = sendExpoPushToRecipients.mock.calls[0];
    expect(messages[0]).toMatchObject({ title: 'last call', body: 'Tickets are going fast.' });

    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(deliveries).toEqual([expect.objectContaining({
      userId: String(USER_A),
      deliveryStatus: 'accepted',
      title: 'last call',
      body: 'Tickets are going fast.',
    })]);
  });

  it('honours "already notified this week" per schedule', async () => {
    const rules = [{
      outcome: 'send',
      conditions: [{ attribute: 'alreadyNotifiedThisBatchWeek', operator: 'is', value: false }],
    }];
    const queue = (timeBucket) => enqueueMeridianJob(req, {
      handlerKey: 'scheduled_push',
      tenantKey: 'nyc',
      scheduledFor: NOW,
      payload: {
        definitionKey: 'once_a_week',
        batchWeek: '2026-W23',
        timeBucket,
        now: NOW.toISOString(),
        copyBodyFallback: 'Just once.',
        rules,
      },
    });

    const first = await queue('2026-06-05T12:00');
    await executeScheduledPush({ run: first.run, req });
    const second = await queue('2026-06-05T12:30');
    const outcome = await executeScheduledPush({ run: second.run, req });

    expect(sendExpoPushToRecipients).toHaveBeenCalledTimes(1);
    expect(outcome.summary.attempted).toBe(0);
  });

  it('reads the message from the schedule for a run queued by hand, and previews by schedule', async () => {
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'crew_only',
      handlerKey: 'scheduled_push',
      scheduleCron: '0 12 * * 5',
      copyBodyFallback: 'Your crew is waiting.',
      rules: [{ outcome: 'send', conditions: [{ attribute: 'hasCrew', operator: 'is', value: true }] }],
    });
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'everyone',
      handlerKey: 'scheduled_push',
      scheduleCron: '0 12 * * 5',
      copyBodyFallback: 'Hello everyone.',
      rules: [],
    });

    const crew = await previewNotificationEligibility(req, {
      handlerKey: 'scheduled_push',
      tenantKey: 'nyc',
      definitionKey: 'crew_only',
    });
    expect(crew.count).toBe(0);
    const everyone = await previewNotificationEligibility(req, {
      handlerKey: 'scheduled_push',
      tenantKey: 'nyc',
      definitionKey: 'everyone',
    });
    expect(everyone.people).toEqual([expect.objectContaining({ userId: String(USER_A) })]);

    const { run } = await enqueueMeridianJob(req, {
      handlerKey: 'scheduled_push',
      tenantKey: 'nyc',
      scheduledFor: NOW,
      payload: { definitionKey: 'everyone', dryRun: true },
    });
    const outcome = await executeScheduledPush({ run, req });
    expect(outcome.terminalStatus).toBe('preview');
    expect(sendExpoPushToRecipients).not.toHaveBeenCalled();
    const { MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobDelivery');
    const [delivery] = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(delivery).toMatchObject({ body: 'Hello everyone.', title: 'just go*', deliveryStatus: 'skipped' });
  });

  describe('send now', () => {
    async function createEveryone(extra = {}) {
      return createMeridianNotificationDefinition(req, {
        definitionKey: 'everyone',
        handlerKey: 'scheduled_push',
        scheduleCron: '0 12 * * 5',
        copyBodyFallback: 'Hello everyone.',
        rules: [],
        ...extra,
      });
    }

    it('sends only what the sender reviewed, even from a paused schedule', async () => {
      const definition = await createEveryone();
      const preview = await previewNotificationEligibility(req, {
        handlerKey: 'scheduled_push',
        tenantKey: 'nyc',
        definitionKey: 'everyone',
      });
      expect(preview.fingerprint).toMatch(/^[a-f0-9]{16}$/);
      expect(preview.quietHours).toEqual(expect.objectContaining({ timezone: 'America/New_York' }));

      const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
      const stale = await sendMeridianNotificationNow(req, definition.id, {
        cities: [{ tenantKey: 'nyc', fingerprint: 'stale' }],
        now: NOW,
      }).catch((error) => error);
      expect(stale).toMatchObject({ code: 'RECIPIENTS_CHANGED', status: 409 });
      expect(stale.details.cities[0]).toMatchObject({ tenantKey: 'nyc', count: 1, fingerprint: preview.fingerprint });
      expect(await MeridianJobRun.countDocuments()).toBe(0);

      const sent = await sendMeridianNotificationNow(req, definition.id, {
        cities: [{ tenantKey: 'nyc', fingerprint: preview.fingerprint }],
        ignoreQuietHours: true,
        triggeredBy: 'admin-1',
        now: NOW,
      });
      expect(sent.runs).toEqual([expect.objectContaining({ tenantKey: 'nyc', created: true })]);
      const run = await MeridianJobRun.findById(sent.runs[0].runId);
      expect(run.payload).toMatchObject({
        definitionKey: 'everyone',
        sendNow: true,
        dryRun: false,
        timeBucket: `now-${NOW.toISOString()}`,
        copyBodyFallback: 'Hello everyone.',
        triggerConfig: expect.objectContaining({ quietHours: { startHour: 0, endHour: 0 } }),
      });

      const outcome = await executeScheduledPush({ run, req });
      expect(outcome.summary.accepted).toBe(1);
    });

    it('refuses a city the schedule does not cover', async () => {
      await seedPivotTenant(req, 'la', 'America/Los_Angeles');
      const definition = await createEveryone({ tenantKey: 'nyc' });
      await expect(sendMeridianNotificationNow(req, definition.id, {
        cities: [{ tenantKey: 'la', fingerprint: 'x' }],
      })).rejects.toMatchObject({ code: 'SEND_NOW_CITY_NOT_ALLOWED' });
      await expect(sendMeridianNotificationNow(req, definition.id, { cities: [] }))
        .rejects.toMatchObject({ code: 'SEND_NOW_CITIES_REQUIRED' });
    });

    it('lists platform admins for the weekly report and sends it once', async () => {
      const definition = await createMeridianNotificationDefinition(req, {
        definitionKey: 'admin_weekly_report',
        handlerKey: 'admin_weekly_report',
        scheduleCron: '0 9 * * 0',
      });
      const preview = await previewNotificationEligibility(req, {
        handlerKey: 'admin_weekly_report',
        definitionKey: 'admin_weekly_report',
      });
      expect(preview).toMatchObject({ channel: 'email', count: 2, tenantKey: null });
      expect(preview.people.map((row) => row.name)).toEqual(['a@meridian.study', 'b@meridian.study']);
      expect(preview).not.toHaveProperty('quietHours');

      const sent = await sendMeridianNotificationNow(req, definition.id, {
        fingerprint: preview.fingerprint,
        now: NOW,
      });
      expect(sent.runs).toEqual([expect.objectContaining({ tenantKey: 'sf', created: true })]);

      resolveAdminEmails.mockResolvedValueOnce(['a@meridian.study']);
      await expect(sendMeridianNotificationNow(req, definition.id, {
        fingerprint: preview.fingerprint,
        now: NOW,
      })).rejects.toMatchObject({ code: 'RECIPIENTS_CHANGED' });
    });
  });

  describe('one-time send', () => {
    const USER_B = new mongoose.Types.ObjectId();
    const draft = {
      tenantKey: 'nyc',
      label: 'Rain plan',
      title: 'rain check',
      body: 'Indoor picks are up.',
      rules: [],
    };

    it('checks the message and recipients, then sends only to the people reviewed', async () => {
      await expect(previewOneTimeSend(req, { ...draft, body: '' }, { now: NOW }))
        .rejects.toMatchObject({ code: 'ONE_TIME_BODY_REQUIRED' });
      await expect(previewOneTimeSend(req, { ...draft, tenantKey: 'nowhere' }, { now: NOW }))
        .rejects.toMatchObject({ code: 'ONE_TIME_CITY_NOT_ALLOWED' });

      const preview = await previewOneTimeSend(req, draft, { now: NOW });
      expect(preview).toMatchObject({ tenantKey: 'nyc', count: 1, sendAt: null });

      await expect(sendOneTime(req, {
        ...draft,
        body: 'Edited after review.',
        cities: [{ tenantKey: 'nyc', fingerprint: preview.fingerprint }],
      }, { now: NOW })).rejects.toMatchObject({ code: 'RECIPIENTS_CHANGED' });

      const sent = await sendOneTime(req, {
        ...draft,
        cities: [{ tenantKey: 'nyc', fingerprint: preview.fingerprint }],
      }, { now: NOW, triggeredBy: 'admin-1' });
      expect(sent.runs).toEqual([expect.objectContaining({ tenantKey: 'nyc', created: true })]);

      const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobRun', 'MeridianJobDelivery');
      const run = await MeridianJobRun.findById(sent.runs[0].runId);
      expect(run.nextAttemptAt.toISOString()).toBe(NOW.toISOString());
      expect(run.payload).toMatchObject({ oneTime: true, frozenRecipients: true, label: 'Rain plan' });
      expect(await MeridianJobDelivery.countDocuments({ runId: run._id, deliveryStatus: 'pending' })).toBe(1);

      // Someone new turns on push after the review; they are not added.
      mockUsers([
        { _id: USER_A, username: 'ari', name: 'Ari', pushToken: 'ExponentPushToken[a]', pushAppEdition: 'pivot' },
        { _id: USER_B, username: 'bo', name: 'Bo', pushToken: 'ExponentPushToken[b]', pushAppEdition: 'pivot' },
      ]);
      await executeScheduledPush({ run, req });
      const [, recipients, messages] = sendExpoPushToRecipients.mock.calls[0];
      expect(recipients.map((user) => String(user._id))).toEqual([String(USER_A)]);
      expect(messages[0]).toMatchObject({ title: 'rain check', body: 'Indoor picks are up.' });
      const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
      expect(deliveries).toEqual([expect.objectContaining({ userId: String(USER_A), deliveryStatus: 'accepted' })]);
    });

    it('schedules for later and can be cancelled before it starts', async () => {
      const sendAt = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
      await expect(previewOneTimeSend(req, { ...draft, sendAt: '2020-01-01T00:00:00Z' }, { now: NOW }))
        .rejects.toMatchObject({ code: 'ONE_TIME_SEND_AT_PAST' });

      const preview = await previewOneTimeSend(req, { ...draft, sendAt }, { now: NOW });
      expect(preview.sendAt).toBe(sendAt);
      const sent = await sendOneTime(req, {
        ...draft,
        sendAt,
        cities: [{ tenantKey: 'nyc', fingerprint: preview.fingerprint }],
      }, { now: NOW });

      const listed = await listOneTimeSends(req);
      expect(listed).toEqual([expect.objectContaining({
        oneTimeId: sent.oneTimeId,
        label: 'Rain plan',
        body: 'Indoor picks are up.',
        runs: [expect.objectContaining({ tenantKey: 'nyc', status: 'pending' })],
      })]);

      const cancelled = await cancelOneTimeSend(req, sent.oneTimeId, { cancelledBy: 'admin-1' });
      expect(cancelled.cancelled).toHaveLength(1);
      const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(req, 'MeridianJobRun', 'MeridianJobDelivery');
      const run = await MeridianJobRun.findById(sent.runs[0].runId).lean();
      expect(run.status).toBe('cancelled');
      expect(await MeridianJobDelivery.countDocuments({ runId: run._id, deliveryStatus: 'pending' })).toBe(0);
      await expect(cancelOneTimeSend(req, sent.oneTimeId))
        .rejects.toMatchObject({ code: 'ONE_TIME_ALREADY_STARTED' });
    });
  });
});
