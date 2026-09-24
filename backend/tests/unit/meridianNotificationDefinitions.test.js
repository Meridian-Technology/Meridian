const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const {
  registerMeridianJobHandler,
  resetMeridianJobHandlers,
} = require('../../services/meridianJobRegistry');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');
const { upsertStoredTenantRow } = require('../../services/tenantConfigService');
const {
  validateThirtyMinuteCron,
  floorToThirtyMinuteBucket,
} = require('../../utilities/meridianNotificationCron');
const {
  createMeridianNotificationDefinition,
  updateMeridianNotificationDefinition,
  deleteMeridianNotificationDefinition,
  listMeridianNotificationDefinitions,
  getMeridianNotificationDefinition,
  upsertMeridianNotificationOverride,
  evaluateMeridianNotificationSchedules,
  resolveDefinitionForTenant,
  restoreDefaultMeridianNotificationSchedules,
} = require('../../services/meridianNotificationDefinitionService');

const meridianNotificationDefinitionSchema = require('../../schemas/meridianNotificationDefinition');

const Definition = mongoose.models.MeridianNotificationDefinitionSchemaTest
  || mongoose.model(
    'MeridianNotificationDefinitionSchemaTest',
    meridianNotificationDefinitionSchema,
  );

function registerStubHandler() {
  if (require('../../services/meridianJobRegistry').getMeridianJobHandler('ritual_stub')) {
    return;
  }
  registerMeridianJobHandler('ritual_stub', {
    category: 'notification',
    buildRunKey: ({ tenantKey, payload = {} }) => (
      `ritual_stub:${String(tenantKey || '').toLowerCase()}:${payload.timeBucket || 'none'}`
    ),
    execute: async () => ({ terminalStatus: 'succeeded', summary: { attempted: 0 } }),
  });
}

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
  });
}

