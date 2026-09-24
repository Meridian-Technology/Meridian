jest.mock('../../services/pivotCrewNudgeService', () => {
  const actual = jest.requireActual('../../services/pivotCrewNudgeService');
  return {
    ...actual,
    sendCrewUnfinishedSwipeNudgesForTenant: jest.fn(),
    sendPendingConsensusNudgesForTenant: jest.fn(),
  };
});

const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensureMeridianJobIndexes } = require('../../services/ensureMeridianJobIndexes');
const { upsertStoredTenantRow } = require('../../services/tenantConfigService');
const { resetMeridianJobHandlers } = require('../../services/meridianJobRegistry');
const { enqueueMeridianJob } = require('../../services/meridianJobEnqueueService');
const {
  tickMeridianJobWorker,
  resetMeridianJobWorkerMutex,
} = require('../../services/meridianJobWorkerLoop');
const {
  sendCrewUnfinishedSwipeNudgesForTenant,
  sendPendingConsensusNudgesForTenant,
  isPivotCrewNudgeCronDisabled,
} = require('../../services/pivotCrewNudgeService');
const {
  registerRitualCrewScanHandler,
  ensureRitualCrewScanDefinition,
  RITUAL_CREW_SCAN_HANDLER_KEY,
  RITUAL_CREW_SCAN_DEFINITION_KEY,
  buildRitualCrewScanRunKey,
  claimConsensusCrew,
} = require('../../services/meridianJobHandlers/ritualCrewScan');
const {
  evaluateMeridianNotificationSchedules,
} = require('../../services/meridianNotificationDefinitionService');
const { registerWeeklyDropHandler } = require('../../services/meridianJobHandlers/weeklyDrop');

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

