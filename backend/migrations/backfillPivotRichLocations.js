#!/usr/bin/env node

require('./ensureBackendNodeModules');
require('dotenv').config();

const { runLocationBackfill } = require('../services/pivotLocationBackfillService');

const TAG = '[backfill:pivot-rich-locations]';

// Dry-run is the default. Historical work is intentionally double-gated:
//   npm run backfill:pivot-rich-locations -- --tenant=nyc --scope=historical \
//     --confirm-live-stable
// Add --apply only after reviewing that output.

function parseArgs(argv) {
  const result = { flags: new Set(), values: {} };
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) continue;
    if (match[2] === undefined) result.flags.add(match[1]);
    else result.values[match[1]] = match[2];
  }
  return result;
}

async function run(argv = process.argv) {
  const args = parseArgs(argv);
  const tenantKey = String(args.values.tenant || '').trim().toLowerCase();
  if (!tenantKey) throw new Error('Pass --tenant=<key> (for example, --tenant=nyc).');

  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const { syncTenantUriCache, getTenantByKey } = require('../services/tenantConfigService');
  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || tenant.tenantType !== 'pivot') {
    throw new Error(`No Just Go tenant "${tenantKey}".`);
  }

  const dryRun = !args.flags.has('apply');
  const db = await connectToDatabase(tenantKey);
  const result = await runLocationBackfill({
    db,
    tenantKey,
    tenant,
    scope: args.values.scope,
    liveCatalogStable: args.flags.has('confirm-live-stable'),
    dryRun,
    batchSize: args.values['batch-size'],
    minIntervalMs: args.values['min-interval-ms'],
    autoApplyConfidence: args.values['auto-confidence'],
    reviewConfidence: args.values['review-confidence'],
    maxProviderOperations: args.values['max-provider-operations'],
    asOf: args.values['as-of'],
  });
  console.log(`${TAG} ${JSON.stringify(result, null, 2)}`);
  if (['paused', 'quota_reached'].includes(result.status)) process.exitCode = 2;
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
        // Tenant connections may already be closed.
      }
    });
}

module.exports = { run, parseArgs };
