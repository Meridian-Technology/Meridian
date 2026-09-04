const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { parseEventDateTime } = require('../utilities/pivotFieldParsingUtils');
const {
  mergeDuplicateThresholds,
  scoreEventSimilarity,
  showtimeGroupKey,
  parseStart,
  utcDayKey,
  utcIsoWeekKey,
  normalizeVenueName,
} = require('../utilities/pivotEventSimilarityUtils');
const {
  unionPivotTimeSlots,
  slotFromStart,
  resolveEventEarliestStart,
  resolveEventLatestEnd,
} = require('../utilities/pivotTimeSlots');
const { unionHostIdentities } = require('../utilities/pivotHostIdentity');
const { uniqueOrganizerIds } = require('./pivotOrganizerResolveService');
const {
  justGoLocationMatchText,
  rawJustGoLocationText,
} = require('../utilities/justGoLocationPolicy');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return parseEventDateTime(value).timestamp;
}

/** Canonical Partiful/Luma ingest URL for duplicate checks. */
function normalizeIngestSourceUrl(raw) {
  const trimmed = trimString(raw);
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'lu.ma') host = 'luma.com';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function normalizeEventText(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name + start minute + location fingerprint for near-duplicate detection. */
function buildEventFingerprint({ name, start_time, location }) {
  const title = normalizeEventText(name);
  const place = normalizeEventText(location);
  const start = parseDateTime(start_time);
  const startKey = start ? start.toISOString().slice(0, 16) : '';

  if (!title && !startKey && !place) {
    return null;
  }

  return `${title}|${startKey}|${place}`;
}

function nativeHostFromUrl(sourceUrl) {
  const sourceKey = normalizeIngestSourceUrl(sourceUrl);
  if (!sourceKey) return null;
  if (sourceKey === 'luma.com' || sourceKey.startsWith('luma.com/')) return 'luma';
  if (sourceKey === 'partiful.com' || sourceKey.startsWith('partiful.com/')) return 'partiful';
  return null;
}

function classifyIngestSourceFamily({ source, sourceUrl, externalLink } = {}) {
  const declared = trimString(source).toLowerCase();
  if (declared === 'luma' || declared === 'partiful' || declared === 'generic-site') {
    return declared;
  }
  return nativeHostFromUrl(sourceUrl || externalLink) || declared || 'other';
}

function isNativeIngestFamily(family) {
  return family === 'luma' || family === 'partiful';
}

function buildTitleDayKey({ name, start_time }) {
  const title = normalizeEventText(name);
  const start = parseDateTime(start_time);
  const day = start ? start.toISOString().slice(0, 10) : '';
  if (!title || !day) return null;
  return `${title}|${day}`;
}

function summarizeCatalogEvent(event) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};
  const sourceUrl = pivot.sourceUrl || event.externalLink;

  return {
    _id: String(event._id),
    name: event.name || '',
    start_time: event.start_time || null,
    location: justGoLocationMatchText(event),
    batchWeek: pivot.batchWeek || null,
    organizerName: host.name || '',
    source: trimString(pivot.source),
    sourceUrl: trimString(sourceUrl),
    sourceKey: normalizeIngestSourceUrl(sourceUrl),
    sourceFamily: classifyIngestSourceFamily({
      source: pivot.source,
      sourceUrl,
    }),
    fingerprint: buildEventFingerprint({
      name: event.name,
      start_time: event.start_time,
      location: justGoLocationMatchText(event),
    }),
    titleDayKey: buildTitleDayKey({
      name: event.name,
      start_time: event.start_time,
    }),
    showtimeKey: showtimeGroupKey({
      name: event.name,
      start_time: event.start_time,
      location: justGoLocationMatchText(event),
    }),
    description: event.description || '',
    city: pivot.parsed?.address?.city || null,
    timeSlots: Array.isArray(pivot.timeSlots) ? pivot.timeSlots : [],
  };
}

async function loadCatalogDuplicateIndex(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');

  const events = await Event.find({
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  })
    .select('name start_time location richLocation description image externalLink customFields.pivot')
    .lean();

  return events.map(summarizeCatalogEvent);
}

