#!/usr/bin/env node
/**
 * Set a Pivot city's drop timezone.
 *
 * `pivotDropTimezone` is load-bearing in two places that both fail quietly when
 * it is wrong or unset: the weekly drop instant, and the `generic-site`
 * extraction prompt that resolves relative listings like "Fri 8pm" to an
 * absolute instant. An unset timezone falls back to UTC during scraping, which
 * silently shifts every relative event time on the page.
 *
 * Usage (from Meridian/backend):
 *   # Show current values.
 *   node migrations/setPivotDropTimezone.js --list
 *
 *   # Set one city.
 *   node migrations/setPivotDropTimezone.js --tenant=ic --timezone=America/Chicago
 *
 *   # Preview without writing.
 *   node migrations/setPivotDropTimezone.js --tenant=ic --timezone=America/Chicago --dry-run
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const {
  getMergedTenants,
  upsertStoredTenantRow,
} = require('../services/tenantConfigService');

const TAG = '[set:pivot-drop-timezone]';

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

function isPivotRow(row) {
  return row?.tenantType === 'pivot' || row?.pivotPilot === true;
}

/** Reject a bad IANA zone here rather than letting it corrupt every scraped date. */
function assertValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`"${timezone}" is not a valid IANA timezone (expected e.g. America/Chicago).`);
  }
}

function describe(tenant) {
  return (
    `  ${tenant.tenantKey.padEnd(14)} ${(tenant.name || '—').padEnd(24)} ` +
    `${(tenant.location || '—').padEnd(28)} tz=${tenant.pivotDropTimezone || 'unset'}`
  );
}

async function run() {
  const args = parseArgs(process.argv);
  const globalDb = await connectToGlobalDatabase();
  const reqLike = { globalDb };

  const tenants = (await getMergedTenants(reqLike)).filter(isPivotRow);

  if (args.flags.has('list') || !args.values.tenant) {
    console.log(`\n${TAG} Pivot tenants\n`);
    tenants.forEach((tenant) => console.log(describe(tenant)));
    if (!args.values.tenant) {
      console.log('\n  Pass --tenant=<key> --timezone=<IANA zone> to set one.\n');
    } else {
      console.log('');
    }
    if (!args.values.tenant) return;
  }

  const tenantKey = String(args.values.tenant).trim().toLowerCase();
  const timezone = args.values.timezone;
  if (!timezone) {
    throw new Error('Pass --timezone=<IANA zone>, e.g. --timezone=America/Chicago');
  }
  assertValidTimezone(timezone);

  const tenant = tenants.find((row) => row.tenantKey === tenantKey);
  if (!tenant) {
    throw new Error(
      `Pivot tenant "${tenantKey}" not found. Known: ${tenants.map((r) => r.tenantKey).join(', ')}`,
    );
  }

  const before = tenant.pivotDropTimezone || 'unset';
  if (before === timezone) {
    console.log(`${TAG} ${tenantKey} already set to ${timezone}; nothing to do.`);
    return;
  }

  if (args.flags.has('dry-run')) {
    console.log(`${TAG} DRY RUN — ${tenantKey}: ${before} → ${timezone} (not written)`);
    return;
  }

  await upsertStoredTenantRow(
    reqLike,
    { ...tenant, pivotDropTimezone: timezone },
    'cli:setPivotDropTimezone',
  );

  const after = (await getMergedTenants(reqLike)).find((row) => row.tenantKey === tenantKey);
  console.log(`${TAG} ${tenantKey}: ${before} → ${after?.pivotDropTimezone || 'unset'}`);

  if (after?.pivotDropTimezone !== timezone) {
    throw new Error('Write did not persist; check tenant config overrides.');
  }
}

run()
  .catch((error) => {
    console.error(`${TAG} failed:`, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
