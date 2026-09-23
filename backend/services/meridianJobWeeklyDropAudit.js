const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { MAX_RUN_RECIPIENTS } = require('../schemas/pivotDropPushRun');

const WEEKLY_DROP_COPY_KEY = 'notifications.weeklyDrop';
const DEV_GATE_ERROR = 'Blocked by development expo push gate (non-admin recipient).';
const DRY_RUN_ERROR = null;

function recipientProduct(user) {
  return user?.pushAppProduct === 'justgo' || user?.pushAppProduct === 'campus'
    ? user.pushAppProduct
    : 'legacy';
}

function userIdString(user) {
  return user?._id?.toString?.() || String(user?._id || '');
}

function weeklyDropCopyKey(message) {
  const variant = message?.data?.crewVariant;
  if (variant) {
    return `${WEEKLY_DROP_COPY_KEY}.${variant}`;
  }
  return WEEKLY_DROP_COPY_KEY;
}

function mapWeeklyDropDeliveryStatus({ blockedDevGate = false, dryRun = false, ticket = null } = {}) {
  if (blockedDevGate) return 'blocked_dev_gate';
  if (dryRun) return 'skipped';
  if (ticket?.status === 'accepted') return 'accepted';
  return 'failed';
}

function buildMeridianWeeklyDropDeliveries({
  runId,
  tenantKey,
  allowedRecipients = [],
  blockedRecipients = [],
  messages = [],
  ticketOutcomes = [],
  dryRun = false,
  sentAt = null,
  baseCopy = {},
} = {}) {
  const rows = [];

  for (const user of blockedRecipients) {
    rows.push({
      runId,
      tenantKey,
      userId: userIdString(user),
      username: user.username || null,
      name: user.name || null,
      product: recipientProduct(user),
      copyKey: WEEKLY_DROP_COPY_KEY,
      title: baseCopy.title || '',
      body: baseCopy.body || '',
      deliveryStatus: 'blocked_dev_gate',
      sentAt: null,
      error: DEV_GATE_ERROR,
    });
  }

  allowedRecipients.forEach((user, index) => {
    const message = messages[index] || {};
    const ticket = ticketOutcomes[index] || null;
    const deliveryStatus = mapWeeklyDropDeliveryStatus({ dryRun, ticket });
    const accepted = deliveryStatus === 'accepted';
    rows.push({
      runId,
      tenantKey,
      userId: userIdString(user),
      username: user.username || null,
      name: user.name || null,
      product: recipientProduct(user),
      copyKey: weeklyDropCopyKey(message),
      title: message.title || baseCopy.title || '',
      body: message.body || baseCopy.body || '',
      deliveryStatus,
      sentAt: accepted || (!dryRun && deliveryStatus === 'failed') ? sentAt : null,
      error: dryRun
        ? DRY_RUN_ERROR
        : (accepted ? null : (ticket?.message || 'Expo rejected this push ticket.')),
    });
  });

  rows.sort((a, b) => {
    const rank = (status) => {
      if (status === 'failed' || status === 'blocked_dev_gate') return 0;
      return 1;
    };
    if (rank(a.deliveryStatus) !== rank(b.deliveryStatus)) {
      return rank(a.deliveryStatus) - rank(b.deliveryStatus);
    }
    const aLabel = (a.name || a.username || a.userId).toLowerCase();
    const bLabel = (b.name || b.username || b.userId).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });

  return rows;
}

function capDeliveryRows(rows, maxRecipients = MAX_RUN_RECIPIENTS) {
  if (!Array.isArray(rows) || rows.length <= maxRecipients) {
    return { deliveries: rows || [], recipientOverflowCount: 0 };
  }
  return {
    deliveries: rows.slice(0, maxRecipients),
    recipientOverflowCount: rows.length - maxRecipients,
  };
}