function duplicateSummary(existing, matchType, extra = {}) {
  const { willUpdate = false, score = null, reasons = [], mergeSlots = false } = extra;
  return {
    matchType,
    willUpdate,
    existingEventId: existing._id,
    existingName: existing.name,
    existingBatchWeek: existing.batchWeek,
    existingOrganizerName: existing.organizerName,
    existingSource: existing.source || null,
    existingSourceFamily: existing.sourceFamily || null,
    ...(score != null ? { score } : {}),
    ...(reasons.length ? { reasons } : {}),
    ...(mergeSlots ? { mergeSlots: true } : {}),
  };
}

function findFuzzyCatalogDuplicate(index, candidate, rawThresholds) {
  const thresholds = mergeDuplicateThresholds(rawThresholds);
  const start = parseStart(candidate.start_time);
  const day = utcDayKey(start);
  const week = utcIsoWeekKey(start);
  if (!day || !normalizeVenueName(candidate.location)) return null;

  const windowMs = thresholds.timeWindowHours * 3_600_000;
  const pool = [];
  for (const row of index) {
    const rowStart = parseStart(row.start_time);
    if (!rowStart) continue;
    if (utcDayKey(rowStart) === day) {
      pool.push(row);
      continue;
    }
    if (utcIsoWeekKey(rowStart) === week) {
      pool.push(row);
      continue;
    }
    if (!thresholds.sameDayRequired && start && Math.abs(rowStart.getTime() - start.getTime()) <= windowMs) {
      pool.push(row);
    }
  }

  let best = null;
  for (const row of pool) {
    const scored = scoreEventSimilarity(candidate, row, thresholds);
    if (!scored.match) continue;
    if (!best || scored.score > best.scored.score) {
      best = { row, scored };
    }
  }
  if (!best) return null;

  const matchType = best.scored.showtime ? 'showtime' : 'similarity';
  return duplicateSummary(best.row, matchType, {
    willUpdate: true,
    score: best.scored.score,
    reasons: best.scored.reasons,
    mergeSlots: best.scored.showtime || best.scored.hoursApart >= 0.25,
  });
}

/**
 * `sharedSourceUrl` marks imports whose sourceUrl is a venue calendar or listing
 * page rather than a per-event permalink. Many distinct events legitimately
 * share such a URL, so matching on it would fold a whole week onto one document.
 * Those imports fall back to the title/time/location fingerprint, then
 * same-week showtimes and conservative title+venue similarity.
 */
function findCatalogDuplicate(index, candidate, options = {}) {
  const sourceKey = options.sharedSourceUrl ? null : normalizeIngestSourceUrl(candidate.sourceUrl);
  const fingerprint = buildEventFingerprint(candidate);

  if (sourceKey) {
    const bySource = index.find((row) => row.sourceKey && row.sourceKey === sourceKey);
    if (bySource) {
      return duplicateSummary(bySource, 'sourceUrl', { willUpdate: true });
    }
  }

  if (fingerprint) {
    const byFingerprint = index.find((row) => row.fingerprint && row.fingerprint === fingerprint);
    if (byFingerprint) {
      return duplicateSummary(byFingerprint, 'fingerprint', { willUpdate: true });
    }
  }

  if (!options.skipFuzzy) {
    return findFuzzyCatalogDuplicate(index, candidate, options.thresholds);
  }

  return null;
}

