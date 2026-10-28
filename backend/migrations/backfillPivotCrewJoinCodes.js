#!/usr/bin/env node
/**
 * Give every live circle made before join codes its six-character code, so
 * friends can type it in the onboarding journey. New circles get one when
 * they're made, and opening a circle assigns one if it's still missing, so
 * this only saves the wait. Archived circles are left alone.
 *
 * Usage (from Meridian/backend):
 *   node migrations/backfillPivotCrewJoinCodes.js
 *   node migrations/backfillPivotCrewJoinCodes.js --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const TAG = '[backfill:crew-join-codes]';

function parseArgs(argv) {
  const flags = new Set();
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)/.exec(raw);
    if (match) flags.add(match[1]);
  }
  return flags;
}

async function run() {
  const dryRun = parseArgs(process.argv).has('dry-run');
  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const { getMergedTenants, syncTenantUriCache } = require('../services/tenantConfigService');
  const getModels = require('../services/getModelService');
  const { ensureCrewJoinCode } = require('../services/pivotCrewService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb, user: { email: 'migration-backfillPivotCrewJoinCodes' } };
  await syncTenantUriCache(req);

  const tenants = (await getMergedTenants(req)).filter(
    (row) => row.tenantType === 'pivot' || row.pivotPilot === true,
  );
  console.log(`\n${TAG} ${dryRun ? 'DRY RUN — ' : ''}tenants=${tenants.length}\n`);

  for (const tenant of tenants) {
    const tenantKey = tenant.tenantKey;
    const db = await connectToDatabase(tenantKey);
    const { PivotCrew } = getModels({ db, school: tenantKey }, 'PivotCrew');
    // The unique join code index must exist before codes are written. Only
    // creates missing indexes (syncIndexes would also drop unknown ones).
    if (!dryRun) await PivotCrew.createIndexes();

    const missing = await PivotCrew.find({ archivedAt: null, joinCode: null })
      .select('_id joinCode')
      .lean();
    console.log(`  ${tenantKey}: ${missing.length} circle(s) without a code`);
    if (dryRun) continue;

    let assigned = 0;
    for (const crew of missing) {
      if (await ensureCrewJoinCode(PivotCrew, crew)) assigned += 1;
    }
    console.log(`    assigned ${assigned}`);
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
      // Per-tenant connections; ignore close races.
    }
    process.exit();
  });
