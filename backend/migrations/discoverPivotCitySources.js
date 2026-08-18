#!/usr/bin/env node
/**
 * Run autonomous event-source discovery for a Just Go city.
 *
 * Exists so discovery can be exercised without the admin UI or an auth token,
 * and so a real run can be rehearsed before it spends any Firecrawl credits.
 *
 * Usage (from Meridian/backend):
 *   # Inspect the query plan. No DB, no API key, no credits.
 *   node migrations/discoverPivotCitySources.js --city="Iowa City" --plan
 *
 *   # Which cities can I run against?
 *   node migrations/discoverPivotCitySources.js --list-tenants
 *
 *   # Smallest useful real run: one candidate, one category, nothing written
 *   # beyond the registry.
 *   node migrations/discoverPivotCitySources.js --tenant=iowacity \
 *     --tags=live-music --max-candidates=1 --no-jobs --no-ingest
 *
 *   # Full run.
 *   node migrations/discoverPivotCitySources.js --tenant=iowacity
 *
 * Flags:
 *   --city=<name>          Plan-only mode against a literal city name.
 *   --tenant=<key>         Pivot tenantKey to discover for.
 *   --plan                 Print the query plan and exit without spending credits.
 *   --list-tenants         List Pivot tenants and exit.
 *   --tags=a,b             Restrict to these catalog slugs.
 *   --max-queries=<n>      Cap seed queries.
 *   --max-candidates=<n>   Cap hosts qualified (the main cost lever).
 *   --min-events=<n>       Events required to qualify a host.
 *   --no-jobs              Register sources without creating curation jobs.
 *   --no-ingest            Register sources without publishing the events found.
 *   --recheck-rejected     Re-evaluate hosts previously rejected.
 *   --flow=<name>          native-then-firecrawl | native-only | firecrawl-only
 *   --luma-slug=<slug>     City slug for luma.com/{slug}
 *   --partiful-slug=<slug> City slug for partiful.com/explore/{slug}
 */
// Events-Backend schemas are symlinked in and resolve bare imports from their own
// package root, so the module path has to be fixed up before anything pulls the
// tenant-model chain in.
require('./ensureBackendNodeModules');
require('dotenv').config();

// Only the dependency-free pieces load up front. Everything that needs Mongo is
// required inside the branch that uses it, so `--plan` and `--city` stay runnable
// with no database reachable.
const { buildDiscoveryQueries } = require('../constants/pivotDiscoverySeeds');
const { isSiteScrapeConfigured } = require('../services/pivotSiteScrapeService');

const TAG = '[discover:pivot-city-sources]';

let connected = false;

async function connectGlobal() {
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const globalDb = await connectToGlobalDatabase();
  connected = true;
  return globalDb;
}

async function loadPivotTenants(globalDb) {
  const { getMergedTenants } = require('../services/tenantConfigService');
  return (await getMergedTenants({ globalDb })).filter(isPivotRow);
}

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

