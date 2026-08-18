#!/usr/bin/env node
/**
 * Task 0.2 — read-only cluster report on existing `customFields.pivot.host.name`.
 *
 * Groups catalog events by raw display host and the shared Task 3.1
 * normalizer (`utilities/pivotOrganizerName`) so we can size auto-match vs
 * review load. Writes no organizer ids.
 *
 * Usage (from Meridian/backend):
 *   node migrations/clusterPivotHostNames.js --tenant=nyc
 *   node migrations/clusterPivotHostNames.js --tenant=sf --out=./tmp/host-clusters-sf.json
 *   npm run cluster:pivot-host-names -- --tenant=nyc
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  normalizeOrganizerName,
  looksLikeJoinedMultiHost,
} = require('../utilities/pivotOrganizerName');

const TAG = '[cluster:pivot-host-names]';
const DEFAULT_TOP_N = 25;

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

function emptyBucket() {
  return {
    eventCount: 0,
    batchWeeks: new Set(),
    sources: new Set(),
    rawNames: new Set(),
    withProfileUrl: 0,
    withImageUrl: 0,
    multiHost: 0,
  };
}

function toSortedList(set) {
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function summarizeBucket(bucket) {
  return {
    eventCount: bucket.eventCount,
    distinctBatchWeeks: bucket.batchWeeks.size,
    batchWeeks: toSortedList(bucket.batchWeeks),
    sources: toSortedList(bucket.sources),
    rawNames: toSortedList(bucket.rawNames),
    withProfileUrl: bucket.withProfileUrl,
    withImageUrl: bucket.withImageUrl,
    multiHost: bucket.multiHost,
  };
}

function clusterHostNames(events) {
  const raw = new Map();
  const normalized = new Map();
  let withProfileUrl = 0;
  let withImageUrl = 0;
  let multiHost = 0;
  let missingName = 0;

  for (const event of events) {
    const pivot = event.customFields?.pivot || {};
    const host = pivot.host || {};
    const rawName = typeof host.name === 'string' ? host.name.trim() : '';
    if (!rawName) {
      missingName += 1;
      continue;
    }

    const hasProfile = Boolean(typeof host.profileUrl === 'string' && host.profileUrl.trim());
    const hasImage = Boolean(typeof host.imageUrl === 'string' && host.imageUrl.trim());
    const isMulti = looksLikeJoinedMultiHost(rawName);
    if (hasProfile) withProfileUrl += 1;
    if (hasImage) withImageUrl += 1;
    if (isMulti) multiHost += 1;

    const source = typeof pivot.source === 'string' ? pivot.source.trim() : '';
    const week = typeof pivot.batchWeek === 'string' ? pivot.batchWeek.trim() : '';
    const folded = normalizeOrganizerName(rawName);

    if (!raw.has(rawName)) raw.set(rawName, emptyBucket());
    const rawBucket = raw.get(rawName);
    rawBucket.eventCount += 1;
    if (week) rawBucket.batchWeeks.add(week);
    if (source) rawBucket.sources.add(source);
    rawBucket.rawNames.add(rawName);
    if (hasProfile) rawBucket.withProfileUrl += 1;
    if (hasImage) rawBucket.withImageUrl += 1;
    if (isMulti) rawBucket.multiHost += 1;

    const normKey = folded || '(empty-normalized)';
    if (!normalized.has(normKey)) normalized.set(normKey, emptyBucket());
    const normBucket = normalized.get(normKey);
    normBucket.eventCount += 1;
    if (week) normBucket.batchWeeks.add(week);
    if (source) normBucket.sources.add(source);
    normBucket.rawNames.add(rawName);
    if (hasProfile) normBucket.withProfileUrl += 1;
    if (hasImage) normBucket.withImageUrl += 1;
    if (isMulti) normBucket.multiHost += 1;
  }

  const collisions = [...normalized.entries()]
    .filter(([, bucket]) => bucket.rawNames.size > 1)
    .map(([normalizedName, bucket]) => ({
      normalizedName,
      ...summarizeBucket(bucket),
    }))
    .sort((a, b) => b.eventCount - a.eventCount);

  const topRaw = [...raw.entries()]
    .map(([name, bucket]) => ({ name, ...summarizeBucket(bucket) }))
    .sort((a, b) => b.eventCount - a.eventCount);

  const topNormalized = [...normalized.entries()]
    .map(([name, bucket]) => ({ name, ...summarizeBucket(bucket) }))
    .sort((a, b) => b.eventCount - a.eventCount);

  return {
    scanned: events.length,
    withHostName: events.length - missingName,
    missingHostName: missingName,
    uniqueRaw: raw.size,
    uniqueNormalized: normalized.size,
    collisions: collisions.length,
    profileUrlCoverage: events.length ? withProfileUrl / events.length : 0,
    imageUrlCoverage: events.length ? withImageUrl / events.length : 0,
    withProfileUrl,
    withImageUrl,
    multiHost,
    collisionRows: collisions,
    topRaw,
    topNormalized,
  };
}

function printReport(tenantKey, cityLabel, report, topN) {
  const pct = (count) =>
    report.scanned ? `${((count / report.scanned) * 100).toFixed(1)}%` : '0.0%';

  console.log(`\n${TAG} tenant=${tenantKey} city="${cityLabel}" (read-only)\n`);
  console.log('Catalog events with customFields.pivot');
  console.log(`  scanned:            ${report.scanned}`);
  console.log(`  with host.name:     ${report.withHostName}`);
  console.log(`  missing host.name:  ${report.missingHostName}`);
  console.log(`  unique raw names:   ${report.uniqueRaw}`);
  console.log(`  unique normalized:  ${report.uniqueNormalized}`);
  console.log(`  collisions:         ${report.collisions} (same normalized → multiple raw)`);
  console.log(`  profileUrl present: ${report.withProfileUrl} (${pct(report.withProfileUrl)})`);
  console.log(`  imageUrl present:   ${report.withImageUrl} (${pct(report.withImageUrl)})`);
  console.log(`  joined multi-host:  ${report.multiHost} (name contains " & " or " and ")`);

  console.log(`\nTop ${topN} raw host.name by event count`);
  for (const row of report.topRaw.slice(0, topN)) {
    console.log(
      `  ${String(row.eventCount).padStart(4)}  weeks=${row.distinctBatchWeeks}` +
        `  profile=${row.withProfileUrl}  image=${row.withImageUrl}` +
        `  src=${row.sources.join(',') || '—'}  ${row.name}`,
    );
  }

  if (report.collisionRows.length) {
    console.log('\nNormalized collisions (same folded name, different raw strings)');
    for (const row of report.collisionRows.slice(0, topN)) {
      console.log(
        `  ${row.normalizedName}  events=${row.eventCount}  raw=${JSON.stringify(row.rawNames)}`,
      );
    }
  } else {
    console.log('\nNo normalized collisions.');
  }

  console.log('');
}

async function run() {
  const args = parseArgs(process.argv);
  const tenantKey = String(args.values.tenant || '').trim().toLowerCase();
  if (!tenantKey) {
    throw new Error('Pass --tenant=<key> (e.g. --tenant=nyc).');
  }

  const topN = Math.max(1, Number(args.values.top) || DEFAULT_TOP_N);
  const outPath = args.values.out ? path.resolve(String(args.values.out)) : null;

  const { connectToGlobalDatabase, connectToDatabase } = require('../connectionsManager');
  const { syncTenantUriCache, getTenantByKey } = require('../services/tenantConfigService');
  const getModels = require('../services/getModelService');

  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };
  await syncTenantUriCache(req);

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || tenant.tenantType !== 'pivot') {
    throw new Error(`No pivot tenant "${tenantKey}". Pass --tenant=<key>.`);
  }

  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');

  const events = await Event.find({
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  })
    .select('customFields.pivot.host customFields.pivot.batchWeek customFields.pivot.source')
    .lean();

  const report = clusterHostNames(events);
  const cityLabel = tenant.location || tenant.name || tenantKey;
  printReport(tenantKey, cityLabel, report, topN);

  const payload = {
    tenantKey,
    cityLabel,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    scanned: report.scanned,
    withHostName: report.withHostName,
    missingHostName: report.missingHostName,
    uniqueRaw: report.uniqueRaw,
    uniqueNormalized: report.uniqueNormalized,
    collisions: report.collisions,
    profileUrlCoverage: Number(report.profileUrlCoverage.toFixed(4)),
    imageUrlCoverage: Number(report.imageUrlCoverage.toFixed(4)),
    withProfileUrl: report.withProfileUrl,
    withImageUrl: report.withImageUrl,
    multiHost: report.multiHost,
    collisionRows: report.collisionRows,
    topRaw: report.topRaw.slice(0, topN),
    topNormalized: report.topNormalized.slice(0, topN),
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`${TAG} wrote ${outPath}`);
  }

  return payload;
}

module.exports = {
  clusterHostNames,
  normalizeOrganizerName,
};

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
