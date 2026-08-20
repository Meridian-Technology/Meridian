/**
 * Catalog-facing organizer helpers.
 *
 * Task 3.2 `proposeOrganizerMerges` is read-only.
 * Task 3.4 merge/split are explicit ops writes (rewrite `organizerIds` + tombstone).
 * Task 4.2 `listOrganizers` is the city-wide Catalog list (not week-gated).
 * Task 4.3 `getOrganizer` is the dossier + live audience query.
 * Task 5.1 `claimOrganizer` attaches an active PivotCreatorGrant user (ops-granted).
 *
 * @see Meridian-Mintlify/strategy/just-go-organizer-identity-plan.mdx Task 3.2 / 3.4 / 4.2 / 4.3 / 5.1
 */

const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { uniqueOrganizerIds } = require('./pivotOrganizerResolveService');
const { loadIntentStatsByEventId } = require('./pivotLabEventsService');
const { getLastOrganizerBackfill } = require('./pivotOrganizerBackfillService');
const { getActiveCreatorGrant } = require('./pivotCreatorGrantService');
const {
  PIVOT_ORGANIZER_CLAIM_STATUSES,
  PIVOT_ORGANIZER_IDENTITY_PROVIDERS,
  activeOrganizerFilter,
} = require('../schemas/pivotOrganizer');
const {
  normalizeOrganizerName,
  looksLikeJoinedMultiHost,
  upsertOrganizerAlias,
} = require('../utilities/pivotOrganizerName');
const {
  identityKey,
  normalizeHostIdentity,
} = require('../utilities/pivotHostIdentity');
const {
  diceCoefficient,
  tokenJaccard,
  stringSimilarity,
  normalizeComparableText,
  normalizeVenueName,
} = require('../utilities/pivotEventSimilarityUtils');

/** Organizer names are shorter than event titles; 0.86 (titleMin) misses near-misses. */
const ORGANIZER_FUZZY_NAME_MIN = 0.72;

const ORGANIZER_LIST_SORTS = Object.freeze(['events', 'weeks', 'audience', 'name']);
const ORGANIZER_LIST_DEFAULT_SORT = 'events';
const ORGANIZER_LIST_DEFAULT_LIMIT = 100;
const ORGANIZER_LIST_MAX_LIMIT = 200;
const CLAIM_STATUS_SET = new Set(PIVOT_ORGANIZER_CLAIM_STATUSES);
const PROVIDER_SET = new Set(PIVOT_ORGANIZER_IDENTITY_PROVIDERS);

const TITLE_STOP = new Set([
  'the',
  'a',
  'an',
  'at',
  'in',
  'on',
  'of',
  'and',
  'or',
  'to',
  'for',
  'with',
  'w',
  'vs',
  'feat',
  'featuring',
  'presents',
  'night',
  'nights',
  'party',
  'show',
  'event',
  'live',
  'concert',
  'session',
  'series',
  'vol',
  'volume',
  'part',
]);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTenantKey({ tenantKey, school } = {}) {
  return trimString(tenantKey || school).toLowerCase();
}

function organizerIdOf(doc) {
  return String(doc?._id || '');
}

function nameVariants(doc) {
  const names = new Set();
  const normalized = trimString(doc?.normalizedName);
  if (normalized) names.add(normalized);
  const canonical = normalizeOrganizerName(doc?.canonicalName);
  if (canonical) names.add(canonical);
  for (const alias of doc?.aliases || []) {
    const folded = trimString(alias?.normalized) || normalizeOrganizerName(alias?.name);
    if (folded) names.add(folded);
  }
  return [...names];
}

function nameSimilarity(left, right) {
  let best = 0;
  for (const a of nameVariants(left)) {
    for (const b of nameVariants(right)) {
      if (!a || !b) continue;
      if (a === b) return 1;
      best = Math.max(best, stringSimilarity(a, b), diceCoefficient(a, b), tokenJaccard(a, b));
    }
  }
  return best;
}

function venueKey(location) {
  return normalizeVenueName(location) || normalizeComparableText(location);
}

function imageKey(url) {
  const trimmed = trimString(url).toLowerCase().replace(/\/+$/, '');
  return trimmed;
}

function titleTokens(name) {
  return normalizeComparableText(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !TITLE_STOP.has(token));
}

function eventOrganizerIds(event) {
  const ids = event?.customFields?.pivot?.host?.organizerIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '').trim()).filter(Boolean);
}

function exclusiveEvents(events, organizerId, otherId) {
  return events.filter((event) => {
    const ids = eventOrganizerIds(event);
    return ids.includes(organizerId) && !ids.includes(otherId);
  });
}

function collectVenues(events) {
  const keys = new Set();
  for (const event of events) {
    const key = venueKey(event?.location);
    if (key) keys.add(key);
  }
  return keys;
}

