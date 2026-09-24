/**
 * Curation query spec, Mongo filter, chips, and merged pagination.
 *
 * This is the admin search contract. It reuses catalog eligibility
 * (published, not deleted, pivot custom fields) and does not change
 * consumer Explore or Drop queries.
 */

const { safeRegex, serializeForSlot } = require('./pivotCarouselCatalogService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  isValidTimeZone,
  zonedCivilToUtc,
} = require('../utilities/pivotFieldParsingUtils');
const { readRankingOverride } = require('../utilities/pivotEditorialPolicy');
const {
  CATALOG_PROVIDER_ID,
  PROVIDER_VERSION,
  PROVIDER_IDS,
} = require('./carouselCurationProvider');

const PINNED_TIERS = Object.freeze(['must_show', 'strong_promote', 'promote']);
const PIN_RANK = Object.freeze({
  featured: 4,
  must_show: 3,
  strong_promote: 2,
  promote: 1,
});
const PINNED_PAGE_MAX = 40;

const PAGE_DEFAULT = 24;
const PAGE_MAX = 60;
const TERM_MAX = 12;
const TERM_LENGTH = 80;
const TAG_MAX = 16;
const SOURCE_MAX = 32;

const SORTS = Object.freeze(['date', 'date-asc', 'relevance', 'ingested']);
const MATCH_MODES = Object.freeze(['any', 'all']);
const IMAGE_MODES = Object.freeze(['any', 'present', 'missing']);
const USED_MODES = Object.freeze(['any', 'exclude', 'only']);
const PUBLICATIONS = Object.freeze(['published', 'inspect-unreleased']);
const TEMPORAL_MODES = Object.freeze(['any', 'upcoming', 'past']);
const PRICE_MODES = Object.freeze(['unknown']);

const ALLOWED_KEYS = Object.freeze([
  'provider',
  'providerVersion',
  'keyword',
  'includeTerms',
  'excludeTerms',
  'sourceTenantKeys',
  'timezone',
  'dateFrom',
  'dateTo',
  'temporalMode',
  'batchWeek',
  'tags',
  'tagMatch',
  'categories',
  'categoryMatch',
  'host',
  'venue',
  'image',
  'previouslyUsedInAccount',
  'publication',
  'price',
  'sort',
  'limit',
  'cursor',
  'dateToExclusive',
]);

const DEFAULT_QUERY = Object.freeze({
  provider: CATALOG_PROVIDER_ID,
  providerVersion: PROVIDER_VERSION,
  keyword: '',
  includeTerms: [],
  excludeTerms: [],
  sourceTenantKeys: [],
  timezone: 'UTC',
  dateFrom: null,
  dateTo: null,
  dateToExclusive: false,
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
  limit: PAGE_DEFAULT,
  cursor: null,
});

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function cloneDefaultQuery() {
  return {
    ...DEFAULT_QUERY,
    includeTerms: [],
    excludeTerms: [],
    sourceTenantKeys: [],
    tags: { values: [], match: 'any' },
    categories: { values: [], match: 'any' },
  };
}

function text(value, max = TERM_LENGTH) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function listOfStrings(raw, { max = TERM_MAX, itemMax = TERM_LENGTH } = {}) {
  if (raw == null || raw === '') return { values: [] };
  if (typeof raw === 'string') {
    return listOfStrings(raw.split(/[,|]/), { max, itemMax });
  }
  if (!Array.isArray(raw)) {
    return fail('Expected a list of strings.', 400, 'UNSUPPORTED_FILTER');
  }
  if (raw.length > max) {
    return fail(`At most ${max} values are allowed.`, 400, 'UNSUPPORTED_FILTER');
  }
  const values = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string' && typeof item !== 'number') {
      return fail('List values must be strings.', 400, 'UNSUPPORTED_FILTER');
    }
    const next = text(item, itemMax);
    if (!next || seen.has(next.toLowerCase())) continue;
    seen.add(next.toLowerCase());
    values.push(next);
  }
  return { values };
}

function slugList(raw) {
  const listed = listOfStrings(raw);
  if (listed.error) return listed;
  const values = [];
  for (const value of listed.values) {
    const slug = value.toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return fail(`Invalid tag slug: ${value}`, 400, 'INVALID_TAG');
    }
    values.push(slug);
  }
  return { values };
}

