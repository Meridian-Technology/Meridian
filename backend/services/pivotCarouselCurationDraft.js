/**
 * Curation selection, slide-count estimate, snapshot diff, and v2 seeding.
 *
 * Templates are starting points. Phase 3.2 will replace these seeded slides
 * with the approved cover and event presets. This step must not force a back
 * slide, and revising a selection must not overwrite retained event slides.
 */

const { ISSUE_LIMITS } = require('./pivotCarouselIssueService');
const {
  generateCoverSlide,
  generateEventSlide,
  shuffleCoverVariation,
} = require('./pivotCarouselPresets');

const COVER_PRESETS = Object.freeze(['loose-letters', 'open-invitation', 'kept-somewhere']);
const EVENT_PRESETS = Object.freeze(['photo-note', 'on-the-bill', 'in-the-room']);
const MAX_SELECTED = ISSUE_LIMITS.maxSlides - 1;
const SNAPSHOT_FIELDS = Object.freeze(['name', 'host', 'startTime', 'location', 'image', 'publication']);

function eventRefKey(ref) {
  return `${String(ref?.sourceTenantKey || '').trim().toLowerCase()}:${String(ref?.eventId || '').trim()}`;
}

function selectionItem(raw) {
  const ref = {
    sourceTenantKey: String(raw?.ref?.sourceTenantKey || raw?.sourceTenantKey || '').trim().toLowerCase(),
    eventId: String(raw?.ref?.eventId || raw?.eventId || '').trim(),
  };
  return {
    ref,
    snapshot: raw?.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {},
    provenance: raw?.provenance && typeof raw.provenance === 'object' ? raw.provenance : {},
    recapNote: String(raw?.recapNote || '').trim().slice(0, 500),
    inspectUnreleased: Boolean(raw?.inspectUnreleased),
  };
}

function normalizeSelection(raw) {
  const selected = [];
  const seen = new Set();
  const duplicates = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const item = selectionItem(row);
    if (!item.ref.sourceTenantKey || !item.ref.eventId) continue;
    const key = eventRefKey(item.ref);
    if (seen.has(key)) {
      duplicates.push(item.ref);
      continue;
    }
    seen.add(key);
    selected.push(item);
  }
  return { selected, duplicates };
}

