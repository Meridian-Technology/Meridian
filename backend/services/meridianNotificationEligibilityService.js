const { listMeridianNotificationDefinitions } = require('./meridianNotificationDefinitionService');
const { sendSoloSwipeRemindersForTenant } = require('./meridianJobHandlers/soloSwipeReminder');
const { sendEventDiscoveryPushesForTenant } = require('./meridianJobHandlers/eventDiscoveryEnqueue');
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

function pickDefinition(definitions, handlerKey, tenantKey) {
  const matches = definitions.filter((row) => row.handlerKey === handlerKey);
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

async function previewNotificationEligibility(req, { handlerKey, tenantKey } = {}) {
  const key = String(handlerKey || '').trim();
  const tenant = String(tenantKey || '').trim().toLowerCase();
  if (!key) {
    throw meridianJobAdminError('handlerKey is required', 'HANDLER_KEY_REQUIRED');
  }
  if (!tenant) {
    throw meridianJobAdminError('tenantKey is required', 'TENANT_KEY_REQUIRED');
  }

  const definitions = await listMeridianNotificationDefinitions(req, { tenantKey: tenant });
  const definition = pickDefinition(definitions, key, tenant);
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

  if (key === 'solo_swipe_reminder') {
    return eligibilityPayload(key, tenant, await sendSoloSwipeRemindersForTenant(req, shared));
  }
  if (key === 'event_discovery') {
    return eligibilityPayload(key, tenant, await sendEventDiscoveryPushesForTenant(req, shared));
  }
  if (key === 'ritual_crew_scan') {
    return eligibilityPayload(key, tenant, await sendCrewUnfinishedSwipeNudgesForTenant(tenantReq, shared));
  }
  if (key === 'ritual_crew_consensus') {
    return eligibilityPayload(key, tenant, await sendPendingConsensusNudgesForTenant(tenantReq, shared));
  }
  if (key === 'weekly_drop') {
    const users = await listWeeklyDropEligibleRecipients(tenant);
    const people = users.slice(0, MAX_RUN_RECIPIENTS).map(publicPerson);
    return {
      handlerKey: key,
      tenantKey: tenant,
      batchWeek: null,
      count: users.length,
      overflow: Math.max(users.length - people.length, 0),
      people,
    };
  }

  throw meridianJobAdminError(
    `${key || 'handler'} has no eligibility preview`,
    'PREVIEW_UNSUPPORTED',
  );
}

module.exports = {
  previewNotificationEligibility,
};