function pickRicherText(left, right) {
  const a = trimString(left);
  const b = trimString(right);
  if (!a) return b || '';
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function draftCandidate(entry) {
  return {
    name: entry.draft?.name,
    start_time: entry.draft?.start_time,
    end_time: entry.draft?.end_time,
    location: justGoLocationMatchText(entry.draft),
    description: entry.draft?.description,
    sourceUrl: entry.sourceUrl || entry.draft?.sourceUrl,
    source: entry.draft?.source,
    timeSlots: entry.draft?.timeSlots,
    city: entry.draft?.parsed?.address?.city,
  };
}

function isNativeDraft(entry) {
  return isNativeIngestFamily(
    classifyIngestSourceFamily({
      source: entry.draft?.source,
      sourceUrl: entry.sourceUrl || entry.draft?.sourceUrl,
    }),
  );
}

function mergeShowtimeGroup(entries) {
  const ranked = [...entries].sort((left, right) => {
    const nativeDelta = Number(isNativeDraft(right)) - Number(isNativeDraft(left));
    if (nativeDelta) return nativeDelta;
    const leftStart = parseStart(left.draft?.start_time)?.getTime() || 0;
    const rightStart = parseStart(right.draft?.start_time)?.getTime() || 0;
    return leftStart - rightStart;
  });
  const primary = ranked[0];
  const slots = unionPivotTimeSlots(
    ...ranked.map((entry) => entry.draft?.timeSlots || []),
    ranked.map((entry) => slotFromStart(entry.draft?.start_time, entry.draft?.end_time)),
  );
  const starts = ranked
    .map((entry) => parseStart(entry.draft?.start_time))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const ends = ranked
    .map((entry) => parseStart(entry.draft?.end_time))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  const draft = {
    ...primary.draft,
    description: ranked.reduce((best, entry) => pickRicherText(best, entry.draft?.description), ''),
    location: ranked.reduce((best, entry) => pickRicherText(best, entry.draft?.location), ''),
    rawLocationText: rawJustGoLocationText(primary.draft),
    image: primary.draft?.image || ranked.find((entry) => entry.draft?.image)?.draft.image || null,
    hostIdentities: unionHostIdentities(
      ...ranked.map((entry) => entry.draft?.hostIdentities || entry.draft?.identities),
    ),
    start_time: starts[0] ? starts[0].toISOString() : primary.draft?.start_time,
    end_time: (ends[ends.length - 1] || starts[starts.length - 1])?.toISOString() || primary.draft?.end_time,
    timeSlots: slots.length > 1 ? slots.map((slot) => ({
      id: slot.id,
      start_time: slot.start_time.toISOString(),
      ...(slot.end_time ? { end_time: slot.end_time.toISOString() } : {}),
      ...(slot.label ? { label: slot.label } : {}),
    })) : primary.draft?.timeSlots,
  };

  return {
    ...primary,
    draft,
    sourceUrl: primary.sourceUrl || draft.sourceUrl,
    rollup: {
      kind: 'showtime',
      count: entries.length,
      sourceUrls: ranked
        .map((entry) => entry.sourceUrl || entry.draft?.sourceUrl)
        .filter(Boolean),
    },
  };
}

/**
 * Collapse same-title, same-venue, same-UTC-week rows with different start
 * times into one draft that carries `timeSlots`. Exact same-minute copies
 * stay as separate rows so fingerprint / batchFingerprint can handle them.
 */
function rollupShowtimeDrafts(drafts = [], rawThresholds) {
  const thresholds = mergeDuplicateThresholds(rawThresholds);
  const groups = new Map();
  drafts.forEach((entry, index) => {
    const key = showtimeGroupKey(draftCandidate(entry));
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });

  const absorbed = new Set();
  const replacements = new Map();
  let rolledUpCount = 0;
  const warnings = [];

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const uniqueMinutes = new Set(
      indices
        .map((index) => parseStart(drafts[index].draft?.start_time))
        .filter(Boolean)
        .map((date) => date.toISOString().slice(0, 16)),
    );
    if (uniqueMinutes.size < 2) continue;

    const scoredOk = indices.every((index, offset) => {
      if (offset === 0) return true;
      const scored = scoreEventSimilarity(
        draftCandidate(drafts[indices[0]]),
        draftCandidate(drafts[index]),
        thresholds,
      );
      return scored.showtime;
    });
    if (!scoredOk) continue;

    const merged = mergeShowtimeGroup(indices.map((index) => drafts[index]));
    replacements.set(indices[0], merged);
    indices.slice(1).forEach((index) => absorbed.add(index));
    rolledUpCount += indices.length - 1;
    warnings.push(
      `Grouped ${indices.length} showtimes of "${merged.draft?.name || 'event'}" into one event.`,
    );
  }

  const next = drafts
    .map((entry, index) => {
      if (absorbed.has(index)) return null;
      return replacements.get(index) || entry;
    })
    .filter(Boolean);

  return { drafts: next, rolledUpCount, warnings };
}

