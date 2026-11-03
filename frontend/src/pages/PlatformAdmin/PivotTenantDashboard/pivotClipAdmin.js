/**
 * Pure helpers for Content → App Clip: the deck settings draft, what the
 * live clip is serving, and grouping of the clip's `clip.*` copy keys.
 */

export const CLIP_DECK_SOURCES = Object.freeze([
  {
    id: 'week',
    label: 'This week’s drop',
    hint: 'Cards flagged App Clip in the live week, then its featured cards, then last week’s.',
  },
  {
    id: 'custom',
    label: 'Pinned list',
    hint: 'The cards below, in this order, from any week. Ignores batch weeks.',
  },
]);

export function clipAdminPaths(tenantKey) {
  const base = `/admin/pivot/tenants/${encodeURIComponent(String(tenantKey || '').trim().toLowerCase())}`;
  return {
    clip: `${base}/clip`,
    events: `${base}/clip/events`,
  };
}

export function clipSearchUrl(tenantKey, { q = '', includePast = false } = {}) {
  const params = new URLSearchParams();
  const term = String(q || '').trim();
  if (term) params.set('q', term);
  if (includePast) params.set('includePast', 'true');
  const query = params.toString();
  return `${clipAdminPaths(tenantKey).events}${query ? `?${query}` : ''}`;
}

/** Editable copy of the server config; `curated` keeps whole rows so new pins render. */
export function clipDraftFromData(data) {
  const config = data?.config || {};
  return {
    deckSource: config.deckSource === 'custom' ? 'custom' : 'week',
    cardLimit: Number.isInteger(config.cardLimit) ? config.cardLimit : 12,
    hidePastEvents: config.hidePastEvents !== false,
    fallbackToWeek: config.fallbackToWeek !== false,
    curated: Array.isArray(data?.curated) ? data.curated : [],
  };
}

export function clipConfigFromDraft(draft) {
  return {
    deckSource: draft.deckSource,
    cardLimit: Number(draft.cardLimit),
    hidePastEvents: draft.hidePastEvents,
    fallbackToWeek: draft.fallbackToWeek,
    curatedEventIds: draft.curated.map((row) => row.id),
  };
}

export function isClipDraftDirty(draft, data) {
  if (!draft || !data) return false;
  return (
    JSON.stringify(clipConfigFromDraft(draft))
    !== JSON.stringify(clipConfigFromDraft(clipDraftFromData(data)))
  );
}

export function moveClipPin(curated, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= curated.length || target < 0 || target >= curated.length) {
    return curated;
  }
  const next = [...curated];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function addClipPin(curated, event, max) {
  if (!event?.id || curated.some((row) => row.id === event.id)) return curated;
  if (max && curated.length >= max) return curated;
  return [...curated, event];
}

export function removeClipPin(curated, id) {
  return curated.filter((row) => row.id !== id);
}

/** Pins the clip will actually play, given the draft's settings. */
export function countPlayablePins(draft) {
  return draft.curated.filter(
    (row) => row.state === 'live' || (row.state === 'ended' && !draft.hidePastEvents),
  ).length;
}

export const CLIP_PIN_STATE_LABELS = Object.freeze({
  live: null,
  ended: 'Ended',
  unpublished: 'Not published',
  missing: 'Deleted',
});

export function describeClipPreview(preview) {
  if (!preview) return { title: 'No preview', detail: '' };
  const count = preview.events?.length || 0;
  const cards = `${count} ${count === 1 ? 'card' : 'cards'}`;
  if (preview.segment === 'custom') {
    return { title: 'Pinned list', detail: cards };
  }
  if (preview.segment === 'clip' || preview.segment === 'featured') {
    const source = preview.segment === 'clip' ? 'App Clip cards' : 'Featured cards (no App Clip cards flagged)';
    const week = preview.fallback ? `last week (${preview.batchWeek})` : preview.batchWeek;
    return { title: source, detail: `${cards} from ${week}` };
  }
  return {
    title: 'Empty',
    detail: 'The clip shows its “still cooking” screen.',
  };
}

export function formatClipEventDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Where each `clip.*` key shows up in the clip, in the order people see them. */
const CLIP_TEXT_GROUPS = [
  {
    id: 'pack',
    label: 'Pack',
    keys: [
      'clip.packKicker',
      'clip.packTitle',
      'clip.packSubtitle',
      'clip.packDropNumber',
      'clip.packPlansUnit',
    ],
  },
  {
    id: 'tutorial',
    label: 'Swipe tutorial',
    keys: [
      'clip.tutorialTitle',
      'clip.tutorialSubtitle',
      'clip.tutorialPass',
      'clip.tutorialInterested',
      'clip.tutorialGotIt',
    ],
  },
  {
    id: 'picks',
    label: 'Picks & end card',
    keys: [
      'clip.picksTitle',
      'clip.picksSaved',
      'clip.picksMore',
      'clip.picksEmpty',
      'clip.picksKeep',
      'clip.keepPicks',
      'clip.valueHeading',
      'clip.valuePersonal',
      'clip.valueFriends',
      'clip.valueSources',
      'clip.getApp',
      'clip.endTagline',
      'clip.nextDrop',
      'clip.dropCadence',
    ],
  },
  {
    id: 'errors',
    label: 'Empty & errors',
    keys: ['clip.empty', 'clip.loadError', 'clip.retry'],
  },
];

/** Groups `clip.*` rows from buildVoiceRows; keys added later land in Other. */
export function groupClipTextRows(rows) {
  const clipRows = (rows || []).filter((row) => row.type === 'entry' && row.section === 'clip');
  const byPath = new Map(clipRows.map((row) => [row.path, row]));
  const placed = new Set();
  const groups = CLIP_TEXT_GROUPS.map((group) => {
    const items = group.keys.map((key) => byPath.get(key)).filter(Boolean);
    items.forEach((row) => placed.add(row.path));
    return { id: group.id, label: group.label, items };
  });
  const other = clipRows
    .filter((row) => !placed.has(row.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (other.length) groups.push({ id: 'other', label: 'Other', items: other });
  return groups.filter((group) => group.items.length > 0);
}
