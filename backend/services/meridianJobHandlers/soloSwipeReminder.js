const getGlobalModels = require('../getGlobalModelService');
const connectionsManager = require('../../connectionsManager');
const getModels = require('../getModelService');
const { getTenantByKey } = require('../tenantConfigService');
const { isPivotTenant, resolvePivotLiveBatchWeek } = require('../../utilities/pivotDropSchedule');
const { mergePivotCrewConfig } = require('../../utilities/pivotCrewConfig');
const { isValidIsoWeek } = require('../../utilities/pivotIsoWeek');
const { getMergedCopyPackOrEmpty } = require('../pivotCopyService');
const { sendExpoPushToRecipients } = require('../expoPushDeliveryService');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const {
  loadWeeklyDropCrewContext,
} = require('../pivotWeeklyDropService');
const {
  isNudgeWindowOpen,
} = require('../pivotCrewNudgeService');
const {
  capDeliveryRows,
  persistMeridianJobDeliveries,
  zipExpoPushDeliveries,
} = require('../meridianJobWeeklyDropAudit');
const { MAX_RUN_RECIPIENTS } = require('../../schemas/pivotDropPushRun');
const {
  NOTIFICATION_COPY_KEYS,
  resolveRitualNotificationCopy,
} = require('../../utilities/meridianJobCopyResolve');

const SOLO_SWIPE_REMINDER_HANDLER_KEY = 'solo_swipe_reminder';
const SOLO_SWIPE_REMINDER_DEFINITION_KEY = 'solo_swipe_reminder';
const SOLO_SWIPE_REMINDER_CRON = '0,30 * * * *';

function buildSoloSwipeReminderRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const week = payload.batchWeek || 'none';
  const bucket = payload.timeBucket || 'manual';
  const dry = payload.dryRun === true ? ':dry' : '';
  return `${SOLO_SWIPE_REMINDER_HANDLER_KEY}:${tenant}:${week}:${bucket}${dry}`;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectionsManager.connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function isSoloSwipeCandidate(context = {}) {
  return context.hasCrew !== true && context.deckComplete !== true;
}

async function loadAlreadyRemindedUserIds(req, tenantKey, batchWeek) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );
  const runs = await MeridianJobRun.find({
    type: SOLO_SWIPE_REMINDER_HANDLER_KEY,
    tenantKey: String(tenantKey || '').trim().toLowerCase(),
    'payload.batchWeek': batchWeek,
  })
    .select('_id')
    .lean();
  if (!runs.length) return new Set();
  const deliveries = await MeridianJobDelivery.find({
    runId: { $in: runs.map((row) => row._id) },
    deliveryStatus: { $in: ['accepted', 'skipped', 'blocked_dev_gate'] },
  })
    .select('userId')
    .lean();
  return new Set(deliveries.map((row) => String(row.userId || '')).filter(Boolean));
}

async function loadPivotPushUsers(tenantKey) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User } = getModels(req, 'User');
  return User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken pushAppProduct pushTokenUpdatedAt username name')
    .lean();
}