describe('meridianJobRitualScan', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = {
      db: mongo.connection,
      globalDb: mongo.globalConnection,
      school: 'nyc',
    };
    await ensureMeridianJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    resetMeridianJobHandlers();
    registerWeeklyDropHandler();
    registerRitualCrewScanHandler();
    resetMeridianJobWorkerMutex();
    sendCrewUnfinishedSwipeNudgesForTenant.mockReset();
    sendPendingConsensusNudgesForTenant.mockReset();
    sendPendingConsensusNudgesForTenant.mockResolvedValue({
      data: { sent: 0, failed: 0, crewsNudged: 0, deliveries: [] },
    });
    await mongo.reset();
    await ensureMeridianJobIndexes(req, { force: true });
    delete process.env.DISABLE_PIVOT_CREW_NUDGE_CRON;
  });

  afterEach(() => {
    delete process.env.DISABLE_PIVOT_CREW_NUDGE_CRON;
    resetMeridianJobWorkerMutex();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('claims each consensus crew once per run', async () => {
    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    const run = await MeridianJobRun.create({
      runKey: 'ritual_crew_scan:nyc:claim',
      category: 'notification',
      type: 'ritual_crew_scan',
      tenantKey: 'nyc',
      status: 'running',
      scheduledFor: new Date('2026-06-05T22:00:00.000Z'),
      nextAttemptAt: new Date('2026-06-05T22:00:00.000Z'),
      payload: {},
    });

    expect(await claimConsensusCrew(req, run._id, 'crew-a')).toBe(true);
    expect(await claimConsensusCrew(req, run._id, 'crew-a')).toBe(false);
    expect(await claimConsensusCrew(req, run._id, 'crew-b')).toBe(true);
    const stored = await MeridianJobRun.findById(run._id).lean();
    expect(stored.payload.consensusSentCrewIds.sort()).toEqual(['crew-a', 'crew-b']);
  });

  it('buildRunKey includes tenant and time bucket for idempotent enqueue', () => {
    expect(buildRitualCrewScanRunKey({
      tenantKey: 'NYC',
      payload: { timeBucket: '2026-06-05T18:00' },
    })).toBe('ritual_crew_scan:nyc:2026-06-05T18:00');
  });

  it('executes tenant nudge send through expo path and writes deliveries', async () => {
    sendPendingConsensusNudgesForTenant.mockResolvedValue({
      data: {
        sent: 1,
        failed: 0,
        crewsNudged: 1,
        deliveries: [{
          userId: 'u2',
          username: 'bo',
          name: 'Bo',
          product: 'justgo',
          copyKey: 'notifications.ritual.decidePending.body',
          title: 'confirm',
          body: 'still deciding',
          deliveryStatus: 'accepted',
          error: null,
        }],
      },
    });
    sendCrewUnfinishedSwipeNudgesForTenant.mockResolvedValue({
      data: {
        tenantKey: 'nyc',
        batchWeek: '2026-W23',
        sent: 1,
        failed: 0,
        crewsNudged: 1,
        deliveries: [{
          userId: 'u1',
          username: 'ari',
          name: 'Ari',
          product: 'justgo',
          copyKey: 'notifications.ritual.quorumWaiting.body',
          title: 'just go*',
          body: 'your crew is waiting on swipes',
          deliveryStatus: 'accepted',
          error: null,
        }],
      },
    });

    await enqueueMeridianJob(req, {
      handlerKey: RITUAL_CREW_SCAN_HANDLER_KEY,
      tenantKey: 'nyc',
      payload: { timeBucket: '2026-06-05T18:00', batchWeek: '2026-W23' },
      scheduledFor: new Date('2026-06-05T22:00:00.000Z'),
    });

    const tick = await tickMeridianJobWorker(req, {
      now: new Date('2026-06-05T22:00:01.000Z'),
    });
    expect(tick.claimed).toBe(true);
    expect(sendCrewUnfinishedSwipeNudgesForTenant).toHaveBeenCalled();
    expect(sendPendingConsensusNudgesForTenant).not.toHaveBeenCalled();

    const { MeridianJobDelivery, MeridianJobRun } = getGlobalModels(
      req,
      'MeridianJobDelivery',
      'MeridianJobRun',
    );
    const run = await MeridianJobRun.findOne({ type: RITUAL_CREW_SCAN_HANDLER_KEY }).lean();
    expect(run.status).toBe('succeeded');
    expect(run.summary.accepted).toBe(1);
    const deliveries = await MeridianJobDelivery.find({ runId: run._id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries.map((row) => row.userId)).toEqual(['u1']);
    expect(deliveries[0]).toMatchObject({
      userId: 'u1',
      deliveryStatus: 'accepted',
      copyKey: 'notifications.ritual.quorumWaiting.body',
      body: 'your crew is waiting on swipes',
    });
    expect(deliveries[0]).not.toHaveProperty('pushToken');
  });

  it('no-ops when DISABLE_PIVOT_CREW_NUDGE_CRON is true', async () => {
    process.env.DISABLE_PIVOT_CREW_NUDGE_CRON = 'true';
    expect(isPivotCrewNudgeCronDisabled()).toBe(true);

    await enqueueMeridianJob(req, {
      handlerKey: RITUAL_CREW_SCAN_HANDLER_KEY,
      tenantKey: 'nyc',
      payload: { timeBucket: 'disabled' },
    });
    const tick = await tickMeridianJobWorker(req, { now: new Date() });
    expect(tick.claimed).toBe(true);
    expect(sendCrewUnfinishedSwipeNudgesForTenant).not.toHaveBeenCalled();

    const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
    const run = await MeridianJobRun.findOne({ type: RITUAL_CREW_SCAN_HANDLER_KEY }).lean();
    expect(run.status).toBe('succeeded');
    expect(run.summary.message).toMatch(/DISABLE_PIVOT_CREW_NUDGE_CRON/);
  });

  it('seeds a fleet definition and skips enqueue when the kill switch is on', async () => {
    await seedPivotTenant(req, 'nyc', 'America/New_York');
    const seeded = await ensureRitualCrewScanDefinition(req);
    expect(seeded.definitionKey).toBe(RITUAL_CREW_SCAN_DEFINITION_KEY);
    expect(seeded.handlerKey).toBe(RITUAL_CREW_SCAN_HANDLER_KEY);
    expect(seeded.enabled).toBe(true);

    const now = new Date('2026-06-05T22:00:00.000Z');
    const enabled = await evaluateMeridianNotificationSchedules(req, { now });
    expect(enabled.enqueued.some((row) => row.handlerKey === RITUAL_CREW_SCAN_HANDLER_KEY)).toBe(true);

    process.env.DISABLE_PIVOT_CREW_NUDGE_CRON = 'true';
    const disabled = await evaluateMeridianNotificationSchedules(req, { now });
    expect(disabled.enqueued.filter((row) => row.handlerKey === RITUAL_CREW_SCAN_HANDLER_KEY)).toHaveLength(0);
  });
});