function preferNativeIdentity(existingPivot, incoming, incomingUrl) {
  const existingFamily = classifyIngestSourceFamily({
    source: existingPivot?.source,
    sourceUrl: existingPivot?.sourceUrl,
  });
  const incomingFamily = classifyIngestSourceFamily({
    source: incoming?.source,
    sourceUrl: incomingUrl,
  });
  const existingNative = isNativeIngestFamily(existingFamily);
  const incomingNative = isNativeIngestFamily(incomingFamily);

  if (incomingNative && !existingNative) {
    return {
      source: incoming.source || incomingFamily,
      sourceUrl: incomingUrl || incoming.sourceUrl || existingPivot?.sourceUrl,
      family: incomingFamily,
    };
  }
  if (existingNative && !incomingNative) {
    return {
      source: existingPivot?.source || existingFamily,
      sourceUrl: existingPivot?.sourceUrl,
      family: existingFamily,
    };
  }
  return {
    source: existingPivot?.source || incoming.source,
    sourceUrl: existingPivot?.sourceUrl || incomingUrl,
    family: existingFamily || incomingFamily,
  };
}

function mergeParsedFields(existingParsed, incomingParsed) {
  if (!incomingParsed) return existingParsed || null;
  if (!existingParsed) return incomingParsed;
  return {
    ...existingParsed,
    ...incomingParsed,
    address: incomingParsed.address || existingParsed.address || null,
    price: incomingParsed.price || existingParsed.price || null,
    age: incomingParsed.age || existingParsed.age || null,
    categoryHints: [...new Set([
      ...(existingParsed.categoryHints || []),
      ...(incomingParsed.categoryHints || []),
    ])],
    startTimeRaw: existingParsed.startTimeRaw || incomingParsed.startTimeRaw || null,
  };
}

/**
 * Overlay an incoming ingest onto an existing catalog row. Native permalinks
 * win over generic-site listing URLs. Showtimes are unioned when the match
 * says so. Longer description / present image fill gaps.
 */
function mergeIngestIntoExisting(existing, incoming, duplicate = {}, incomingUrl = null) {
  const existingPivot = existing?.customFields?.pivot || {};
  const identity = preferNativeIdentity(existingPivot, incoming, incomingUrl);
  const incomingFamily = classifyIngestSourceFamily({
    source: incoming?.source,
    sourceUrl: incomingUrl,
  });
  const existingFamily = classifyIngestSourceFamily({
    source: existingPivot?.source,
    sourceUrl: existingPivot?.sourceUrl,
  });
  const sameFamilyRefresh =
    duplicate.matchType === 'sourceUrl' ||
    (duplicate.matchType === 'fingerprint' && incomingFamily === existingFamily);
  const mergeSlots =
    duplicate.mergeSlots || duplicate.matchType === 'showtime';
  const incomingSlots = incoming.timeSlots || [];
  const existingSlots = existingPivot.timeSlots || [];
  let slots = unionPivotTimeSlots(existingSlots, incomingSlots);
  if (mergeSlots) {
    slots = unionPivotTimeSlots(
      slots,
      [slotFromStart(incoming.startTime || incoming.start_time, incoming.endTime || incoming.end_time)],
      [slotFromStart(existing.start_time, existing.end_time)],
    );
  }

  const startTime =
    slots.length > 1
      ? resolveEventEarliestStart({ timeSlots: slots }, incoming.startTime || incoming.start_time)
      : incoming.startTime || incoming.start_time;
  const endTime =
    slots.length > 1
      ? resolveEventLatestEnd({ timeSlots: slots }, incoming.endTime || incoming.end_time)
      : incoming.endTime || incoming.end_time;

  return {
    ...incoming,
    name: incoming.name || existing.name,
    description: sameFamilyRefresh
      ? incoming.description || existing.description || ''
      : pickRicherText(existing.description, incoming.description),
    location: pickRicherText(existing.location, incoming.location),
    rawLocationText:
      trimString(existingPivot.rawLocationText)
      || rawJustGoLocationText(incoming),
    image: incoming.image || existing.image || null,
    hostName: trimString(existingPivot.host?.name) || trimString(incoming.hostName),
    hostImageUrl: incoming.hostImageUrl || existingPivot.host?.imageUrl || null,
    hostProfileUrl: incoming.hostProfileUrl || existingPivot.host?.profileUrl || null,
    hostIdentities: unionHostIdentities(
      existingPivot.host?.identities,
      incoming.hostIdentities,
      incoming.identities,
    ),
    organizerIds: uniqueOrganizerIds(
      existingPivot.host?.organizerIds,
      incoming.organizerIds,
    ),
    source: identity.source,
    sourceUrl: identity.sourceUrl,
    startTime,
    endTime,
    start_time: startTime,
    end_time: endTime,
    timeSlots: slots.length > 1 ? slots : incomingSlots.length ? incomingSlots : existingSlots,
    parsed: mergeParsedFields(existingPivot.parsed, incoming.parsed),
    movie: incoming.movie || existingPivot.movie || null,
    enrichment: incoming.enrichment || existingPivot.enrichment || null,
    duplicateRollup: {
      matchType: duplicate.matchType || null,
      score: duplicate.score || null,
      reasons: duplicate.reasons || [],
      at: new Date().toISOString(),
      incomingSource: incoming.source || null,
      incomingSourceUrl: incomingUrl,
      keptSource: identity.source,
      keptSourceUrl: identity.sourceUrl,
    },
  };
}