function facetList(raw, matchRaw, matchKey) {
  const object = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : { values: raw, match: matchRaw };
  const listed = slugList(object.values);
  if (listed.error) return listed;
  const match = text(object.match || matchRaw || 'any', 8).toLowerCase();
  if (!MATCH_MODES.includes(match)) {
    return fail(`${matchKey} must be any or all.`, 400, 'UNSUPPORTED_FILTER');
  }
  return { values: listed.values, match };
}

function isValidYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseDateBoundary(raw, timezone, { end = false } = {}) {
  if (raw == null || raw === '') return { date: null, exclusive: false };
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return fail('That date is not valid.', 400, 'MALFORMED_DATE');
    return { date: raw, exclusive: false };
  }
  if (typeof raw !== 'string') return fail('Dates must be strings.', 400, 'MALFORMED_DATE');
  const value = raw.trim();
  if (!value) return { date: null, exclusive: false };

  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const date = Number(day[3]);
    if (!isValidYmd(year, month, date)) {
      return fail(`That date is not valid: ${value}`, 400, 'MALFORMED_DATE');
    }
    const civil = end
      ? { year, month, day: date + 1, hour: 0, minute: 0 }
      : { year, month, day: date, hour: 0, minute: 0 };
    return { date: zonedCivilToUtc(civil, timezone), exclusive: end };
  }

  if (!/^\d{4}-\d{2}-\d{2}[T\s]/.test(value) && !/^\d{4}-\d{2}-\d{2}[zZ+\-]/.test(value)) {
    return fail(`That date is not valid: ${value}`, 400, 'MALFORMED_DATE');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fail(`That date is not valid: ${value}`, 400, 'MALFORMED_DATE');
  }
  return { date: parsed, exclusive: false };
}

function decodeCursor(raw) {
  if (raw == null || raw === '') return { cursor: null };
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!parsed || !parsed.s || !parsed.t || !parsed.i || parsed.v == null) {
      return fail('The search cursor is invalid.', 400, 'INVALID_CURSOR');
    }
    if (!SORTS.includes(parsed.s)) {
      return fail('The search cursor is invalid.', 400, 'INVALID_CURSOR');
    }
    return { cursor: parsed };
  } catch {
    return fail('The search cursor is invalid.', 400, 'INVALID_CURSOR');
  }
}

function encodeCursor({ sort, value, tenantKey, eventId }) {
  return Buffer.from(JSON.stringify({
    s: sort,
    v: value,
    t: tenantKey,
    i: String(eventId),
  }), 'utf8').toString('base64url');
}

