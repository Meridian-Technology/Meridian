/**
 * Historical organizer attribution. Same resolver as crawl; no Firecrawl.
 *
 * Skips events that already have `host.organizerIds` as an array (including
 * `[]` leftovers) unless `force`. Does not call proposeOrganizerMerges.
 *
 * @see Meridian-Mintlify/strategy/just-go-organizer-identity-plan.mdx Task 3.3
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const {
  resolveOrganizers,
  identitiesToResolve,
  uniqueOrganizerIds,
} = require('./pivotOrganizerResolveService');
const {
  IDENTITY_PROVIDERS,
  identityKey,
  normalizeProfileUrl,
} = require('../utilities/pivotHostIdentity');
const { normalizeOrganizerName } = require('../utilities/pivotOrganizerName');

const BACKFILL_PAGE_SIZE = 100;
const AMBIGUOUS_NAMES_CAP = 40;
const PROVIDER_SET = new Set(IDENTITY_PROVIDERS);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTenantKey({ tenantKey, school } = {}) {
  return trimString(tenantKey || school).toLowerCase();
}

function providerFromSource(source, profileUrl) {
  const trimmed = trimString(source).toLowerCase();
  if (PROVIDER_SET.has(trimmed)) return trimmed;
  if (trimmed === 'lu.ma') return 'luma';

  const url = (profileUrl || '').toLowerCase();
  if (url.includes('partiful.com')) return 'partiful';
  if (url.includes('luma.com') || url.includes('lu.ma')) return 'luma';
  return 'generic-site';
}

/**
 * Prefer persisted `host.identities`. Historical rows often only have
 * `host.name` / `host.profileUrl` / pivot `source`.
 */
function identitiesFromStoredHost(host, source) {
  const stored = Array.isArray(host?.identities) ? host.identities.filter(Boolean) : [];
  if (stored.length) return stored;

  const name = trimString(host?.name);
  const profileUrl = normalizeProfileUrl(host?.profileUrl) || trimString(host?.profileUrl);
  const imageUrl = trimString(host?.imageUrl);
  if (!name && !profileUrl) return [];

  const identity = {
    provider: providerFromSource(source, profileUrl),
  };
  if (name) identity.name = name;
  if (profileUrl) identity.profileUrl = profileUrl;
  if (imageUrl) identity.imageUrl = imageUrl;
  return [identity];
}

function alreadyResolved(host) {
  return Array.isArray(host?.organizerIds);
}

function cacheKeyForIdentity(identity, displayName) {
  return (
    identityKey(identity) ||
    `name::${normalizeOrganizerName(identity?.name || displayName)}`
  );
}

async function resolveIdentityOnce({ db, tenantKey, identity, displayName, cache }) {
  const key = cacheKeyForIdentity(identity, displayName);
  if (cache.has(key)) {
    const cached = cache.get(key);
    return { ...cached, created: 0 };
  }

  const result = await resolveOrganizers({
    db,
    tenantKey,
    identities: identity ? [identity] : [],
    displayName,
  });
  const entry = {
    organizerIds: result.organizerIds,
    ambiguous: result.ambiguous,
    created: result.created.length,
  };
  cache.set(key, entry);
  return entry;
}

async function resolveEventHost({ db, tenantKey, host, source, cache }) {
  const displayName = trimString(host?.name);
  const built = identitiesFromStoredHost(host, source);
  const { identities, leftover } = identitiesToResolve(built, displayName);

  if (leftover || !identities.length) {
    return { organizerIds: [], kind: 'unlinked', created: 0 };
  }

  const organizerIds = [];
  let created = 0;
  let sawAmbiguous = false;

  for (const identity of identities) {
    const cached = await resolveIdentityOnce({
      db,
      tenantKey,
      identity,
      displayName: identity.name || displayName,
      cache,
    });
    created += cached.created || 0;
    if (cached.ambiguous?.length) {
      sawAmbiguous = true;
      continue;
    }
    organizerIds.push(...cached.organizerIds);
  }

  const ids = uniqueOrganizerIds(organizerIds);
  if (ids.length) return { organizerIds: ids, kind: 'linked', created };
  if (sawAmbiguous) return { organizerIds: [], kind: 'ambiguous', created };
  return { organizerIds: [], kind: 'unlinked', created };
}

function emptyCounts() {
  return {
    scanned: 0,
    linked: 0,
    skipped: 0,
    ambiguous: 0,
    unlinked: 0,
    createdOrganizers: 0,
  };
}

