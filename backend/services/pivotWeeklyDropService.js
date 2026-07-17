const axios = require('axios');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey, upsertStoredTenantRow, serializeTenantForAdmin } = require('./tenantConfigService');
const { normalizePivotDropFields, normalizePivotDropOverrides } = require('../constants/defaultTenants');
const { isValidIsoWeek, toIsoWeek } = require('../utilities/pivotIsoWeek');
const { buildDropSchedulePayload } = require('./pivotConfigService');
const { rebuildWeeklySnapshot } = require('./pivotWeeklySnapshotService');
const {
  DAY_NAMES,
  isPivotTenant,
} = require('../utilities/pivotDropSchedule');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const DROP_WINDOW_MS = 30 * 60 * 1000;

const PUSH_TITLE = 'just go*';
const PUSH_BODY = 'What are you doing this week? Just go.';
const PUSH_TITLE_MAX = 100;
const PUSH_BODY_MAX = 240;

function trimPushField(value, maxLength) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function resolveWeeklyDropPushCopy(tenant, batchWeek, options = {}) {
  const override = Array.isArray(tenant?.pivotDropOverrides)
    ? tenant.pivotDropOverrides.find((row) => row?.batchWeek === batchWeek)
    : null;

  const title =
    trimPushField(options.pushTitle, PUSH_TITLE_MAX) ||
    trimPushField(override?.pushTitle, PUSH_TITLE_MAX) ||
    trimPushField(tenant?.pivotDropPushTitle, PUSH_TITLE_MAX) ||
    PUSH_TITLE;

  const body =
    trimPushField(options.pushBody, PUSH_BODY_MAX) ||
    trimPushField(override?.pushBody, PUSH_BODY_MAX) ||
    trimPushField(tenant?.pivotDropPushBody, PUSH_BODY_MAX) ||
    PUSH_BODY;

  let source = 'default';
  if (trimPushField(options.pushTitle, PUSH_TITLE_MAX) || trimPushField(options.pushBody, PUSH_BODY_MAX)) {
    source = 'send';
  } else if (
    trimPushField(override?.pushTitle, PUSH_TITLE_MAX) ||
    trimPushField(override?.pushBody, PUSH_BODY_MAX)
  ) {
    source = 'override';
  } else if (
    trimPushField(tenant?.pivotDropPushTitle, PUSH_TITLE_MAX) ||
    trimPushField(tenant?.pivotDropPushBody, PUSH_BODY_MAX)
  ) {
    source = 'tenant';
  }

  return { title, body, source };
}

function buildWeeklyDropPushMessage(pushToken, batchWeek, copy = {}) {
  const title =
    trimPushField(copy.title, PUSH_TITLE_MAX) ||
    trimPushField(copy.pushTitle, PUSH_TITLE_MAX) ||
    PUSH_TITLE;
  const body =
    trimPushField(copy.body, PUSH_BODY_MAX) ||
    trimPushField(copy.pushBody, PUSH_BODY_MAX) ||
    PUSH_BODY;
  return {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: {
      type: 'pivot_week',
      edition: 'pivot',
      appEdition: 'pivot',
      batchWeek,
      navigation: {
        type: 'navigate',
        route: 'PivotWeek',
        deepLink: 'meridian://pivot/week',
      },
    },
    priority: 'default',
    channelId: 'default',
  };
}

async function countPublishedEvents(tenantKey, batchWeek) {
  const db = await connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { Event } = getModels(req, 'Event');
  return Event.countDocuments({
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  });
}

async function countPivotPushRecipients(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User } = getModels(req, 'User');
  return User.countDocuments({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  });
}

async function loadPivotPushRecipients(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User } = getModels(req, 'User');
  return User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken')
    .lean();
}

function validateDropConfigPayload(body = {}) {
  const patch = {};
  normalizePivotDropFields(body, patch);

  const pushTitle = trimPushField(body.pivotDropPushTitle, PUSH_TITLE_MAX);
  if (body.pivotDropPushTitle !== undefined) {
    patch.pivotDropPushTitle = pushTitle || undefined;
  }
  const pushBody = trimPushField(body.pivotDropPushBody, PUSH_BODY_MAX);
  if (body.pivotDropPushBody !== undefined) {
    patch.pivotDropPushBody = pushBody || undefined;
  }

  if (body.pivotDropOverrides !== undefined) {
    const overrides = normalizePivotDropOverrides(body.pivotDropOverrides);
    patch.pivotDropOverrides = overrides || [];
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'No drop schedule fields provided.' };
  }

  if (patch.pivotDropTimezone !== undefined && !patch.pivotDropTimezone) {
    return { error: 'pivotDropTimezone cannot be empty.' };
  }

  return { patch };
}

function serializeDropSchedule(tenant, batchWeek, now = new Date()) {
  const dropSchedule = buildDropSchedulePayload(tenant, batchWeek, now);
  const deltaMs = Math.abs(now.getTime() - new Date(dropSchedule.nextDropAt).getTime());
  const pushCopy = resolveWeeklyDropPushCopy(tenant, batchWeek);

  return {
    ...dropSchedule,
    minutesFromDropAt: Math.round(deltaMs / 60000),
    withinDropWindow: deltaMs <= DROP_WINDOW_MS,
    pushCopy: {
      title: pushCopy.title,
      body: pushCopy.body,
      source: pushCopy.source,
    },
  };
}

