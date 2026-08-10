#!/usr/bin/env node
/**
 * Send the manual Pivot weekly drop push for a city tenant.
 *
 * Usage (from Meridian/backend):
 *   npm run send:pivot-weekly-push -- --tenantKey=nyc --batchWeek=2026-W22
 *   npm run send:pivot-weekly-push -- --tenantKey=nyc --dry-run
 *   npm run send:pivot-weekly-push -- --tenantKey=nyc --force
 *   npm run send:pivot-weekly-push -- --tenantKey=nyc --pushTitle="Iowa City" --pushBody="Your week is live"
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const axios = require('axios');
const mongoose = require('mongoose');
const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
const tenantConfigSchema = require('../schemas/tenantConfig');
const { getMergedTenants } = require('../services/tenantConfigService');
const getModels = require('../services/getModelService');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  describePivotDropSchedule,
  isPivotTenant,
  resolvePivotDropInstant,
} = require('../utilities/pivotDropSchedule');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const {
  buildWeeklyDropPushMessage,
  resolveWeeklyDropPushCopy,
} = require('../services/pivotWeeklyDropService');

const CONFIG_KEY = 'default';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const DROP_WINDOW_MS = 30 * 60 * 1000;

function readArg(prefix) {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag ? flag.slice(prefix.length + 1) : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function countPublishedEvents(req, batchWeek) {
  const { Event } = getModels(req, 'Event');
  return Event.countDocuments({
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  });
}

async function loadPivotPushRecipients(req) {
  const { User } = getModels(req, 'User');
  return User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken')
    .lean();
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

  let ok = 0;
  let errors = 0;
  for (const ticket of tickets) {
    if (ticket?.status === 'ok') {
      ok += 1;
    } else {
      errors += 1;
      if (ticket?.message) {
        console.warn(`[send:pivot-weekly-push] Expo ticket error: ${ticket.message}`);
      }
    }
  }

  return { ok, errors, tickets };
}

async function sendAllMessages(messages) {
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
    const batch = messages.slice(index, index + EXPO_BATCH_SIZE);
    const result = await sendExpoBatch(batch);
    sent += result.ok;
    failed += result.errors;
  }

  return { sent, failed };
}

async function run() {
  const tenantKey = readArg('--tenantKey');
  const batchWeek = readArg('--batchWeek') || toIsoWeek();
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const pushTitle = readArg('--pushTitle');
  const pushBody = readArg('--pushBody');

  if (!tenantKey) {
    throw new Error('Missing required flag --tenantKey=<city>');
  }
  if (!isValidIsoWeek(batchWeek)) {
    throw new Error(`Invalid --batchWeek "${batchWeek}" — expected YYYY-Www`);
  }

  const globalDb = await connectToGlobalDatabase();
  globalDb.model('TenantConfig', tenantConfigSchema, 'tenant_configs');
  const req = { globalDb, school: 'www' };
  const tenants = await getMergedTenants(req);
  const tenant = tenants.find((row) => row.tenantKey === tenantKey);

  if (!tenant) {
    throw new Error(`Unknown tenantKey "${tenantKey}"`);
  }
  if (!isPivotTenant(tenant)) {
    throw new Error(`Tenant "${tenantKey}" is not a pivot city`);
  }

  const resolved = resolvePivotDropInstant(tenant, batchWeek);
  const schedule = describePivotDropSchedule(resolved);
  const now = new Date();
  const deltaMs = Math.abs(now.getTime() - resolved.dropAt.getTime());

  console.log(`[send:pivot-weekly-push] tenantKey=${tenantKey} batchWeek=${batchWeek}`);
  console.log(
    `[send:pivot-weekly-push] Next drop (${schedule.sourceLabel}): ${schedule.formatted} (${schedule.localTime})`
  );
  console.log(`[send:pivot-weekly-push] Resolved dropAt UTC: ${resolved.dropAt.toISOString()}`);

  if (resolved.usingPilotDefaults) {
    console.warn(
      '[send:pivot-weekly-push] WARNING: tenant has no stored weekly drop config — using pilot defaults (Thu 18:00 America/New_York). Set fields in Platform Admin before production drops.'
    );
  }

  const tenantDb = await connectToDatabase(tenantKey);
  const tenantReq = { db: tenantDb, school: tenantKey };
  const publishedCount = await countPublishedEvents(tenantReq, batchWeek);
  console.log(
    `[send:pivot-weekly-push] Published catalog events for ${batchWeek}: ${publishedCount}`
  );

  if (publishedCount === 0) {
    console.warn(
      `[send:pivot-weekly-push] WARNING: no published events for ${batchWeek}. Publish the catalog in Pivot Lab before sending the drop push.`
    );
  }

  if (!force && deltaMs > DROP_WINDOW_MS) {
    const minutesAway = Math.round(deltaMs / 60000);
    console.warn(
      `[send:pivot-weekly-push] WARNING: now is ${minutesAway} minutes from resolved dropAt. Re-check Platform Admin / Pivot Lab "Next drop" or pass --force to send anyway.`
    );
    if (!dryRun) {
      throw new Error('Aborting send — outside drop window (use --force to override).');
    }
  }

  const recipients = await loadPivotPushRecipients(tenantReq);
  console.log(
    `[send:pivot-weekly-push] Pivot push recipients (pushAppEdition=pivot): ${recipients.length}`
  );

  if (recipients.length === 0) {
    console.warn('[send:pivot-weekly-push] No pivot push tokens found — nothing to send.');
    return;
  }

  const pushCopy = resolveWeeklyDropPushCopy(tenant, batchWeek, { pushTitle, pushBody });
  const messages = recipients.map((recipient) =>
    buildWeeklyDropPushMessage(recipient.pushToken, batchWeek, pushCopy)
  );

  if (dryRun) {
    console.log('[send:pivot-weekly-push] dry-run — would send:');
    console.log(
      JSON.stringify(
        {
          title: pushCopy.title,
          body: pushCopy.body,
          recipientCount: messages.length,
          sample: messages[0],
        },
        null,
        2
      )
    );
    return;
  }

  const { sent, failed } = await sendAllMessages(messages);
  console.log(`[send:pivot-weekly-push] sent=${sent} failed=${failed}`);

  // Freeze this week's Lab metrics now that the drop went out (best-effort).
  try {
    const { rebuildWeeklySnapshot } = require('../services/pivotWeeklySnapshotService');
    const rebuild = await rebuildWeeklySnapshot(req, { batchWeek });
    if (rebuild.error) {
      console.warn(`[send:pivot-weekly-push] snapshot rebuild skipped: ${rebuild.error}`);
    } else {
      console.log(`[send:pivot-weekly-push] weekly snapshot rebuilt for ${batchWeek}`);
    }
  } catch (error) {
    console.warn(
      `[send:pivot-weekly-push] snapshot rebuild failed (send already completed): ${error.message}`
    );
  }
}

run()
  .catch((error) => {
    console.error('[send:pivot-weekly-push] failed', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
