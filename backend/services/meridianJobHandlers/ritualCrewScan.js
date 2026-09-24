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

const { getTenantByKey } = require('../tenantConfigService');
const { alignDaytimeCheckCron, DAYTIME_CHECK_CRON, quietHoursSendBlockForDelivery } = require('../../utilities/meridianQuietHours');
const {
  resolveNotificationRules,
  defaultNotificationRules,
} = require('../../utilities/meridianNotificationRules');

const RITUAL_CREW_SCAN_HANDLER_KEY = 'ritual_crew_scan';
const RITUAL_CREW_SCAN_DEFINITION_KEY = 'ritual_crew_scan';
const RITUAL_CREW_SCAN_CRON = DAYTIME_CHECK_CRON;

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

async function claimConsensusCrew(req, runId, crewId) {
  if (!runId || !crewId) return false;
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun } = getGlobalModels(jobReq, 'MeridianJobRun');
  const id = String(crewId);
  const updated = await MeridianJobRun.findOneAndUpdate(
    { _id: runId, 'payload.consensusSentCrewIds': { $nin: [id] } },
    { $addToSet: { 'payload.consensusSentCrewIds': id } },
  );
  return Boolean(updated);
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

  const rules = Array.isArray(payload.rules)
    ? payload.rules
    : resolveNotificationRules(RITUAL_CREW_SCAN_HANDLER_KEY, {
      rules: payload.rules,
      triggerConfig: payload.triggerConfig,
    }).rules;
  const tenantReq = { ...req, school: tenantKey };
  const now = payload.now ? new Date(payload.now) : new Date();
  if (payload.dryRun !== true) {
    const tenant = await getTenantByKey(req, tenantKey);
    if (tenant) {
      const quiet = quietHoursSendBlockForDelivery(payload, {
        now,
        timeZone: tenant.pivotDropTimezone,
        triggerConfig: payload.triggerConfig,
      });
      if (quiet) {
        throw new MeridianJobHandlerError(quiet.error, {
          retryable: true,
          defer: true,
          retryAfterMs: quiet.retryAfterMs,
          statusCode: 409,
          code: 'QUIET_HOURS',
        });
      }
    }
  }

  const swipe = rules.length
    ? await sendCrewUnfinishedSwipeNudgesForTenant(tenantReq, {
      now,
      batchWeek: payload.batchWeek,
      dryRun: payload.dryRun === true,
      triggerConfig: payload.triggerConfig,
      rules,
      copyTitleKey: payload.copyTitleKey,
      copyBodyKey: payload.copyBodyKey,
      copyTitleFallback: payload.copyTitleFallback,
      copyBodyFallback: payload.copyBodyFallback,
    })
    : { data: { sent: 0, failed: 0, deliveries: [], skipped: 'swipe_nudges_disabled' } };

  if (swipe?.status && swipe.status >= 400) {
    throw new MeridianJobHandlerError(swipe.error || 'ritual_crew_scan failed', {
      retryable: swipe.status >= 500,
      statusCode: swipe.status,
    });
  }

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
  const failed = swipe.data?.failed || 0;
  const skipped = swipe.data?.skipped ? 1 : 0;

  return {
    terminalStatus: payload.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: deliveries.length,
      accepted,
      failed,
      skipped,
      recipientOverflowCount: overflow,
      message: swipe.data?.skipped || null,
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
  triggerConfig: { scan: 'unfinished_swipe' },
  rules: defaultNotificationRules(RITUAL_CREW_SCAN_HANDLER_KEY),
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
  if (existing) return alignDaytimeCheckCron(existing);
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

const RITUAL_CREW_CONSENSUS_HANDLER_KEY = 'ritual_crew_consensus';
const RITUAL_CREW_CONSENSUS_DEFINITION_KEY = 'ritual_crew_consensus';
const RITUAL_CREW_CONSENSUS_CRON = DAYTIME_CHECK_CRON;

function buildRitualCrewConsensusRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const bucket = payload.timeBucket || 'manual';
  const dry = payload.dryRun === true ? ':dry' : '';
  return `${RITUAL_CREW_CONSENSUS_HANDLER_KEY}:${tenant}:${bucket}${dry}`;
}

