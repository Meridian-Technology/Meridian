/** Events a host made in the app rather than ones crawled from a source. */
export const HOST_CREATED_SOURCE = 'justgo';

export const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unpublished', label: 'Unpublished' },
  { value: 'draft', label: 'Draft' },
  { value: 'staged', label: 'Staged' },
  { value: 'published', label: 'Published' },
  { value: 'untagged', label: 'Untagged' },
  { value: 'missing-host', label: 'Missing host' },
  { value: 'missing-rich-data', label: 'Missing rich data' },
  { value: 'broken-image', label: 'Broken image' },
  { value: 'film', label: 'Showtimes' },
  { value: 'featured', label: 'Featured' },
];

export function eventMatchesFilter(event, filter, { brokenImageIds } = {}) {
  if (!filter || filter === 'all') return true;
  if (filter === 'unpublished') {
    return event.ingestStatus === 'draft' || event.ingestStatus === 'staged';
  }
  if (filter === 'draft') return event.ingestStatus === 'draft';
  if (filter === 'staged') return event.ingestStatus === 'staged';
  if (filter === 'published') return event.ingestStatus === 'published';
  if (filter === 'untagged') {
    return !Array.isArray(event.tags) || event.tags.length === 0;
  }
  if (filter === 'missing-host') {
    return !event.organizerName?.trim();
  }
  if (filter === 'missing-rich-data') {
    return event.needsRichData === true;
  }
  if (filter === 'broken-image') {
    return Boolean(event.image?.trim?.()) && brokenImageIds?.has(String(event._id));
  }
  if (filter === 'film') {
    return Boolean(event.movie) || (Array.isArray(event.timeSlots) && event.timeSlots.length > 0);
  }
  if (filter === 'featured') {
    return event.featured === true;
  }
  return true;
}

export function eventMatchesCatalogSearch(event, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const tags = Array.isArray(event?.tags) ? event.tags.join(' ') : '';
  const haystack = [
    event?.name,
    event?.organizerName,
    event?.location,
    event?.rawLocationText,
    event?.source,
    event?.ingestStatus,
    tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function isHostCreatedEvent(event) {
  return event?.source === HOST_CREATED_SOURCE;
}

export function eventMatchesSourceFilter(event, sourceFilter) {
  if (!sourceFilter || sourceFilter === 'all') return true;
  if (sourceFilter === HOST_CREATED_SOURCE) return isHostCreatedEvent(event);
  return true;
}

/** Newest host drafts first when Host-created filter is active; otherwise soft-boost them. */
export function compareCurationEvents(a, b, { hostCreatedOnly = false } = {}) {
  if (hostCreatedOnly) {
    const aSubmitted = a.creatorSubmittedAt ? Date.parse(a.creatorSubmittedAt) : 0;
    const bSubmitted = b.creatorSubmittedAt ? Date.parse(b.creatorSubmittedAt) : 0;
    if (bSubmitted !== aSubmitted) return bSubmitted - aSubmitted;
    const aStart = a.start_time ? Date.parse(a.start_time) : 0;
    const bStart = b.start_time ? Date.parse(b.start_time) : 0;
    return aStart - bStart;
  }

  const aHostDraft = isHostCreatedEvent(a) && a.ingestStatus === 'draft' ? 1 : 0;
  const bHostDraft = isHostCreatedEvent(b) && b.ingestStatus === 'draft' ? 1 : 0;
  if (bHostDraft !== aHostDraft) return bHostDraft - aHostDraft;

  if (aHostDraft && bHostDraft) {
    const aSubmitted = a.creatorSubmittedAt ? Date.parse(a.creatorSubmittedAt) : 0;
    const bSubmitted = b.creatorSubmittedAt ? Date.parse(b.creatorSubmittedAt) : 0;
    if (bSubmitted !== aSubmitted) return bSubmitted - aSubmitted;
  }

  const aStart = a.start_time ? Date.parse(a.start_time) : 0;
  const bStart = b.start_time ? Date.parse(b.start_time) : 0;
  return aStart - bStart;
}
