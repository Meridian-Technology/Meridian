/**
 * Admin curation search across an account's allowed source tenants.
 *
 * Consumer Explore and Drop stay on their own services. This path only reads
 * catalog rows and never publishes, unpublishes, or changes Drop membership.
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { loadAccount } = require('./pivotCarouselIssueService');
const { resolveCurationProvider, VECTOR_PROVIDER_ID } = require('./carouselCurationProvider');
const {
  PAGE_DEFAULT,
  PAGE_MAX,
  cloneDefaultQuery,
  parseCurationQuery,
  buildCurationMongoQuery,
  mongoSort,
  cursorMongoClause,
  relevanceStage,
  pinnedMongoClause,
  PINNED_PAGE_MAX,
  serializeCurationCandidate,
  mergeSourcePages,
  chipsFromQuery,
} = require('./pivotCarouselCurationQuery');

const SOURCE_CONCURRENCY = 3;
const SAVED_SEARCH_MAX = 50;
const EVENT_FIELDS = [
  'name',
  'description',
  'image',
  'start_time',
  'end_time',
  'location',
  'richLocation.venueName',
  'externalLink',
  'createdAt',
  'customFields.pivot',
].join(' ');

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const size = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: size }, run));
  return results;
}

async function usedEventIdsByTenant(req, accountId, tenantKeys) {
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const decks = await PivotCarouselDeck.find({ accountId })
    .select('tenantKey sources slides.events.eventId')
    .lean();
  const used = Object.fromEntries(tenantKeys.map((key) => [key, []]));
  const seen = new Set();
  const add = (tenantKey, eventId) => {
    const key = String(tenantKey || '').trim().toLowerCase();
    const id = String(eventId || '').trim();
    if (!used[key] || !id) return;
    const token = `${key}:${id}`;
    if (seen.has(token)) return;
    seen.add(token);
    used[key].push(id);
  };
  for (const deck of decks) {
    for (const source of deck.sources || []) {
      add(source.sourceTenantKey, source.eventId);
    }
    for (const slide of deck.slides || []) {
      for (const event of slide.events || []) {
        add(deck.tenantKey, event.eventId);
      }
    }
  }
  return used;
}

function excludeIds(match, ids) {
  if (!ids.length) return match;
  if (match._id?.$nin) {
    match._id.$nin = [...match._id.$nin, ...ids];
    return match;
  }
  if (match._id?.$in) {
    const blocked = new Set(ids.map((id) => String(id)));
    match._id.$in = match._id.$in.filter((id) => !blocked.has(String(id)));
    return match;
  }
  match.$and = [...(match.$and || []), { _id: { $nin: ids } }];
  return match;
}

async function queryOneSource(req, tenantKey, spec, usedEventIds, { now, capturedAt }) {
  try {
    const db = await connectToDatabase(tenantKey);
    const { Event } = getModels({ db }, 'Event');
    const tenant = await getTenantByKey(req, tenantKey);
    const cityName = tenant?.location || tenant?.name || tenantKey;
    const match = buildCurationMongoQuery(spec, { now, usedEventIds });
    const afterCursor = cursorMongoClause(spec, tenantKey);
    if (afterCursor) {
      match.$and = [...(match.$and || []), afterCursor];
    }

    const toCandidate = (event) => serializeCurationCandidate(event, {
      sourceTenantKey: tenantKey,
      cityName,
      timezone: tenant?.pivotDropTimezone || tenant?.timezone,
      spec,
      capturedAt,
    });

    let pinned = [];
    if (!spec.cursor) {
      pinned = await Event.find({ $and: [match, pinnedMongoClause()] })
        .select(EVENT_FIELDS)
        .sort({ start_time: -1, _id: -1 })
        .limit(PINNED_PAGE_MAX)
        .lean();
      excludeIds(match, pinned.map((event) => event._id));
    }

    const fetchLimit = spec.limit + 1;
    let events;
    if (spec.sort === 'relevance') {
      events = await Event.aggregate([
        { $match: match },
        relevanceStage(spec.keyword),
        { $sort: mongoSort(spec) },
        { $limit: fetchLimit },
        { $project: {
          name: 1,
          description: 1,
          image: 1,
          start_time: 1,
          end_time: 1,
          location: 1,
          richLocation: 1,
          externalLink: 1,
          createdAt: 1,
          customFields: 1,
          _curationRelevance: 1,
        } },
      ]);
    } else {
      events = await Event.find(match)
        .select(EVENT_FIELDS)
        .sort(mongoSort(spec))
        .limit(fetchLimit)
        .lean();
    }

    return {
      tenantKey,
      status: 'ok',
      fetched: events.length,
      candidates: [...pinned, ...events].map(toCandidate),
    };
  } catch (err) {
    return {
      tenantKey,
      status: 'failed',
      complete: false,
      error: err.message || 'Unable to search this city.',
      retryable: true,
      fetched: 0,
      candidates: [],
    };
  }
}

async function searchCatalogCandidates(ctx) {
  const { req, account, spec, now } = ctx;
  const requested = spec.sourceTenantKeys;
  const allowed = account.sourceTenantKeys;
  const sources = requested.length ? requested : allowed;
  for (const key of sources) {
    if (!allowed.includes(key)) {
      return fail('That source tenant is not allowed for this account.', 403, 'SOURCE_NOT_ALLOWED');
    }
  }

  const used = spec.previouslyUsedInAccount === 'any'
    ? Object.fromEntries(sources.map((key) => [key, []]))
    : await usedEventIdsByTenant(req, account._id, sources);
  const capturedAt = now;
  const sourceResults = await mapPool(sources, SOURCE_CONCURRENCY, (tenantKey) => (
    queryOneSource(req, tenantKey, spec, used[tenantKey] || [], { now, capturedAt })
  ));

  return {
    data: mergeSourcePages(sourceResults, spec),
  };
}

async function searchCurationCandidates(req, accountId, raw = {}, options = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const parsed = parseCurationQuery(raw);
  if (parsed.error) return parsed;
  const now = options.now instanceof Date ? options.now : new Date();
  const provider = resolveCurationProvider(parsed.spec.provider, searchCatalogCandidates);
  if (!provider) return fail('Unknown provider.', 400, 'UNSUPPORTED_FILTER');
  if (provider.id === VECTOR_PROVIDER_ID) return provider.search();
  return provider.search({
    req,
    account: loaded.account,
    spec: parsed.spec,
    now,
  });
}

function serializeSavedSearch(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    accountId: String(row.accountId),
    name: row.name,
    query: row.query,
    chips: chipsFromQuery(row.query),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function curationQuerySpec(req, accountId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const resetQuery = cloneDefaultQuery();
  return {
    data: {
      accountId: String(loaded.account._id),
      sourceTenantKeys: loaded.account.sourceTenantKeys,
      resetQuery,
      chips: [],
      limits: {
        pageDefault: PAGE_DEFAULT,
        pageMax: PAGE_MAX,
        savedSearches: SAVED_SEARCH_MAX,
        sourceConcurrency: SOURCE_CONCURRENCY,
      },
    },
  };
}

async function listSavedCurationSearches(req, accountId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselSavedSearch } = getGlobalModels(req, 'PivotCarouselSavedSearch');
  const docs = await PivotCarouselSavedSearch.find({ accountId: loaded.account._id })
    .sort({ updatedAt: -1 })
    .lean();
  return { data: { savedSearches: docs.map(serializeSavedSearch) } };
}

async function saveCurationSearch(req, accountId, body = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const name = text(body.name, 80);
  if (!name) return fail('A saved search name is required.', 400, 'NAME_REQUIRED');
  const parsed = parseCurationQuery({ ...body.query, cursor: null });
  if (parsed.error) return parsed;
  const { PivotCarouselSavedSearch } = getGlobalModels(req, 'PivotCarouselSavedSearch');
  const count = await PivotCarouselSavedSearch.countDocuments({ accountId: loaded.account._id });
  const existing = await PivotCarouselSavedSearch.findOne({ accountId: loaded.account._id, name });
  if (!existing && count >= SAVED_SEARCH_MAX) {
    return fail(`An account can keep ${SAVED_SEARCH_MAX} saved searches.`, 422, 'SAVED_SEARCH_CAP');
  }
  const query = { ...parsed.spec, cursor: null };
  if (existing) {
    existing.query = query;
    existing.updatedBy = actorId(req);
    existing.markModified('query');
    await existing.save();
    return { data: { savedSearch: serializeSavedSearch(existing) } };
  }
  const doc = await PivotCarouselSavedSearch.create({
    accountId: loaded.account._id,
    name,
    query,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { savedSearch: serializeSavedSearch(doc) } };
}

async function deleteSavedCurationSearch(req, accountId, searchId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselSavedSearch } = getGlobalModels(req, 'PivotCarouselSavedSearch');
  const doc = await PivotCarouselSavedSearch.findOneAndDelete({
    _id: searchId,
    accountId: loaded.account._id,
  });
  if (!doc) return fail('Saved search not found.', 404, 'SAVED_SEARCH_NOT_FOUND');
  return { data: { deleted: true, id: String(doc._id) } };
}

async function loadCurationSnapshots(req, account, refs, options = {}) {
  const allowed = new Set(account.sourceTenantKeys);
  const grouped = new Map();
  for (const raw of refs || []) {
    const tenantKey = String(raw?.sourceTenantKey || raw?.ref?.sourceTenantKey || '').trim().toLowerCase();
    const eventId = String(raw?.eventId || raw?.ref?.eventId || '').trim();
    if (!tenantKey || !eventId) continue;
    if (!allowed.has(tenantKey)) {
      return fail('That source tenant is not allowed for this account.', 403, 'SOURCE_NOT_ALLOWED');
    }
    if (!grouped.has(tenantKey)) grouped.set(tenantKey, []);
    grouped.get(tenantKey).push(eventId);
  }

  const capturedAt = options.now instanceof Date ? options.now : new Date();
  const spec = {
    provider: 'catalog',
    providerVersion: 1,
    publication: 'inspect-unreleased',
  };
  const byKey = new Map();
  const failures = [];

  const sources = [...grouped.keys()];
  const rows = await mapPool(sources, SOURCE_CONCURRENCY, async (tenantKey) => {
    try {
      const db = await connectToDatabase(tenantKey);
      const { Event } = getModels({ db }, 'Event');
      const tenant = await getTenantByKey(req, tenantKey);
      const events = await Event.find({
        _id: { $in: grouped.get(tenantKey) },
        isDeleted: { $ne: true },
      }).select(EVENT_FIELDS).lean();
      return {
        tenantKey,
        status: 'ok',
        events: events.map((event) => serializeCurationCandidate(event, {
          sourceTenantKey: tenantKey,
          cityName: tenant?.location || tenant?.name || tenantKey,
          timezone: tenant?.pivotDropTimezone || tenant?.timezone,
          spec,
          capturedAt,
        })),
      };
    } catch (err) {
      return {
        tenantKey,
        status: 'failed',
        error: err.message || 'Unable to load this city.',
        retryable: true,
        events: [],
      };
    }
  });

  for (const row of rows) {
    if (row.status !== 'ok') {
      failures.push(row);
      continue;
    }
    for (const candidate of row.events) {
      byKey.set(`${candidate.ref.sourceTenantKey}:${candidate.ref.eventId}`, candidate);
    }
  }

  return { data: { byKey, failures, capturedAt } };
}

module.exports = {
  SOURCE_CONCURRENCY,
  SAVED_SEARCH_MAX,
  searchCurationCandidates,
  curationQuerySpec,
  listSavedCurationSearches,
  saveCurationSearch,
  deleteSavedCurationSearch,
  usedEventIdsByTenant,
  loadCurationSnapshots,
};