async function sendSoloSwipeRemindersForTenant(req, options = {}) {
  const tenantKey = String(options.tenantKey || req?.school || '').trim().toLowerCase();
  if (!tenantKey) {
    return { error: 'tenantKey is required', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) {
    return { data: { tenantKey, sent: 0, failed: 0, skipped: 'not_pivot', deliveries: [] } };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek || resolvePivotLiveBatchWeek(tenant, now);
  if (!isValidIsoWeek(batchWeek)) {
    return { error: 'batchWeek must be YYYY-Www.', status: 400 };
  }

  const crewConfig = mergePivotCrewConfig(tenant.pivotCrewConfig);
  if (!isNudgeWindowOpen(tenant, batchWeek, crewConfig.nudges.unfinishedSwipeReminderHours, now)) {
    return {
      data: {
        tenantKey,
        batchWeek,
        skipped: 'before_nudge_window',
        sent: 0,
        failed: 0,
        deliveries: [],
      },
    };
  }

  const users = await loadPivotPushUsers(tenantKey);
  const contextByUserId = await loadWeeklyDropCrewContext(
    tenantKey,
    batchWeek,
    users.map((user) => user._id?.toString?.() || String(user._id || '')),
  );
  const already = await loadAlreadyRemindedUserIds(req, tenantKey, batchWeek);
  const eligible = users.filter((user) => {
    const userId = user._id?.toString?.() || String(user._id || '');
    if (!userId || already.has(userId)) return false;
    return isSoloSwipeCandidate(contextByUserId.get(userId) || {});
  });
  const capped = capDeliveryRows(eligible, MAX_RUN_RECIPIENTS);
  const recipients = capped.deliveries;
  const copyPack = await getMergedCopyPackOrEmpty(req, { tenantKey });
  const copy = resolveRitualNotificationCopy('swipe', copyPack);
  const copyKey = options.copyBodyKey || NOTIFICATION_COPY_KEYS.ritual.swipe.body;
  const dryRun = options.dryRun === true;

  const messages = recipients.map((user) => ({
    to: user.pushToken,
    sound: 'default',
    title: copy.title,
    body: copy.body,
    data: {
      batchWeek,
      ritualPhase: 'solo',
      ritualNudgeType: 'swipe',
      pushType: 'solo_swipe_reminder',
    },
    priority: 'default',
    channelId: 'default',
  }));

  let tickets = [];
  let sent = 0;
  let failed = 0;
  if (!dryRun && recipients.length) {
    const pushResult = await sendExpoPushToRecipients(tenantKey, recipients, messages);
    tickets = pushResult.tickets || [];
    sent = pushResult.sent || 0;
    failed = pushResult.failed || 0;
  }

  const deliveries = zipExpoPushDeliveries({
    recipients,
    messages,
    tickets,
    copyKey,
    dryRun,
  });

  return {
    data: {
      tenantKey,
      batchWeek,
      sent: dryRun ? 0 : sent,
      failed: dryRun ? 0 : failed,
      skipped: capped.recipientOverflowCount,
      eligible: eligible.length,
      deliveries,
    },
  };
}

async function executeSoloSwipeReminder(ctx) {
  const run = ctx.run || {};
  const req = ctx.req || {};
  const payload = run.payload || {};
  const tenantKey = run.tenantKey;
  if (!tenantKey) {
    throw new MeridianJobHandlerError('tenantKey is required for solo_swipe_reminder', {
      retryable: false,
    });
  }

  const result = await sendSoloSwipeRemindersForTenant(req, {
    tenantKey,
    batchWeek: payload.batchWeek,
    now: payload.now ? new Date(payload.now) : undefined,
    dryRun: payload.dryRun === true,
    copyBodyKey: payload.copyBodyKey,
  });

  if (result?.status && result.status >= 400) {
    throw new MeridianJobHandlerError(result.error || 'solo_swipe_reminder failed', {
      retryable: result.status >= 500,
      statusCode: result.status,
    });
  }

  let overflow = 0;
  try {
    const persisted = await persistMeridianJobDeliveries(req, {
      runId: run._id,
      tenantKey,
      deliveries: result.data?.deliveries || [],
      summaryMessage: result.data?.skipped === 'before_nudge_window'
        ? 'before_nudge_window'
        : null,
    });
    overflow = persisted.recipientOverflowCount || 0;
  } catch (error) {
    console.error('[solo_swipe_reminder] delivery audit persist failed', error);
  }

  const skippedWindow = result.data?.skipped === 'before_nudge_window';
  return {
    terminalStatus: payload.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: result.data?.deliveries?.length || 0,
      accepted: result.data?.sent || 0,
      failed: result.data?.failed || 0,
      skipped: skippedWindow ? 1 : (result.data?.skipped || 0),
      recipientOverflowCount: overflow,
      message: skippedWindow
        ? 'before_nudge_window'
        : (result.data?.skipped === 'not_pivot' ? 'not_pivot' : null),
    },
  };
}

const SOLO_SWIPE_REMINDER_DEFINITION_SPEC = Object.freeze({
  definitionKey: SOLO_SWIPE_REMINDER_DEFINITION_KEY,
  handlerKey: SOLO_SWIPE_REMINDER_HANDLER_KEY,
  tenantKey: '',
  enabled: true,
  scheduleCron: SOLO_SWIPE_REMINDER_CRON,
  copyTitleKey: NOTIFICATION_COPY_KEYS.ritual.swipe.title,
  copyBodyKey: NOTIFICATION_COPY_KEYS.ritual.swipe.body,
  triggerConfig: { scan: 'solo_unfinished_deck' },
});

async function ensureSoloSwipeReminderDefinition(req) {
  registerSoloSwipeReminderHandler();
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(
    jobReq,
    'MeridianNotificationDefinition',
  );
  const existing = await MeridianNotificationDefinition.findOne({
    definitionKey: SOLO_SWIPE_REMINDER_DEFINITION_KEY,
    tenantKey: '',
  });
  if (existing) return existing;
  try {
    return await MeridianNotificationDefinition.create({ ...SOLO_SWIPE_REMINDER_DEFINITION_SPEC });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return MeridianNotificationDefinition.findOne({
      definitionKey: SOLO_SWIPE_REMINDER_DEFINITION_KEY,
      tenantKey: '',
    });
  }
}

function registerSoloSwipeReminderHandler() {
  if (getMeridianJobHandler(SOLO_SWIPE_REMINDER_HANDLER_KEY)) {
    return getMeridianJobHandler(SOLO_SWIPE_REMINDER_HANDLER_KEY);
  }
  return registerMeridianJobHandler(SOLO_SWIPE_REMINDER_HANDLER_KEY, {
    category: 'notification',
    buildRunKey: buildSoloSwipeReminderRunKey,
    execute: executeSoloSwipeReminder,
  });
}

registerSoloSwipeReminderHandler();

module.exports = {
  SOLO_SWIPE_REMINDER_HANDLER_KEY,
  SOLO_SWIPE_REMINDER_DEFINITION_KEY,
  SOLO_SWIPE_REMINDER_CRON,
  buildSoloSwipeReminderRunKey,
  isSoloSwipeCandidate,
  sendSoloSwipeRemindersForTenant,
  executeSoloSwipeReminder,
  ensureSoloSwipeReminderDefinition,
  registerSoloSwipeReminderHandler,
};
