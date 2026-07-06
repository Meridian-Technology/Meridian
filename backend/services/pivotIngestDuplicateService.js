const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDateTime(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function summarizeCatalogEvent(event) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};

  return {
    _id: String(event._id),
    name: event.name || '',
    batchWeek: pivot.batchWeek || null,
    organizerName: host.name || '',
    sourceKey: normalizeIngestSourceUrl(pivot.sourceUrl || event.externalLink),
    fingerprint: buildEventFingerprint({
      name: event.name,
      start_time: event.start_time,
      location: event.location,
    }),
  };
}

async function loadCatalogDuplicateIndex(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');

  const events = await Event.find({
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  })
    .select('name start_time location externalLink customFields.pivot')
    .lean();

  return events.map(summarizeCatalogEvent);
}

function duplicateSummary(existing, matchType, { willUpdate = false } = {}) {
  return {
    matchType,
    willUpdate,
    existingEventId: existing._id,
    existingName: existing.name,
    existingBatchWeek: existing.batchWeek,
    existingOrganizerName: existing.organizerName,
  };
}

function findCatalogDuplicate(index, candidate) {
  const sourceKey = normalizeIngestSourceUrl(candidate.sourceUrl);
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
      return duplicateSummary(byFingerprint, 'fingerprint');
    }
  }

  return null;
}

function annotateImportDrafts(drafts, catalogIndex = []) {
  const seenSourceKeys = new Map();
  const seenFingerprints = new Map();
  const duplicateWarnings = [];

  const annotated = drafts.map((entry, index) => {
    const candidate = {
      name: entry.draft?.name,
      start_time: entry.draft?.start_time,
      location: entry.draft?.location,
      sourceUrl: entry.sourceUrl || entry.draft?.sourceUrl,
    };

    const sourceKey = normalizeIngestSourceUrl(candidate.sourceUrl);
    const fingerprint = buildEventFingerprint(candidate);
    let duplicate = findCatalogDuplicate(catalogIndex, candidate);

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

  return { drafts: annotated, duplicateWarnings };
}

function formatDuplicateWarning(duplicate, candidateName) {
  const label = candidateName || 'Event';
  if (duplicate.matchType === 'sourceUrl') {
    return `${label} already exists in catalog and will update the existing row.`;
  }
  if (duplicate.matchType === 'fingerprint') {
    return `${label} looks like a duplicate of "${duplicate.existingName}" (same title, time, and location).`;
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
  if (duplicate.matchType === 'sourceUrl') return false;
  return true;
}

async function resolveImportDuplicate(req, { tenantKey, candidate }) {
  if (!tenantKey) {
    return { duplicate: null, catalogIndex: [] };
  }

  const catalogIndex = await loadCatalogDuplicateIndex(tenantKey);
  const duplicate = findCatalogDuplicate(catalogIndex, candidate);
  return { duplicate, catalogIndex };
}

module.exports = {
  normalizeIngestSourceUrl,
  buildEventFingerprint,
  summarizeCatalogEvent,
  loadCatalogDuplicateIndex,
  findCatalogDuplicate,
  annotateImportDrafts,
  formatDuplicateWarning,
  isBlockingDuplicate,
  resolveImportDuplicate,
};
