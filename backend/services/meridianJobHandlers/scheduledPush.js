const getGlobalModels = require('../getGlobalModelService');
const connectionsManager = require('../../connectionsManager');
const getModels = require('../getModelService');
const { getTenantByKey } = require('../tenantConfigService');
const { isPivotTenant, resolvePivotLiveBatchWeek } = require('../../utilities/pivotDropSchedule');
const { isValidIsoWeek } = require('../../utilities/pivotIsoWeek');
const { getMergedCopyPackOrEmpty } = require('../pivotCopyService');
const { sendExpoPushToRecipients } = require('../expoPushDeliveryService');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const { loadWeeklyDropCrewContext } = require('../pivotWeeklyDropService');
const {
  capDeliveryRows,
  persistMeridianJobDeliveries,
  zipExpoPushDeliveries,
} = require('../meridianJobWeeklyDropAudit');
const { MAX_RUN_RECIPIENTS } = require('../../schemas/pivotDropPushRun');
const {
  WEEKLY_DROP_COPY_FALLBACKS,
  resolveNotificationCopyPair,
} = require('../../utilities/meridianJobCopyResolve');
const {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
  duplicateExpoSendResult,
} = require('../meridianJobSendClaim');
const { quietHoursSendBlockForDelivery } = require('../../utilities/meridianQuietHours');
const {
  SCHEDULED_PUSH,
  resolveNotificationRules,
  evaluateRuleGroups,
  rulesReference,
} = require('../../utilities/meridianNotificationRules');

const SCHEDULED_PUSH_HANDLER_KEY = SCHEDULED_PUSH;
const CREW_FACTS = ['hasCrew', 'deckComplete', 'unfinishedCardCount'];

function buildScheduledPushRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const definition = String(payload.definitionKey || 'none').trim().toLowerCase();
  const bucket = payload.timeBucket || `manual-${new Date().toISOString()}`;
  const dry = payload.dryRun === true ? ':dry' : '';
  return `${SCHEDULED_PUSH_HANDLER_KEY}:${tenant}:${definition}:${bucket}${dry}`;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectionsManager.connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function resolveScheduledPushCopy(pack, { copyTitleFallback, copyBodyFallback } = {}) {
  const body = String(copyBodyFallback || '').trim();
  if (!body) return null;
  const copy = resolveNotificationCopyPair({
    pack,
    titleFallback: String(copyTitleFallback || '').trim() || WEEKLY_DROP_COPY_FALLBACKS.title,
    bodyFallback: body,
  });
  return copy.body ? copy : null;
}

async function loadPushUsers(tenantKey) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const { User } = getModels({ db, school: tenantKey }, 'User');
  return User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken pushAppProduct pushTokenUpdatedAt username name')
    .lean();
}

async function loadAlreadyNotifiedUserIds(req, { tenantKey, definitionKey, batchWeek }) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );
  const runs = await MeridianJobRun.find({
    type: SCHEDULED_PUSH_HANDLER_KEY,
    tenantKey,
    'payload.definitionKey': definitionKey,
    'payload.batchWeek': batchWeek,
    'payload.dryRun': { $ne: true },
  })
    .select('_id')
    .lean();
  if (!runs.length) return new Set();
  const deliveries = await MeridianJobDelivery.find({
    runId: { $in: runs.map((row) => row._id) },
    deliveryStatus: { $in: ['accepted', 'blocked_dev_gate'] },
  })
    .select('userId')
    .lean();
  return new Set(deliveries.map((row) => String(row.userId || '')).filter(Boolean));
}

/**
 * Pushes a schedule's own title and body to every Just Go user in the city
 * who matches its who-rules. No rules means everyone.
 */
