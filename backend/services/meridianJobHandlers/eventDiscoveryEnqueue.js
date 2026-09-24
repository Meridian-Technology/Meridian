const getGlobalModels = require('../getGlobalModelService');
const connectionsManager = require('../../connectionsManager');
const getModels = require('../getModelService');
const { getTenantByKey } = require('../tenantConfigService');
const { isPivotTenant } = require('../../utilities/pivotDropSchedule');
const { getZonedParts } = require('../../utilities/meridianNotificationCron');
const { getMergedCopyPackOrEmpty } = require('../pivotCopyService');
const { sendExpoPushToRecipients } = require('../expoPushDeliveryService');
const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('../meridianJobRegistry');
const {
  persistMeridianJobDeliveries,
  zipExpoPushDeliveries,
  capDeliveryRows,
} = require('../meridianJobWeeklyDropAudit');
const { MAX_RUN_RECIPIENTS } = require('../../schemas/pivotDropPushRun');
const {
  NOTIFICATION_COPY_KEYS,
  resolveDefinitionNotificationCopy,
} = require('../../utilities/meridianJobCopyResolve');
const {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
  duplicateExpoSendResult,
} = require('../meridianJobSendClaim');

const { alignDaytimeCheckCron, DAYTIME_CHECK_CRON, quietHoursSendBlockForDelivery } = require('../../utilities/meridianQuietHours');
const { resolveNotificationCheckConfig } = require('../../utilities/meridianNotificationCheckConfig');
const {
  resolveNotificationRules,
  evaluateRuleGroups,
  rulesReference,
  defaultNotificationRules,
} = require('../../utilities/meridianNotificationRules');

const EVENT_DISCOVERY_HANDLER_KEY = 'event_discovery';
const EVENT_DISCOVERY_DEFINITION_KEY = 'event_discovery';
const EVENT_DISCOVERY_CRON = DAYTIME_CHECK_CRON;

function discoveryDayBucket(date = new Date(), timeZone = 'UTC') {
  const parts = getZonedParts(date, timeZone);
  return [
    String(parts.year).padStart(4, '0'),
    '-',
    String(parts.month).padStart(2, '0'),
    '-',
    String(parts.day).padStart(2, '0'),
  ].join('');
}

function buildEventDiscoveryRunKey({ tenantKey, payload = {} }) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const userId = String(payload.userId || '').trim();
  const day = payload.dayBucket
    || (typeof payload.timeBucket === 'string' ? payload.timeBucket.slice(0, 10) : '')
    || discoveryDayBucket(payload.now ? new Date(payload.now) : new Date());
  const dry = payload.dryRun === true ? ':dry' : '';
  if (userId) {
    return `${EVENT_DISCOVERY_HANDLER_KEY}:${tenant}:${userId}:${day}${dry}`;
  }
  return `${EVENT_DISCOVERY_HANDLER_KEY}:${tenant}:${day}${dry}`;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectionsManager.connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function loadPivotPushUsers(tenantKey, userIds = null) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const tenantReq = { db, school: tenantKey };
  const { User } = getModels(tenantReq, 'User');
  const query = {
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  };
  if (Array.isArray(userIds) && userIds.length) {
    query._id = { $in: userIds };
  }
  return User.find(query)
    .select('_id pushToken pushAppProduct username name')
    .lean();
}

async function isEventDiscoveryEnabled(req, tenantKey) {
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(
    jobReq,
    'MeridianNotificationDefinition',
  );
  const definition = await MeridianNotificationDefinition.findOne({
    definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
    tenantKey: '',
  }).lean();
  if (!definition) return false;
  const tenant = await getTenantByKey(jobReq, tenantKey);
  const override = Array.isArray(tenant?.meridianNotificationOverrides)
    ? tenant.meridianNotificationOverrides.find(
      (row) => row?.definitionKey === EVENT_DISCOVERY_DEFINITION_KEY,
    )
    : null;
  if (override && override.enabled !== undefined) return override.enabled === true;
  return definition.enabled !== false;
}

