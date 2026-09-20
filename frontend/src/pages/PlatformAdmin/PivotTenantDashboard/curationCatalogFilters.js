export const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unpublished', label: 'Unpublished' },
  { value: 'draft', label: 'Draft' },
  { value: 'staged', label: 'Staged' },
  { value: 'published', label: 'Published' },
  { value: 'untagged', label: 'Untagged' },
  { value: 'missing-host', label: 'Missing host' },
  { value: 'missing-rich-data', label: 'Missing rich data' },
  { value: 'film', label: 'Showtimes' },
  { value: 'featured', label: 'Featured' },
];

export function eventMatchesFilter(event, filter) {
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