async function sendScheduledPushForTenant(req, options = {}) {
  const tenantKey = String(options.tenantKey || '').trim().toLowerCase();
  if (!tenantKey) return { error: 'tenantKey is required', status: 400 };

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) {
    return { data: { tenantKey, sent: 0, failed: 0, skipped: 'not_pivot', deliveries: [] } };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek || resolvePivotLiveBatchWeek(tenant, now);
  if (!isValidIsoWeek(batchWeek)) {
    return { error: 'batchWeek must be YYYY-Www.', status: 400 };
  }

  const eligibilityOnly = options.eligibilityOnly === true;
  const dryRun = options.dryRun === true;
  if (!eligibilityOnly && !dryRun) {
    const quiet = quietHoursSendBlockForDelivery(options, {
      now,
      timeZone: tenant.pivotDropTimezone,
      triggerConfig: options.triggerConfig,
    });
    if (quiet) {
      return {
        ...quiet,
        data: { tenantKey, batchWeek, skipped: 'quiet_hours', sent: 0, failed: 0, deliveries: [] },
      };
    }
  }

  const copyPack = await getMergedCopyPackOrEmpty(req, { tenantKey });
  const copy = resolveScheduledPushCopy(copyPack, options);
  if (!copy && !eligibilityOnly) {
    return {
      error: 'This schedule has no message. Add a body before it can send.',
      status: 400,
      code: 'SCHEDULED_PUSH_BODY_REQUIRED',
    };
  }

  const frozen = Array.isArray(options.frozenRecipients) ? options.frozenRecipients : null;
  const rules = frozen
    ? []
    : (Array.isArray(options.rules)
      ? options.rules
      : resolveNotificationRules(SCHEDULED_PUSH_HANDLER_KEY, options).rules);
  const users = await loadPushUsers(tenantKey);
  const userIds = users.map((user) => user._id?.toString?.() || String(user._id || ''));
  const contextByUserId = CREW_FACTS.some((key) => rulesReference(rules, key))
    ? await loadWeeklyDropCrewContext(tenantKey, batchWeek, userIds)
    : new Map();
  const already = rulesReference(rules, 'alreadyNotifiedThisBatchWeek')
    ? await loadAlreadyNotifiedUserIds(req, {
      tenantKey,
      definitionKey: options.definitionKey || null,
      batchWeek,
    })
    : new Set();
  const frozenIds = frozen ? new Set(frozen.map((row) => String(row.userId))) : null;
  const pushUserIds = new Set(userIds);
  const lostPush = frozen
    ? frozen.filter((row) => !pushUserIds.has(String(row.userId))).map((row) => ({
      userId: String(row.userId),
      username: row.username || null,
      name: row.name || null,
      product: 'legacy',
      copyKey: null,
      title: '',
      body: '',
      deliveryStatus: 'skipped',
      sentAt: null,
      error: 'Push was turned off after this send was reviewed.',
    }))
    : [];

  const eligible = users.filter((user) => {
    const userId = user._id?.toString?.() || String(user._id || '');
    if (!userId) return false;
    if (frozenIds) return frozenIds.has(userId);
    if (!rules.length) return true;
    const context = contextByUserId.get(userId) || {};
    return evaluateRuleGroups({
      hasCrew: context.hasCrew === true,
      deckComplete: context.deckComplete === true,
      unfinishedCardCount: Number(context.unfinishedCardCount) || 0,
      alreadyNotifiedThisBatchWeek: already.has(userId),
    }, rules).includes('send');
  });
  const capped = capDeliveryRows(eligible, MAX_RUN_RECIPIENTS);
  const recipients = capped.deliveries;

  if (eligibilityOnly) {
    return {
      data: {
        tenantKey,
        batchWeek,
        sent: 0,
        failed: 0,
        eligible: eligible.length,
        overflow: capped.recipientOverflowCount,
        people: recipients.map((user) => ({
          userId: user._id?.toString?.() || String(user._id || ''),
          username: user.username || null,
          name: user.name || null,
        })),
        deliveries: [],
      },
    };
  }

  const messages = recipients.map((user) => ({
    to: user.pushToken,
    sound: 'default',
    title: copy.title,
    body: copy.body,
    data: {
      batchWeek,
      definitionKey: options.definitionKey || null,
      pushType: SCHEDULED_PUSH_HANDLER_KEY,
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

  return {
    data: {
      tenantKey,
      batchWeek,
      sent: dryRun ? 0 : sent,
      failed: dryRun ? 0 : failed,
      skipped: capped.recipientOverflowCount + lostPush.length,
      eligible: eligible.length,
      deliveries: [
        ...zipExpoPushDeliveries({
          recipients,
          messages,
          tickets,
          copyKey: null,
          dryRun,
        }),
        ...lostPush,
      ],
    },
  };
}

async function loadFrozenRecipients(req, runId) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobDelivery } = getGlobalModels(jobReq, 'MeridianJobDelivery');
  return MeridianJobDelivery.find({ runId, deliveryStatus: 'pending' })
    .select('userId username name')
    .lean();
}

async function clearFrozenRecipients(req, runId) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobDelivery } = getGlobalModels(jobReq, 'MeridianJobDelivery');
  await MeridianJobDelivery.deleteMany({ runId, deliveryStatus: 'pending' });
}

