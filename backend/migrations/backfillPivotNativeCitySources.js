#!/usr/bin/env node
/**
 * Task 3.2 — upsert PivotCitySource rows for existing luma/partiful jobs
 * that were created before bootstrap started writing the registry on reuse.
 *
 * Usage (from Meridian/backend):
 *   node migrations/backfillPivotNativeCitySources.js
 *   node migrations/backfillPivotNativeCitySources.js --dry-run
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const TAG = '[backfill:native-city-sources]';

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
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const { getMergedTenants, syncTenantUriCache } = require('../services/tenantConfigService');
  const getGlobalModels = require('../services/getGlobalModelService');
  const {
    persistBootstrappedSource,
    nativeRegistryHost,
  } = require('../services/pivotSourceDiscoveryService');
  const { isNativeIndexUrl } = require('../utilities/pivotDiscoveryConfig');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb, user: { email: 'migration-backfillPivotNativeCitySources' } };
  await syncTenantUriCache(req);

  const tenants = (await getMergedTenants(req)).filter(
    (row) => row.tenantType === 'pivot' || row.pivotPilot === true,
  );
  const { PivotCurationJob, PivotCitySource } = getGlobalModels(
    req,
    'PivotCurationJob',
    'PivotCitySource',
  );

  console.log(`\n${TAG} ${dryRun ? 'DRY RUN — ' : ''}tenants=${tenants.length}\n`);

  for (const tenant of tenants) {
    const tenantKey = tenant.tenantKey;
    const jobs = await PivotCurationJob.find({
      tenantKey,
      provider: { $in: ['luma', 'partiful'] },
      enabled: { $ne: false },
    }).lean();

    const byHost = new Map();
    for (const job of jobs) {
      const host = nativeRegistryHost(job.provider, job.url);
      if (!host || !job.url) continue;
      const current = byHost.get(host);
      const index = isNativeIndexUrl(job.provider, job.url);
      if (!current || (index && !isNativeIndexUrl(current.provider, current.url))) {
        byHost.set(host, job);
      }
    }

    console.log(`  ${tenantKey}: ${jobs.length} native job(s), ${byHost.size} host(s)`);

    for (const [host, job] of byHost) {
      const lastEventCount = job.lastRunStats?.upserted || 0;
      const spec = {
        provider: job.provider,
        host,
        url: job.url,
        label: job.label || `${job.provider} · ${tenant.location || tenant.name || tenantKey}`,
      };

      if (dryRun) {
        const existing = await PivotCitySource.findOne({ tenantKey, host }).lean();
        console.log(
          `    ${existing ? 'would update' : 'would create'} ${host}  ${spec.url}` +
            `  job=${job._id}  events=${lastEventCount}`,
        );
        continue;
      }

      await persistBootstrappedSource(req, tenantKey, spec, new Date(), job._id, {
        lastEventCount,
      });
      console.log(`    upserted ${host}  ${spec.url}  job=${job._id}  events=${lastEventCount}`);
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
      // Per-tenant connections; ignore close races.
    }
    process.exit();
  });