function collectImages(organizer, events) {
  const keys = new Set();
  const own = imageKey(organizer?.imageUrl);
  if (own) keys.add(own);
  for (const identity of organizer?.identities || []) {
    const key = imageKey(identity?.imageUrl);
    if (key) keys.add(key);
  }
  for (const event of events) {
    const key = imageKey(event?.customFields?.pivot?.host?.imageUrl);
    if (key) keys.add(key);
  }
  return keys;
}

function collectTitleTokenCounts(events) {
  const counts = new Map();
  for (const event of events) {
    for (const token of titleTokens(event?.name)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return counts;
}

function setIntersection(left, right) {
  const out = [];
  for (const value of left) {
    if (right.has(value)) out.push(value);
  }
  return out;
}

function sharedRecurringTitleToken(leftCounts, rightCounts) {
  for (const [token, leftN] of leftCounts) {
    const rightN = rightCounts.get(token) || 0;
    if (!rightN) continue;
    if (leftN >= 2 || rightN >= 2) return token;
  }
  return '';
}

function summarizeOrganizer(doc) {
  return {
    organizerId: organizerIdOf(doc),
    canonicalName: doc.canonicalName,
    normalizedName: doc.normalizedName,
  };
}

/**
 * City-wide fuzzy merge proposals. Read-only.
 *
 * @param {object} params
 * @param {import('mongoose').Connection} params.db
 * @param {string} [params.tenantKey]
 * @param {string} [params.school]
 * @returns {Promise<{ proposals: object[] }>}
 */
async function proposeOrganizerMerges(params = {}) {
  const db = params.db;
  const tenantKey = resolveTenantKey(params);
  if (!db) {
    throw new Error('proposeOrganizerMerges requires db (tenant connection).');
  }
  if (!tenantKey) {
    throw new Error('proposeOrganizerMerges requires tenantKey.');
  }

  const { PivotOrganizer, Event } = getModels({ db, school: tenantKey }, 'PivotOrganizer', 'Event');
  const organizers = await PivotOrganizer.find({
    tenantKey,
    status: { $ne: 'merged' },
  }).lean();
  if (organizers.length < 2) {
    return { proposals: [] };
  }

  const organizerIds = organizers.map(organizerIdOf);
  const events = await Event.find({
    'customFields.pivot.host.organizerIds': { $in: organizerIds },
  })
    .select('name location customFields.pivot.host')
    .lean();

  const proposals = [];
  for (let i = 0; i < organizers.length; i += 1) {
    for (let j = i + 1; j < organizers.length; j += 1) {
      const left = organizers[i];
      const right = organizers[j];
      const score = nameSimilarity(left, right);
      if (score < ORGANIZER_FUZZY_NAME_MIN) continue;

      const leftId = organizerIdOf(left);
      const rightId = organizerIdOf(right);
      const leftEvents = exclusiveEvents(events, leftId, rightId);
      const rightEvents = exclusiveEvents(events, rightId, leftId);

      const reasons = ['name-similarity'];
      const sharedVenues = setIntersection(collectVenues(leftEvents), collectVenues(rightEvents));
      if (sharedVenues.length) reasons.push('shared-venue');

      const sharedImages = setIntersection(
        collectImages(left, leftEvents),
        collectImages(right, rightEvents),
      );
      if (sharedImages.length) reasons.push('same-image');

      const titleToken = sharedRecurringTitleToken(
        collectTitleTokenCounts(leftEvents),
        collectTitleTokenCounts(rightEvents),
      );
      if (titleToken) reasons.push('shared-title-token');

      if (reasons.length < 2) continue;

      const [a, b] =
        leftId < rightId
          ? [summarizeOrganizer(left), summarizeOrganizer(right)]
          : [summarizeOrganizer(right), summarizeOrganizer(left)];

      proposals.push({
        a,
        b,
        score: Math.round(score * 1000) / 1000,
        reasons,
      });
    }
  }

  proposals.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.a.organizerId.localeCompare(right.a.organizerId);
  });

  return { proposals };
}

const MERGE_ALIAS_SOURCE = 'merge';
const SPLIT_ALIAS_SOURCE = 'split';

function isObjectId(value) {
  const id = String(value || '').trim();
  return (
    mongoose.Types.ObjectId.isValid(id) &&
    String(new mongoose.Types.ObjectId(id)) === id
  );
}

function invalidIdError(field) {
  return {
    error: `${field} must be a valid organizer id.`,
    status: 400,
    code: 'ORGANIZER_INVALID_ID',
  };
}

function notFoundError() {
  return {
    error: 'Organizer not found.',
    status: 404,
    code: 'ORGANIZER_NOT_FOUND',
  };
}

