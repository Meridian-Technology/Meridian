#!/usr/bin/env node
/**
 * Import a Pivot JSON event export into a city catalog from the command line.
 *
 * The admin JSON import panel is the normal path. This exists for backfills,
 * where a week that already went out on one environment has to be reproduced on
 * another without clicking the review queue through week by week.
 *
 * Usage (from Meridian/backend):
 *   # Show where every event would land. Writes nothing.
 *   node migrations/importPivotEventsJson.js --tenant=ic --file=week.json --dry-run
 *
 *   # Stage into the review queue, same as the admin panel.
 *   node migrations/importPivotEventsJson.js --tenant=ic --file=week.json
 *
 *   # Backfill a week that already aired: writes published, straight to the feed.
 *   node migrations/importPivotEventsJson.js --tenant=ic --file=week.json --release
 *
 * Flags:
 *   --tenant=<key>       Pivot tenantKey to import into. Required.
 *   --file=<path>        JSON export to read. Repeat the flag for several files.
 *   --dry-run            Print the plan and exit without writing.
 *   --release            Write events as published rather than staged.
 *   --batch-week=<week>  Fallback week for events with no resolvable date.
 *   --force-batch-week   Pin every event to --batch-week whatever its date says.
 *   --imported-by=<who>  Audit stamp on each event. Defaults to pivot-backfill.
 *   --permalinks         Treat each sourceUrl as a single-event permalink.
 *
 * Batch week comes from each event's own start date unless --force-batch-week,
 * so a file labelled as a single week can legitimately span two ISO weeks.
 *
 * These exports cite the venue calendar an event was read off, so one URL is
 * routinely shared by a whole season of listings. Identity is therefore the
 * title/time/location fingerprint, not the URL — otherwise every event from a
 * calendar folds onto one document. Pass --permalinks for feeds where a URL
 * really does identify one event, such as Partiful or Luma exports.
 *
 * Re-running is safe either way: matched events are updated in place.
 */
// Events-Backend schemas are symlinked in and resolve bare imports from their own
// package root, so the module path has to be fixed up before anything pulls the
// tenant-model chain in.
require('./ensureBackendNodeModules');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { resolveEventBatchWeek } = require('../utilities/pivotIsoWeek');

const TAG = '[import:pivot-events-json]';

/**
 * Slugs these exports have used that the catalog spells differently. Kept
 * explicit rather than fuzzy-matched so an unrecognised tag stays a hard error
 * instead of being silently bent onto the nearest neighbour.
 */
const TAG_ALIASES = {
  family: 'family-friendly',
  'sports-and-fitness': 'fitness',
};

let connected = false;

function parseArgs(argv) {
  const args = { flags: new Set(), values: {}, files: [] };
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    if (value === undefined) args.flags.add(key);
    else if (key === 'file') args.files.push(value);
    else args.values[key] = value;
  }
  return args;
}

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Agent exports use placeholder strings such as "BLANK" where an event has no
 * poster. Anything that is not an http(s) URL would render as a broken image,
 * so it is dropped rather than stored.
 */
function resolveImage(raw) {
  const image = trim(raw);
  return /^https?:\/\//i.test(image) ? image : '';
}

function normalizeTimeSlots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slot) => ({
      ...(trim(slot?.id) ? { id: trim(slot.id) } : {}),
      ...(trim(slot?.label) ? { label: trim(slot.label) } : {}),
      start_time: trim(slot?.start_time),
      ...(trim(slot?.end_time) ? { end_time: trim(slot.end_time) } : {}),
    }))
    .filter((slot) => slot.start_time);
}

/**
 * Mirrors the admin panel's entry → overrides mapping so a CLI import and a
 * pasted import produce the same catalog document.
 */