describe('meridian notification definitions', () => {
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
    registerStubHandler();
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('rejects cron minutes that are not 0 or 30', async () => {
    expect(validateThirtyMinuteCron('15 * * * *').error).toMatch(/minute must be 0 or 30/);
    expect(validateThirtyMinuteCron('* * * * *').error).toMatch(/minute must be 0 or 30/);
    expect(validateThirtyMinuteCron('0,30 * * * *').ok).toBe(true);
    expect(validateThirtyMinuteCron('*/30 * * * *').ok).toBe(true);
    expect(validateThirtyMinuteCron('0 18 * * 5').ok).toBe(true);

    const invalid = new Definition({
      definitionKey: 'bad_cron',
      handlerKey: 'ritual_stub',
      scheduleCron: '15 * * * *',
    });
    await expect(invalid.validate()).rejects.toThrow(/minute must be 0 or 30/);

    await expect(
      createMeridianNotificationDefinition(req, {
        definitionKey: 'bad_cron_api',
        handlerKey: 'ritual_stub',
        scheduleCron: '45 9 * * *',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCHEDULE_CRON', status: 400 });
  });

  it('creates, lists, updates, and deletes definitions', async () => {
    const created = await createMeridianNotificationDefinition(req, {
      definitionKey: 'Ritual_Crew_Scan',
      handlerKey: 'ritual_stub',
      scheduleCron: '0,30 * * * *',
      copyTitleKey: 'notifications.ritual.title',
      copyBodyKey: 'notifications.ritual.body',
      triggerConfig: { lookbackHours: 6 },
    });

    expect(created.definitionKey).toBe('ritual_crew_scan');
    expect(created.tenantKey).toBe(null);
    expect(created.enabled).toBe(true);
    expect(created.scheduleCron).toBe('0,30 * * * *');
    expect(created.triggerConfig).toEqual({ lookbackHours: 6 });
    expect(created.rules).toEqual([]);

    const listed = await listMeridianNotificationDefinitions(req);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const byKey = await getMeridianNotificationDefinition(req, 'ritual_crew_scan');
    expect(byKey.id).toBe(created.id);

    const updated = await updateMeridianNotificationDefinition(req, created.id, {
      enabled: false,
      scheduleCron: '0 18 * * 4',
    });
    expect(updated.enabled).toBe(false);
    expect(updated.scheduleCron).toBe('0 18 * * 4');

    await expect(
      createMeridianNotificationDefinition(req, {
        definitionKey: 'ritual_crew_scan',
        handlerKey: 'ritual_stub',
        scheduleCron: '0 9 * * *',
      }),
    ).rejects.toMatchObject({ code: 'DEFINITION_EXISTS', status: 409 });

    const deleted = await deleteMeridianNotificationDefinition(req, 'ritual_crew_scan');
    expect(deleted.deleted).toBe(true);
    await expect(getMeridianNotificationDefinition(req, created.id)).rejects.toMatchObject({
      code: 'DEFINITION_NOT_FOUND',
    });
  });

  it('migrates legacy solo flags into who-rules on read', async () => {
    const { registerSoloSwipeReminderHandler } = require('../../services/meridianJobHandlers/soloSwipeReminder');
    registerSoloSwipeReminderHandler();
    const migrated = await createMeridianNotificationDefinition(req, {
      definitionKey: 'solo_swipe_reminder',
      handlerKey: 'solo_swipe_reminder',
      scheduleCron: '0,30 8-21 * * *',
      triggerConfig: { requireNoCrew: false },
    });
    expect(migrated.rules[0].conditions.map((condition) => condition.attribute)).toEqual([
      'deckComplete',
      'alreadyNotifiedThisBatchWeek',
    ]);

    const stored = await updateMeridianNotificationDefinition(req, migrated.id, {
      rules: [{
        outcome: 'send',
        conditions: [{ attribute: 'deckComplete', operator: 'is', value: false }],
      }],
    });
    expect(stored.rules).toEqual([{
      outcome: 'send',
      conditions: [{ attribute: 'deckComplete', operator: 'is', value: false }],
    }]);
  });

  it('rejects unknown handlers', async () => {
    await expect(
      createMeridianNotificationDefinition(req, {
        definitionKey: 'missing_handler',
        handlerKey: 'not_registered',
        scheduleCron: '0 9 * * *',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_HANDLER', status: 400 });
  });

  it('merges TenantConfig meridianNotificationOverrides at read time', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    const created = await createMeridianNotificationDefinition(req, {
      definitionKey: 'ritual_crew_scan',
      handlerKey: 'ritual_stub',
      scheduleCron: '0,30 * * * *',
      enabled: true,
      copyTitleKey: 'notifications.ritual.title',
    });

    await upsertMeridianNotificationOverride(req, 'nyc', 'ritual_crew_scan', {
      enabled: false,
      scheduleCron: '30 9 * * 1',
      copyTitleKey: 'notifications.ritual.nycTitle',
    });

    const merged = await listMeridianNotificationDefinitions(req, { tenantKey: 'nyc' });
    expect(merged).toHaveLength(1);
    expect(merged[0].enabled).toBe(false);
    expect(merged[0].scheduleCron).toBe('30 9 * * 1');
    expect(merged[0].copyTitleKey).toBe('notifications.ritual.nycTitle');
    expect(merged[0].overrideApplied).toBe(true);
    expect(merged[0].overriddenFields).toEqual(
      expect.arrayContaining(['enabled', 'scheduleCron', 'copyTitleKey']),
    );

    const fleet = await getMeridianNotificationDefinition(req, created.id);
    expect(fleet.enabled).toBe(true);
    expect(fleet.scheduleCron).toBe('0,30 * * * *');

    const resolved = resolveDefinitionForTenant(created, {
      meridianNotificationOverrides: [{ definitionKey: 'ritual_crew_scan', enabled: false }],
    });
    expect(resolved.definition.enabled).toBe(false);
  });

  it('enqueues idempotent runs per tenant timezone time bucket', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await seedPivotTenant(req, 'la', 'America/Los_Angeles');

    await createMeridianNotificationDefinition(req, {
      definitionKey: 'ritual_crew_scan',
      handlerKey: 'ritual_stub',
      scheduleCron: '0 18 * * 5',
      enabled: true,
    });

    // Friday 2026-06-05 22:00 UTC = 18:00 New York, 15:00 Los Angeles
    const now = new Date('2026-06-05T22:00:00.000Z');
    expect(floorToThirtyMinuteBucket(now, 'America/New_York').timeBucket).toBe('2026-06-05T18:00');
    expect(floorToThirtyMinuteBucket(now, 'America/Los_Angeles').timeBucket).toBe('2026-06-05T15:00');

    const first = await evaluateMeridianNotificationSchedules(req, { now });
    expect(first.enqueued.map((row) => row.tenantKey).sort()).toEqual(['nyc']);
    expect(first.enqueued[0].created).toBe(true);
    expect(first.enqueued[0].timeBucket).toBe('2026-06-05T18:00');
    expect(first.enqueued[0].runKey).toBe('ritual_stub:nyc:2026-06-05T18:00');

    const second = await evaluateMeridianNotificationSchedules(req, { now });
    expect(second.enqueued).toHaveLength(1);
    expect(second.enqueued[0].created).toBe(false);

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    expect(await MeridianJobRun.countDocuments()).toBe(1);

    await upsertMeridianNotificationOverride(req, 'nyc', 'ritual_crew_scan', { enabled: false });
    const disabled = await evaluateMeridianNotificationSchedules(req, { now });
    expect(disabled.enqueued).toHaveLength(0);
  });

  it('does not enqueue a matching cron during quiet hours', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'solo_swipe_reminder',
      handlerKey: 'ritual_stub',
      scheduleCron: '0,30 * * * *',
      enabled: true,
    });

    // 02:00 America/New_York
    const night = new Date('2026-06-06T06:00:00.000Z');
    const skipped = await evaluateMeridianNotificationSchedules(req, { now: night });
    expect(skipped.enqueued).toHaveLength(0);

    // 09:00 America/New_York
    const morning = new Date('2026-06-06T13:00:00.000Z');
    const sent = await evaluateMeridianNotificationSchedules(req, { now: morning });
    expect(sent.enqueued.map((row) => row.tenantKey)).toEqual(['nyc']);
  });

  it('restores built-in schedules and leaves a custom schedule in place', async () => {
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'ritual_crew_scan',
      handlerKey: 'ritual_stub',
      scheduleCron: '0 9 * * *',
      enabled: false,
      rules: [],
    });
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'custom_nudge',
      handlerKey: 'ritual_stub',
      scheduleCron: '0 10 * * *',
    });

    const restored = await restoreDefaultMeridianNotificationSchedules(req);
    expect(restored.map((row) => row.definitionKey).sort()).toEqual([
      'event_discovery',
      'ritual_crew_consensus',
      'ritual_crew_scan',
      'solo_swipe_reminder',
      'weekly_drop',
    ]);

    const scan = restored.find((row) => row.definitionKey === 'ritual_crew_scan');
    expect(scan.handlerKey).toBe('ritual_crew_scan');
    expect(scan.enabled).toBe(true);
    expect(scan.scheduleCron).toBe('0,30 8-21 * * *');
    expect(scan.rules[0].conditions.map((row) => row.attribute)).toEqual([
      'quorumMet',
      'activeMemberCount',
      'unfinishedSwiperCount',
      'hoursSinceWeeklyDrop',
      'alreadyNotifiedThisBatchWeek',
    ]);

    const weekly = restored.find((row) => row.definitionKey === 'weekly_drop');
    expect(weekly.enabled).toBe(true);
    expect(weekly.scheduleCron).toBe('0 18 * * 4');
    expect(weekly.rules).toEqual([]);

    expect(restored.find((row) => row.definitionKey === 'event_discovery').enabled).toBe(false);

    const listed = await listMeridianNotificationDefinitions(req);
    expect(listed.map((row) => row.definitionKey).sort()).toEqual([
      'custom_nudge',
      'event_discovery',
      'ritual_crew_consensus',
      'ritual_crew_scan',
      'solo_swipe_reminder',
      'weekly_drop',
    ]);
  });
});