function zipExpoPushDeliveries({
  recipients = [],
  messages = [],
  tickets = [],
  copyKey,
  dryRun = false,
} = {}) {
  const sentAt = new Date();
  return recipients.map((user, index) => {
    const message = messages[index] || {};
    const ticket = tickets[index] || null;
    const gateBlocked = /development expo push gate/i.test(ticket?.message || '');
    const deliveryStatus = mapWeeklyDropDeliveryStatus({
      blockedDevGate: gateBlocked,
      dryRun,
      ticket,
    });
    const accepted = deliveryStatus === 'accepted';
    return {
      userId: userIdString(user),
      username: user.username || null,
      name: user.name || null,
      product: recipientProduct(user),
      copyKey,
      title: message.title || '',
      body: message.body || '',
      deliveryStatus,
      sentAt: accepted || deliveryStatus === 'failed' ? sentAt : null,
      error: dryRun
        ? DRY_RUN_ERROR
        : (accepted ? null : (ticket?.message || 'Expo rejected this push ticket.')),
    };
  });
}

async function persistMeridianJobDeliveries(req, {
  runId,
  tenantKey,
  deliveries = [],
  summaryMessage = null,
} = {}) {
  if (!runId) return { persisted: 0, recipientOverflowCount: 0 };
  const jobReq = await resolveGlobalJobReq(req);
  const { MeridianJobDelivery, MeridianJobRun } = getGlobalModels(
    jobReq,
    'MeridianJobDelivery',
    'MeridianJobRun',
  );
  const rows = deliveries.map((row) => ({
    runId,
    tenantKey,
    userId: row.userId,
    username: row.username || null,
    name: row.name || null,
    product: row.product || 'legacy',
    copyKey: row.copyKey || null,
    title: row.title || '',
    body: row.body || '',
    deliveryStatus: row.deliveryStatus,
    sentAt: row.sentAt || null,
    error: row.error || null,
  }));
  const capped = capDeliveryRows(rows, MAX_RUN_RECIPIENTS);
  if (capped.deliveries.length) {
    await MeridianJobDelivery.insertMany(capped.deliveries, { ordered: false });
  }
  if (capped.recipientOverflowCount || summaryMessage) {
    await MeridianJobRun.updateOne(
      { _id: runId },
      {
        $set: {
          'summary.recipientOverflowCount': capped.recipientOverflowCount,
          ...(summaryMessage ? { 'summary.message': summaryMessage } : {}),
        },
      },
    );
  }
  return {
    persisted: capped.deliveries.length,
    recipientOverflowCount: capped.recipientOverflowCount,
  };
}

function summarizeDeliveries(rows = [], overflowCount = 0) {
  return rows.reduce(
    (acc, row) => {
      acc.attempted += 1;
      if (row.deliveryStatus === 'accepted') acc.accepted += 1;
      else if (row.deliveryStatus === 'failed') acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    {
      attempted: overflowCount,
      accepted: 0,
      failed: 0,
      skipped: 0,
      recipientOverflowCount: overflowCount,
      message: null,
    },
  );
}

async function resolveGlobalJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function ensureWeeklyDropMeridianRun(jobReq, {
  tenantKey,
  batchWeek,
  dryRun,
  force,
  triggeredBy,
  meridianJobRunId,
  payload = {},
} = {}) {
  const { MeridianJobRun, MeridianJobAttempt } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobAttempt',
  );

  if (meridianJobRunId) {
    const run = await MeridianJobRun.findById(meridianJobRunId);
    return { run, attempt: null, created: false, MeridianJobRun, MeridianJobAttempt };
  }

  const now = new Date();
  const tenant = String(tenantKey || '').trim().toLowerCase();
  const week = batchWeek || 'unknown';
  const dry = dryRun === true ? 'dry:' : '';
  const run = await MeridianJobRun.create({
    runKey: `weekly_drop:${tenant}:${week}:${dry}direct:${new mongoose.Types.ObjectId()}`,
    category: 'notification',
    type: 'weekly_drop',
    tenantKey,
    status: dryRun ? 'preview' : 'running',
    scheduledFor: now,
    nextAttemptAt: now,
    attemptCount: 1,
    payload: {
      batchWeek,
      dryRun: dryRun === true,
      force: force === true,
      triggeredBy: triggeredBy || null,
      ...payload,
    },
    startedAt: now,
  });
  const attempt = await MeridianJobAttempt.create({
    runId: run._id,
    attemptNumber: 1,
    status: 'running',
    startedAt: now,
  });
  return { run, attempt, created: true, MeridianJobRun, MeridianJobAttempt };
}