async function executeRitualCrewConsensus(ctx) {
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
    throw new MeridianJobHandlerError('tenantKey is required for ritual_crew_consensus', {
      retryable: false,
    });
  }

  const rules = Array.isArray(payload.rules)
    ? payload.rules
    : resolveNotificationRules(RITUAL_CREW_CONSENSUS_HANDLER_KEY, {
      rules: payload.rules,
      triggerConfig: payload.triggerConfig,
    }).rules;
  const tenantReq = { ...req, school: tenantKey };
  const now = payload.now ? new Date(payload.now) : new Date();
  if (payload.dryRun !== true) {
    const tenant = await getTenantByKey(req, tenantKey);
    if (tenant) {
      const quiet = quietHoursSendBlockForDelivery(payload, {
        now,
        timeZone: tenant.pivotDropTimezone,
        triggerConfig: payload.triggerConfig,
      });
      if (quiet) {
        throw new MeridianJobHandlerError(quiet.error, {
          retryable: true,
          defer: true,
          retryAfterMs: quiet.retryAfterMs,
          statusCode: 409,
          code: 'QUIET_HOURS',
        });
      }
    }
  }

  const pending = rules.length
    ? await sendPendingConsensusNudgesForTenant(tenantReq, {
      now,
      batchWeek: payload.batchWeek,
      triggerConfig: payload.triggerConfig,
      rules,
      copyTitleKey: payload.copyTitleKey,
      copyBodyKey: payload.copyBodyKey,
      copyTitleFallback: payload.copyTitleFallback,
      copyBodyFallback: payload.copyBodyFallback,
      claimCrew: payload.dryRun === true
        ? undefined
        : (crewId) => claimConsensusCrew(req, run._id, crewId),
    })
    : { data: { sent: 0, failed: 0, deliveries: [], crewsNudged: 0 } };

  if (pending?.status && pending.status >= 400) {
    throw new MeridianJobHandlerError(pending.error || 'ritual_crew_consensus failed', {
      retryable: pending.status >= 500,
      statusCode: pending.status,
    });
  }

  const deliveries = pending.data?.deliveries || [];
  let overflow = 0;
  try {
    const persisted = await persistRitualScanDeliveries(req, {
      runId: run._id,
      tenantKey,
      deliveries,
      summaryMessage: pending.data?.skipped || null,
    });
    overflow = persisted.recipientOverflowCount || 0;
  } catch (error) {
    console.error('[ritual_crew_consensus] delivery audit persist failed', error);
  }

  return {
    terminalStatus: payload.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: deliveries.length,
      accepted: pending.data?.sent || 0,
      failed: pending.data?.failed || 0,
      skipped: pending.data?.skipped ? 1 : 0,
      recipientOverflowCount: overflow,
      message: pending.data?.skipped || null,
    },
  };
}

const RITUAL_CREW_CONSENSUS_DEFINITION_SPEC = Object.freeze({
  definitionKey: RITUAL_CREW_CONSENSUS_DEFINITION_KEY,
  handlerKey: RITUAL_CREW_CONSENSUS_HANDLER_KEY,
  tenantKey: '',
  enabled: true,
  scheduleCron: RITUAL_CREW_CONSENSUS_CRON,
  copyTitleKey: NOTIFICATION_COPY_KEYS.ritual.decide_pending.title,
  copyBodyKey: NOTIFICATION_COPY_KEYS.ritual.decide_pending.body,
  triggerConfig: { scan: 'consensus_pending' },
  rules: defaultNotificationRules(RITUAL_CREW_CONSENSUS_HANDLER_KEY),
});

async function ensureRitualCrewConsensusDefinition(req) {
  registerRitualCrewConsensusHandler();
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(
    jobReq,
    'MeridianNotificationDefinition',
  );
  const existing = await MeridianNotificationDefinition.findOne({
    definitionKey: RITUAL_CREW_CONSENSUS_DEFINITION_KEY,
    tenantKey: '',
  });
  if (existing) return alignDaytimeCheckCron(existing);
  try {
    return await MeridianNotificationDefinition.create({ ...RITUAL_CREW_CONSENSUS_DEFINITION_SPEC });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return MeridianNotificationDefinition.findOne({
      definitionKey: RITUAL_CREW_CONSENSUS_DEFINITION_KEY,
      tenantKey: '',
    });
  }
}

function registerRitualCrewConsensusHandler() {
  if (getMeridianJobHandler(RITUAL_CREW_CONSENSUS_HANDLER_KEY)) {
    return getMeridianJobHandler(RITUAL_CREW_CONSENSUS_HANDLER_KEY);
  }
  return registerMeridianJobHandler(RITUAL_CREW_CONSENSUS_HANDLER_KEY, {
    category: 'notification',
    buildRunKey: buildRitualCrewConsensusRunKey,
    execute: executeRitualCrewConsensus,
  });
}

registerRitualCrewScanHandler();
registerRitualCrewConsensusHandler();

module.exports = {
  RITUAL_CREW_SCAN_HANDLER_KEY,
  RITUAL_CREW_SCAN_DEFINITION_KEY,
  RITUAL_CREW_SCAN_CRON,
  RITUAL_CREW_SCAN_DEFINITION_SPEC,
  RITUAL_CREW_CONSENSUS_HANDLER_KEY,
  RITUAL_CREW_CONSENSUS_DEFINITION_KEY,
  RITUAL_CREW_CONSENSUS_DEFINITION_SPEC,
  buildRitualCrewScanRunKey,
  claimConsensusCrew,
  executeRitualCrewScan,
  executeRitualCrewConsensus,
  ensureRitualCrewScanDefinition,
  ensureRitualCrewConsensusDefinition,
  registerRitualCrewScanHandler,
  registerRitualCrewConsensusHandler,
};
