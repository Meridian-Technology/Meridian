#!/usr/bin/env node
/**
 * Replace analytics identifiers stored before they were keyed, in the platform
 * database and every city database:
 *
 * - analytics_events.ip_hash (plain SHA-256 of the IP) → keyed hash
 * - QR scan anonymous ids (truncated SHA-256 of IP + user agent) → keyed hash
 * - eventAnalytics.viewHistory: raw IP and user agent removed, raw
 *   `ip-userAgent` anonymous ids → keyed hash
 *
 * Old values are converted to exactly what the servers now write, so unique
 * views and repeat QR scans keep matching. Run it with the same
 * ANALYTICS_HASH_SECRET (or JWT_SECRET) as the servers, after they are
 * deployed. Safe to re-run: keyed values are skipped.
 *
 * It also reports databases whose eventAnalytics.eventId index is not unique.
 * It does not change indexes or merge duplicate documents.
 *
 * From Meridian/backend:
 *   node migrations/scrubAnalyticsIdentifiers.js --dry-run
 *   node migrations/scrubAnalyticsIdentifiers.js
 *   npm run migrate:analytics-identifiers -- --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const {
  emptyCounts,
  scrubAnalyticsIdentifiers,
  checkEventAnalyticsIndex,
} = require('../services/analyticsPrivacyMigration');

const TAG = '[migrate:analytics-identifiers]';

function parseArgs(argv) {
  const flags = new Set();
  for (const raw of argv.slice(2)) {
    if (raw.startsWith('--')) flags.add(raw.slice(2));
  }
  return { dryRun: flags.has('dry-run') };
}

function summary(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(' ');
}

async function run() {
  const { dryRun } = parseArgs(process.argv);
  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const getModels = require('../services/getModelService');
  const { syncTenantUriCache, getMergedTenants } = require('../services/tenantConfigService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);
  const tenants = await getMergedTenants(req);

  const databases = [{ tenantKey: 'www', connect: async () => globalDb }];
  for (const tenant of tenants) {
    if (!tenant?.tenantKey || tenant.tenantKey === 'www') continue;
    databases.push({ tenantKey: tenant.tenantKey, connect: () => connectToDatabase(tenant.tenantKey) });
  }

  const mode = dryRun ? 'dry-run' : 'rewrote';
  const totals = emptyCounts();
  const indexWarnings = [];
  for (const { tenantKey, connect } of databases) {
    let db;
    try {
      db = await connect();
    } catch (error) {
      console.warn(`${TAG} skipped ${tenantKey}: ${error.message}`);
      continue;
    }
    const models = getModels({ db, school: tenantKey }, 'AnalyticsEvent', 'EventAnalytics', 'EventQR');
    const counts = await scrubAnalyticsIdentifiers(models, { dryRun });
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    console.log(`${TAG} ${mode} ${tenantKey}: ${summary(counts)}`);

    const index = await checkEventAnalyticsIndex(models.EventAnalytics);
    if (!index.ok) indexWarnings.push({ tenantKey, ...index });
  }

  console.log(`${TAG} ${mode} total: ${summary(totals)}`);
  for (const warning of indexWarnings) {
    console.warn(
      `${TAG} ${warning.tenantKey}: eventAnalytics.eventId index is not unique (index present=${warning.hasIndex}, eventIds with duplicate documents=${warning.duplicateEventIds}). Concurrent first views can create duplicate documents until it is rebuilt as unique.`,
    );
  }
  if (totals.skippedConcurrentDocs) {
    console.warn(`${TAG} ${totals.skippedConcurrentDocs} documents changed during the run; re-run to finish them.`);
  }
  return { totals, indexWarnings };
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(`${TAG} failed:`, error);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await require('mongoose').disconnect();
      } catch {
        // Per-tenant connections close separately.
      }
      process.exit();
    });
}

module.exports = { run, parseArgs };
