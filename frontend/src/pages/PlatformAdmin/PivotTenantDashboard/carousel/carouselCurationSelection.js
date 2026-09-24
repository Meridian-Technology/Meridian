export const COVER_PRESETS = ['loose-letters', 'open-invitation', 'kept-somewhere'];
export const EVENT_PRESETS = ['photo-note', 'on-the-bill', 'in-the-room'];
export const COVER_VARIATIONS = [1, 2, 3];

/** Explicit shuffle. Loading a draft does not call this. */
export function nextCoverVariation(current) {
  const index = COVER_VARIATIONS.indexOf(Number(current));
  return COVER_VARIATIONS[(index + 1) % COVER_VARIATIONS.length];
}
export const MAX_SLIDES = 20;
export const MAX_SELECTED = MAX_SLIDES - 1;

export function eventRefKey(ref) {
  return `${String(ref?.sourceTenantKey || '').trim().toLowerCase()}:${String(ref?.eventId || '').trim()}`;
}

export function candidateToSelection(candidate) {
  return {
    ref: candidate.ref,
    snapshot: candidate.snapshot || {},
    provenance: candidate.provenance || {},
    recapNote: candidate.recapNote || '',
    inspectUnreleased: Boolean(candidate.inspectUnreleased),
  };
}

export function addSelection(selected, candidate) {
  const next = [...(selected || [])];
  const key = eventRefKey(candidate.ref);
  if (next.some((item) => eventRefKey(item.ref) === key)) {
    return { selected: next, added: false, duplicate: true };
  }
  next.push(candidateToSelection(candidate));
  return { selected: next, added: true, duplicate: false };
}

export function addVisibleSelection(selected, candidates) {
  let next = [...(selected || [])];
  let added = 0;
  let duplicates = 0;
  for (const candidate of candidates || []) {
    const result = addSelection(next, candidate);
    next = result.selected;
    if (result.added) added += 1;
    if (result.duplicate) duplicates += 1;
  }
  return { selected: next, added, duplicates };
}

export function removeSelection(selected, ref) {
  const key = eventRefKey(ref);
  return (selected || []).filter((item) => eventRefKey(item.ref) !== key);
}

export function moveSelection(selected, ref, direction) {
  const next = [...(selected || [])];
  const index = next.findIndex((item) => eventRefKey(item.ref) === eventRefKey(ref));
  if (index < 0) return next;
  const swap = index + direction;
  if (swap < 0 || swap >= next.length) return next;
  [next[index], next[swap]] = [next[swap], next[index]];
  return next;
}

export function slideEstimate(selectedCount) {
  const slideCount = 1 + Number(selectedCount || 0);
  return {
    slideCount,
    cover: 1,
    events: Number(selectedCount || 0),
    maxSlides: MAX_SLIDES,
    overflow: slideCount > MAX_SLIDES,
  };
}

export function selectionWarnings(selected, { format } = {}) {
  const warnings = [];
  const cities = new Set();
  for (const item of selected || []) {
    cities.add(item.snapshot?.city?.tenantKey || item.ref.sourceTenantKey);
    if (!item.snapshot?.image) {
      warnings.push({ code: 'MISSING_IMAGE', ref: item.ref, message: `${item.snapshot?.name || 'An event'} has no photograph.` });
    }
    if (item.inspectUnreleased || item.provenance?.inspectUnreleased) {
      warnings.push({ code: 'UNRELEASED', ref: item.ref, message: `${item.snapshot?.name || 'An event'} is not published.` });
    }
    if (item.snapshot?.happenedConfirmed === false && item.snapshot?.startTime) {
      warnings.push({ code: 'HAPPENED_UNKNOWN', ref: item.ref, message: `${item.snapshot?.name || 'An event'} is a past listing, not proof it ran.` });
    }
  }
  if (format === 'city-picks' && cities.size > 1) {
    warnings.push({ code: 'MULTI_CITY', message: 'City picks usually stay in one city. This batch spans more than one.' });
  }
  return warnings;
}

export function diffSelection(previousRefs, nextRefs) {
  const previous = previousRefs || [];
  const next = nextRefs || [];
  const prevKeys = previous.map(eventRefKey);
  const nextKeys = next.map(eventRefKey);
  const prevSet = new Set(prevKeys);
  const nextSet = new Set(nextKeys);
  return {
    added: next.filter((ref) => !prevSet.has(eventRefKey(ref))),
    removed: previous.filter((ref) => !nextSet.has(eventRefKey(ref))),
    retained: next.filter((ref) => prevSet.has(eventRefKey(ref))),
    reordered: prevKeys.filter((key) => nextSet.has(key)).join('|')
      !== nextKeys.filter((key) => prevSet.has(key)).join('|'),
  };
}

export function describeCurationDiff(diff) {
  const parts = [];
  if (diff.added?.length) parts.push(`${diff.added.length} added`);
  if (diff.removed?.length) parts.push(`${diff.removed.length} removed`);
  if (diff.reordered) parts.push('reordered');
  if (diff.detachedSlideIds?.length) parts.push(`${diff.detachedSlideIds.length} kept off-selection`);
  if (!parts.length) return 'No membership change.';
  return parts.join(' · ');
}

export const CURATION_STEPS = Object.freeze(['search', 'review']);

export function nextCurationStep(step) {
  const index = CURATION_STEPS.indexOf(step);
  return CURATION_STEPS[Math.min(index + 1, CURATION_STEPS.length - 1)];
}

export function previousCurationStep(step) {
  const index = CURATION_STEPS.indexOf(step);
  return CURATION_STEPS[Math.max(index - 1, 0)];
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `curate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function defaultQueryForFormat(format, sourceTenantKeys, ownerTenantKey) {
  const sources = format === 'city-picks' && ownerTenantKey
    ? [ownerTenantKey]
    : [];
  return {
    temporalMode: format === 'sorry-you-missed-it' ? 'past' : 'upcoming',
    sourceTenantKeys: sources.filter((key) => !sourceTenantKeys?.length || sourceTenantKeys.includes(key)),
  };
}