function serializeLastBackfill(doc) {
  if (!doc) return null;
  return {
    ranAt: doc.ranAt,
    force: Boolean(doc.force),
    scanned: doc.scanned || 0,
    linked: doc.linked || 0,
    skipped: doc.skipped || 0,
    ambiguous: doc.ambiguous || 0,
    unlinked: doc.unlinked || 0,
    createdOrganizers: doc.createdOrganizers || 0,
    ambiguousNames: Array.isArray(doc.ambiguousNames) ? doc.ambiguousNames : [],
  };
}

async function persistLastBackfill(PivotOrganizerBackfillRun, tenantKey, counts, force) {
  const ranAt = new Date();
  const doc = await PivotOrganizerBackfillRun.findOneAndUpdate(
    { tenantKey },
    {
      $set: {
        tenantKey,
        ranAt,
        force: Boolean(force),
        ...counts,
      },
    },
    { upsert: true, new: true },
  );
  return serializeLastBackfill(doc);
}

/**
 * Walk city Events and stamp `host.organizerIds` via `resolveOrganizers`.
 *
 * @param {object} params
 * @param {import('mongoose').Connection} params.db
 * @param {string} [params.tenantKey]
 * @param {string} [params.school]
 * @param {boolean} [params.force]
 * @param {number} [params.pageSize]
 */
async function runOrganizerBackfill(params = {}) {
  const db = params.db;
  const tenantKey = resolveTenantKey(params);
  const force = Boolean(params.force);
  const pageSize = Math.max(1, Number(params.pageSize) || BACKFILL_PAGE_SIZE);

  if (!db) {
    throw new Error('runOrganizerBackfill requires db (tenant connection).');
  }
  if (!tenantKey) {
    throw new Error('runOrganizerBackfill requires tenantKey.');
  }

  const { Event, PivotOrganizerBackfillRun } = getModels(
    { db, school: tenantKey },
    'Event',
    'PivotOrganizerBackfillRun',
  );

  const counts = emptyCounts();
  const cache = new Map();
  const ambiguousNames = [];
  const ambiguousSeen = new Set();
  let lastId = null;

  for (;;) {
    const query = {
      'customFields.pivot': { $exists: true },
      isDeleted: { $ne: true },
    };
    if (lastId) query._id = { $gt: lastId };

    const page = await Event.find(query)
      .sort({ _id: 1 })
      .limit(pageSize)
      .select('_id customFields.pivot.host customFields.pivot.source')
      .lean();

    if (!page.length) break;

    const writes = [];
    for (const event of page) {
      counts.scanned += 1;
      const host = event.customFields?.pivot?.host || {};
      if (!force && alreadyResolved(host)) {
        counts.skipped += 1;
        continue;
      }

      const resolved = await resolveEventHost({
        db,
        tenantKey,
        host,
        source: event.customFields?.pivot?.source,
        cache,
      });
      counts.createdOrganizers += resolved.created;
      if (resolved.kind === 'linked') counts.linked += 1;
      else if (resolved.kind === 'ambiguous') {
        counts.ambiguous += 1;
        const hostName = trimString(host.name);
        const nameKey = hostName.toLowerCase();
        if (hostName && !ambiguousSeen.has(nameKey) && ambiguousNames.length < AMBIGUOUS_NAMES_CAP) {
          ambiguousSeen.add(nameKey);
          ambiguousNames.push(hostName);
        }
      } else counts.unlinked += 1;

      writes.push({
        updateOne: {
          filter: { _id: event._id },
          update: {
            $set: { 'customFields.pivot.host.organizerIds': resolved.organizerIds },
          },
        },
      });
    }

    if (writes.length) {
      await Event.bulkWrite(writes);
    }

    lastId = page[page.length - 1]._id;
    if (page.length < pageSize) break;
  }

  const lastBackfill = await persistLastBackfill(
    PivotOrganizerBackfillRun,
    tenantKey,
    { ...counts, ambiguousNames },
    force,
  );

  return {
    ...counts,
    lastBackfill,
  };
}

async function getLastOrganizerBackfill({ db, tenantKey, school } = {}) {
  const key = resolveTenantKey({ tenantKey, school });
  if (!db || !key) return null;
  const { PivotOrganizerBackfillRun } = getModels(
    { db, school: key },
    'PivotOrganizerBackfillRun',
  );
  const doc = await PivotOrganizerBackfillRun.findOne({ tenantKey: key }).lean();
  return serializeLastBackfill(doc);
}

async function backfillOrganizers(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const db = await connectToDatabase(tenantKey);
  const data = await runOrganizerBackfill({
    db,
    tenantKey,
    force: options.force,
    pageSize: options.pageSize,
  });
  return { data: { tenantKey, ...data } };
}

module.exports = {
  backfillOrganizers,
  runOrganizerBackfill,
  getLastOrganizerBackfill,
  identitiesFromStoredHost,
  BACKFILL_PAGE_SIZE,
};