function numberArg(args, key) {
  const raw = args.values[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function listArg(args, key) {
  const raw = args.values[key];
  if (!raw) return undefined;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function isPivotRow(row) {
  return row?.tenantType === 'pivot' || row?.pivotPilot === true;
}

function printEnhancedPlan(data) {
  const { city, tenantKey, plan } = data;
  console.log(`\n${TAG} discovery plan for "${city}" (${tenantKey})\n`);
  
  // Show flow and configuration
  console.log(`  flow:                 ${plan.flow}`);
  if (plan.lumaSlug) console.log(`  luma slug:            ${plan.lumaSlug}`);
  if (plan.partifulSlug) console.log(`  partiful slug:        ${plan.partifulSlug}`);
  
  // Native sources section
  if (plan.runNative) {
    console.log(`\n  Native sources:`);
    if (plan.nativeJobs && plan.nativeJobs.length > 0) {
      for (const job of plan.nativeJobs) {
        console.log(`    · ${job.provider}: ${job.url}`);
      }
      console.log(`    native jobs:          ${plan.nativeJobs.length}`);
    } else {
      console.log(`    (no native sources configured)`);
    }
    
    if (plan.nativeWarning) {
      console.log(`\n  Warning: ${plan.nativeWarning}`);
    }
  } else {
    console.log(`\n  Native sources:       skipped (${plan.flow})`);
  }
  
  // Firecrawl section  
  if (plan.runFirecrawl) {
    console.log(`\n  Firecrawl search:`);
    console.log(`    queries:              ${plan.queries}`);
    console.log(`    categories covered:   ${plan.categories}`);
    console.log(`    max candidates:       ${plan.maxCandidates}`);
  } else {
    console.log(`\n  Firecrawl search:     skipped (${plan.flow})`);
  }
  
  // Credit calculation
  console.log(`\n  max outbound calls:   ${plan.maxOutboundCalls}`);
  
  if (plan.maxOutboundCalls === 0) {
    console.log(`\n  No Firecrawl credits required for this plan.`);
  } else {
    console.log(
      `\n  Upper bound, not a prediction: one search per query, then at most a map\n` +
        `  plus a qualifying scrape for each candidate that clears the filters.\n` +
        `  Native sources use $0 credits.`,
    );
  }
}

function printResult(data) {
  console.log(`\n${TAG} ${data.city} (${data.tenantKey})\n`);
  console.log(`  queries run:          ${data.queries}`);
  console.log(`  candidate hosts:      ${data.candidates.found}`);
  console.log(`    already known:      ${data.candidates.skippedKnown}`);
  console.log(`    filtered out:       ${data.candidates.skippedNonSource}`);
  console.log(`    evaluated:          ${data.candidates.evaluated}`);
  console.log(
    `  calls:                ${data.calls.searches} search, ` +
      `${data.calls.maps} map, ${data.calls.scrapes} scrape`,
  );
  if (data.events) {
    console.log(
      `  events published:     ${data.events.upserted} added, ` +
        `${data.events.skipped} already listed, ${data.events.failed} failed` +
        `${data.batchWeek ? `  (fallback week ${data.batchWeek})` : ''}`,
    );
  }
  if (data.nativeJobIds?.length) {
    console.log(
      `  queued for crawl:     ${data.nativeJobIds.length} native source(s) — ` +
        'parsed directly, so their events arrive on a follow-up batch',
    );
  }

  if (data.qualified.length) {
    console.log(`\n  QUALIFIED (${data.qualified.length})`);
    for (const source of data.qualified) {
      const tags = source.seedTags.length ? source.seedTags.join(', ') : '—';
      console.log(`    ✓ ${source.host}  [${source.provider}]  events=${source.lastEventCount}`);
      console.log(`      ${source.url}`);
      console.log(`      tags: ${tags}${source.curationJobId ? `  job: ${source.curationJobId}` : ''}`);
    }
  } else {
    console.log('\n  QUALIFIED (0)');
  }

  if (data.rejected.length) {
    console.log(`\n  REJECTED (${data.rejected.length})`);
    for (const source of data.rejected) {
      console.log(`    ✗ ${source.host}  ${source.rejectedReason}`);
    }
  }

  if (data.aborted) {
    console.log(`\n  ABORTED: ${data.aborted.code} — ${data.aborted.error}`);
    console.log('  Remaining candidates were skipped rather than retried.');
  }

  if (data.failures.length) {
    console.log(`\n  non-fatal failures (${data.failures.length}):`);
    for (const failure of data.failures.slice(0, 10)) {
      console.log(`    · ${failure.code || 'UNKNOWN'}: ${failure.error}`);
    }
  }

  console.log('');
}

async function run() {
  const args = parseArgs(process.argv);
  const maxCandidates = numberArg(args, 'max-candidates') ?? 20;
  const tags = listArg(args, 'tags');
  const maxQueries = numberArg(args, 'max-queries');

  // Plan-only against a literal city needs neither a database nor an API key,
  // which makes it the cheapest way to sanity-check seed coverage.
  const literalCity = args.values.city;
  if (literalCity && !args.values.tenant) {
    const queries = buildDiscoveryQueries({ city: literalCity, tags, maxQueries });
    if (!queries.length) {
      throw new Error('No queries built. Check --city and --tags.');
    }
    printPlan(literalCity, queries, maxCandidates);
    return;
  }

  const globalDb = await connectGlobal();

  if (args.flags.has('list-tenants')) {
    const tenants = await loadPivotTenants(globalDb);
    console.log(`\n${TAG} Pivot tenants\n`);
    if (!tenants.length) {
      console.log('  none configured — add a tenant with tenantType "pivot" first.\n');
      return;
    }
    for (const tenant of tenants) {
      console.log(
        `  ${tenant.tenantKey.padEnd(14)} ${(tenant.name || '—').padEnd(24)} ` +
          `${tenant.location || '—'}  tz=${tenant.pivotDropTimezone || 'unset'}`,
      );
    }
    console.log('');
    return;
  }

  const tenantKey = args.values.tenant;
  if (!tenantKey) {
    throw new Error(
      'Pass --tenant=<key> for a real run, --city="<name>" --plan for a plan, or --list-tenants.',
    );
  }

  if (args.flags.has('plan')) {
    const { previewCitySourceDiscovery } = require('../services/pivotSourceDiscoveryService');
    
    // Use the full preview service to get native + Firecrawl plan
    const planResult = await previewCitySourceDiscovery(
      { params: { tenantKey } }, 
      { 
        tenantKey,
        flow,
        lumaSlug,
        partifulSlug,
        tags, 
        maxQueries, 
        maxCandidates 
      }
    );
    
    if (planResult.error) {
      throw new Error(`Plan failed: ${planResult.error}`);
    }
    
    printEnhancedPlan(planResult.data);
    return;
  }

  const flow = args.values.flow;
  const lumaSlug = args.values['luma-slug'];
  const partifulSlug = args.values['partiful-slug'];

  if (!isSiteScrapeConfigured() && flow !== 'native-only') {
    throw new Error(
      'FIRECRAWL_API_KEY is not set. Every candidate would abort on SITE_SCRAPE_NOT_CONFIGURED.\n' +
        '  Set it in Meridian/backend/.env, use --flow=native-only, or use --plan to inspect the run without spending credits.',
    );
  }

  const { connectToDatabase } = require('../connectionsManager');
  const { discoverCitySources } = require('../services/pivotSourceDiscoveryService');

  const db = await connectToDatabase(tenantKey);
  const reqLike = {
    globalDb,
    db,
    school: tenantKey,
    user: { email: `cli@${tenantKey}.internal` },
  };

  console.log(
    `${TAG} starting — tenant=${tenantKey} max_candidates=${maxCandidates} ` +
      `jobs=${args.flags.has('no-jobs') ? 'off' : 'on'}`,
  );

  const result = await discoverCitySources(reqLike, {
    tenantKey,
    tags,
    maxQueries,
    maxCandidates,
    minEvents: numberArg(args, 'min-events'),
    createJobs: !args.flags.has('no-jobs'),
    ingestEvents: !args.flags.has('no-ingest'),
    recheckRejected: args.flags.has('recheck-rejected'),
    flow,
    lumaSlug,
    partifulSlug,
  });

  if (result.error) {
    throw new Error(`${result.code || 'FAILED'}: ${result.error}`);
  }

  printResult(result.data);
}

run()
  .catch((error) => {
    console.error(`${TAG} failed:`, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (connected) {
      await require('mongoose').disconnect();
    }
  });
