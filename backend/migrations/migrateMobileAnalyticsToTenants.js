#!/usr/bin/env node
/**
 * Move phone analytics out of the platform database into the city database
 * they belong to. Web events stay put.
 *
 * An event moves when its tenantKey names a known city, or when its user
 * belongs to exactly one city. Anonymous events and users in several cities
 * stay on the platform database and are counted in the summary.
 *
 * From Meridian/backend:
 *   node migrations/migrateMobileAnalyticsToTenants.js --dry-run
 *   node migrations/migrateMobileAnalyticsToTenants.js
 *   npm run migrate:mobile-analytics -- --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const {
  MOBILE_PLATFORMS,
  resolveMobileAnalyticsTenant,
  prepareMigratedAnalyticsEvent,
  eventIdsSafeToRemove,
} = require('../services/mobileAnalyticsMigration');

const TAG = '[migrate:mobile-analytics]';
const BATCH = 200;

function parseArgs(argv) {
  const flags = new Set();
  for (const raw of argv.slice(2)) {
    if (raw.startsWith('--')) flags.add(raw.slice(2));
  }
  return { dryRun: flags.has('dry-run') };
}

function emptyCounts() {
  return { tenantKey: 0, membership: 0, ambiguous: 0, unassigned: 0, moved: 0 };
}

async function cityModels(connectToDatabase, getModels, tenantKey, cache) {
  if (cache.has(tenantKey)) return cache.get(tenantKey);
  const db = await connectToDatabase(tenantKey);
  const { AnalyticsEvent } = getModels({ db, school: tenantKey }, 'AnalyticsEvent');
  cache.set(tenantKey, AnalyticsEvent);
  return AnalyticsEvent;
}

async function flushBatch(PlatformAnalytics, CityAnalytics, docs, dryRun) {
  if (!docs.length) return 0;
  if (dryRun) return docs.length;
  let error = null;
  try {
    await CityAnalytics.insertMany(docs, { ordered: false });
  } catch (insertError) {
    error = insertError;
    if (!insertError.writeErrors) throw insertError;
  }
  const eventIds = eventIdsSafeToRemove(docs, error);
  if (!eventIds.length) return 0;
  await PlatformAnalytics.deleteMany({ event_id: { $in: eventIds } });
  return eventIds.length;
}

async function run() {
  const { dryRun } = parseArgs(process.argv);
  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const getGlobalModels = require('../services/getGlobalModelService');
  const getModels = require('../services/getModelService');
  const { syncTenantUriCache, getMergedTenants } = require('../services/tenantConfigService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);
  const tenants = await getMergedTenants(req);
  const tenantKeys = new Set(tenants.map((tenant) => tenant.tenantKey));

  const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
  const { AnalyticsEvent: platformAnalytics } = getModels(
    { db: globalDb, school: 'www' },
    'AnalyticsEvent',
  );

  const memberships = await TenantMembership.find({ status: { $ne: 'left' } })
    .select('tenantUserId tenantKey')
    .lean();

  const membershipsByUser = new Map();
  for (const row of memberships) {
    if (!row.tenantUserId || !row.tenantKey) continue;
    const userId = String(row.tenantUserId);
    const list = membershipsByUser.get(userId) || [];
    list.push(String(row.tenantKey).toLowerCase());
    membershipsByUser.set(userId, list);
  }

  const counts = emptyCounts();
  const byCity = new Map();
  const cache = new Map();
  const buffers = new Map();

  const cursor = platformAnalytics
    .find({ platform: { $in: MOBILE_PLATFORMS } })
    .lean()
    .cursor();

  async function flush(tenantKey) {
    const docs = buffers.get(tenantKey) || [];
    if (!docs.length) return;
    buffers.set(tenantKey, []);
    const city = await cityModels(connectToDatabase, getModels, tenantKey, cache);
    const moved = await flushBatch(platformAnalytics, city, docs, dryRun);
    counts.moved += moved;
  }

  for await (const event of cursor) {
    const decision = resolveMobileAnalyticsTenant(event, { tenantKeys, membershipsByUser });
    counts[decision.reason] += 1;
    if (!decision.tenantKey) continue;
    byCity.set(decision.tenantKey, (byCity.get(decision.tenantKey) || 0) + 1);
    const bucket = buffers.get(decision.tenantKey) || [];
    bucket.push(prepareMigratedAnalyticsEvent(event, decision.tenantKey));
    buffers.set(decision.tenantKey, bucket);
    if (bucket.length >= BATCH) await flush(decision.tenantKey);
  }

  for (const tenantKey of buffers.keys()) {
    await flush(tenantKey);
  }

  const mode = dryRun ? 'dry-run' : 'moved';
  console.log(
    `${TAG} ${mode} scanned mobile events: tenantKey=${counts.tenantKey} membership=${counts.membership} ambiguous=${counts.ambiguous} unassigned=${counts.unassigned} ${mode}=${counts.moved}`,
  );
  for (const [tenantKey, count] of [...byCity.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${TAG} ${mode} ${tenantKey}: ${count}`);
  }
  if (counts.ambiguous || counts.unassigned) {
    console.log(
      `${TAG} left ${counts.ambiguous + counts.unassigned} mobile events on the platform database (no single city).`,
    );
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

module.exports = { run, flushBatch };