/** A run queued by hand only names the schedule; read the rest from it. */
async function resolveRunSettings(req, tenantKey, payload) {
  if (payload.copyBodyFallback || !payload.definitionKey) return payload;
  const { listMeridianNotificationDefinitions } = require('../meridianNotificationDefinitionService');
  const matches = (await listMeridianNotificationDefinitions(req, { tenantKey }))
    .filter((row) => (
      row.definitionKey === payload.definitionKey
      && row.handlerKey === SCHEDULED_PUSH_HANDLER_KEY
    ));
  const definition = matches.find((row) => row.tenantKey === tenantKey) || matches[0];
  if (!definition) return payload;
  return {
    ...payload,
    copyTitleFallback: definition.copyTitleFallback,
    copyBodyFallback: definition.copyBodyFallback,
    triggerConfig: payload.triggerConfig || definition.triggerConfig,
    rules: Array.isArray(payload.rules) ? payload.rules : definition.rules,
  };
}

async function executeScheduledPush(ctx) {
  const run = ctx.run || {};
  const req = ctx.req || {};
  const tenantKey = run.tenantKey;
  if (!tenantKey) {
    throw new MeridianJobHandlerError('tenantKey is required for scheduled_push', { retryable: false });
  }
  const payload = await resolveRunSettings(req, tenantKey, run.payload || {});
  const dryRun = payload.dryRun === true;

  if (!dryRun) {
    const tenant = await getTenantByKey(req, tenantKey);
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
    const claim = await claimMeridianJobExpoSend(req, run._id);
    if (!claim.proceed) return duplicateExpoSendResult(claim);
  }

  const frozenRecipients = payload.frozenRecipients === true
    ? await loadFrozenRecipients(req, run._id)
    : null;
  const result = await sendScheduledPushForTenant(req, {
    tenantKey,
    frozenRecipients,
    definitionKey: payload.definitionKey,
    batchWeek: payload.batchWeek,
    now: payload.now ? new Date(payload.now) : undefined,
    dryRun,
    copyTitleFallback: payload.copyTitleFallback,
    copyBodyFallback: payload.copyBodyFallback,
    triggerConfig: payload.triggerConfig,
    rules: payload.rules,
  });

  if (result?.status >= 400 && !dryRun) {
    await releaseMeridianJobExpoSend(req, run._id);
  }
  if (result?.code === 'QUIET_HOURS') {
    throw new MeridianJobHandlerError(result.error || 'Quiet hours', {
      retryable: true,
      defer: true,
      retryAfterMs: result.retryAfterMs,
      statusCode: 409,
      code: 'QUIET_HOURS',
    });
  }
  if (result?.status && result.status >= 400) {
    throw new MeridianJobHandlerError(result.error || 'scheduled_push failed', {
      retryable: result.status >= 500,
      statusCode: result.status,
      code: result.code || null,
    });
  }

  let overflow = 0;
  try {
    if (frozenRecipients) await clearFrozenRecipients(req, run._id);
    const persisted = await persistMeridianJobDeliveries(req, {
      runId: run._id,
      tenantKey,
      deliveries: result.data?.deliveries || [],
    });
    overflow = persisted.recipientOverflowCount || 0;
  } catch (error) {
    console.error('[scheduled_push] delivery audit persist failed', error);
  }

  return {
    terminalStatus: dryRun ? 'preview' : 'succeeded',
    summary: {
      attempted: result.data?.deliveries?.length || 0,
      accepted: result.data?.sent || 0,
      failed: result.data?.failed || 0,
      skipped: result.data?.skipped === 'not_pivot' ? 0 : (result.data?.skipped || 0),
      recipientOverflowCount: overflow,
      message: result.data?.skipped === 'not_pivot' ? 'not_pivot' : (dryRun ? 'dry-run' : null),
    },
  };
}

function registerScheduledPushHandler() {
  if (getMeridianJobHandler(SCHEDULED_PUSH_HANDLER_KEY)) {
    return getMeridianJobHandler(SCHEDULED_PUSH_HANDLER_KEY);
  }
  return registerMeridianJobHandler(SCHEDULED_PUSH_HANDLER_KEY, {
    category: 'notification',
    buildRunKey: buildScheduledPushRunKey,
    execute: executeScheduledPush,
  });
}

registerScheduledPushHandler();

module.exports = {
  SCHEDULED_PUSH_HANDLER_KEY,
  buildScheduledPushRunKey,
  resolveScheduledPushCopy,
  sendScheduledPushForTenant,
  executeScheduledPush,
  registerScheduledPushHandler,
};