function buildEntry(raw, seenAliases) {
  const timeSlots = normalizeTimeSlots(raw?.timeSlots);
  const startTime = trim(raw?.start_time) || timeSlots[0]?.start_time || '';
  const image = resolveImage(raw?.image);

  const tags = (Array.isArray(raw?.tags) ? raw.tags : []).map((tag) => {
    const slug = trim(tag);
    const alias = TAG_ALIASES[slug];
    if (alias) {
      seenAliases.set(slug, alias);
      return alias;
    }
    return slug;
  });

  const sourceUrl = trim(raw?.sourceUrl) || trim(raw?.url);
  const name = trim(raw?.name);

  const missing = [];
  if (!name) missing.push('name');
  if (!trim(raw?.hostName)) missing.push('hostName');
  if (!trim(raw?.location)) missing.push('location');
  if (!startTime) missing.push('start_time');
  if (!tags.length) missing.push('tags');

  return {
    name,
    missing,
    tags,
    startTime,
    url: sourceUrl || undefined,
    overrides: {
      name,
      hostName: trim(raw?.hostName),
      location: trim(raw?.location),
      ...(startTime ? { start_time: startTime } : {}),
      ...(trim(raw?.end_time) ? { end_time: trim(raw.end_time) } : {}),
      description: trim(raw?.description) || undefined,
      image: image || undefined,
      source: trim(raw?.source) || 'manual',
      sourceUrl: sourceUrl || undefined,
      tags,
      ...(timeSlots.length ? { timeSlots } : {}),
      ...(raw?.movie ? { movie: raw.movie } : {}),
    },
  };
}

function readFileEntries(filePath, seenAliases) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`${resolved} is not valid JSON: ${error.message}`);
  }

  const rawEvents = Array.isArray(parsed)
    ? parsed
    : parsed?.events || parsed?.drafts || parsed?.items;
  if (!Array.isArray(rawEvents) || !rawEvents.length) {
    throw new Error(`${resolved} has no events array.`);
  }

  return {
    label: trim(parsed?.label) || path.basename(resolved),
    file: resolved,
    entries: rawEvents.map((raw) => buildEntry(raw, seenAliases)),
  };
}

function previewWeek(entry, options) {
  const resolved = resolveEventBatchWeek({
    forceBatchWeek: options.forceBatchWeek,
    batchWeek: options.batchWeek,
    startTime: entry.startTime,
    timeSlots: entry.overrides.timeSlots,
  });
  return resolved.batchWeek || `unresolved (${resolved.code})`;
}

function tallyWeeks(entries, options) {
  const weeks = {};
  for (const entry of entries) {
    const week = previewWeek(entry, options);
    weeks[week] = (weeks[week] || 0) + 1;
  }
  return weeks;
}

