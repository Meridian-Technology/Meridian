const {
  projectPublicRichLocation,
} = require('../events/services/richLocationProjectionService');
const { serializePivotEnrichment } = require('./pivotEnrichment');

const JUST_GO_EVENT_DOCUMENT_VERSION = 'just_go_event_document_v1';
const JUST_GO_EVENT_DOCUMENT_EXCLUSIONS = Object.freeze([
  'embedding_model_calls',
  'vector_storage',
  'retrieval',
  'recommender_changes',
  'proximity_search',
  'map_view',
]);

function normalizeText(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
  return normalized || undefined;
}

function normalizeLowerText(value) {
  return normalizeText(value)?.toLocaleLowerCase('en-US');
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeStringSet(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeLowerText).filter(Boolean))].sort(compareText);
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeEnrichment(pivot) {
  const enrichment = serializePivotEnrichment(pivot);
  if (!enrichment) return undefined;
  const vibe = normalizeStringSet(enrichment.vibe);
  return {
    ...(vibe.length ? { vibe } : {}),
    ...(normalizeLowerText(enrichment.priceBand)
      ? { priceBand: normalizeLowerText(enrichment.priceBand) }
      : {}),
    ...(normalizeText(enrichment.neighborhood)
      ? { neighborhood: normalizeText(enrichment.neighborhood) }
      : {}),
    ...(normalizeText(enrichment.audience)
      ? { audience: normalizeText(enrichment.audience) }
      : {}),
  };
}

function buildDocumentText(metadata) {
  const location = metadata.richLocation;
  const locationText = location
    ? [
      location.publicDisplayLabel,
      location.venueName,
      location.formattedAddress,
      location.approximateLabel,
      location.neighborhood,
      location.city,
      location.region,
      location.countryCode,
    ].filter(Boolean).join(' · ')
    : undefined;
  const enrichment = metadata.enrichment;
  return [
    ['Title', metadata.title],
    ['Description', metadata.description],
    ['Host', metadata.hostName],
    ['Type', metadata.eventType],
    ['Tags', metadata.tags.length ? metadata.tags.join(', ') : undefined],
    ['Vibe', enrichment?.vibe?.length ? enrichment.vibe.join(', ') : undefined],
    ['Price', enrichment?.priceBand],
    ['Audience', enrichment?.audience],
    ['Location', locationText],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

/**
 * Build a stable, public-safe document for future offline embedding and city-scene work.
 * The builder performs no model calls or writes and intentionally excludes viewer,
 * registration, ranking, coordinates, provider IDs, and legacy location text.
 */
function buildJustGoEventDocument(event, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return undefined;
  const pivot = event.customFields?.pivot || {};
  const title = normalizeText(event.name);
  const eventId = normalizeText(event._id ?? event.id);
  if (!eventId || !title) return undefined;

  const tags = normalizeStringSet(pivot.tags);
  const enrichment = normalizeEnrichment(pivot);
  const richLocation = projectPublicRichLocation(event.richLocation);
  const metadata = {
    title,
    ...(normalizeText(event.description) ? { description: normalizeText(event.description) } : {}),
    ...(normalizeLowerText(event.type) ? { eventType: normalizeLowerText(event.type) } : {}),
    ...(normalizeDate(event.start_time) ? { startTime: normalizeDate(event.start_time) } : {}),
    ...(normalizeDate(event.end_time) ? { endTime: normalizeDate(event.end_time) } : {}),
    ...(normalizeText(pivot.batchWeek) ? { batchWeek: normalizeText(pivot.batchWeek) } : {}),
    tags,
    ...(normalizeText(pivot.host?.name) ? { hostName: normalizeText(pivot.host.name) } : {}),
    ...(enrichment && Object.keys(enrichment).length ? { enrichment } : {}),
    ...(richLocation ? { richLocation } : {}),
  };

  return {
    schemaVersion: JUST_GO_EVENT_DOCUMENT_VERSION,
    eventId,
    ...(normalizeLowerText(options.tenantKey)
      ? { tenantKey: normalizeLowerText(options.tenantKey) }
      : {}),
    text: buildDocumentText(metadata),
    metadata,
  };
}

module.exports = {
  JUST_GO_EVENT_DOCUMENT_VERSION,
  JUST_GO_EVENT_DOCUMENT_EXCLUSIONS,
  buildJustGoEventDocument,
};