function lookalikeDuplicates(selected) {
  const groups = new Map();
  for (const item of selected) {
    const name = String(item.snapshot?.name || '').trim().toLowerCase();
    const start = item.snapshot?.startTime ? new Date(item.snapshot.startTime).toISOString() : '';
    if (!name || !start) continue;
    const key = `${name}|${start}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.ref);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function slideEstimate(selectedCount) {
  const slideCount = 1 + Number(selectedCount || 0);
  return {
    slideCount,
    cover: 1,
    events: Number(selectedCount || 0),
    maxSlides: ISSUE_LIMITS.maxSlides,
    overflow: slideCount > ISSUE_LIMITS.maxSlides,
  };
}

function selectionWarnings(selected, { format } = {}) {
  const warnings = [];
  const cities = new Set();
  for (const item of selected) {
    const city = item.snapshot?.city?.tenantKey || item.ref.sourceTenantKey;
    cities.add(city);
    if (!item.snapshot?.image) {
      warnings.push({
        code: 'MISSING_IMAGE',
        ref: item.ref,
        message: `${item.snapshot?.name || 'An event'} has no photograph.`,
      });
    }
    if (item.inspectUnreleased || item.provenance?.inspectUnreleased) {
      warnings.push({
        code: 'UNRELEASED',
        ref: item.ref,
        message: `${item.snapshot?.name || 'An event'} is not published.`,
      });
    }
    if (item.snapshot?.happenedConfirmed === false && item.snapshot?.startTime) {
      warnings.push({
        code: 'HAPPENED_UNKNOWN',
        ref: item.ref,
        message: `${item.snapshot?.name || 'An event'} is a past listing, not proof it ran.`,
      });
    }
  }
  if (format === 'city-picks' && cities.size > 1) {
    warnings.push({
      code: 'MULTI_CITY',
      message: 'City picks usually stay in one city. This batch spans more than one.',
    });
  }
  const lookalikes = lookalikeDuplicates(selected);
  for (const group of lookalikes) {
    warnings.push({
      code: 'LOOKALIKE',
      refs: group,
      message: 'Two selected events share a name and start time.',
    });
  }
  return warnings;
}

function snapshotChanges(previous, next) {
  const changes = [];
  for (const field of SNAPSHOT_FIELDS) {
    const before = previous?.[field] == null ? '' : String(previous[field]);
    const after = next?.[field] == null ? '' : String(next[field]);
    if (before !== after) changes.push(field);
  }
  return changes;
}

function diffSelection(previousRefs, nextRefs) {
  const previous = (previousRefs || []).map((ref) => (
    ref?.sourceTenantKey ? ref : { sourceTenantKey: ref?.ref?.sourceTenantKey, eventId: ref?.ref?.eventId || ref?.eventId }
  ));
  const next = (nextRefs || []).map((ref) => (
    ref?.sourceTenantKey ? ref : { sourceTenantKey: ref?.ref?.sourceTenantKey, eventId: ref?.ref?.eventId || ref?.eventId }
  ));
  const prevKeys = previous.map(eventRefKey);
  const nextKeys = next.map(eventRefKey);
  const prevSet = new Set(prevKeys);
  const nextSet = new Set(nextKeys);
  const retainedOrder = prevKeys.filter((key) => nextSet.has(key));
  const nextRetained = nextKeys.filter((key) => prevSet.has(key));
  return {
    added: next.filter((ref) => !prevSet.has(eventRefKey(ref))),
    removed: previous.filter((ref) => !nextSet.has(eventRefKey(ref))),
    retained: next.filter((ref) => prevSet.has(eventRefKey(ref))),
    reordered: retainedOrder.join('|') !== nextRetained.join('|'),
  };
}

function generateIssueDocument({ selected, theme, coverPreset, eventPreset, format, coverVariation = 1, coverImage = null }) {
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    slides: [
      generateCoverSlide({ theme, coverPreset, variation: coverVariation, coverImage }),
      ...selected.map((item) => generateEventSlide(item, eventPreset, { format })),
    ],
  };
}

function applyCurationToDocument(document, {
  previousRefs,
  selected,
  theme,
  coverPreset,
  eventPreset,
  format,
}) {
  const diff = diffSelection(previousRefs, selected.map((item) => item.ref));
  const slides = Array.isArray(document?.slides) ? document.slides : [];
  const cover = slides.find((slide) => slide.role === 'cover') || generateCoverSlide({ theme, coverPreset, coverImage: null });
  const byRef = new Map();
  for (const slide of slides) {
    if (slide.role === 'event' && slide.source) { const key = eventRefKey(slide.source); byRef.set(key, [...(byRef.get(key) || []), slide]); }
  }

  const nextSlides = [cover];
  for (const item of selected) {
    const existing = byRef.get(eventRefKey(item.ref));
    if (existing) {
      nextSlides.push(...existing);
      byRef.delete(eventRefKey(item.ref));
    } else {
      nextSlides.push(generateEventSlide(item, eventPreset, { format: format || document?.format }));
    }
  }

  const detachedSlideIds = [];
  for (const slide of [...byRef.values()].flat()) {
    nextSlides.push({ ...slide, detached: true });
    detachedSlideIds.push(slide.id);
  }
  for (const slide of slides) {
    if ((slide.role === 'cover' && slide.id !== cover.id) || (slide.role === 'event' && !slide.source) || (slide.role !== 'cover' && slide.role !== 'event')) nextSlides.push(slide);
  }

  return {
    document: {
      schemaVersion: 2,
      width: document?.width || 1080,
      height: document?.height || 1350,
      slides: nextSlides,
    },
    diff: { ...diff, detachedSlideIds },
    estimate: slideEstimate(selected.length + detachedSlideIds.length),
  };
}

module.exports = {
  COVER_PRESETS,
  EVENT_PRESETS,
  MAX_SELECTED,
  SNAPSHOT_FIELDS,
  eventRefKey,
  selectionItem,
  normalizeSelection,
  lookalikeDuplicates,
  slideEstimate,
  selectionWarnings,
  snapshotChanges,
  diffSelection,
  generateCoverSlide,
  generateEventSlide,
  generateIssueDocument,
  applyCurationToDocument,
  shuffleCoverVariation,
};
