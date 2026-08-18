#!/usr/bin/env node
/**
 * Task 3.1 — read-only overlap measurement for native (Luma/Partiful) vs
 * generic-site venue events. Uses the same duplicate index ingest already runs.
 *
 * Usage (from Meridian/backend):
 *   node migrations/measurePivotNativeVenueOverlap.js --tenant=sf
 *   node migrations/measurePivotNativeVenueOverlap.js --tenant=nyc
 *
 * Writes nothing. Prints catalog counts plus recent discovery / curation-run
 * stats so a hybrid run can be inspected without spending Firecrawl credits.
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const TAG = '[measure:native-venue-overlap]';

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} };
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    if (value === undefined) args.flags.add(key);
    else args.values[key] = value;
  }
  return args;
}

function printSamples(label, rows) {
  if (!rows?.length) return;
  console.log(`  ${label}:`);
  for (const row of rows.slice(0, 8)) {
    if (Array.isArray(row)) {
      const parts = row.map((item) => `${item.sourceFamily}:${item.name}`).join(' ↔ ');
      console.log(`    · ${parts}`);
      continue;
    }
    const extra = row.existingName
      ? ` → ${row.existingName} (${row.existingSource || row.matchType})`
      : row.nativeName
        ? ` ~ ${row.nativeName} (${row.nativeSource})`
        : '';
    console.log(`    · ${row.name || '—'}${extra}`);
  }
}

async function loadRecentRuns(req, tenantKey) {
  const getGlobalModels = require('../services/getGlobalModelService');
  const { PivotSourceDiscoveryRun, PivotCurationRun } = getGlobalModels(
    req,
    'PivotSourceDiscoveryRun',
    'PivotCurationRun',
  );

  const discovery = await PivotSourceDiscoveryRun.find({
    tenantKey,
    kind: { $in: ['discovery', null] },
    rehearsal: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('status plan counters startedAt finishedAt actor')
    .lean();

  const curation = await PivotCurationRun.find({ tenantKey })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('provider status stats url startedAt finishedAt')
    .lean();

  return { discovery, curation };
}

function summarizeCurationByProvider(runs) {
  const byProvider = {};
  for (const run of runs) {
    const provider = run.provider || 'unknown';
    if (!byProvider[provider]) {
      byProvider[provider] = {
        runs: 0,
        upserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        updatedBySourceUrl: 0,
        updatedByFingerprint: 0,
        updatedByShowtime: 0,
        updatedBySimilarity: 0,
        showtimesRolledUp: 0,
      };
    }
    const row = byProvider[provider];
    row.runs += 1;
    row.upserted += run.stats?.upserted || 0;
    row.updated += run.stats?.updated || 0;
    row.skipped += run.stats?.skipped || 0;
    row.failed += run.stats?.failed || 0;
    row.updatedBySourceUrl += run.stats?.updatedBySourceUrl || 0;
    row.updatedByFingerprint += run.stats?.updatedByFingerprint || 0;
    row.updatedByShowtime += run.stats?.updatedByShowtime || 0;
    row.updatedBySimilarity += run.stats?.updatedBySimilarity || 0;
    row.showtimesRolledUp += run.stats?.showtimesRolledUp || 0;
  }
  return byProvider;
}

async function run() {
  const args = parseArgs(process.argv);
  const tenantKey = String(args.values.tenant || 'sf').trim().toLowerCase();

  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const { syncTenantUriCache, getTenantByKey } = require('../services/tenantConfigService');
  const { measureTenantNativeVenueOverlap } = require('../services/pivotIngestDuplicateService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || tenant.tenantType !== 'pivot') {
    throw new Error(`No pivot tenant "${tenantKey}". Pass --tenant=<key>.`);
  }

  await connectToDatabase(tenantKey);

  console.log(`\n${TAG} tenant=${tenantKey} city="${tenant.location || tenant.name || '—'}"\n`);

  const overlap = await measureTenantNativeVenueOverlap(tenantKey);

  console.log('Catalog (live Event documents with customFields.pivot)');
  console.log(`  total:        ${overlap.total}`);
  console.log(`  by family:    ${JSON.stringify(overlap.byFamily)}`);
  console.log(`  native:       ${overlap.native} (luma + partiful)`);
  console.log(`  generic-site: ${overlap.genericSite}`);
  console.log('');
  console.log('What the current deduper would do if venue rows were ingested after native');
  console.log(`  sourceUrl match (update):    ${overlap.wouldMatchNative.sourceUrl}`);
  console.log(`  fingerprint match (update):  ${overlap.wouldMatchNative.fingerprint}`);
  console.log(`  showtime match (merge slots): ${overlap.wouldMatchNative.showtime || 0}`);
  console.log(`  similarity match (merge):    ${overlap.wouldMatchNative.similarity || 0}`);
  console.log(`  no match:                    ${overlap.wouldMatchNative.none}`);
  console.log(`  venue URL is luma/partiful:  ${overlap.venueWithNativeUrlCount}`);
  console.log(`  surviving mixed fingerprint: ${overlap.survivingMixedFingerprintPairs} (two catalog rows for the same night)`);
  console.log(`  title+day near-miss:         ${overlap.nearMissCount} (same title and day, fuzzy still said no)`);
  console.log(`  split showtime groups:       ${overlap.splitShowtimeGroupCount || 0} (same title+venue+day, different times, still separate rows)`);

  printSamples('sourceUrl matches', overlap.wouldMatchSamples.sourceUrl);
  printSamples('fingerprint matches', overlap.wouldMatchSamples.fingerprint);
  printSamples('showtime matches', overlap.wouldMatchSamples.showtime);
  printSamples('similarity matches', overlap.wouldMatchSamples.similarity);
  printSamples('venue rows with native URLs', overlap.venueWithNativeUrlSamples);
  printSamples('surviving mixed pairs', overlap.survivingMixedFingerprintSamples);
  printSamples('title+day near-misses', overlap.nearMissSamples);

  const { discovery, curation } = await loadRecentRuns(req, tenantKey);

  console.log('\nRecent discovery runs (non-rehearsal)');
  if (!discovery.length) {
    console.log('  none');
  } else {
    for (const runDoc of discovery) {
      const counters = runDoc.counters || {};
      const plan = runDoc.plan || {};
      console.log(
        `  ${runDoc.startedAt?.toISOString?.() || runDoc.startedAt}  ${runDoc.status}` +
          `  flow=${plan.flow || '—'}  native=${plan.runNative ? 'yes' : 'no'}` +
          `  firecrawl=${plan.runFirecrawl === false ? 'no' : 'yes'}`,
      );
      console.log(
        `    upserted=${counters.eventsUpserted || 0}  updated=${counters.eventsUpdated || 0}` +
          `  fingerprint=${counters.eventsUpdatedByFingerprint || 0}` +
          `  skipped=${counters.eventsSkipped || 0}  failed=${counters.eventsFailed || 0}` +
          `  searches=${counters.searches || 0}  scrapes=${counters.scrapes || 0}`,
      );
    }
  }

  const byProvider = summarizeCurationByProvider(curation);
  console.log('\nRecent curation runs by provider (last 30)');
  const providers = Object.keys(byProvider);
  if (!providers.length) {
    console.log('  none');
  } else {
    for (const provider of providers) {
      const row = byProvider[provider];
      console.log(
        `  ${provider.padEnd(14)} runs=${row.runs}  upserted=${row.upserted}` +
          `  updated=${row.updated}  skipped=${row.skipped}  failed=${row.failed}` +
          `  bySourceUrl=${row.updatedBySourceUrl}  byFingerprint=${row.updatedByFingerprint}` +
          `  byShowtime=${row.updatedByShowtime || 0}  bySimilarity=${row.updatedBySimilarity || 0}` +
          `  rolledShowtimes=${row.showtimesRolledUp || 0}`,
      );
    }
  }

  console.log('');
}

run()
  .catch((error) => {
    console.error(`${TAG} failed:`, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await require('mongoose').disconnect();
    } catch {
      // Connections are per-tenant createConnection handles; ignore close races.
    }
    process.exit();
  });