async function getWeeklyDropStatus(req, tenantKey, batchWeekInput) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const batchWeek = batchWeekInput || toIsoWeek();
  if (!isValidIsoWeek(batchWeek)) {
    return { status: 400, error: 'batchWeek must be YYYY-Www.' };
  }

  const [publishedEventCount, pivotPushRecipientCount] = await Promise.all([
    countPublishedEvents(tenantKey, batchWeek),
    countPivotPushRecipients(tenantKey),
  ]);

  return {
    tenant: serializeTenantForAdmin(tenant),
    dropSchedule: serializeDropSchedule(tenant, batchWeek),
    publishedEventCount,
    pivotPushRecipientCount,
    dayNames: DAY_NAMES,
  };
}

async function updateWeeklyDropConfig(req, tenantKey, body, updatedBy) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const validation = validateDropConfigPayload(body);
  if (validation.error) {
    return { status: 400, error: validation.error };
  }

  const saved = await upsertStoredTenantRow(
    req,
    {
      ...tenant,
      ...validation.patch,
    },
    updatedBy
  );

  const batchWeek = isValidIsoWeek(body.batchWeek) ? body.batchWeek.trim() : toIsoWeek();
  return {
    tenant: serializeTenantForAdmin(saved),
    dropSchedule: serializeDropSchedule(saved, batchWeek),
  };
}

async function sendExpoBatch(messages) {
  const response = await axios.post(EXPO_PUSH_URL, messages, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
  });

  const tickets = Array.isArray(response.data?.data)
    ? response.data.data
    : [response.data?.data].filter(Boolean);

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const ticket of tickets) {
    if (ticket?.status === 'ok') {
      sent += 1;
    } else {
      failed += 1;
      if (ticket?.message) errors.push(ticket.message);
    }
  }

  return { sent, failed, errors };
}

async function sendWeeklyDropPush(req, tenantKey, options = {}) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const batchWeek = options.batchWeek || toIsoWeek();
  if (!isValidIsoWeek(batchWeek)) {
    return { status: 400, error: 'batchWeek must be YYYY-Www.' };
  }

  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const now = new Date();
  const dropSchedule = serializeDropSchedule(tenant, batchWeek, now);
  const pushCopy = resolveWeeklyDropPushCopy(tenant, batchWeek, {
    pushTitle: options.pushTitle,
    pushBody: options.pushBody,
  });
  const publishedEventCount = await countPublishedEvents(tenantKey, batchWeek);
  const recipients = await loadPivotPushRecipients(tenantKey);

  const warnings = [];
  if (dropSchedule.usingPilotDefaults) {
    warnings.push(
      'Tenant has no stored weekly drop config — using pilot defaults (Thu 18:00 America/New_York).'
    );
  }
  if (publishedEventCount === 0) {
    warnings.push(`No published catalog events for ${batchWeek}. Publish in Pivot Lab first.`);
  }
  if (!force && !dropSchedule.withinDropWindow) {
    warnings.push(
      `Now is ${dropSchedule.minutesFromDropAt} minutes from resolved dropAt. Confirm schedule or use force.`
    );
    if (!dryRun) {
      return {
        status: 409,
        error: 'Outside drop window. Pass force=true to send anyway.',
        code: 'OUTSIDE_DROP_WINDOW',
        data: { dropSchedule, publishedEventCount, pivotPushRecipientCount: recipients.length, warnings },
      };
    }
  }

  const messages = recipients.map((recipient) =>
    buildWeeklyDropPushMessage(recipient.pushToken, batchWeek, pushCopy)
  );

  if (dryRun) {
    return {
      dryRun: true,
      dropSchedule,
      pushCopy,
      publishedEventCount,
      pivotPushRecipientCount: recipients.length,
      warnings,
      sampleMessage: messages[0] || null,
    };
  }

  if (recipients.length === 0) {
    return {
      status: 400,
      error: 'No pivot push tokens found for this city.',
      code: 'NO_RECIPIENTS',
      data: { dropSchedule, publishedEventCount, warnings },
    };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
    const batch = messages.slice(index, index + EXPO_BATCH_SIZE);
    const result = await sendExpoBatch(batch);
    sent += result.sent;
    failed += result.failed;
    errors.push(...result.errors);
  }

  // Best-effort: freeze this week's metrics right after the drop so Lab trends
  // build themselves; a snapshot failure must never mask a successful send.
  let snapshotRebuilt = false;
  try {
    const rebuild = await rebuildWeeklySnapshot(req, { batchWeek });
    snapshotRebuilt = !rebuild.error;
  } catch (error) {
    console.error(
      `[pivotWeeklyDrop] snapshot rebuild failed after send tenant=${tenantKey} batchWeek=${batchWeek}:`,
      error,
    );
  }

  return {
    dryRun: false,
    dropSchedule,
    pushCopy,
    publishedEventCount,
    pivotPushRecipientCount: recipients.length,
    sent,
    failed,
    snapshotRebuilt,
    warnings,
    errors: errors.slice(0, 5),
  };
}

module.exports = {
  PUSH_TITLE,
  PUSH_BODY,
  PUSH_TITLE_MAX,
  PUSH_BODY_MAX,
  DROP_WINDOW_MS,
  resolveWeeklyDropPushCopy,
  buildWeeklyDropPushMessage,
  getWeeklyDropStatus,
  updateWeeklyDropConfig,
  sendWeeklyDropPush,
};