function claimedConflictError() {
  return {
    error: 'Cannot merge two organizers claimed by different users.',
    status: 409,
    code: 'ORGANIZER_ALREADY_CLAIMED',
  };
}

function alreadyClaimedError() {
  return {
    error: 'Organizer is already claimed by another user.',
    status: 409,
    code: 'ORGANIZER_ALREADY_CLAIMED',
  };
}

function grantRequiredError() {
  return {
    error: 'An active creator grant is required for this user and city.',
    status: 409,
    code: 'CREATOR_GRANT_REQUIRED',
  };
}

function alreadyMergedError() {
  return {
    error: 'Organizer is already merged.',
    status: 409,
    code: 'ORGANIZER_ALREADY_MERGED',
  };
}

function organizerIdKeys(id) {
  const asString = String(id);
  const keys = [asString];
  if (isObjectId(asString)) keys.push(new mongoose.Types.ObjectId(asString));
  return keys;
}

function replaceOrganizerId(list, fromId, toId) {
  return uniqueOrganizerIds(
    (Array.isArray(list) ? list : []).map((value) =>
      String(value) === String(fromId) ? String(toId) : value,
    ),
  );
}

function claimedUserId(doc) {
  if (doc?.claimStatus !== 'claimed' || !doc?.claimedByUserId) return '';
  return String(doc.claimedByUserId);
}

function serializeOrganizer(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    canonicalName: row.canonicalName,
    normalizedName: row.normalizedName,
    status: row.status || 'active',
    claimStatus: row.claimStatus,
    claimedByUserId: row.claimedByUserId ? String(row.claimedByUserId) : null,
    mergedInto: row.mergedInto ? String(row.mergedInto) : null,
    aliases: row.aliases || [],
    identities: row.identities || [],
    imageUrl: row.imageUrl || null,
  };
}

async function rewriteEventOrganizerIds(Event, fromId, toId, eventIds = null) {
  const query = {
    'customFields.pivot.host.organizerIds': { $in: organizerIdKeys(fromId) },
  };
  if (Array.isArray(eventIds)) {
    const objectIds = eventIds.filter(isObjectId).map((id) => new mongoose.Types.ObjectId(id));
    if (!objectIds.length) return { rewritten: 0, events: [] };
    query._id = { $in: objectIds };
  }

  const events = await Event.find(query).select('customFields.pivot.host.organizerIds').lean();
  if (!events.length) return { rewritten: 0, events: [] };

  const writes = events.map((event) => ({
    updateOne: {
      filter: { _id: event._id },
      update: {
        $set: {
          'customFields.pivot.host.organizerIds': replaceOrganizerId(
            event.customFields?.pivot?.host?.organizerIds,
            fromId,
            toId,
          ),
        },
      },
    },
  }));
  await Event.bulkWrite(writes);
  return { rewritten: events.length, events };
}

async function runMergeOrganizers({ db, tenantKey, targetId, sourceId }) {
  if (!isObjectId(targetId)) return invalidIdError('organizerId');
  if (!isObjectId(sourceId)) return invalidIdError('sourceOrganizerId');
  if (String(targetId) === String(sourceId)) {
    return {
      error: 'Cannot merge an organizer into itself.',
      status: 400,
      code: 'ORGANIZER_MERGE_SELF',
    };
  }

  const { PivotOrganizer, Event } = getModels(
    { db, school: tenantKey },
    'PivotOrganizer',
    'Event',
  );

  const target = await PivotOrganizer.findOne({ _id: targetId, tenantKey });
  const source = await PivotOrganizer.findOne({ _id: sourceId, tenantKey });
  if (!target || !source) return notFoundError();

  if (source.status === 'merged' && String(source.mergedInto) === String(target._id)) {
    return {
      data: {
        alreadyMerged: true,
        target: serializeOrganizer(target),
        source: serializeOrganizer(source),
        eventsRewritten: 0,
      },
    };
  }
  if (source.status === 'merged' || target.status === 'merged') {
    return alreadyMergedError();
  }

  const sourceClaim = claimedUserId(source);
  const targetClaim = claimedUserId(target);
  const sourceClaimedBy = source.claimedByUserId;
  if (sourceClaim && targetClaim && sourceClaim !== targetClaim) {
    return claimedConflictError();
  }

  const now = new Date();
  const incomingIdentities = (source.identities || [])
    .map((row) => normalizeHostIdentity(row))
    .filter(Boolean);

  source.identities = [];
  source.status = 'merged';
  source.mergedInto = target._id;
  source.claimStatus = 'unclaimed';
  source.claimedByUserId = null;
  source.lastResolvedAt = now;
  await source.save();

  let aliases = Array.isArray(target.aliases) ? target.aliases : [];
  aliases = upsertOrganizerAlias(aliases, source.canonicalName, MERGE_ALIAS_SOURCE);
  for (const alias of source.aliases || []) {
    aliases = upsertOrganizerAlias(aliases, alias?.name, alias?.source || MERGE_ALIAS_SOURCE);
  }
  target.aliases = aliases;

  const identities = Array.isArray(target.identities) ? [...target.identities] : [];
  for (const identity of incomingIdentities) {
    if (!identityKey(identity)) continue;
    if (identities.some((row) => identityKey(row) === identityKey(identity))) continue;
    identities.push(identity);
  }
  target.identities = identities;

  if (!target.imageUrl && source.imageUrl) {
    target.imageUrl = source.imageUrl;
  }
  if (!targetClaim && sourceClaim) {
    target.claimStatus = 'claimed';
    target.claimedByUserId = sourceClaimedBy;
  }
  target.lastResolvedAt = now;
  await target.save();

  const { rewritten } = await rewriteEventOrganizerIds(Event, source._id, target._id);

  return {
    data: {
      alreadyMerged: false,
      target: serializeOrganizer(target),
      source: serializeOrganizer(source),
      eventsRewritten: rewritten,
    },
  };
}

