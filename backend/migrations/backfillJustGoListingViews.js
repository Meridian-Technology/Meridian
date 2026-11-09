#!/usr/bin/env node
/**
 * Credit Just Go listing page views that were only recorded as
 * `justgo_public_event_view` analytics events, so the creator Insights tab
 * shows them. Scans the platform database and every city database, finds the
 * Just Go city that owns each event, and adds the view there.
 *
 * Safe to re-run: each analytics event is recorded at most once. Needs the same
 * ANALYTICS_HASH_SECRET (or JWT_SECRET) as the servers, so backfilled visitors
 * match the ones the live page records.
 *
 * From Meridian/backend:
 *   node migrations/backfillJustGoListingViews.js --dry-run
 *   node migrations/backfillJustGoListingViews.js
 *   node migrations/backfillJustGoListingViews.js --env=staging
 *   npm run migrate:justgo-listing-views -- --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const { analyticsHash } = require('../utilities/analyticsHash');
const {
  emptyBackfillCounts,
  backfillListingViews,
  createTenantResolver,
} = require('../services/justGoListingViewBackfill');

const TAG = '[migrate:justgo-listing-views]';

function parseArgs(argv) {
  const flags = new Set();
  let env = 'prod';
  for (const raw of argv.slice(2)) {
    if (raw.startsWith('--env=')) env = raw.slice('--env='.length) || null;
    else if (raw.startsWith('--')) flags.add(raw.slice(2));
  }
  return { dryRun: flags.has('dry-run'), env };
}

async function run() {
  const { dryRun, env } = parseArgs(process.argv);
  if (!analyticsHash('probe')) {
    throw new Error('No analytics hash key: set ANALYTICS_HASH_SECRET (or JWT_SECRET) to the server value.');
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

  const counts = emptyBackfillCounts();
  for (const { tenantKey, db } of databases) {
    const { AnalyticsEvent } = getModels({ db, school: tenantKey }, 'AnalyticsEvent');
    await backfillListingViews(AnalyticsEvent, {
      resolveTenant, eventAnalyticsFor, dryRun, env, counts,
    });
  }

  const mode = dryRun ? 'dry-run' : 'done';
  console.log(
    `${TAG} ${mode} env=${env || 'any'} cities=${cities.length} scanned=${counts.scanned} invalidEventId=${counts.invalidEventId} unresolved=${counts.unresolved} recorded=${counts.recorded} alreadyRecorded=${counts.alreadyRecorded}`,
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
