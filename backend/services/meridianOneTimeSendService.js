const crypto = require('crypto');
const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { getTenantByKey } = require('./tenantConfigService');
const { enqueueMeridianJob } = require('./meridianJobEnqueueService');
const { definitionAdminError } = require('./meridianNotificationDefinitionService');
const {
  recipientFingerprint,
  quietHoursStatus,
  dedupePeople,
} = require('./meridianNotificationEligibilityService');
const {
  SCHEDULED_PUSH_HANDLER_KEY,
  sendScheduledPushForTenant,
} = require('./meridianJobHandlers/scheduledPush');
const { isPivotTenant, resolvePivotLiveBatchWeek, PIVOT_DROP_PILOT_DEFAULTS } = require('../utilities/pivotDropSchedule');
const { validateRules } = require('../utilities/meridianNotificationRules');

const TITLE_MAX = 100;
const BODY_MAX = 240;
const LABEL_MAX = 80;
const MAX_LEAD_MS = 60 * 24 * 60 * 60 * 1000;
const PAST_GRACE_MS = 60 * 1000;
const NO_QUIET_HOURS = Object.freeze({ startHour: 0, endHour: 0 });

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function trimmed(value) {
  return String(value ?? '').trim();
}

/** Validates the draft once so preview and send agree on what is being sent. */
function normalizeDraft(body = {}, now = new Date()) {
  const title = trimmed(body.title);
  const message = trimmed(body.body);
  const label = trimmed(body.label);
  if (!message) throw definitionAdminError('Write a message', 'ONE_TIME_BODY_REQUIRED');
  if (message.length > BODY_MAX) {
    throw definitionAdminError(`Keep the message to ${BODY_MAX} characters`, 'ONE_TIME_BODY_TOO_LONG');
  }
  if (title.length > TITLE_MAX) {
    throw definitionAdminError(`Keep the title to ${TITLE_MAX} characters`, 'ONE_TIME_TITLE_TOO_LONG');
  }
  if (label.length > LABEL_MAX) {
    throw definitionAdminError(`Keep the name to ${LABEL_MAX} characters`, 'ONE_TIME_LABEL_TOO_LONG');
  }
  const rules = validateRules(SCHEDULED_PUSH_HANDLER_KEY, body.rules ?? []);
  if (rules.error) throw definitionAdminError(rules.error, 'INVALID_RULES');

  let sendAt = null;
  if (body.sendAt) {
    const parsed = new Date(body.sendAt);
    if (Number.isNaN(parsed.getTime())) {
      throw definitionAdminError('Pick a valid send time', 'ONE_TIME_SEND_AT_INVALID');
    }
    if (parsed.getTime() < now.getTime() - PAST_GRACE_MS) {
      throw definitionAdminError('That send time has already passed', 'ONE_TIME_SEND_AT_PAST');
    }
    if (parsed.getTime() > now.getTime() + MAX_LEAD_MS) {
      throw definitionAdminError('Schedule one-time sends at most 60 days ahead', 'ONE_TIME_SEND_AT_TOO_FAR');
    }
    sendAt = parsed > now ? parsed : null;
  }
  return { title: title || null, body: message, label: label || null, rules: rules.rules, sendAt };
}

/** Recipients plus everything else the sender approves: message and send time. */
function draftFingerprint(recipientPrint, draft) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([
      recipientPrint,
      draft.title,
      draft.body,
      draft.sendAt ? draft.sendAt.toISOString() : 'now',
    ]))
    .digest('hex')
    .slice(0, 16);
}

async function requirePivotTenant(jobReq, tenantKey) {
  const key = trimmed(tenantKey).toLowerCase();
  const tenant = key ? await getTenantByKey(jobReq, key) : null;
  if (!tenant || !isPivotTenant(tenant)) {
    throw definitionAdminError(`${key || 'That city'} isn't a Just Go city`, 'ONE_TIME_CITY_NOT_ALLOWED');
  }
  return tenant;
}

