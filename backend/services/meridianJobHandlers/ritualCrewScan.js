const getGlobalModels = require('../getGlobalModelService');
const { connectToGlobalDatabase } = require('../../connectionsManager');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const {
  isPivotCrewNudgeCronDisabled,
  sendCrewUnfinishedSwipeNudgesForTenant,
  sendPendingConsensusNudgesForTenant,
} = require('../pivotCrewNudgeService');
const { capDeliveryRows } = require('../meridianJobWeeklyDropAudit');
const { MAX_RUN_RECIPIENTS } = require('../../schemas/pivotDropPushRun');
const { NOTIFICATION_COPY_KEYS } = require('../../utilities/meridianJobCopyResolve');

const RITUAL_CREW_SCAN_HANDLER_KEY = 'ritual_crew_scan';
const RITUAL_CREW_SCAN_DEFINITION_KEY = 'ritual_crew_scan';
const RITUAL_CREW_SCAN_CRON = '0,30 * * * *';

function buildRitualCrewScanRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const bucket = payload.timeBucket || 'manual';
  const dry = payload.dryRun === true ? ':dry' : '';
  return `${RITUAL_CREW_SCAN_HANDLER_KEY}:${tenant}:${bucket}${dry}`;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function persistRitualScanDeliveries(req, {
  runId,
  tenantKey,
  deliveries = [],
  summaryMessage = null,
} = {}) {
  if (!runId) return { persisted: 0, recipientOverflowCount: 0 };
  const jobReq = await resolveJobReq(req);
  const { MeridianJobDelivery, MeridianJobRun } = getGlobalModels(
    jobReq,
    'MeridianJobDelivery',
    'MeridianJobRun',
  );
  const sentAt = new Date();
  const rows = deliveries.map((row) => ({
    runId,
    tenantKey,
    userId: row.userId,
    username: row.username || null,
    name: row.name || null,
    product: row.product || 'legacy',
    copyKey: row.copyKey || NOTIFICATION_COPY_KEYS.ritual.quorum_waiting.body,
    title: row.title || '',
    body: row.body || '',
    deliveryStatus: row.deliveryStatus,
    sentAt: row.deliveryStatus === 'accepted' || row.deliveryStatus === 'failed' ? sentAt : null,
    error: row.error || null,
  }));
  const capped = capDeliveryRows(rows, MAX_RUN_RECIPIENTS);
  if (capped.deliveries.length) {
    await MeridianJobDelivery.insertMany(capped.deliveries, { ordered: false });
  }
  if (capped.recipientOverflowCount || summaryMessage) {
    await MeridianJobRun.updateOne(
      { _id: runId },
      {
        $set: {
          'summary.recipientOverflowCount': capped.recipientOverflowCount,
          ...(summaryMessage ? { 'summary.message': summaryMessage } : {}),
        },
      },
    );
  }
  return {
    persisted: capped.deliveries.length,
    recipientOverflowCount: capped.recipientOverflowCount,
  };
}

async function executeRitualCrewScan(ctx) {
  if (isPivotCrewNudgeCronDisabled()) {
    return {
      terminalStatus: 'succeeded',
      summary: {
        attempted: 0,
        accepted: 0,
        failed: 0,
        skipped: 0,
        message: 'disabled by DISABLE_PIVOT_CREW_NUDGE_CRON',
      },
    };
  }

  const run = ctx.run || {};
  const req = ctx.req || {};
  const payload = run.payload || {};
  const tenantKey = run.tenantKey;
  if (!tenantKey) {
    throw new MeridianJobHandlerError('tenantKey is required for ritual_crew_scan', {
      retryable: false,
    });
  }

  const tenantReq = { ...req, school: tenantKey };
  const swipe = await sendCrewUnfinishedSwipeNudgesForTenant(tenantReq, {
    now: payload.now ? new Date(payload.now) : undefined,
    batchWeek: payload.batchWeek,
    dryRun: payload.dryRun === true,
  });

  if (swipe?.status && swipe.status >= 400) {
    throw new MeridianJobHandlerError(swipe.error || 'ritual_crew_scan failed', {
      retryable: swipe.status >= 500,
      statusCode: swipe.status,
    });
  }

  const pending = await sendPendingConsensusNudgesForTenant(tenantReq, {
    now: payload.now ? new Date(payload.now) : undefined,
    batchWeek: payload.batchWeek || swipe.data?.batchWeek,
  });

  const deliveries = swipe.data?.deliveries || [];
  let overflow = 0;
  try {
    const persisted = await persistRitualScanDeliveries(req, {
      runId: run._id,
      tenantKey,
      deliveries,
      summaryMessage: swipe.data?.skipped || null,
    });
    overflow = persisted.recipientOverflowCount || 0;
  } catch (error) {
    console.error('[ritual_crew_scan] delivery audit persist failed', error);
  }

  const accepted = swipe.data?.sent || 0;
  const failed = (swipe.data?.failed || 0) + (pending.data?.failed || 0);
  const skipped = swipe.data?.skipped ? 1 : 0;

  return {
    terminalStatus: payload.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: deliveries.length,
      accepted,
      failed,
      skipped,
      recipientOverflowCount: overflow,
      message: swipe.data?.skipped
        || (pending.data?.crewsNudged
          ? `swipe sent=${accepted}; consensus crews=${pending.data.crewsNudged}`
          : null),
    },
  };
}

const RITUAL_CREW_SCAN_DEFINITION_SPEC = Object.freeze({
  definitionKey: RITUAL_CREW_SCAN_DEFINITION_KEY,
  handlerKey: RITUAL_CREW_SCAN_HANDLER_KEY,
  tenantKey: '',
  enabled: true,
  scheduleCron: RITUAL_CREW_SCAN_CRON,
  copyTitleKey: NOTIFICATION_COPY_KEYS.ritual.quorum_waiting.title,
  copyBodyKey: NOTIFICATION_COPY_KEYS.ritual.quorum_waiting.body,
  triggerConfig: { scan: 'unfinished_swipe_and_consensus_pending' },
});

async function ensureRitualCrewScanDefinition(req) {
  registerRitualCrewScanHandler();
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(
    jobReq,
    'MeridianNotificationDefinition',
  );
  const existing = await MeridianNotificationDefinition.findOne({
    definitionKey: RITUAL_CREW_SCAN_DEFINITION_KEY,
    tenantKey: '',
  });
  if (existing) return existing;
  try {
    return await MeridianNotificationDefinition.create({ ...RITUAL_CREW_SCAN_DEFINITION_SPEC });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return MeridianNotificationDefinition.findOne({
      definitionKey: RITUAL_CREW_SCAN_DEFINITION_KEY,
      tenantKey: '',
    });
  }
}

function registerRitualCrewScanHandler() {
  if (getMeridianJobHandler(RITUAL_CREW_SCAN_HANDLER_KEY)) {
    return getMeridianJobHandler(RITUAL_CREW_SCAN_HANDLER_KEY);
  }
  return registerMeridianJobHandler(RITUAL_CREW_SCAN_HANDLER_KEY, {
    category: 'notification',
    buildRunKey: buildRitualCrewScanRunKey,
    execute: executeRitualCrewScan,
  });
}

registerRitualCrewScanHandler();

module.exports = {
  RITUAL_CREW_SCAN_HANDLER_KEY,
  RITUAL_CREW_SCAN_DEFINITION_KEY,
  RITUAL_CREW_SCAN_CRON,
  buildRitualCrewScanRunKey,
  executeRitualCrewScan,
  ensureRitualCrewScanDefinition,
  registerRitualCrewScanHandler,
};