function printWeeks(weeks, indent = '    ') {
  for (const week of Object.keys(weeks).sort()) {
    console.log(`${indent}${week}  ${weeks[week]}`);
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const tenantKey = trim(args.values.tenant).toLowerCase();
  const dryRun = args.flags.has('dry-run');
  const release = args.flags.has('release');
  const forceBatchWeek = args.flags.has('force-batch-week');
  const batchWeek = trim(args.values['batch-week']) || undefined;
  const sharedSourceUrl = !args.flags.has('permalinks');

  if (!tenantKey) throw new Error('Pass --tenant=<key>.');
  if (!args.files.length) throw new Error('Pass at least one --file=<path>.');
  if (forceBatchWeek && !batchWeek) {
    throw new Error('--force-batch-week needs --batch-week=<week>.');
  }

  const seenAliases = new Map();
  const files = args.files.map((file) => readFileEntries(file, seenAliases));
  const entries = files.flatMap((file) => file.entries);
  const weekOptions = { forceBatchWeek, batchWeek };

  console.log(`\n${TAG} ${tenantKey} — ${entries.length} event(s) from ${files.length} file(s)\n`);
  for (const file of files) {
    console.log(`  ${file.label}  (${file.entries.length})`);
    printWeeks(tallyWeeks(file.entries, weekOptions), '      ');
  }

  console.log('\n  combined');
  printWeeks(tallyWeeks(entries, weekOptions), '      ');

  if (seenAliases.size) {
    console.log('\n  tag remaps');
    for (const [from, to] of seenAliases) console.log(`      ${from} → ${to}`);
  }

  // Identity is the fingerprint, so two rows sharing one would silently collapse
  // into a single document the way a shared listing URL used to.
  const { buildEventFingerprint } = require('../services/pivotIngestDuplicateService');
  const byFingerprint = new Map();
  for (const entry of entries) {
    const fingerprint = buildEventFingerprint({
      name: entry.overrides.name,
      start_time: entry.startTime,
      location: entry.overrides.location,
    });
    if (!fingerprint) continue;
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, []);
    byFingerprint.get(fingerprint).push(entry.name);
  }
  const collisions = [...byFingerprint.values()].filter((names) => names.length > 1);
  if (collisions.length) {
    console.log(`\n  COLLIDING (${collisions.length}) — same title, time, and location`);
    for (const names of collisions.slice(0, 10)) console.log(`      · ${names.join(' || ')}`);
    throw new Error('Rows above would overwrite each other. Disambiguate them first.');
  }

  const incomplete = entries.filter((entry) => entry.missing.length);
  if (incomplete.length) {
    console.log(`\n  INCOMPLETE (${incomplete.length}) — these would be rejected`);
    for (const entry of incomplete.slice(0, 10)) {
      console.log(`      · ${entry.name || '(unnamed)'} — missing ${entry.missing.join(', ')}`);
    }
    throw new Error('Fix the incomplete events above, or remove them from the file.');
  }

  const globalDb = await require('../connectionsManager').connectToGlobalDatabase();
  connected = true;
  const db = await require('../connectionsManager').connectToDatabase(tenantKey);
  const reqLike = {
    globalDb,
    db,
    school: tenantKey,
    user: { email: trim(args.values['imported-by']) || 'pivot-backfill' },
  };

  // Validated up front so an unknown slug fails the whole import rather than
  // leaving a week half written.
  const { validatePivotEventTags } = require('../services/pivotTagCatalogService');
  const allTags = [...new Set(entries.flatMap((entry) => entry.tags))];
  const tagResult = await validatePivotEventTags(reqLike, allTags, { required: true });
  if (tagResult.error) {
    throw new Error(`${tagResult.code || 'TAGS_INVALID'}: ${tagResult.error}`);
  }
  console.log(`\n  tags: ${allTags.length} distinct, all in catalog`);
  console.log(`  identity: ${sharedSourceUrl ? 'title + time + location' : 'source URL (permalinks)'}`);
  console.log(`  writes as: ${release ? 'published (live in the feed)' : 'staged (review queue)'}`);

  if (dryRun) {
    console.log(`\n${TAG} dry run — nothing written.\n`);
    return;
  }

  const { publishBatchIngestEvents } = require('../services/pivotIngestPublishService');
  const result = await publishBatchIngestEvents(reqLike, {
    tenantKey,
    batchWeek,
    forceBatchWeek,
    sharedSourceUrl,
    events: entries.map((entry) => ({ url: entry.url, overrides: entry.overrides })),
    ...(release ? { releaseNow: true, confirm: 'RELEASE_NOW' } : {}),
  });

  if (result.error && !result.data?.published?.length) {
    throw new Error(`${result.code || 'IMPORT_FAILED'}: ${result.error}`);
  }

  const data = result.data;
  const created = Math.max((data.publishedCount || 0) - (data.updatedCount || 0), 0);

  console.log(`\n${TAG} done\n`);
  console.log(`  created:  ${created}`);
  console.log(`  updated:  ${data.updatedCount || 0}`);
  console.log(`  failed:   ${data.failedCount || 0}`);
  console.log(`  status:   ${data.ingestStatus}`);
  console.log('\n  by week');
  printWeeks(data.batchWeekCounts || {}, '      ');

  if (data.failures?.length) {
    console.log(`\n  failures (${data.failures.length})`);
    for (const failure of data.failures.slice(0, 10)) {
      console.log(`      · ${failure.code || 'UNKNOWN'}: ${failure.message}`);
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
    if (connected) {
      await require('mongoose').disconnect();
    }
  });
