/**
 * Local filter-chip helpers for the curation search workspace.
 * The server is the source of truth; this mirrors reset and chip ids so the
 * picker can render immediately while a search is in flight.
 */

export const DEFAULT_CURATION_QUERY = Object.freeze({
  provider: 'catalog',
  providerVersion: 1,
  keyword: '',
  includeTerms: [],
  excludeTerms: [],
  sourceTenantKeys: [],
  timezone: 'UTC',
  dateFrom: null,
  dateTo: null,
  temporalMode: 'any',
  batchWeek: null,
  tags: Object.freeze({ values: [], match: 'any' }),
  categories: Object.freeze({ values: [], match: 'any' }),
  host: '',
  venue: '',
  image: 'any',
  previouslyUsedInAccount: 'any',
  publication: 'published',
  price: 'unknown',
  sort: 'date',
  limit: 24,
  cursor: null,
});

export function resetCurationQuery() {
  return {
    ...DEFAULT_CURATION_QUERY,
    includeTerms: [],
    excludeTerms: [],
    sourceTenantKeys: [],
    tags: { values: [], match: 'any' },
    categories: { values: [], match: 'any' },
  };
}

function chip(id, field, label, value) {
  return { id, field, label, value };
}

export function chipsFromCurationQuery(query = {}) {
  const spec = { ...DEFAULT_CURATION_QUERY, ...query };
  const chips = [];
  if (spec.keyword) chips.push(chip('keyword', 'keyword', `“${spec.keyword}”`, spec.keyword));
  (spec.includeTerms || []).forEach((term, index) => {
    chips.push(chip(`include:${index}`, 'includeTerms', term, term));
  });
  (spec.excludeTerms || []).forEach((term, index) => {
    chips.push(chip(`exclude:${index}`, 'excludeTerms', `not ${term}`, term));
  });
  (spec.sourceTenantKeys || []).forEach((key) => {
    chips.push(chip(`source:${key}`, 'sourceTenantKeys', key, key));
  });
  if (spec.dateFrom || spec.dateTo) {
    chips.push(chip('dates', 'dateFrom', 'date range', `${spec.dateFrom || '…'} → ${spec.dateTo || '…'}`));
  }
  if (spec.temporalMode && spec.temporalMode !== 'any') {
    chips.push(chip('temporal', 'temporalMode', spec.temporalMode, spec.temporalMode));
  }
  if (spec.batchWeek) chips.push(chip('week', 'batchWeek', spec.batchWeek, spec.batchWeek));
  if (spec.tags?.values?.length) {
    chips.push(chip('tags', 'tags', `tags ${spec.tags.match} ${spec.tags.values.join(', ')}`, spec.tags));
  }
  if (spec.categories?.values?.length) {
    chips.push(chip('categories', 'categories', `categories ${spec.categories.match} ${spec.categories.values.join(', ')}`, spec.categories));
  }
  if (spec.host) chips.push(chip('host', 'host', spec.host, spec.host));
  if (spec.venue) chips.push(chip('venue', 'venue', spec.venue, spec.venue));
  if (spec.image && spec.image !== 'any') {
    chips.push(chip('image', 'image', spec.image === 'present' ? 'has image' : 'no image', spec.image));
  }
  if (spec.previouslyUsedInAccount && spec.previouslyUsedInAccount !== 'any') {
    chips.push(chip(
      'used',
      'previouslyUsedInAccount',
      spec.previouslyUsedInAccount === 'only' ? 'already used' : 'not used yet',
      spec.previouslyUsedInAccount,
    ));
  }
  if (spec.publication && spec.publication !== 'published') {
    chips.push(chip('publication', 'publication', 'includes drafts', spec.publication));
  }
  if (spec.sort && spec.sort !== 'date') chips.push(chip('sort', 'sort', spec.sort, spec.sort));
  return chips;
}

export function removeCurationChip(query, chipId) {
  const next = {
    ...resetCurationQuery(),
    ...query,
    includeTerms: [...(query.includeTerms || [])],
    excludeTerms: [...(query.excludeTerms || [])],
    sourceTenantKeys: [...(query.sourceTenantKeys || [])],
    tags: { match: query.tags?.match || 'any', values: [...(query.tags?.values || [])] },
    categories: { match: query.categories?.match || 'any', values: [...(query.categories?.values || [])] },
  };
  if (chipId === 'keyword') next.keyword = '';
  if (chipId.startsWith('include:')) next.includeTerms.splice(Number(chipId.slice(8)), 1);
  if (chipId.startsWith('exclude:')) next.excludeTerms.splice(Number(chipId.slice(8)), 1);
  if (chipId.startsWith('source:')) {
    next.sourceTenantKeys = next.sourceTenantKeys.filter((key) => key !== chipId.slice(7));
  }
  if (chipId === 'dates') {
    next.dateFrom = null;
    next.dateTo = null;
  }
  if (chipId === 'temporal') next.temporalMode = 'any';
  if (chipId === 'week') next.batchWeek = null;
  if (chipId === 'tags') next.tags = { values: [], match: 'any' };
  if (chipId === 'categories') next.categories = { values: [], match: 'any' };
  if (chipId === 'host') next.host = '';
  if (chipId === 'venue') next.venue = '';
  if (chipId === 'image') next.image = 'any';
  if (chipId === 'used') next.previouslyUsedInAccount = 'any';
  if (chipId === 'publication') next.publication = 'published';
  if (chipId === 'sort') next.sort = 'date';
  next.cursor = null;
  return next;
}