async function hoursSinceLastDiscoveryPush(req, tenantKey, userIds, now) {
  const hoursByUserId = new Map();
  if (!userIds.length) return hoursByUserId;
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const runs = await MeridianJobRun.find({
    type: EVENT_DISCOVERY_HANDLER_KEY,
    tenantKey,
    createdAt: { $gte: since },
  })
    .select('_id')
    .lean();
  if (!runs.length) return hoursByUserId;
  const rows = await MeridianJobDelivery.find({
    runId: { $in: runs.map((run) => run._id) },
    userId: { $in: userIds },
    deliveryStatus: { $in: ['accepted', 'skipped', 'blocked_dev_gate'] },
  })
    .select('userId sentAt')
    .lean();
  for (const row of rows) {
    const sentAt = row.sentAt ? new Date(row.sentAt).getTime() : NaN;
    if (Number.isNaN(sentAt)) continue;
    const hours = (now.getTime() - sentAt) / (60 * 60 * 1000);
    const userId = String(row.userId || '');
    const previous = hoursByUserId.get(userId);
    if (previous == null || hours < previous) hoursByUserId.set(userId, hours);
  }
  return hoursByUserId;
}

async function sendEventDiscoveryPushesForTenant(req, options = {}) {
  const tenantKey = String(options.tenantKey || req?.school || '').trim().toLowerCase();
  if (!tenantKey) {
    return { error: 'tenantKey is required', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) {
    return { data: { tenantKey, sent: 0, failed: 0, skipped: 'not_pivot', deliveries: [] } };
  }

  const dryRun = options.dryRun === true;
  if (!dryRun) {
    const quiet = quietHoursSendBlockForDelivery(options, {
      now: options.now || new Date(),
      timeZone: tenant.pivotDropTimezone,
      triggerConfig: options.triggerConfig,
    });
    if (quiet) {
      return {
        ...quiet,
        data: { tenantKey, skipped: 'quiet_hours', sent: 0, failed: 0, deliveries: [] },
      };
    }
  }
  const rules = Array.isArray(options.rules)
    ? options.rules
    : resolveNotificationRules(EVENT_DISCOVERY_HANDLER_KEY, {
      rules: options.rules,
      triggerConfig: options.triggerConfig,
    }).rules;
  const loaded = await loadPivotPushUsers(tenantKey, options.userId ? [options.userId] : null);
  const now = options.now || new Date();
  const userIds = loaded.map((user) => user._id?.toString?.() || String(user._id || '')).filter(Boolean);
  const hoursByUserId = rulesReference(rules, 'hoursSinceLastDiscoveryPush')
    ? await hoursSinceLastDiscoveryPush(req, tenantKey, userIds, now)
    : new Map();
  const users = loaded.filter((user) => {
    const userId = user._id?.toString?.() || String(user._id || '');
    const hours = hoursByUserId.has(userId)
      ? hoursByUserId.get(userId)
      : Number.POSITIVE_INFINITY;
    return evaluateRuleGroups({ hoursSinceLastDiscoveryPush: hours }, rules).includes('send');
  });
  const capped = capDeliveryRows(users, MAX_RUN_RECIPIENTS);
  const recipients = capped.deliveries;
  const copyPack = await getMergedCopyPackOrEmpty(req, { tenantKey });
  const copy = resolveDefinitionNotificationCopy({
    pack: copyPack,
    titleKey: options.copyTitleKey || NOTIFICATION_COPY_KEYS.definition.title,
    bodyKey: options.copyBodyKey || NOTIFICATION_COPY_KEYS.definition.body,
    titleFallback: options.copyTitleFallback,
    bodyFallback: options.copyBodyFallback,
  });
  const copyKey = options.copyBodyKey || NOTIFICATION_COPY_KEYS.definition.body;

  const messages = recipients.map((user) => ({
    to: user.pushToken,
    sound: 'default',
    title: copy.title,
    body: copy.body,
    data: {
      dayBucket: options.dayBucket || null,
      batchWeek: options.batchWeek || null,
      pushType: 'event_discovery',
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
      sent: dryRun ? 0 : sent,
      failed: dryRun ? 0 : failed,
      skipped: capped.recipientOverflowCount,
      deliveries: zipExpoPushDeliveries({
        recipients,
        messages,
        tickets,
        copyKey,
        dryRun,
      }),
    },
  };
}

async function executeEventDiscovery(ctx) {
  const run = ctx.run || {};
  const req = ctx.req || {};
  const payload = run.payload || {};
  const tenantKey = run.tenantKey;
  if (!tenantKey) {
    throw new MeridianJobHandlerError('tenantKey is required for event_discovery', {
      retryable: false,
    });
  }

  if (payload.dryRun !== true) {
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

  const result = await sendEventDiscoveryPushesForTenant(req, {
    tenantKey,
    userId: payload.userId || null,
    dayBucket: payload.dayBucket,
    batchWeek: payload.batchWeek,
    dryRun: payload.dryRun === true,
    copyTitleKey: payload.copyTitleKey,
    copyBodyKey: payload.copyBodyKey,
    copyTitleFallback: payload.copyTitleFallback,
    copyBodyFallback: payload.copyBodyFallback,
    triggerConfig: payload.triggerConfig,
    rules: payload.rules,
    now: payload.now ? new Date(payload.now) : undefined,
  });

  if (result?.code === 'QUIET_HOURS' && payload.dryRun !== true) {
    await releaseMeridianJobExpoSend(req, run._id);
    throw new MeridianJobHandlerError(result.error || 'Quiet hours', {
      retryable: true,
      defer: true,
      retryAfterMs: result.retryAfterMs,
      statusCode: 409,
      code: 'QUIET_HOURS',
    });
  }

  if (result?.status >= 400 && payload.dryRun !== true) {
    await releaseMeridianJobExpoSend(req, run._id);
  }

  if (result?.status && result.status >= 400) {
    throw new MeridianJobHandlerError(result.error || 'event_discovery failed', {
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
    });
    overflow = persisted.recipientOverflowCount || 0;
  } catch (error) {
    console.error('[event_discovery] delivery audit persist failed', error);
  }

  return {
    terminalStatus: payload.dryRun === true ? 'preview' : 'succeeded',
    summary: {
      attempted: result.data?.deliveries?.length || 0,
      accepted: result.data?.sent || 0,
      failed: result.data?.failed || 0,
      skipped: result.data?.skipped || 0,
      recipientOverflowCount: overflow,
      message: result.data?.skipped === 'not_pivot' ? 'not_pivot' : null,
    },
  };
}

const EVENT_DISCOVERY_DEFINITION_SPEC = Object.freeze({
  definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
  handlerKey: EVENT_DISCOVERY_HANDLER_KEY,
  tenantKey: '',
  enabled: false,
  scheduleCron: EVENT_DISCOVERY_CRON,
  copyTitleKey: NOTIFICATION_COPY_KEYS.definition.title,
  copyBodyKey: NOTIFICATION_COPY_KEYS.definition.body,
  triggerConfig: { on: 'catalog_publish', debounce: 'user_day' },
  rules: defaultNotificationRules(EVENT_DISCOVERY_HANDLER_KEY),
});

async function ensureEventDiscoveryDefinition(req) {
  registerEventDiscoveryEnqueueHandler();
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(
    jobReq,
    'MeridianNotificationDefinition',
  );
  const existing = await MeridianNotificationDefinition.findOne({
    definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
    tenantKey: '',
  });
  if (existing) return alignDaytimeCheckCron(existing);
  try {
    return await MeridianNotificationDefinition.create({ ...EVENT_DISCOVERY_DEFINITION_SPEC });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return MeridianNotificationDefinition.findOne({
      definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
      tenantKey: '',
    });
  }
}

/**
 * Catalog-publish hook. Enqueues at most one run per user per local day when the
 * fleet definition (or tenant override) is enabled. Failures never throw to ingest.
 */
async function enqueueEventDiscoveryOnCatalogPublish(req, {
  tenantKey,
  batchWeek = null,
  userIds = null,
  now = new Date(),
} = {}) {
  try {
    registerEventDiscoveryEnqueueHandler();
    const key = String(tenantKey || '').trim().toLowerCase();
    if (!key) return { skipped: 'tenantKey_required', enqueued: [] };

    await ensureEventDiscoveryDefinition(req);
    const enabled = await isEventDiscoveryEnabled(req, key);
    if (!enabled) {
      return { skipped: 'definition_disabled', enqueued: [] };
    }
    const jobReq = await resolveJobReq(req);
    const { MeridianNotificationDefinition } = getGlobalModels(
      jobReq,
      'MeridianNotificationDefinition',
    );
    const definition = await MeridianNotificationDefinition.findOne({
      definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
      tenantKey: '',
    }).lean();
    const tenantForMode = await getTenantByKey(jobReq, key);
    const override = Array.isArray(tenantForMode?.meridianNotificationOverrides)
      ? tenantForMode.meridianNotificationOverrides.find(
        (row) => row?.definitionKey === EVENT_DISCOVERY_DEFINITION_KEY,
      )
      : null;
    const triggerConfig = override && override.triggerConfig !== undefined
      ? override.triggerConfig
      : definition?.triggerConfig;
    if (resolveNotificationCheckConfig(triggerConfig).discovery.on === 'schedule') {
      return { skipped: 'schedule_only', enqueued: [] };
    }

    const tenant = await getTenantByKey(req, key);
    const dayBucket = discoveryDayBucket(now, tenant?.pivotDropTimezone || 'UTC');
    const { enqueueMeridianJob } = require('../meridianJobEnqueueService');

    const targets = Array.isArray(userIds) && userIds.length
      ? userIds.map((userId) => String(userId || '').trim()).filter(Boolean)
      : [null];

    const enqueued = [];
    for (const userId of targets) {
      const result = await enqueueMeridianJob(req, {
        handlerKey: EVENT_DISCOVERY_HANDLER_KEY,
        tenantKey: key,
        scheduledFor: now,
        payload: {
          definitionKey: EVENT_DISCOVERY_DEFINITION_KEY,
          dayBucket,
          batchWeek,
          userId,
          trigger: 'catalog_publish',
          triggerConfig,
        },
      });
      enqueued.push({
        userId,
        created: result.created,
        runKey: result.run?.runKey || null,
        runId: result.run?._id ? String(result.run._id) : null,
      });
    }
    return { skipped: null, dayBucket, enqueued };
  } catch (error) {
    console.error('[event_discovery] catalog publish enqueue failed', error);
    return { skipped: 'error', error: error?.message || String(error), enqueued: [] };
  }
}

function registerEventDiscoveryEnqueueHandler() {
  if (getMeridianJobHandler(EVENT_DISCOVERY_HANDLER_KEY)) {
    return getMeridianJobHandler(EVENT_DISCOVERY_HANDLER_KEY);
  }
  return registerMeridianJobHandler(EVENT_DISCOVERY_HANDLER_KEY, {
    category: 'notification',
    buildRunKey: buildEventDiscoveryRunKey,
    execute: executeEventDiscovery,
  });
}

registerEventDiscoveryEnqueueHandler();

module.exports = {
  EVENT_DISCOVERY_HANDLER_KEY,
  EVENT_DISCOVERY_DEFINITION_KEY,
  EVENT_DISCOVERY_CRON,
  EVENT_DISCOVERY_DEFINITION_SPEC,
  discoveryDayBucket,
  buildEventDiscoveryRunKey,
  isEventDiscoveryEnabled,
  sendEventDiscoveryPushesForTenant,
  executeEventDiscovery,
  ensureEventDiscoveryDefinition,
  enqueueEventDiscoveryOnCatalogPublish,
  registerEventDiscoveryEnqueueHandler,
};