function parseCurationQuery(raw = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!input) return fail('The search query must be an object.', 400, 'UNSUPPORTED_FILTER');

  const unknown = Object.keys(input).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unknown.length) {
    return fail(
      `Unsupported filter: ${unknown.join(', ')}`,
      400,
      'UNSUPPORTED_FILTER',
      { details: { unsupported: unknown } },
    );
  }

  const spec = cloneDefaultQuery();

  const provider = text(input.provider || CATALOG_PROVIDER_ID, 32).toLowerCase();
  if (!PROVIDER_IDS.includes(provider)) {
    return fail(`Unknown provider: ${provider}`, 400, 'UNSUPPORTED_FILTER');
  }
  spec.provider = provider;

  if (input.providerVersion != null && input.providerVersion !== '' && Number(input.providerVersion) !== PROVIDER_VERSION) {
    return fail(`Unsupported provider version: ${input.providerVersion}`, 400, 'UNSUPPORTED_FILTER');
  }
  spec.providerVersion = PROVIDER_VERSION;

  spec.keyword = text(input.keyword);
  const includeTerms = listOfStrings(input.includeTerms);
  if (includeTerms.error) return includeTerms;
  spec.includeTerms = includeTerms.values;
  const excludeTerms = listOfStrings(input.excludeTerms);
  if (excludeTerms.error) return excludeTerms;
  spec.excludeTerms = excludeTerms.values;

  const sources = listOfStrings(input.sourceTenantKeys, { max: SOURCE_MAX, itemMax: 40 });
  if (sources.error) return sources;
  spec.sourceTenantKeys = sources.values.map((key) => key.toLowerCase());

  const timezone = text(input.timezone || 'UTC', 80) || 'UTC';
  if (!isValidTimeZone(timezone)) {
    return fail(`Unknown timezone: ${timezone}`, 400, 'INVALID_TIMEZONE');
  }
  spec.timezone = timezone;

  const from = parseDateBoundary(input.dateFrom, timezone, { end: false });
  if (from.error) return from;
  const to = parseDateBoundary(input.dateTo, timezone, { end: true });
  if (to.error) return to;
  spec.dateFrom = from.date ? from.date.toISOString() : null;
  spec.dateTo = to.date ? to.date.toISOString() : null;
  spec.dateToExclusive = Boolean(to.exclusive || input.dateToExclusive);

  const temporalMode = text(input.temporalMode || 'any', 16).toLowerCase();
  if (!TEMPORAL_MODES.includes(temporalMode)) {
    return fail('temporalMode must be any, upcoming, or past.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.temporalMode = temporalMode;

  const batchWeek = text(input.batchWeek, 16);
  if (batchWeek && !isValidIsoWeek(batchWeek)) {
    return fail('batchWeek must be ISO week format YYYY-Www.', 400, 'INVALID_BATCH_WEEK');
  }
  spec.batchWeek = batchWeek || null;

  const tags = facetList(input.tags, input.tagMatch, 'tagMatch');
  if (tags.error) return tags;
  spec.tags = tags;
  const categories = facetList(input.categories, input.categoryMatch, 'categoryMatch');
  if (categories.error) return categories;
  spec.categories = categories;

  spec.host = text(input.host);
  spec.venue = text(input.venue);

  const image = text(input.image || 'any', 16).toLowerCase();
  if (!IMAGE_MODES.includes(image)) {
    return fail('image must be any, present, or missing.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.image = image;

  const used = text(input.previouslyUsedInAccount || 'any', 16).toLowerCase();
  if (!USED_MODES.includes(used)) {
    return fail('previouslyUsedInAccount must be any, exclude, or only.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.previouslyUsedInAccount = used;

  const publication = text(input.publication || 'published', 32).toLowerCase();
  if (!PUBLICATIONS.includes(publication)) {
    return fail('publication must be published or inspect-unreleased.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.publication = publication;

  const price = text(input.price || 'unknown', 16).toLowerCase();
  if (!PRICE_MODES.includes(price)) {
    return fail(
      'Price is not a reliable catalog field. Only price=unknown is accepted.',
      400,
      'UNSUPPORTED_FILTER',
    );
  }
  spec.price = price;

  const sort = text(input.sort || 'date', 16).toLowerCase();
  if (!SORTS.includes(sort)) {
    return fail('sort must be date, date-asc, relevance, or ingested.', 400, 'UNSUPPORTED_FILTER');
  }
  if (sort === 'relevance' && !spec.keyword) {
    return fail('Relevance sort needs a keyword.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.sort = sort;

  const limit = Math.min(Math.max(Number(input.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
  if (!Number.isFinite(limit)) {
    return fail('limit must be a number.', 400, 'UNSUPPORTED_FILTER');
  }
  spec.limit = limit;

  const cursor = decodeCursor(input.cursor);
  if (cursor.error) return cursor;
  if (cursor.cursor && cursor.cursor.s !== spec.sort) {
    return fail('The search cursor does not match this sort.', 400, 'INVALID_CURSOR');
  }
  spec.cursor = cursor.cursor;

  return { spec };
}

function textClause(regex) {
  return {
    $or: [
      { name: regex },
      { description: regex },
      { location: regex },
      { 'richLocation.venueName': regex },
      { 'customFields.pivot.host.name': regex },
      { 'customFields.pivot.tags': regex },
    ],
  };
}

function facetClause(field, facet) {
  if (!facet.values.length) return null;
  return {
    [field]: facet.match === 'all' ? { $all: facet.values } : { $in: facet.values },
  };
}

function buildCurationMongoQuery(spec, { now = new Date(), usedEventIds = [] } = {}) {
  const and = [];
  const query = {
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  };

  if (spec.publication === 'inspect-unreleased') {
    query['customFields.pivot.ingestStatus'] = { $in: ['draft', 'staged', 'published'] };
  } else {
    query['customFields.pivot.ingestStatus'] = 'published';
  }

  if (spec.batchWeek) query['customFields.pivot.batchWeek'] = spec.batchWeek;

  const startTime = {};
  if (spec.dateFrom) startTime.$gte = new Date(spec.dateFrom);
  if (spec.dateTo) {
    if (spec.dateToExclusive) startTime.$lt = new Date(spec.dateTo);
    else startTime.$lte = new Date(spec.dateTo);
  }
  if (spec.temporalMode === 'upcoming') {
    startTime.$gte = startTime.$gte && startTime.$gte > now ? startTime.$gte : now;
  }
  if (spec.temporalMode === 'past') {
    startTime.$lt = startTime.$lt && startTime.$lt < now ? startTime.$lt : now;
  }
  if (Object.keys(startTime).length) query.start_time = startTime;

  if (spec.keyword) and.push(textClause(safeRegex(spec.keyword)));
  for (const term of spec.includeTerms) and.push(textClause(safeRegex(term)));
  if (spec.excludeTerms.length) {
    query.$nor = spec.excludeTerms.map((term) => textClause(safeRegex(term)));
  }
  if (spec.host) query['customFields.pivot.host.name'] = safeRegex(spec.host);
  if (spec.venue) {
    and.push({
      $or: [
        { location: safeRegex(spec.venue) },
        { 'richLocation.venueName': safeRegex(spec.venue) },
      ],
    });
  }

  const tags = facetClause('customFields.pivot.tags', spec.tags);
  if (tags) and.push(tags);
  const categories = facetClause('customFields.pivot.tags', spec.categories);
  if (categories) and.push(categories);

  if (spec.image === 'present') {
    query.image = { $exists: true, $nin: [null, ''] };
  } else if (spec.image === 'missing') {
    and.push({ $or: [{ image: { $exists: false } }, { image: null }, { image: '' }] });
  }

  if (spec.previouslyUsedInAccount === 'exclude' && usedEventIds.length) {
    query._id = { $nin: usedEventIds };
  }
  if (spec.previouslyUsedInAccount === 'only') {
    query._id = { $in: usedEventIds };
  }

  if (and.length) query.$and = and;
  return query;
}

function mongoSort(spec) {
  if (spec.sort === 'date-asc') return { start_time: 1, _id: 1 };
  if (spec.sort === 'ingested') return { createdAt: -1, _id: -1 };
  if (spec.sort === 'relevance') return { _curationRelevance: -1, start_time: -1, _id: -1 };
  return { start_time: -1, _id: -1 };
}

function cursorTime(cursor) {
  if (cursor.s === 'relevance') {
    const parts = String(cursor.v).split('|');
    return { score: Number(parts[0]), time: new Date(parts[1]) };
  }
  return { time: new Date(cursor.v) };
}

function sameTimeTenantClause(cursor, tenantKey, timeField, idDirection) {
  if (tenantKey > cursor.t) return { [timeField]: cursorTime(cursor).time };
  if (tenantKey === cursor.t) {
    return {
      [timeField]: cursorTime(cursor).time,
      _id: idDirection === 'desc' ? { $lt: cursor.i } : { $gt: cursor.i },
    };
  }
  return null;
}

function cursorMongoClause(spec, tenantKey) {
  const cursor = spec.cursor;
  if (!cursor) return null;
  if (spec.sort === 'relevance') {
    const { score, time } = cursorTime(cursor);
    const sameScoreTime = sameTimeTenantClause(
      { ...cursor, v: time.toISOString() },
      tenantKey,
      'start_time',
      'desc',
    );
    return {
      $or: [
        { _curationRelevance: { $lt: score } },
        { _curationRelevance: score, start_time: { $lt: time } },
        ...(sameScoreTime ? [{ _curationRelevance: score, ...sameScoreTime }] : []),
      ],
    };
  }
  const field = spec.sort === 'ingested' ? 'createdAt' : 'start_time';
  const desc = spec.sort !== 'date-asc';
  const { time } = cursorTime(cursor);
  const same = sameTimeTenantClause(cursor, tenantKey, field, desc ? 'desc' : 'asc');
  return {
    $or: [
      { [field]: desc ? { $lt: time } : { $gt: time } },
      ...(same ? [same] : []),
    ],
  };
}

function relevanceStage(keyword) {
  const regex = safeRegex(keyword).source;
  return {
    $addFields: {
      _curationRelevance: {
        $cond: [
          { $regexMatch: { input: { $ifNull: ['$name', ''] }, regex, options: 'i' } },
          2,
          1,
        ],
      },
    },
  };
}

function compareDesc(a, b) {
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

function compareAsc(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function editorialPin(candidate) {
  if (candidate?.snapshot?.featured || candidate?.featured || candidate?.customFields?.pivot?.featured) {
    return PIN_RANK.featured;
  }
  const tier = candidate?.snapshot?.rankingOverride?.tier
    || candidate?.rankingOverride?.tier
    || candidate?.customFields?.pivot?.rankingOverride?.tier;
  return PIN_RANK[tier] || 0;
}

function pinnedMongoClause() {
  return {
    $or: [
      { 'customFields.pivot.featured': true },
      { 'customFields.pivot.rankingOverride.tier': { $in: PINNED_TIERS } },
    ],
  };
}

function candidateTime(candidate) {
  const value = candidate.startTime || candidate.snapshot?.startTime;
  return value ? new Date(value).getTime() : 0;
}

function candidateIngested(candidate) {
  const value = candidate.ingestedAt || candidate.provenance?.ingestedAt;
  return value ? new Date(value).getTime() : 0;
}

function compareCandidates(a, b, sort, { pin = false } = {}) {
  let cmp;
  if (pin) {
    cmp = compareDesc(editorialPin(a), editorialPin(b));
    if (cmp !== 0) return cmp;
  }
  if (sort === 'date-asc') cmp = compareAsc(candidateTime(a), candidateTime(b));
  else if (sort === 'ingested') cmp = compareDesc(candidateIngested(a), candidateIngested(b));
  else if (sort === 'relevance') {
    cmp = compareDesc(a.score || 0, b.score || 0);
    if (cmp === 0) cmp = compareDesc(candidateTime(a), candidateTime(b));
  } else {
    cmp = compareDesc(candidateTime(a), candidateTime(b));
  }
  if (cmp !== 0) return cmp;
  cmp = compareAsc(a.ref?.sourceTenantKey || a.sourceTenantKey, b.ref?.sourceTenantKey || b.sourceTenantKey);
  if (cmp !== 0) return cmp;
  return compareDesc(String(a.ref?.eventId || a.eventId), String(b.ref?.eventId || b.eventId));
}

function cursorValueFor(candidate, sort) {
  if (sort === 'ingested') {
    return candidate.provenance?.ingestedAt || new Date(candidateIngested(candidate)).toISOString();
  }
  if (sort === 'relevance') {
    const start = candidate.snapshot?.startTime || candidate.startTime;
    return `${candidate.score || 0}|${start ? new Date(start).toISOString() : ''}`;
  }
  const start = candidate.snapshot?.startTime || candidate.startTime;
  return start ? new Date(start).toISOString() : '';
}

function serializeCurationCandidate(event, { sourceTenantKey, cityName, spec, capturedAt }) {
  const slot = serializeForSlot(event);
  const pivot = event.customFields?.pivot || {};
  const publication = pivot.ingestStatus || null;
  const inspectUnreleased = spec.publication === 'inspect-unreleased'
    && publication
    && publication !== 'published';
  return {
    ref: { sourceTenantKey, eventId: String(event._id) },
    snapshot: {
      name: slot.name,
      host: slot.host,
      startTime: slot.startTime,
      location: slot.location,
      image: slot.image,
      tags: slot.tags,
      batchWeek: slot.batchWeek,
      description: event.description || '',
      sourceUrl: pivot.sourceUrl || null,
      externalLink: event.externalLink || null,
      city: { tenantKey: sourceTenantKey, name: cityName || sourceTenantKey },
      publication,
      featured: pivot.featured === true,
      rankingOverride: (() => {
        const override = readRankingOverride(event);
        return override ? { tier: override.tier, audience: override.audience } : null;
      })(),
      happenedConfirmed: false,
      recapNote: null,
    },
    provenance: {
      capturedAt: capturedAt.toISOString(),
      sourceTenantKey,
      eventId: String(event._id),
      publication,
      inspectUnreleased,
      sourceUrl: pivot.sourceUrl || event.externalLink || null,
      ingestedAt: event.createdAt ? new Date(event.createdAt).toISOString() : null,
      provider: { id: spec.provider, version: spec.providerVersion },
    },
    group: null,
    score: event._curationRelevance == null ? null : event._curationRelevance,
    inspectUnreleased,
  };
}

function chip(id, field, label, value) {
  return { id, field, label, value };
}

function chipsFromQuery(spec) {
  const chips = [];
  if (spec.keyword) chips.push(chip('keyword', 'keyword', `“${spec.keyword}”`, spec.keyword));
  spec.includeTerms.forEach((term, index) => {
    chips.push(chip(`include:${index}`, 'includeTerms', term, term));
  });
  spec.excludeTerms.forEach((term, index) => {
    chips.push(chip(`exclude:${index}`, 'excludeTerms', `not ${term}`, term));
  });
  spec.sourceTenantKeys.forEach((key) => {
    chips.push(chip(`source:${key}`, 'sourceTenantKeys', key, key));
  });
  if (spec.dateFrom || spec.dateTo) {
    chips.push(chip('dates', 'dateFrom', 'date range', `${spec.dateFrom || '…'} → ${spec.dateTo || '…'}`));
  }
  if (spec.temporalMode !== 'any') {
    chips.push(chip('temporal', 'temporalMode', spec.temporalMode, spec.temporalMode));
  }
  if (spec.batchWeek) chips.push(chip('week', 'batchWeek', spec.batchWeek, spec.batchWeek));
  if (spec.tags.values.length) {
    chips.push(chip('tags', 'tags', `tags ${spec.tags.match} ${spec.tags.values.join(', ')}`, spec.tags));
  }
  if (spec.categories.values.length) {
    chips.push(chip('categories', 'categories', `categories ${spec.categories.match} ${spec.categories.values.join(', ')}`, spec.categories));
  }
  if (spec.host) chips.push(chip('host', 'host', spec.host, spec.host));
  if (spec.venue) chips.push(chip('venue', 'venue', spec.venue, spec.venue));
  if (spec.image !== 'any') chips.push(chip('image', 'image', spec.image === 'present' ? 'has image' : 'no image', spec.image));
  if (spec.previouslyUsedInAccount !== 'any') {
    chips.push(chip('used', 'previouslyUsedInAccount', spec.previouslyUsedInAccount === 'only' ? 'already used' : 'not used yet', spec.previouslyUsedInAccount));
  }
  if (spec.publication !== 'published') {
    chips.push(chip('publication', 'publication', 'includes drafts', spec.publication));
  }
  if (spec.sort !== 'date') chips.push(chip('sort', 'sort', spec.sort, spec.sort));
  return chips;
}

function mergeSourcePages(sourceResults, spec) {
  const candidates = [];
  const sources = sourceResults.map((row) => ({
    tenantKey: row.tenantKey,
    status: row.status,
    complete: row.status === 'ok',
    error: row.error || null,
    retryable: row.retryable || false,
    fetched: row.fetched || 0,
  }));
  for (const row of sourceResults) {
    if (row.status === 'ok') candidates.push(...row.candidates);
  }
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.ref.sourceTenantKey}:${candidate.ref.eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  const pinFirst = !spec.cursor;
  const pinned = pinFirst
    ? unique.filter((row) => editorialPin(row) > 0).sort((a, b) => compareCandidates(a, b, spec.sort, { pin: true }))
    : [];
  const rest = unique
    .filter((row) => !pinFirst || editorialPin(row) === 0)
    .sort((a, b) => compareCandidates(a, b, spec.sort));
  const restPage = rest.slice(0, spec.limit);
  const page = [...pinned, ...restPage];
  const sourceFull = sources.some((row) => row.status === 'ok' && row.fetched > spec.limit);
  const hasMore = rest.length > spec.limit || sourceFull;
  const last = restPage[restPage.length - 1] || page[page.length - 1];
  const allOk = sources.every((row) => row.status === 'ok');
  return {
    provider: { id: spec.provider, version: spec.providerVersion },
    query: spec,
    resetQuery: cloneDefaultQuery(),
    chips: chipsFromQuery(spec),
    candidates: page,
    sources,
    continuation: {
      cursor: hasMore && last
        ? encodeCursor({
          sort: spec.sort,
          value: cursorValueFor(last, spec.sort),
          tenantKey: last.ref.sourceTenantKey,
          eventId: last.ref.eventId,
        })
        : null,
      complete: allOk && !hasMore,
      hasMore,
    },
  };
}

module.exports = {
  PAGE_DEFAULT,
  PAGE_MAX,
  PINNED_PAGE_MAX,
  DEFAULT_QUERY,
  ALLOWED_KEYS,
  SORTS,
  cloneDefaultQuery,
  parseCurationQuery,
  buildCurationMongoQuery,
  mongoSort,
  cursorMongoClause,
  relevanceStage,
  editorialPin,
  pinnedMongoClause,
  compareCandidates,
  encodeCursor,
  decodeCursor,
  serializeCurationCandidate,
  chipsFromQuery,
  mergeSourcePages,
};
