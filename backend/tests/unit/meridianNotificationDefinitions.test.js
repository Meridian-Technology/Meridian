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
});