async function runSplitOrganizer({
  db,
  tenantKey,
  organizerId,
  eventIds,
  newCanonicalName,
  identity,
}) {
  if (!isObjectId(organizerId)) return invalidIdError('organizerId');

  const ids = Array.isArray(eventIds)
    ? [...new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!ids.length) {
    return {
      error: 'eventIds must be a non-empty array.',
      status: 400,
      code: 'ORGANIZER_SPLIT_EMPTY',
    };
  }

  const { PivotOrganizer, Event } = getModels(
    { db, school: tenantKey },
    'PivotOrganizer',
    'Event',
  );

  const source = await PivotOrganizer.findOne({ _id: organizerId, tenantKey });
  if (!source) return notFoundError();
  if (source.status === 'merged') return alreadyMergedError();

  const objectIds = ids.filter(isObjectId).map((id) => new mongoose.Types.ObjectId(id));
  const events = await Event.find({
    _id: { $in: objectIds },
    'customFields.pivot.host.organizerIds': { $in: organizerIdKeys(source._id) },
  })
    .select('name customFields.pivot.host')
    .lean();

  if (!events.length) {
    return {
      error: 'None of the eventIds belong to this organizer.',
      status: 400,
      code: 'ORGANIZER_SPLIT_NO_EVENTS',
    };
  }

  let detachedIdentity = null;
  if (identity && typeof identity === 'object') {
    const wanted = normalizeHostIdentity(identity);
    const wantedKey = identityKey(wanted);
    if (!wantedKey) {
      return {
        error: 'identity must include a provider plus name, profileUrl, or externalId.',
        status: 400,
        code: 'ORGANIZER_IDENTITY_NOT_FOUND',
      };
    }
    const remaining = [];
    for (const row of source.identities || []) {
      if (!detachedIdentity && identityKey(row) === wantedKey) {
        detachedIdentity = normalizeHostIdentity(row) || wanted;
        continue;
      }
      remaining.push(row);
    }
    if (!detachedIdentity) {
      return {
        error: 'identity was not found on this organizer.',
        status: 404,
        code: 'ORGANIZER_IDENTITY_NOT_FOUND',
      };
    }
    source.identities = remaining;
  }

  const fallbackName =
    trimString(newCanonicalName) ||
    trimString(events[0]?.customFields?.pivot?.host?.name) ||
    `${source.canonicalName} (split)`;
  const now = new Date();
  source.lastResolvedAt = now;
  await source.save();

  const created = await PivotOrganizer.create({
    tenantKey,
    canonicalName: fallbackName,
    normalizedName: normalizeOrganizerName(fallbackName) || fallbackName.toLowerCase(),
    aliases: upsertOrganizerAlias([], fallbackName, SPLIT_ALIAS_SOURCE),
    identities: detachedIdentity ? [detachedIdentity] : undefined,
    lastResolvedAt: now,
  });

  const { rewritten } = await rewriteEventOrganizerIds(
    Event,
    source._id,
    created._id,
    events.map((event) => String(event._id)),
  );

  return {
    data: {
      source: serializeOrganizer(source),
      created: serializeOrganizer(created),
      eventsRewritten: rewritten,
    },
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseListLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return ORGANIZER_LIST_DEFAULT_LIMIT;
  return Math.min(parsed, ORGANIZER_LIST_MAX_LIMIT);
}

function parseListOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function parseListSort(value) {
  const sort = trimString(value).toLowerCase();
  return ORGANIZER_LIST_SORTS.includes(sort) ? sort : ORGANIZER_LIST_DEFAULT_SORT;
}

function uniqueAliasNames(aliases) {
  const names = [];
  const seen = new Set();
  for (const alias of aliases || []) {
    const name = trimString(alias?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function uniqueProviders(identities) {
  const providers = [];
  const seen = new Set();
  for (const identity of identities || []) {
    const provider = trimString(identity?.provider);
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    providers.push(provider);
  }
  return providers;
}

function organizerImageUrl(doc) {
  const top = trimString(doc?.imageUrl);
  if (top) return top;
  for (const identity of doc?.identities || []) {
    const imageUrl = trimString(identity?.imageUrl);
    if (imageUrl) return imageUrl;
  }
  return null;
}

function compareIsoWeekDesc(left, right) {
  return String(right || '').localeCompare(String(left || ''));
}

function compareNameAsc(left, right) {
  return String(left || '').localeCompare(String(right || ''), undefined, {
    sensitivity: 'base',
  });
}

function buildOrganizerListFilter({ tenantKey, q, claimStatus, source }) {
  const filter = activeOrganizerFilter(tenantKey);
  const status = trimString(claimStatus).toLowerCase();
  if (CLAIM_STATUS_SET.has(status)) {
    filter.claimStatus = status;
  }
  const provider = trimString(source).toLowerCase();
  if (PROVIDER_SET.has(provider)) {
    filter['identities.provider'] = provider;
  }

  const raw = trimString(q);
  if (raw) {
    const folded = normalizeOrganizerName(raw);
    const rx = new RegExp(escapeRegex(raw), 'i');
    const clauses = [
      { canonicalName: rx },
      { normalizedName: rx },
      { 'aliases.name': rx },
      { 'aliases.normalized': rx },
    ];
    if (folded && folded !== raw.toLowerCase()) {
      clauses.push({ normalizedName: folded }, { 'aliases.normalized': folded });
    }
    filter.$or = clauses;
  }
  return filter;
}

async function loadOrganizerEventStats(Event, organizerIds) {
  const statsById = new Map();
  if (!organizerIds.length) return statsById;

  const idKeys = [];
  for (const id of organizerIds) {
    idKeys.push(...organizerIdKeys(id));
  }

  const rows = await Event.aggregate([
    {
      $match: {
        'customFields.pivot.host.organizerIds': { $in: idKeys },
      },
    },
    {
      $project: {
        organizerIds: '$customFields.pivot.host.organizerIds',
        batchWeek: '$customFields.pivot.batchWeek',
      },
    },
    { $unwind: '$organizerIds' },
    {
      $project: {
        organizerId: { $toString: '$organizerIds' },
        batchWeek: 1,
      },
    },
    { $match: { organizerId: { $in: organizerIds } } },
    {
      $group: {
        _id: '$organizerId',
        eventCount: { $sum: 1 },
        weeksActive: { $addToSet: '$batchWeek' },
      },
    },
  ]);

  for (const row of rows) {
    const weeksActive = (row.weeksActive || [])
      .filter((week) => typeof week === 'string' && week.trim())
      .sort(compareIsoWeekDesc);
    statsById.set(String(row._id), {
      eventCount: row.eventCount || 0,
      weeksActive,
    });
  }
  return statsById;
}

function serializeOrganizerListRow(doc, stats) {
  return {
    id: organizerIdOf(doc),
    canonicalName: doc.canonicalName,
    aliases: uniqueAliasNames(doc.aliases),
    providers: uniqueProviders(doc.identities),
    eventCount: stats?.eventCount || 0,
    weeksActive: stats?.weeksActive || [],
    claimStatus: doc.claimStatus || 'unclaimed',
    imageUrl: organizerImageUrl(doc),
  };
}

function sortOrganizerListRows(rows, sort) {
  const copy = rows.slice();
  copy.sort((left, right) => {
    if (sort === 'name') {
      const byName = compareNameAsc(left.canonicalName, right.canonicalName);
      if (byName) return byName;
      return left.id.localeCompare(right.id);
    }
    if (sort === 'weeks') {
      const byWeeks = (right.weeksActive?.length || 0) - (left.weeksActive?.length || 0);
      if (byWeeks) return byWeeks;
    } else {
      // events (default) and audience (detail-only — same order as events)
      const byEvents = (right.eventCount || 0) - (left.eventCount || 0);
      if (byEvents) return byEvents;
    }
    const byName = compareNameAsc(left.canonicalName, right.canonicalName);
    if (byName) return byName;
    return left.id.localeCompare(right.id);
  });
  return copy;
}

/**
 * City-wide organizer catalog. Not week-gated. Hides `status: 'merged'`.
 * Audience is detail-only (Task 4.3) — `sort=audience` uses event count.
 */
async function runListOrganizers({
  db,
  tenantKey,
  q,
  claimStatus,
  source,
  sort,
  limit,
  offset,
} = {}) {
  if (!db) {
    throw new Error('runListOrganizers requires db (tenant connection).');
  }
  const key = resolveTenantKey({ tenantKey });
  if (!key) {
    throw new Error('runListOrganizers requires tenantKey.');
  }

  const parsedSort = parseListSort(sort);
  const parsedLimit = parseListLimit(limit);
  const parsedOffset = parseListOffset(offset);
  const { PivotOrganizer, Event } = getModels({ db, school: key }, 'PivotOrganizer', 'Event');

  const organizers = await PivotOrganizer.find(
    buildOrganizerListFilter({
      tenantKey: key,
      q,
      claimStatus,
      source,
    }),
  )
    .select('canonicalName aliases identities claimStatus imageUrl')
    .lean();

  const organizerIds = organizers.map(organizerIdOf);
  const [statsById, lastBackfill] = await Promise.all([
    loadOrganizerEventStats(Event, organizerIds),
    getLastOrganizerBackfill({ db, tenantKey: key }),
  ]);
  const rows = sortOrganizerListRows(
    organizers.map((doc) => serializeOrganizerListRow(doc, statsById.get(organizerIdOf(doc)))),
    parsedSort,
  );

  return {
    data: {
      tenantKey: key,
      organizers: rows.slice(parsedOffset, parsedOffset + parsedLimit),
      total: rows.length,
      limit: parsedLimit,
      offset: parsedOffset,
      sort: parsedSort,
      audience: 'detail-only',
      lastBackfill,
    },
  };
}

async function listOrganizers(req, options = {}) {
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runListOrganizers({
      db,
      tenantKey,
      q: options.q,
      claimStatus: options.claimStatus,
      source: options.source,
      sort: options.sort,
      limit: options.limit,
      offset: options.offset,
    }),
  );
}

const UNLINKED_EVENT_QUERY = Object.freeze({
  'customFields.pivot': { $exists: true },
  isDeleted: { $ne: true },
  'customFields.pivot.host.organizerIds.0': { $exists: false },
});

function classifyUnlinkedKind(hostName, collisionCounts) {
  if (looksLikeJoinedMultiHost(hostName)) return 'leftover';
  const folded = normalizeOrganizerName(hostName);
  if (folded && (collisionCounts.get(folded) || 0) >= 2) return 'ambiguous';
  return 'leftover';
}

function serializeUnlinkedEvent(event, kind) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};
  return {
    id: String(event._id),
    name: event.name,
    hostName: trimString(host.name) || null,
    source: pivot.source || null,
    batchWeek: pivot.batchWeek || null,
    ingestStatus: pivot.ingestStatus || null,
    start: event.start_time || null,
    kind,
  };
}

/**
 * Events with pivot metadata and empty / missing `organizerIds`.
 * Also returns last-run backfill + fuzzy proposals (no extra locked route).
 */
async function runListUnlinkedOrganizerEvents({
  db,
  tenantKey,
  kind,
  limit,
  offset,
} = {}) {
  if (!db) {
    throw new Error('runListUnlinkedOrganizerEvents requires db (tenant connection).');
  }
  const key = resolveTenantKey({ tenantKey });
  if (!key) {
    throw new Error('runListUnlinkedOrganizerEvents requires tenantKey.');
  }

  const parsedLimit = parseListLimit(limit);
  const parsedOffset = parseListOffset(offset);
  const kindFilter = trimString(kind).toLowerCase();
  const { Event, PivotOrganizer } = getModels(
    { db, school: key },
    'Event',
    'PivotOrganizer',
  );

  const [events, organizers, lastBackfill, proposed] = await Promise.all([
    Event.find(UNLINKED_EVENT_QUERY)
      .select('name start_time customFields.pivot')
      .lean(),
    PivotOrganizer.find(activeOrganizerFilter(key)).select('normalizedName').lean(),
    getLastOrganizerBackfill({ db, tenantKey: key }),
    proposeOrganizerMerges({ db, tenantKey: key }),
  ]);

  const collisionCounts = new Map();
  for (const organizer of organizers) {
    const folded = trimString(organizer.normalizedName);
    if (!folded) continue;
    collisionCounts.set(folded, (collisionCounts.get(folded) || 0) + 1);
  }

  const classified = events.map((event) => {
    const hostName = event.customFields?.pivot?.host?.name;
    return serializeUnlinkedEvent(event, classifyUnlinkedKind(hostName, collisionCounts));
  });
  const leftover = classified.filter((row) => row.kind === 'leftover').length;
  const ambiguous = classified.filter((row) => row.kind === 'ambiguous').length;
  const rows = classified
    .filter((row) => {
      if (kindFilter === 'ambiguous' || kindFilter === 'leftover') {
        return row.kind === kindFilter;
      }
      return true;
    })
    .sort((left, right) => {
      const byWeek = compareIsoWeekDesc(left.batchWeek, right.batchWeek);
      if (byWeek) return byWeek;
      return compareNameAsc(left.hostName || left.name, right.hostName || right.name);
    });

  return {
    data: {
      tenantKey: key,
      events: rows.slice(parsedOffset, parsedOffset + parsedLimit),
      total: rows.length,
      leftover,
      ambiguous,
      limit: parsedLimit,
      offset: parsedOffset,
      lastBackfill,
      proposals: proposed.proposals || [],
    },
  };
}

async function listUnlinkedOrganizerEvents(req, options = {}) {
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runListUnlinkedOrganizerEvents({
      db,
      tenantKey,
      kind: options.kind,
      limit: options.limit,
      offset: options.offset,
    }),
  );
}

