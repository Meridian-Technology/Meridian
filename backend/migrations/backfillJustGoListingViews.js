#!/usr/bin/env node
/**
 * Credit Just Go listing page views that were only recorded as
 * `justgo_public_event_view` analytics events, so the creator Insights tab
 * shows them. Scans the platform database and every city database, finds the
 * Just Go city that owns each event, and adds the view there.
 *
 * Safe to re-run, before or after the deploy that makes the page record views
 * itself: each listing replays only analytics events received before its first
 * live view, and only ones a finished run has not replayed. --before=<ISO time>
 * adds a global cutoff. Needs the servers' ANALYTICS_HASH_SECRET, so backfilled
 * visitors match the ones the live page records.
 *
 * From Meridian/backend:
 *   node migrations/backfillJustGoListingViews.js --dry-run
 *   node migrations/backfillJustGoListingViews.js
 *   node migrations/backfillJustGoListingViews.js --env=staging
 *   node migrations/backfillJustGoListingViews.js --before=2026-11-12T00:00:00Z
 *   npm run migrate:justgo-listing-views -- --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const {
  createListingViewBackfill,
  createTenantResolver,
} = require('../services/justGoListingViewBackfill');

const TAG = '[migrate:justgo-listing-views]';

function parseArgs(argv) {
  const flags = new Set();
  let env = 'prod';
  let before = null;
  for (const raw of argv.slice(2)) {
    if (raw.startsWith('--env=')) env = raw.slice('--env='.length) || null;
    else if (raw.startsWith('--before=')) {
      before = new Date(raw.slice('--before='.length));
      if (Number.isNaN(before.getTime())) throw new Error(`Invalid --before: ${raw}`);
    } else if (raw.startsWith('--')) flags.add(raw.slice(2));
  }
  return { dryRun: flags.has('dry-run'), env, before };
}

async function run() {
  const { dryRun, env, before } = parseArgs(process.argv);
  if (!process.env.ANALYTICS_HASH_SECRET) {
    // A fallback key would hash visitors differently from the servers.
    throw new Error('Set ANALYTICS_HASH_SECRET to the servers\' value.');
  }
  const eventAnalyticsSchema = require('../events/schemas/eventAnalytics');
  if (!eventAnalyticsSchema.path('viewHistory')?.schema?.path('sourceEventId')) {
    // An older schema drops sourceEventId on write, and re-runs would then double count.
    throw new Error('backend/events predates viewHistory.sourceEventId; update private-deps.lock first.');
  }

  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const getModels = require('../services/getModelService');
  const { syncTenantUriCache, getMergedTenants } = require('../services/tenantConfigService');
  const { isConfiguredJustGoTenant } = require('../events/contracts/publicEventResolutionPolicy');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);
  const tenants = await getMergedTenants(req);

  const databases = [{ tenantKey: 'www', db: globalDb }];
  for (const tenant of tenants) {
    if (!tenant?.tenantKey || tenant.tenantKey === 'www') continue;
    try {
      databases.push({ tenantKey: tenant.tenantKey, db: await connectToDatabase(tenant.tenantKey) });
    } catch (error) {
      console.warn(`${TAG} skipped ${tenant.tenantKey}: ${error.message}`);
    }
  }
  const byKey = new Map(databases.map((entry) => [entry.tenantKey, entry]));

  const cities = tenants
    .filter(isConfiguredJustGoTenant)
    .filter((tenant) => byKey.has(tenant.tenantKey))
    .map((tenant) => {
      const { db } = byKey.get(tenant.tenantKey);
      const { Event } = getModels({ db, school: tenant.tenantKey }, 'Event');
      return { tenantKey: tenant.tenantKey, Event };
    });
  const resolveTenant = createTenantResolver(cities);
  const eventAnalyticsFor = async (tenantKey) => {
    const { db } = byKey.get(tenantKey);
    return getModels({ db, school: tenantKey }, 'EventAnalytics').EventAnalytics;
  };

  const backfill = createListingViewBackfill({
    resolveTenant, eventAnalyticsFor, dryRun, env, before,
  });
  for (const { tenantKey, db } of databases) {
    const { AnalyticsEvent } = getModels({ db, school: tenantKey }, 'AnalyticsEvent');
    await backfill.replay(AnalyticsEvent);
  }
  await backfill.finish();
  const { counts } = backfill;

  const mode = dryRun ? 'dry-run' : 'done';
  console.log(
    `${TAG} ${mode} env=${env || 'any'} before=${before ? before.toISOString() : 'none'} cities=${cities.length} scanned=${counts.scanned} invalidEventId=${counts.invalidEventId} unresolved=${counts.unresolved} afterLiveViews=${counts.afterLiveViews} alreadyBackfilled=${counts.alreadyBackfilled} afterCutoff=${counts.afterCutoff} recorded=${counts.recorded} alreadyRecorded=${counts.alreadyRecorded}`,
  );
  for (const [tenantKey, count] of Object.entries(counts.byTenant).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${TAG} ${mode} ${tenantKey}: ${count} views`);
  }
  return counts;
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
