/**
 * Emails the Just Go weekly report (pivotWeeklyReportService) to every platform
 * admin. A fleet handler: one run per schedule slot for all cities, and the
 * audience is fixed — schedules can set when it goes out, never who gets it.
 *
 * Not a default schedule. Create one from Notifications → New schedule.
 */
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
} = require('../meridianJobSendClaim');

const ADMIN_WEEKLY_REPORT_HANDLER_KEY = 'admin_weekly_report';

function buildAdminWeeklyReportRunKey({ payload = {}, scheduledFor = new Date() }) {
  const slot = payload.timeBucket || `manual-${new Date(scheduledFor).toISOString()}`;
  const dry = payload.dryRun === true ? ':dry' : '';
  return `${ADMIN_WEEKLY_REPORT_HANDLER_KEY}:${slot}${dry}`;
}

function summaryFor(data, message = null) {
  const recipients = data?.recipients?.length || 0;
  return {
    attempted: recipients,
    accepted: data?.sent ? recipients : 0,
    failed: 0,
    skipped: 0,
    recipientOverflowCount: 0,
    message: message || (data?.period ? `report for ${data.period}` : null),
  };
}

async function executeAdminWeeklyReport(ctx) {
  const { sendWeeklyReport } = require('../pivotWeeklyReportService');
  const run = ctx.run || {};
  const req = ctx.req || {};
  const payload = run.payload || {};
  const dryRun = payload.dryRun === true;
  const now = payload.now ? new Date(payload.now) : new Date();

  if (!dryRun) {
    const claim = await claimMeridianJobExpoSend(req, run._id);
    if (!claim.proceed) {
      return { terminalStatus: 'succeeded', summary: summaryFor(null, 'skipped duplicate send') };
    }
  }

  const result = await sendWeeklyReport(req, { now, dryRun });
  if (result?.error) {
    if (!dryRun) await releaseMeridianJobExpoSend(req, run._id);
    throw new MeridianJobHandlerError(result.error, {
      retryable: (result.status || 500) >= 500 && result.code !== 'EMAIL_UNAVAILABLE',
      statusCode: result.status || null,
      code: result.code || null,
    });
  }

  return {
    terminalStatus: dryRun ? 'preview' : 'succeeded',
    summary: summaryFor(result.data, dryRun ? 'dry-run' : null),
  };
}

function registerAdminWeeklyReportHandler() {
  if (getMeridianJobHandler(ADMIN_WEEKLY_REPORT_HANDLER_KEY)) {
    return getMeridianJobHandler(ADMIN_WEEKLY_REPORT_HANDLER_KEY);
  }
  return registerMeridianJobHandler(ADMIN_WEEKLY_REPORT_HANDLER_KEY, {
    category: 'notification',
    scope: 'fleet',
    channel: 'email',
    buildRunKey: buildAdminWeeklyReportRunKey,
    execute: executeAdminWeeklyReport,
  });
}

registerAdminWeeklyReportHandler();

module.exports = {
  ADMIN_WEEKLY_REPORT_HANDLER_KEY,
  buildAdminWeeklyReportRunKey,
  executeAdminWeeklyReport,
  registerAdminWeeklyReportHandler,
};
