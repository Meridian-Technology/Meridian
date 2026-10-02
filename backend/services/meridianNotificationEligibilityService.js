const crypto = require('crypto');
const { listMeridianNotificationDefinitions } = require('./meridianNotificationDefinitionService');
const { getTenantByKey } = require('./tenantConfigService');
const { getMeridianJobHandler } = require('./meridianJobRegistry');
const { ensureMeridianJobHandlersLoaded } = require('./meridianJobHandlers');
const { resolveAdminEmails } = require('./pivotComputeAdminNotifyService');
const { quietHoursDelayMs, resolveQuietHours } = require('../utilities/meridianQuietHours');
const { PIVOT_DROP_PILOT_DEFAULTS } = require('../utilities/pivotDropSchedule');
const { sendSoloSwipeRemindersForTenant } = require('./meridianJobHandlers/soloSwipeReminder');
const { sendEventDiscoveryPushesForTenant } = require('./meridianJobHandlers/eventDiscoveryEnqueue');
const { sendScheduledPushForTenant } = require('./meridianJobHandlers/scheduledPush');
const {
  sendCrewUnfinishedSwipeNudgesForTenant,
  sendPendingConsensusNudgesForTenant,
} = require('./pivotCrewNudgeService');
const { listWeeklyDropEligibleRecipients } = require('./pivotWeeklyDropService');
const { defaultNotificationRules } = require('../utilities/meridianNotificationRules');
const { MAX_RUN_RECIPIENTS } = require('../schemas/pivotDropPushRun');
const { meridianJobAdminError } = require('./meridianJobAdminService');

function publicPerson(user) {
  const userId = user?.userId || user?._id?.toString?.() || String(user?._id || '');
  return {
    userId: String(userId || ''),
    username: user?.username || null,
    name: user?.name || null,
  };
}

function dedupePeople(people) {
  const seen = new Set();
  const next = [];
  for (const person of people) {
    if (!person.userId || seen.has(person.userId)) continue;
    seen.add(person.userId);
    next.push(person);
  }
  return next;
}

function pickDefinition(definitions, handlerKey, tenantKey, definitionKey) {
  let matches = definitions.filter((row) => row.handlerKey === handlerKey);
  if (definitionKey) {
    const named = matches.filter((row) => row.definitionKey === definitionKey);
    if (named.length) matches = named;
  }
  return matches.find((row) => row.tenantKey === tenantKey) || matches[0] || null;
}

function eligibilityPayload(handlerKey, tenantKey, result) {
  if (result?.error) {
    throw meridianJobAdminError(result.error, result.code || 'ELIGIBILITY_FAILED', result.status || 400);
  }
  const data = result?.data || {};
  const people = dedupePeople(data.people || []);
  return {
    handlerKey,
    tenantKey,
    batchWeek: data.batchWeek || null,
    count: Number.isFinite(data.eligible) ? data.eligible : people.length,
    overflow: data.overflow || 0,
    people,
  };
}

/** Changes whenever the recipient list does, so a send can prove it matches what was reviewed. */
function recipientFingerprint(preview) {
  const ids = (preview.people || []).map((person) => person.userId).sort();
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([preview.count, preview.overflow || 0, ids]))
    .digest('hex')
    .slice(0, 16);
}

async function quietHoursStatus(req, tenantKey, triggerConfig, now = new Date()) {
  const tenant = await getTenantByKey(req, tenantKey);
  const timezone = String(tenant?.pivotDropTimezone || '').trim()
    || PIVOT_DROP_PILOT_DEFAULTS.pivotDropTimezone;
  const delayMs = quietHoursDelayMs(now, timezone, resolveQuietHours(triggerConfig));
  return {
    active: delayMs > 0,
    timezone,
    endsAt: delayMs > 0 ? new Date(now.getTime() + delayMs).toISOString() : null,
  };
}