async function previewCity(jobReq, tenant, draft, now) {
  const result = await sendScheduledPushForTenant(jobReq, {
    tenantKey: tenant.tenantKey,
    rules: draft.rules,
    copyTitleFallback: draft.title,
    copyBodyFallback: draft.body,
    now: draft.sendAt || now,
    eligibilityOnly: true,
  });
  if (result?.error) {
    throw definitionAdminError(result.error, result.code || 'ELIGIBILITY_FAILED', result.status || 400);
  }
  const data = result?.data || {};
  const people = dedupePeople(data.people || []);
  const preview = {
    tenantKey: tenant.tenantKey,
    batchWeek: data.batchWeek || null,
    count: Number.isFinite(data.eligible) ? data.eligible : people.length,
    overflow: data.overflow || 0,
    people,
  };
  return {
    ...preview,
    fingerprint: draftFingerprint(recipientFingerprint(preview), draft),
    quietHours: await quietHoursStatus(jobReq, tenant.tenantKey, {}, draft.sendAt || now),
    sendAt: draft.sendAt ? draft.sendAt.toISOString() : null,
  };
}

async function previewOneTimeSend(req, body = {}, { now = new Date() } = {}) {
  const jobReq = await resolveJobReq(req);
  const draft = normalizeDraft(body, now);
  const tenant = await requirePivotTenant(jobReq, body.tenantKey);
  return previewCity(jobReq, tenant, draft, now);
}

function recipientsChanged(changed) {
  const error = definitionAdminError(
    'Who would get this changed since you reviewed it. Review the new list before sending.',
    'RECIPIENTS_CHANGED',
    409,
  );
  error.details = { cities: changed };
  return error;
}

/**
 * Queues one run per city for exactly the people the sender reviewed. Those
 * people are written as pending deliveries, so a later send can't pick up
 * anyone new and the run page shows who is lined up.
 */
async function sendOneTime(req, body = {}, { now = new Date(), triggeredBy = null } = {}) {
  const jobReq = await resolveJobReq(req);
  const draft = normalizeDraft(body, now);
  const cities = Array.isArray(body.cities) ? body.cities : [];
  if (!cities.length) throw definitionAdminError('Pick at least one city', 'SEND_NOW_CITIES_REQUIRED');

  const checked = [];
  const changed = [];
  const seen = new Set();
  for (const row of cities) {
    const tenant = await requirePivotTenant(jobReq, row?.tenantKey);
    if (seen.has(tenant.tenantKey)) continue;
    seen.add(tenant.tenantKey);
    const preview = await previewCity(jobReq, tenant, draft, now);
    if (!row?.fingerprint || preview.fingerprint !== row.fingerprint) changed.push(preview);
    checked.push({ tenant, preview });
  }
  if (changed.length) throw recipientsChanged(changed);

  const oneTimeId = new mongoose.Types.ObjectId().toString();
  const scheduledFor = draft.sendAt || now;
  // Parked until its recipients are written, so the worker can't claim it early.
  const parkedUntil = new Date(now.getTime() + MAX_LEAD_MS * 2);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );
  const runs = [];
  for (const { tenant, preview } of checked) {
    const timezone = trimmed(tenant.pivotDropTimezone) || PIVOT_DROP_PILOT_DEFAULTS.pivotDropTimezone;
    const result = await enqueueMeridianJob(jobReq, {
      handlerKey: SCHEDULED_PUSH_HANDLER_KEY,
      tenantKey: tenant.tenantKey,
      scheduledFor: parkedUntil,
      payload: {
        definitionKey: null,
        oneTime: true,
        oneTimeId,
        label: draft.label,
        copyTitleFallback: draft.title,
        copyBodyFallback: draft.body,
        rules: draft.rules,
        frozenRecipients: true,
        batchWeek: resolvePivotLiveBatchWeek(tenant, scheduledFor),
        triggerConfig: body.ignoreQuietHours === true ? { quietHours: { ...NO_QUIET_HOURS } } : {},
        timeBucket: `once-${oneTimeId}`,
        timezone,
        triggeredBy,
      },
    });
    if (result.created && preview.people.length) {
      await MeridianJobDelivery.insertMany(preview.people.map((person) => ({
        runId: result.run._id,
        tenantKey: tenant.tenantKey,
        userId: person.userId,
        username: person.username || null,
        name: person.name || null,
        product: 'legacy',
        title: draft.title || '',
        body: draft.body,
        deliveryStatus: 'pending',
      })));
    }
    if (result.created) {
      await MeridianJobRun.updateOne(
        { _id: result.run._id, status: 'pending' },
        { $set: { scheduledFor, nextAttemptAt: scheduledFor } },
      );
    }
    runs.push({
      tenantKey: tenant.tenantKey,
      created: result.created,
      runId: result.run?._id ? String(result.run._id) : null,
      status: 'pending',
      scheduledFor: scheduledFor.toISOString(),
    });
  }
  return { oneTimeId, sendAt: draft.sendAt ? draft.sendAt.toISOString() : null, runs };
}

