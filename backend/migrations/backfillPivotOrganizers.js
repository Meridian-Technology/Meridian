#!/usr/bin/env node
/**
 * Task 3.3 — organizer identity backfill for one city.
 *
 * Calls the same `runOrganizerBackfill` as the admin POST. Does not
 * re-fetch sourceUrl / Firecrawl. Re-run with --force after merge-rule changes.
 *
 * Usage (from Meridian/backend):
 *   node migrations/backfillPivotOrganizers.js --tenant=nyc
 *   node migrations/backfillPivotOrganizers.js --tenant=nyc --force
 *   npm run backfill:pivot-organizers -- --tenant=nyc
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const { runOrganizerBackfill } = require('../services/pivotOrganizerBackfillService');

const TAG = '[backfill:pivot-organizers]';

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

async function run() {
  const args = parseArgs(process.argv);
  const tenantKey = String(args.values.tenant || '').trim().toLowerCase();
  if (!tenantKey) {
    throw new Error('Pass --tenant=<key> (e.g. --tenant=nyc).');
  }

  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const { syncTenantUriCache, getTenantByKey } = require('../services/tenantConfigService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || tenant.tenantType !== 'pivot') {
    throw new Error(`No pivot tenant "${tenantKey}". Pass --tenant=<key>.`);
  }

  const db = await connectToDatabase(tenantKey);
  const force = args.flags.has('force');
  console.log(`${TAG} tenant=${tenantKey} force=${force}`);

  const result = await runOrganizerBackfill({ db, tenantKey, force });
  console.log(`${TAG} scanned=${result.scanned} linked=${result.linked} skipped=${result.skipped}`);
  console.log(
    `${TAG} ambiguous=${result.ambiguous} unlinked=${result.unlinked} createdOrganizers=${result.createdOrganizers}`,
  );
  return result;
}

if (require.main === module) {
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
}

module.exports = { run };