const EMPTY_AUDIENCE = Object.freeze({
  interested: 0,
  registered: 0,
  passed: 0,
  externalOpens: 0,
  repeatUsers: 0,
});

function serializeOrganizerDetail(doc) {
  return {
    ...serializeOrganizer(doc),
    kind: doc.kind || 'unclear',
    providers: uniqueProviders(doc.identities),
    imageUrl: organizerImageUrl(doc),
    lastResolvedAt: doc.lastResolvedAt || null,
  };
}

function serializeOrganizerEvent(event, intentStats) {
  const pivot = event.customFields?.pivot || {};
  return {
    id: String(event._id),
    name: event.name,
    batchWeek: pivot.batchWeek || null,
    ingestStatus: pivot.ingestStatus || null,
    source: pivot.source || null,
    start: event.start_time || null,
    intentStats: intentStats || {
      interested: 0,
      registered: 0,
      passed: 0,
      externalOpens: 0,
      externalOpenUsers: 0,
    },
  };
}

function sortOrganizerEvents(events) {
  return events.slice().sort((left, right) => {
    const byWeek = compareIsoWeekDesc(left.batchWeek, right.batchWeek);
    if (byWeek) return byWeek;
    const leftStart = left.start ? Date.parse(left.start) : 0;
    const rightStart = right.start ? Date.parse(right.start) : 0;
    if (rightStart !== leftStart) return rightStart - leftStart;
    return String(left.id).localeCompare(String(right.id));
  });
}