async function adminEmailEligibility(req, handlerKey) {
  const emails = await resolveAdminEmails(req);
  return {
    handlerKey,
    tenantKey: null,
    batchWeek: null,
    channel: 'email',
    count: emails.length,
    overflow: 0,
    people: emails.map((email) => ({ userId: email, username: null, name: email })),
  };
}

async function previewNotificationEligibility(req, options = {}) {
  const preview = await previewRecipients(req, options);
  const result = { ...preview, fingerprint: recipientFingerprint(preview) };
  if (preview.channel !== 'email' && preview.tenantKey) {
    result.quietHours = await quietHoursStatus(req, preview.tenantKey, preview.triggerConfig);
  }
  delete result.triggerConfig;
  return result;
}

async function previewRecipients(req, { handlerKey, tenantKey, definitionKey } = {}) {
  const key = String(handlerKey || '').trim();
  const tenant = String(tenantKey || '').trim().toLowerCase();
  if (!key) {
    throw meridianJobAdminError('handlerKey is required', 'HANDLER_KEY_REQUIRED');
  }
  ensureMeridianJobHandlersLoaded();
  if (getMeridianJobHandler(key)?.channel === 'email') {
    return adminEmailEligibility(req, key);
  }
  if (!tenant) {
    throw meridianJobAdminError('tenantKey is required', 'TENANT_KEY_REQUIRED');
  }

  const definitions = await listMeridianNotificationDefinitions(req, { tenantKey: tenant });
  const definition = pickDefinition(
    definitions,
    key,
    tenant,
    String(definitionKey || '').trim().toLowerCase(),
  );
  const rules = Array.isArray(definition?.rules)
    ? definition.rules
    : defaultNotificationRules(key);
  const shared = {
    tenantKey: tenant,
    rules,
    triggerConfig: definition?.triggerConfig,
    copyTitleKey: definition?.copyTitleKey,
    copyBodyKey: definition?.copyBodyKey,
    copyTitleFallback: definition?.copyTitleFallback,
    copyBodyFallback: definition?.copyBodyFallback,
    eligibilityOnly: true,
  };
  const tenantReq = { ...req, school: tenant };
  const withTrigger = (preview) => ({ ...preview, triggerConfig: definition?.triggerConfig });

  if (key === 'solo_swipe_reminder') {
    return withTrigger(eligibilityPayload(key, tenant, await sendSoloSwipeRemindersForTenant(req, shared)));
  }
  if (key === 'event_discovery') {
    return withTrigger(eligibilityPayload(key, tenant, await sendEventDiscoveryPushesForTenant(req, shared)));
  }
  if (key === 'scheduled_push') {
    return withTrigger(eligibilityPayload(key, tenant, await sendScheduledPushForTenant(req, {
      ...shared,
      definitionKey: definition?.definitionKey || null,
    })));
  }
  if (key === 'ritual_crew_scan') {
    return withTrigger(eligibilityPayload(
      key,
      tenant,
      await sendCrewUnfinishedSwipeNudgesForTenant(tenantReq, shared),
    ));
  }
  if (key === 'ritual_crew_consensus') {
    return withTrigger(eligibilityPayload(
      key,
      tenant,
      await sendPendingConsensusNudgesForTenant(tenantReq, shared),
    ));
  }
  if (key === 'weekly_drop') {
    const users = await listWeeklyDropEligibleRecipients(tenant);
    const people = users.slice(0, MAX_RUN_RECIPIENTS).map(publicPerson);
    return withTrigger({
      handlerKey: key,
      tenantKey: tenant,
      batchWeek: null,
      count: users.length,
      overflow: Math.max(users.length - people.length, 0),
      people,
    });
  }

  throw meridianJobAdminError(
    `${key || 'handler'} has no eligibility preview`,
    'PREVIEW_UNSUPPORTED',
  );
}

module.exports = {
  previewNotificationEligibility,
  recipientFingerprint,
  quietHoursStatus,
  dedupePeople,
};
