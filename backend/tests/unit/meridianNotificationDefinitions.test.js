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
    // New schedules start paused unless the caller turns them on.
    expect(created.enabled).toBe(false);
    expect(created.scheduleCron).toBe('0,30 * * * *');
    expect(created.triggerConfig).toEqual({ lookbackHours: 6 });
    expect(created.rules).toEqual([]);

    const listed = await listMeridianNotificationDefinitions(req);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const byKey = await getMeridianNotificationDefinition(req, 'ritual_crew_scan');
    expect(byKey.id).toBe(created.id);

    const updated = await updateMeridianNotificationDefinition(req, created.id, {
      enabled: true,
      scheduleCron: '0 18 * * 4',
    });
    expect(updated.enabled).toBe(true);
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

  it('enqueues weekly drops at 18:00 in each city rather than one UTC instant', async () => {
    await seedPivotTenant(req, 'tokyo', 'Asia/Tokyo');
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await seedPivotTenant(req, 'la', 'America/Los_Angeles');
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'weekly_drop',
      handlerKey: 'weekly_drop',
      scheduleCron: '0 18 * * 4',
      enabled: true,
    });

    const checks = [
      ['2026-06-04T09:00:00.000Z', 'tokyo'],
      ['2026-06-04T22:00:00.000Z', 'nyc'],
      ['2026-06-05T01:00:00.000Z', 'la'],
    ];
    for (const [instant, tenantKey] of checks) {
      const result = await evaluateMeridianNotificationSchedules(req, { now: new Date(instant) });
      expect(result.enqueued.map((row) => row.tenantKey)).toEqual([tenantKey]);
      expect(result.enqueued[0].runKey).toBe(`weekly_drop:${tenantKey}:2026-W23`);
    }
  });

  it('uses the city calendar week for a weekly drop near the UTC week boundary', async () => {
    await seedPivotTenant(req, 'la', 'America/Los_Angeles');
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'weekly_drop',
      handlerKey: 'weekly_drop',
      scheduleCron: '30 21 * * 0',
      enabled: true,
    });

    // Monday in UTC is still Sunday in Los Angeles.
    const result = await evaluateMeridianNotificationSchedules(req, {
      now: new Date('2026-06-08T04:30:00.000Z'),
    });
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0].runKey).toBe('weekly_drop:la:2026-W23');
    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    const run = await MeridianJobRun.findOne({ runKey: result.enqueued[0].runKey }).lean();
    expect(run.payload.batchWeek).toBe('2026-W23');
    expect(run.payload.timezone).toBe('America/Los_Angeles');
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

  it('runs the admin weekly report once per slot for all cities, to a fixed audience', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    await seedPivotTenant(req, 'la', 'America/Los_Angeles');

    await expect(createMeridianNotificationDefinition(req, {
      definitionKey: 'admin_weekly_report_nyc',
      handlerKey: 'admin_weekly_report',
      tenantKey: 'nyc',
      scheduleCron: '0 9 * * 0',
    })).rejects.toMatchObject({ code: 'FLEET_HANDLER_TENANT_SCOPE', status: 400 });
    await expect(createMeridianNotificationDefinition(req, {
      definitionKey: 'admin_weekly_report_rules',
      handlerKey: 'admin_weekly_report',
      scheduleCron: '0 9 * * 0',
      rules: [{ outcome: 'send', conditions: [{ attribute: 'hasCrew', operator: 'is', value: true }] }],
    })).rejects.toMatchObject({ code: 'INVALID_RULES' });

    const created = await createMeridianNotificationDefinition(req, {
      definitionKey: 'admin_weekly_report',
      handlerKey: 'admin_weekly_report',
      scheduleCron: '0 9 * * 0',
    });
    expect(created.enabled).toBe(false);
    await expect(updateMeridianNotificationDefinition(req, created.id, { tenantKey: 'la' }))
      .rejects.toMatchObject({ code: 'FLEET_HANDLER_TENANT_SCOPE' });
    await expect(upsertMeridianNotificationOverride(req, 'nyc', 'admin_weekly_report', { enabled: true }))
      .rejects.toMatchObject({ code: 'FLEET_HANDLER_OVERRIDE' });

    // Sunday 2026-06-07 13:00 UTC = 09:00 New York (the pilot drop timezone).
    const now = new Date('2026-06-07T13:00:00.000Z');
    expect((await evaluateMeridianNotificationSchedules(req, { now })).enqueued).toHaveLength(0);

    await updateMeridianNotificationDefinition(req, created.id, { enabled: true });
    const first = await evaluateMeridianNotificationSchedules(req, { now });
    expect(first.enqueued).toEqual([expect.objectContaining({
      handlerKey: 'admin_weekly_report',
      tenantKey: 'sf',
      created: true,
      runKey: 'admin_weekly_report:2026-06-07T09:00',
    })]);
    const second = await evaluateMeridianNotificationSchedules(req, { now });
    expect(second.enqueued[0].created).toBe(false);
    expect((await evaluateMeridianNotificationSchedules(req, {
      now: new Date('2026-06-07T16:00:00.000Z'),
    })).enqueued).toHaveLength(0);

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    expect(await MeridianJobRun.countDocuments({ type: 'admin_weekly_report' })).toBe(1);
  });

  it('restores built-in schedules paused and leaves a custom schedule in place', async () => {
    await createMeridianNotificationDefinition(req, {
      definitionKey: 'ritual_crew_scan',
      handlerKey: 'ritual_stub',
      scheduleCron: '0 9 * * *',
      enabled: true,
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
    // Restoring an enabled schedule pauses it: restore never starts a send.
    expect(scan.enabled).toBe(false);
    expect(scan.scheduleCron).toBe('0,30 8-21 * * *');
    expect(scan.rules[0].conditions.map((row) => row.attribute)).toEqual([
      'quorumMet',
      'activeMemberCount',
      'unfinishedSwiperCount',
      'hoursSinceWeeklyDrop',
      'alreadyNotifiedThisBatchWeek',
    ]);

    const weekly = restored.find((row) => row.definitionKey === 'weekly_drop');
    expect(weekly.scheduleCron).toBe('0 18 * * 4');
    expect(weekly.rules).toEqual([]);

    expect(restored.every((row) => row.enabled === false)).toBe(true);
    expect(restored.map((row) => row.handlerKey)).not.toContain('admin_weekly_report');
    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    const tick = await evaluateMeridianNotificationSchedules(req, { now: new Date('2026-06-04T22:00:00.000Z') });
    expect(tick.enqueued).toHaveLength(0);
    expect(await MeridianJobRun.countDocuments()).toBe(0);

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