async function loadOrganizerAudience(PivotEventIntent, eventIds) {
  if (!eventIds.length) {
    return { ...EMPTY_AUDIENCE };
  }

  const rows = await PivotEventIntent.aggregate([
    { $match: { eventId: { $in: eventIds } } },
    {
      $group: {
        _id: '$userId',
        statuses: { $addToSet: '$status' },
        eventIds: { $addToSet: '$eventId' },
        externalOpens: { $sum: { $ifNull: ['$externalOpenCount', 0] } },
      },
    },
  ]);

  const audience = { ...EMPTY_AUDIENCE };
  for (const row of rows) {
    const statuses = row.statuses || [];
    if (statuses.includes('interested')) audience.interested += 1;
    if (statuses.includes('registered')) audience.registered += 1;
    if (statuses.includes('passed')) audience.passed += 1;
    audience.externalOpens += row.externalOpens || 0;
    if ((row.eventIds || []).length >= 2) audience.repeatUsers += 1;
  }
  return audience;
}

/**
 * Organizer dossier. Audience is a live query, not a weekly rollup.
 * Hides `status: 'merged'` (same as the list).
 */
async function runGetOrganizer({ db, tenantKey, organizerId } = {}) {
  if (!db) {
    throw new Error('runGetOrganizer requires db (tenant connection).');
  }
  const key = resolveTenantKey({ tenantKey });
  if (!key) {
    throw new Error('runGetOrganizer requires tenantKey.');
  }
  if (!isObjectId(organizerId)) {
    return invalidIdError('organizerId');
  }

  const { PivotOrganizer, Event, PivotEventIntent } = getModels(
    { db, school: key },
    'PivotOrganizer',
    'Event',
    'PivotEventIntent',
  );

  const organizer = await PivotOrganizer.findOne({
    _id: organizerId,
    ...activeOrganizerFilter(key),
  }).lean();
  if (!organizer) {
    return notFoundError();
  }

  const events = await Event.find({
    'customFields.pivot.host.organizerIds': { $in: organizerIdKeys(organizerId) },
    isDeleted: { $ne: true },
  })
    .select('name start_time customFields.pivot')
    .lean();

  const eventIds = events.map((event) => event._id);
  const [intentStatsByEventId, audience] = await Promise.all([
    loadIntentStatsByEventId(PivotEventIntent, eventIds),
    loadOrganizerAudience(PivotEventIntent, eventIds),
  ]);

  return {
    data: {
      tenantKey: key,
      organizer: serializeOrganizerDetail(organizer),
      events: sortOrganizerEvents(
        events.map((event) =>
          serializeOrganizerEvent(event, intentStatsByEventId.get(String(event._id))),
        ),
      ),
      audience,
    },
  };
}