function annotateImportDrafts(drafts, catalogIndex = [], options = {}) {
  const rolled = rollupShowtimeDrafts(drafts, options.thresholds);
  const seenSourceKeys = new Map();
  const seenFingerprints = new Map();
  const duplicateWarnings = [...rolled.warnings];

  const annotated = rolled.drafts.map((entry, index) => {
    const candidate = draftCandidate(entry);
    const sourceKey = normalizeIngestSourceUrl(candidate.sourceUrl);
    const fingerprint = buildEventFingerprint(candidate);
    let duplicate = findCatalogDuplicate(catalogIndex, candidate, {
      thresholds: options.thresholds,
      skipFuzzy: options.skipFuzzy,
    });

    if (!duplicate && sourceKey && seenSourceKeys.has(sourceKey)) {
      duplicate = {
        matchType: 'batchSourceUrl',
        willUpdate: false,
        existingEventId: null,
        existingName: seenSourceKeys.get(sourceKey).name,
        existingBatchWeek: null,
        existingOrganizerName: null,
        batchIndex: seenSourceKeys.get(sourceKey).index,
      };
    } else if (!duplicate && fingerprint && seenFingerprints.has(fingerprint)) {
      duplicate = {
        matchType: 'batchFingerprint',
        willUpdate: false,
        existingEventId: null,
        existingName: seenFingerprints.get(fingerprint).name,
        existingBatchWeek: null,
        existingOrganizerName: null,
        batchIndex: seenFingerprints.get(fingerprint).index,
      };
    }

    if (!seenSourceKeys.has(sourceKey) && sourceKey) {
      seenSourceKeys.set(sourceKey, { index, name: candidate.name || entry.sourceUrl });
    }
    if (!seenFingerprints.has(fingerprint) && fingerprint) {
      seenFingerprints.set(fingerprint, { index, name: candidate.name || 'event' });
    }

    if (duplicate) {
      duplicateWarnings.push(formatDuplicateWarning(duplicate, candidate.name));
    }

    return {
      ...entry,
      duplicate,
    };
  });

  return {
    drafts: annotated,
    duplicateWarnings,
    rolledUpCount: rolled.rolledUpCount,
  };
}

function formatDuplicateWarning(duplicate, candidateName) {
  const label = candidateName || 'Event';
  if (duplicate.matchType === 'sourceUrl') {
    return `${label} already exists in catalog and will update the existing row.`;
  }
  if (duplicate.matchType === 'fingerprint') {
    return `${label} matches existing "${duplicate.existingName}" (same title, time, and location) — publishing will update it.`;
  }
  if (duplicate.matchType === 'showtime') {
    return `${label} is another showtime of "${duplicate.existingName}" — publishing will add it to that event.`;
  }
  if (duplicate.matchType === 'similarity') {
    const score = duplicate.score != null ? ` (${Math.round(duplicate.score * 100)}% match)` : '';
    return `${label} looks like "${duplicate.existingName}"${score} — publishing will merge into the existing row.`;
  }
  if (duplicate.matchType === 'batchSourceUrl') {
    return `${label} duplicates another row in this import batch (same source URL).`;
  }
  if (duplicate.matchType === 'batchFingerprint') {
    return `${label} duplicates another row in this import batch (same title, time, and location).`;
  }
  return `${label} looks like a duplicate.`;
}

