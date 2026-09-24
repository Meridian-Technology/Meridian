const { toIsoWeek } = require('../../utilities/pivotIsoWeek');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const { sendWeeklyDropPush } = require('../pivotWeeklyDropService');
const {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
  duplicateExpoSendResult,
} = require('../meridianJobSendClaim');

const { quietHoursSendBlockForDelivery } = require('../../utilities/meridianQuietHours');
const { getTenantByKey } = require('../tenantConfigService');
const { NOTIFICATION_COPY_KEYS } = require('../../utilities/meridianJobCopyResolve');
const { PIVOT_DROP_PILOT_DEFAULTS } = require('../../utilities/pivotDropSchedule');

const OUTSIDE_WINDOW_DEFER_MS = 30 * 60 * 1000;

function buildWeeklyDropRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const week = payload.batchWeek || toIsoWeek();
  const dry = payload.dryRun === true ? ':dry' : '';
  return `weekly_drop:${tenant}:${week}${dry}`;
}

async function executeWeeklyDrop(ctx) {
  const payload = ctx.run?.payload || {};
  const req = ctx.req || {};
  const dryRun = payload.dryRun === true;
  if (!dryRun) {
    const tenant = await getTenantByKey(req, ctx.run?.tenantKey);
    const quiet = tenant
      ? quietHoursSendBlockForDelivery(payload, {
        now: payload.now ? new Date(payload.now) : new Date(),
        timeZone: tenant.pivotDropTimezone,
        triggerConfig: payload.triggerConfig,
      })
      : null;
    if (quiet) {
      throw new MeridianJobHandlerError(quiet.error, {
        retryable: true,
        defer: true,
        retryAfterMs: quiet.retryAfterMs,
        statusCode: 409,
        code: 'QUIET_HOURS',
      });
    }
    const claim = await claimMeridianJobExpoSend(req, ctx.run?._id);
    if (!claim.proceed) return duplicateExpoSendResult(claim);
  }
  const result = await sendWeeklyDropPush(req, ctx.run.tenantKey, {
    batchWeek: payload.batchWeek,
    dryRun: payload.dryRun === true,
    force: payload.force === true,
    pushTitle: payload.pushTitle,
    pushBody: payload.pushBody,
    triggeredBy: payload.triggeredBy || null,
    meridianJobRunId: ctx.run._id,
    triggerConfig: payload.triggerConfig,
    now: payload.now,
    enforceQuietHours: payload.enforceQuietHours,
  });

  if (result?.status >= 400 && !dryRun) {
    await releaseMeridianJobExpoSend(req, ctx.run?._id);
  }

  if (result?.code === 'QUIET_HOURS' || result?.code === 'OUTSIDE_DROP_WINDOW') {
    throw new MeridianJobHandlerError(result.error || 'Outside send window', {
      retryable: true,
      defer: true,
      retryAfterMs: result.retryAfterMs || OUTSIDE_WINDOW_DEFER_MS,
      statusCode: 409,
      code: result.code,
    });
  }

  if (result?.status && result.status >= 400) {
    throw new MeridianJobHandlerError(result.error || 'weekly_drop failed', {
      retryable: result.status >= 500,
      statusCode: result.status,
      code: result.code || null,
    });
  }

  return {
    terminalStatus: result?.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: result?.summary?.attempted
        || result?.pivotPushRecipientCount
        || 0,
      accepted: result?.sent || 0,
      failed: result?.failed || 0,
      skipped: result?.skipped || 0,
      recipientOverflowCount: result?.recipientOverflowCount || 0,
      message: result?.dryRun === true ? 'dry-run' : null,
    },
    pivotDropPushRunId: result?.pivotDropPushRunId || null,
  };
}

const WEEKLY_DROP_DEFINITION_SPEC = Object.freeze({
  definitionKey: 'weekly_drop',
  handlerKey: 'weekly_drop',
  tenantKey: '',
  enabled: true,
  scheduleCron: `${PIVOT_DROP_PILOT_DEFAULTS.pivotDropMinute} ${PIVOT_DROP_PILOT_DEFAULTS.pivotDropHour} * * ${PIVOT_DROP_PILOT_DEFAULTS.pivotDropDayOfWeek}`,
  copyTitleKey: NOTIFICATION_COPY_KEYS.weeklyDrop.title,
  copyBodyKey: NOTIFICATION_COPY_KEYS.weeklyDrop.body,
  triggerConfig: {},
  rules: [],
});

function registerWeeklyDropHandler() {
  if (getMeridianJobHandler('weekly_drop')) {
    return getMeridianJobHandler('weekly_drop');
  }
  return registerMeridianJobHandler('weekly_drop', {
    category: 'notification',
    buildRunKey: buildWeeklyDropRunKey,
    execute: executeWeeklyDrop,
  });
}

registerWeeklyDropHandler();

module.exports = {
  WEEKLY_DROP_DEFINITION_SPEC,
  buildWeeklyDropRunKey,
  executeWeeklyDrop,
  registerWeeklyDropHandler,
};