async function persistWeeklyDropMeridianAudit(req, {
  tenantKey,
  batchWeek,
  dryRun = false,
  force = false,
  triggeredBy = null,
  meridianJobRunId = null,
  pushCopy = {},
  allowedRecipients = [],
  blockedRecipients = [],
  messages = [],
  ticketOutcomes = [],
  pivotDropPushRunId = null,
} = {}) {
  const jobReq = await resolveGlobalJobReq(req);
  const ensured = await ensureWeeklyDropMeridianRun(jobReq, {
    tenantKey,
    batchWeek,
    dryRun,
    force,
    triggeredBy,
    meridianJobRunId,
  });
  if (!ensured.run?._id) {
    throw new Error('Failed to resolve meridian job run for weekly drop audit');
  }

  try {
    return await writeWeeklyDropMeridianAudit(jobReq, ensured, {
      tenantKey,
      dryRun,
      sentAt: dryRun ? null : new Date(),
      pushCopy,
      allowedRecipients,
      blockedRecipients,
      messages,
      ticketOutcomes,
      pivotDropPushRunId,
    });
  } catch (error) {
    if (ensured.created && ensured.run?._id) {
      const { MeridianJobRun } = getGlobalModels(jobReq, 'MeridianJobRun');
      await MeridianJobRun.updateOne(
        { _id: ensured.run._id, status: 'running' },
        {
          $set: {
            status: dryRun ? 'preview' : 'succeeded',
            finishedAt: new Date(),
            lastError: String(error?.message || 'audit persist failed').slice(0, 1000),
          },
        },
      ).catch(() => {});
    }
    throw error;
  }
}

async function writeWeeklyDropMeridianAudit(jobReq, ensured, {
  tenantKey,
  dryRun,
  sentAt,
  pushCopy,
  allowedRecipients,
  blockedRecipients,
  messages,
  ticketOutcomes,
  pivotDropPushRunId,
}) {
  const { MeridianJobRun, MeridianJobAttempt } = ensured;
  const { MeridianJobDelivery } = getGlobalModels(jobReq, 'MeridianJobDelivery');

  const allRows = buildMeridianWeeklyDropDeliveries({
    runId: ensured.run._id,
    tenantKey,
    allowedRecipients,
    blockedRecipients,
    messages,
    ticketOutcomes,
    dryRun,
    sentAt,
    baseCopy: pushCopy,
  });
  const capped = capDeliveryRows(allRows, MAX_RUN_RECIPIENTS);
  if (capped.deliveries.length) {
    await MeridianJobDelivery.insertMany(capped.deliveries);
  }

  const summary = summarizeDeliveries(capped.deliveries, capped.recipientOverflowCount);
  if (dryRun) {
    summary.message = 'dry-run';
  }

  const finishedAt = new Date();
  const setFields = {
    summary,
  };
  if (pivotDropPushRunId) {
    setFields.pivotDropPushRunId = pivotDropPushRunId;
  }

  if (ensured.created) {
    setFields.status = dryRun ? 'preview' : 'succeeded';
    setFields.finishedAt = finishedAt;
    setFields.lastError = null;
    if (ensured.attempt?._id) {
      await MeridianJobAttempt.updateOne(
        { _id: ensured.attempt._id },
        { $set: { status: 'succeeded', error: null, finishedAt } },
      );
    }
  }

  await MeridianJobRun.updateOne({ _id: ensured.run._id }, { $set: setFields });

  return {
    meridianJobRunId: ensured.run._id,
    pivotDropPushRunId: pivotDropPushRunId || null,
    recipientOverflowCount: capped.recipientOverflowCount,
    summary,
    deliveryCount: capped.deliveries.length,
  };
}

async function tryPersistWeeklyDropMeridianAudit(req, input) {
  try {
    return await persistWeeklyDropMeridianAudit(req, input);
  } catch (error) {
    console.error(
      '[pivotWeeklyDrop] failed to persist meridian job audit:',
      error?.message || error,
    );
    return null;
  }
}

module.exports = {
  WEEKLY_DROP_COPY_KEY,
  DEV_GATE_ERROR,
  MAX_RUN_RECIPIENTS,
  mapWeeklyDropDeliveryStatus,
  weeklyDropCopyKey,
  buildMeridianWeeklyDropDeliveries,
  capDeliveryRows,
  zipExpoPushDeliveries,
  persistMeridianJobDeliveries,
  persistWeeklyDropMeridianAudit,
  tryPersistWeeklyDropMeridianAudit,
};