function isBlockingDuplicate(duplicate) {
  if (!duplicate) return false;
  // sourceUrl and fingerprint matches resolve against an existing catalog event, so
  // publishing updates it in place. Only collisions between two rows of the same import
  // batch have nothing to update against and must block.
  return (
    duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint'
  );
}

async function annotateImportDuplicates(req, options = {}) {
  const tenantKey = options.tenantKey?.trim()?.toLowerCase();
  const drafts = Array.isArray(options.drafts) ? options.drafts : [];
  if (!tenantKey || !drafts.length) {
    return { drafts, duplicateWarnings: [] };
  }

  const catalogIndex = await loadCatalogDuplicateIndex(tenantKey);
  return annotateImportDrafts(drafts, catalogIndex, {
    thresholds: options.thresholds,
    skipFuzzy: options.skipFuzzy,
  });
}

async function resolveImportDuplicate(
  req,
  { tenantKey, candidate, sharedSourceUrl = false, thresholds, skipFuzzy = false } = {},
) {
  if (!tenantKey) {
    return { duplicate: null, catalogIndex: [] };
  }

  const catalogIndex = await loadCatalogDuplicateIndex(tenantKey);
  const duplicate = findCatalogDuplicate(catalogIndex, candidate, {
    sharedSourceUrl,
    thresholds,
    skipFuzzy,
  });
  return { duplicate, catalogIndex };
}

const OVERLAP_SAMPLE_LIMIT = 12;

function pushSample(samples, row) {
  if (samples.length < OVERLAP_SAMPLE_LIMIT) samples.push(row);
}

/**
 * Measure native (Luma/Partiful) vs venue (`generic-site`) overlap using the
 * same sourceUrl + fingerprint index ingest already uses. Does not invent
 * matching rules — it reports what the current deduper would catch, and the
 * title+day near-misses it would miss.
 */
