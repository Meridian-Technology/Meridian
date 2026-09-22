const { toIsoWeek } = require('../../utilities/pivotIsoWeek');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const { sendWeeklyDropPush } = require('../pivotWeeklyDropService');

function buildWeeklyDropRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const week = payload.batchWeek || toIsoWeek();
  const dry = payload.dryRun === true ? ':dry' : '';
  return `weekly_drop:${tenant}:${week}${dry}`;
}

async function executeWeeklyDrop(ctx) {
  const payload = ctx.run?.payload || {};
  const req = ctx.req || {};
  const result = await sendWeeklyDropPush(req, ctx.run.tenantKey, {
    batchWeek: payload.batchWeek,
    dryRun: payload.dryRun === true,
    force: payload.force === true,
    pushTitle: payload.pushTitle,
    pushBody: payload.pushBody,
    triggeredBy: payload.triggeredBy || null,
    meridianJobRunId: ctx.run._id,
  });

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
  buildWeeklyDropRunKey,
  executeWeeklyDrop,
  registerWeeklyDropHandler,
};