async function getOrganizer(req, options = {}) {
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runGetOrganizer({
      db,
      tenantKey,
      organizerId: options.organizerId,
    }),
  );
}

async function withTenantDb(req, tenantKey, fn) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;
  const key = tenantResult.tenant.tenantKey;
  const db = await connectToDatabase(key);
  return fn({ db, tenantKey: key });
}

async function mergeOrganizers(req, options = {}) {
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runMergeOrganizers({
      db,
      tenantKey,
      targetId: options.organizerId,
      sourceId: options.sourceOrganizerId,
    }),
  );
}

async function splitOrganizer(req, options = {}) {
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runSplitOrganizer({
      db,
      tenantKey,
      organizerId: options.organizerId,
      eventIds: options.eventIds,
      newCanonicalName: options.newCanonicalName,
      identity: options.identity,
    }),
  );
}

/**
 * Ops-granted claim. Does not rewrite Event.source or createdByUserId.
 *
 * Unclaim: `{ unclaim: true }` → claimStatus unclaimed + clear claimedByUserId.
 * Reassign is two-step (unclaim, then claim). Claim-to-other while claimed → 409.
 */
async function runClaimOrganizer({
  db,
  tenantKey,
  organizerId,
  globalUserId,
  unclaim = false,
  findActiveGrant,
} = {}) {
  if (!isObjectId(organizerId)) return invalidIdError('organizerId');

  const key = resolveTenantKey({ tenantKey });
  const { PivotOrganizer } = getModels({ db, school: key }, 'PivotOrganizer');

  const organizer = await PivotOrganizer.findOne({
    _id: organizerId,
    ...activeOrganizerFilter(key),
  });
  if (!organizer) return notFoundError();

  if (unclaim) {
    const alreadyUnclaimed =
      organizer.claimStatus === 'unclaimed' && !organizer.claimedByUserId;
    if (!alreadyUnclaimed) {
      organizer.claimStatus = 'unclaimed';
      organizer.claimedByUserId = null;
      await organizer.save();
    }
    return {
      data: {
        organizer: serializeOrganizer(organizer),
        unclaimed: true,
        alreadyUnclaimed,
      },
    };
  }

  const userId = String(globalUserId || '').trim();
  if (!isObjectId(userId)) {
    return {
      error: 'globalUserId must be a valid ObjectId.',
      status: 400,
      code: 'INVALID_GLOBAL_USER_ID',
    };
  }

  const grant =
    typeof findActiveGrant === 'function'
      ? await findActiveGrant({ globalUserId: userId, tenantKey: key })
      : null;
  if (!grant) return grantRequiredError();

  const existingClaim = claimedUserId(organizer);
  if (existingClaim && existingClaim !== userId) {
    return alreadyClaimedError();
  }

  const alreadyClaimed = existingClaim === userId && organizer.claimStatus === 'claimed';
  if (!alreadyClaimed) {
    organizer.claimedByUserId = userId;
    organizer.claimStatus = 'claimed';
    await organizer.save();
  }

  return {
    data: {
      organizer: serializeOrganizer(organizer),
      alreadyClaimed,
    },
  };
}