function measureNativeVenueOverlap(events = []) {
  const rows = events.map(summarizeCatalogEvent);
  const byFamily = {};
  for (const row of rows) {
    const family = row.sourceFamily || 'other';
    byFamily[family] = (byFamily[family] || 0) + 1;
  }

  const nativeRows = rows.filter((row) => isNativeIngestFamily(row.sourceFamily));
  const venueRows = rows.filter((row) => row.sourceFamily === 'generic-site');
  const nativeIndex = nativeRows.map((row) => row);

  const fingerprintGroups = new Map();
  for (const row of rows) {
    if (!row.fingerprint) continue;
    if (!fingerprintGroups.has(row.fingerprint)) fingerprintGroups.set(row.fingerprint, []);
    fingerprintGroups.get(row.fingerprint).push(row);
  }

  const survivingMixedFingerprint = [];
  for (const group of fingerprintGroups.values()) {
    if (group.length < 2) continue;
    const families = new Set(group.map((row) => row.sourceFamily));
    const hasNative = [...families].some(isNativeIngestFamily);
    if (hasNative && families.has('generic-site')) {
      survivingMixedFingerprint.push(group);
    }
  }

  const venueWithNativeUrl = [];
  const wouldMatchNative = { sourceUrl: 0, fingerprint: 0, showtime: 0, similarity: 0, none: 0 };
  const wouldMatchSamples = { sourceUrl: [], fingerprint: [], showtime: [], similarity: [] };
  const nearMissSamples = [];
  let nearMissCount = 0;
  const showtimeGroups = new Map();

  const nativeByTitleDay = new Map();
  for (const row of nativeRows) {
    if (!row.titleDayKey) continue;
    if (!nativeByTitleDay.has(row.titleDayKey)) nativeByTitleDay.set(row.titleDayKey, []);
    nativeByTitleDay.get(row.titleDayKey).push(row);
  }
  for (const row of rows) {
    if (!row.showtimeKey) continue;
    if (!showtimeGroups.has(row.showtimeKey)) showtimeGroups.set(row.showtimeKey, []);
    showtimeGroups.get(row.showtimeKey).push(row);
  }
  const splitShowtimeGroups = [...showtimeGroups.values()].filter((group) => {
    const minutes = new Set(
      group
        .map((row) => parseStart(row.start_time))
        .filter(Boolean)
        .map((date) => date.toISOString().slice(0, 16)),
    );
    return minutes.size > 1;
  });

  for (const venue of venueRows) {
    const urlFamily = nativeHostFromUrl(venue.sourceUrl);
    if (isNativeIngestFamily(urlFamily)) {
      venueWithNativeUrl.push({
        name: venue.name,
        sourceUrl: venue.sourceUrl,
        nativeHost: urlFamily,
      });
    }

    const duplicate = findCatalogDuplicate(nativeIndex, {
      name: venue.name,
      start_time: venue.start_time,
      location: venue.location,
      sourceUrl: venue.sourceUrl,
      description: venue.description,
      city: venue.city,
    });

    if (
      duplicate?.matchType === 'sourceUrl' ||
      duplicate?.matchType === 'fingerprint' ||
      duplicate?.matchType === 'showtime' ||
      duplicate?.matchType === 'similarity'
    ) {
      wouldMatchNative[duplicate.matchType] += 1;
      pushSample(wouldMatchSamples[duplicate.matchType], {
        name: venue.name,
        sourceUrl: venue.sourceUrl,
        existingName: duplicate.existingName,
        existingSource: duplicate.existingSource,
        matchType: duplicate.matchType,
        score: duplicate.score || null,
      });
      continue;
    }

    wouldMatchNative.none += 1;
    const nativesSameNight = venue.titleDayKey ? nativeByTitleDay.get(venue.titleDayKey) : null;
    if (nativesSameNight?.length) {
      nearMissCount += 1;
      pushSample(nearMissSamples, {
        name: venue.name,
        sourceUrl: venue.sourceUrl,
        nativeName: nativesSameNight[0].name,
        nativeSourceUrl: nativesSameNight[0].sourceUrl,
        nativeSource: nativesSameNight[0].sourceFamily,
      });
    }
  }

  return {
    total: rows.length,
    byFamily,
    native: nativeRows.length,
    genericSite: venueRows.length,
    venueWithNativeUrlCount: venueWithNativeUrl.length,
    venueWithNativeUrlSamples: venueWithNativeUrl.slice(0, OVERLAP_SAMPLE_LIMIT),
    survivingMixedFingerprintPairs: survivingMixedFingerprint.length,
    survivingMixedFingerprintSamples: survivingMixedFingerprint.slice(0, OVERLAP_SAMPLE_LIMIT).map((group) =>
      group.map((row) => ({
        name: row.name,
        sourceFamily: row.sourceFamily,
        sourceUrl: row.sourceUrl,
      })),
    ),
    wouldMatchNative,
    wouldMatchSamples,
    nearMissCount,
    nearMissSamples,
    splitShowtimeGroupCount: splitShowtimeGroups.length,
    splitShowtimeGroupSamples: splitShowtimeGroups.slice(0, OVERLAP_SAMPLE_LIMIT).map((group) =>
      group.map((row) => ({
        name: row.name,
        sourceFamily: row.sourceFamily,
        start_time: row.start_time,
        location: row.location,
      })),
    ),
  };
}

async function measureTenantNativeVenueOverlap(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');

  const events = await Event.find({
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  })
    .select('name start_time location description image externalLink customFields.pivot')
    .lean();

  return measureNativeVenueOverlap(events);
}

module.exports = {
  normalizeIngestSourceUrl,
  buildEventFingerprint,
  classifyIngestSourceFamily,
  nativeHostFromUrl,
  isNativeIngestFamily,
  summarizeCatalogEvent,
  loadCatalogDuplicateIndex,
  findCatalogDuplicate,
  annotateImportDrafts,
  annotateImportDuplicates,
  formatDuplicateWarning,
  isBlockingDuplicate,
  resolveImportDuplicate,
  rollupShowtimeDrafts,
  mergeIngestIntoExisting,
  measureNativeVenueOverlap,
  measureTenantNativeVenueOverlap,
};