async function listOneTimeSends(req, { limit = 30 } = {}) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun } = getGlobalModels(jobReq, 'MeridianJobRun');
  const rows = await MeridianJobRun.find({ type: SCHEDULED_PUSH_HANDLER_KEY, 'payload.oneTime': true })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 30, 1), 100) * 10)
    .lean();
  const byId = new Map();
  for (const run of rows) {
    const id = run.payload?.oneTimeId;
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        oneTimeId: id,
        label: run.payload.label || null,
        title: run.payload.copyTitleFallback || null,
        body: run.payload.copyBodyFallback || '',
        scheduledFor: run.scheduledFor || null,
        createdAt: run.createdAt || null,
        runs: [],
      });
    }
    byId.get(id).runs.push({
      runId: String(run._id),
      tenantKey: run.tenantKey,
      status: run.status,
      summary: run.summary || null,
      lastError: run.lastError || null,
    });
  }
  return [...byId.values()].slice(0, Number(limit) || 30);
}

async function cancelOneTimeSend(req, oneTimeId, { cancelledBy = null } = {}) {
  const id = trimmed(oneTimeId);
  if (!/^[a-f0-9]{24}$/i.test(id)) throw definitionAdminError('Unknown one-time send', 'ONE_TIME_NOT_FOUND', 404);
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(jobReq, 'MeridianJobRun', 'MeridianJobDelivery');
  const pending = await MeridianJobRun.find({
    type: SCHEDULED_PUSH_HANDLER_KEY,
    'payload.oneTimeId': id,
    status: 'pending',
  }).select('_id').lean();
  if (!pending.length) {
    const any = await MeridianJobRun.exists({ type: SCHEDULED_PUSH_HANDLER_KEY, 'payload.oneTimeId': id });
    if (!any) throw definitionAdminError('Unknown one-time send', 'ONE_TIME_NOT_FOUND', 404);
    throw definitionAdminError('This send already started, so it can no longer be cancelled', 'ONE_TIME_ALREADY_STARTED', 409);
  }
  const finishedAt = new Date();
  const cancelled = [];
  for (const { _id } of pending) {
    const update = await MeridianJobRun.updateOne(
      { _id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          finishedAt,
          summary: {
            attempted: 0,
            accepted: 0,
            failed: 0,
            skipped: 0,
            recipientOverflowCount: 0,
            message: 'cancelled',
          },
          'payload.cancelledBy': cancelledBy,
        },
      },
    );
    if (update.modifiedCount) {
      cancelled.push(String(_id));
      await MeridianJobDelivery.updateMany(
        { runId: _id, deliveryStatus: 'pending' },
        { $set: { deliveryStatus: 'skipped', error: 'Cancelled before it sent.' } },
      );
    }
  }
  return { oneTimeId: id, cancelled };
}

module.exports = {
  normalizeDraft,
  previewOneTimeSend,
  sendOneTime,
  listOneTimeSends,
  cancelOneTimeSend,
};