async function claimOrganizer(req, options = {}) {
  const unclaim = options.unclaim === true || options.unclaim === 'true';
  return withTenantDb(req, options.tenantKey, ({ db, tenantKey }) =>
    runClaimOrganizer({
      db,
      tenantKey,
      organizerId: options.organizerId,
      globalUserId: options.globalUserId || options.userId,
      unclaim,
      findActiveGrant: ({ globalUserId, tenantKey: grantTenantKey }) =>
        getActiveCreatorGrant(req, {
          globalUserId,
          tenantKey: grantTenantKey,
        }),
    }),
  );
}

module.exports = {
  proposeOrganizerMerges,
  listOrganizers,
  runListOrganizers,
  getOrganizer,
  runGetOrganizer,
  listUnlinkedOrganizerEvents,
  runListUnlinkedOrganizerEvents,
  mergeOrganizers,
  splitOrganizer,
  runMergeOrganizers,
  runSplitOrganizer,
  claimOrganizer,
  runClaimOrganizer,
  ORGANIZER_FUZZY_NAME_MIN,
  ORGANIZER_LIST_SORTS,
  ORGANIZER_LIST_DEFAULT_SORT,
  ORGANIZER_LIST_DEFAULT_LIMIT,
  ORGANIZER_LIST_MAX_LIMIT,
};
