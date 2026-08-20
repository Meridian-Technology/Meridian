/**
 * Deterministic organizer resolve (tiers 1–2). Shared by crawl, publish, backfill.
 *
 * Tier 1: normalized profileUrl or (provider, externalId) — attach or create.
 * Tier 2: unique normalizedName in this city — attach or create; 2+ is ambiguous.
 * Co-hosts resolve independently. Joined "Alice & Bob" display names stay unlinked.
 *
 * @see Meridian-Mintlify/strategy/just-go-organizer-identity-plan.mdx Task 2.2
 */

const getModels = require('./getModelService');
const { activeOrganizerFilter } = require('../schemas/pivotOrganizer');
const {
  normalizeOrganizerName,
  looksLikeJoinedMultiHost,
  upsertOrganizerAlias,
} = require('../utilities/pivotOrganizerName');
const {
  normalizeProfileUrl,
  normalizeHostIdentity,
  identityKey,
  unionHostIdentities,
  identityFromDisplayName,
} = require('../utilities/pivotHostIdentity');

const ALIAS_SOURCE = 'resolve';
const DISPLAY_NAME_FALLBACK_PROVIDER = 'manual';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTenantKey({ tenantKey, school } = {}) {
  return trimString(tenantKey || school).toLowerCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return '';
}

function sanitizeIdentity(raw) {
  const identity = normalizeHostIdentity(raw);
  if (!identity) return null;
  const confidence = Number(raw?.confidence);
  if (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) {
    identity.confidence = confidence;
  }
  return identity;
}

function hasHardId(identity) {
  if (!identity) return false;
  return Boolean(normalizeProfileUrl(identity.profileUrl) || trimString(identity.externalId));
}

function rawNameOf(identity, displayName) {
  return firstNonEmpty(identity?.name, displayName);
}

function canonicalNameForCreate(identity, displayName) {
  return (
    firstNonEmpty(
      identity?.name,
      displayName,
      identity?.externalId,
      identity?.profileUrl,
    ) || 'Unknown'
  );
}

function identitiesToResolve(identities, displayName) {
  const fromDraft = unionHostIdentities(identities).map(sanitizeIdentity).filter(Boolean);
  if (fromDraft.length) {
    return { identities: fromDraft, leftover: null };
  }

  const name = trimString(displayName);
  if (!name) return { identities: [], leftover: null };
  if (looksLikeJoinedMultiHost(name)) {
    return { identities: [], leftover: { reason: 'joined-multi-host', name } };
  }

  const fallback = identityFromDisplayName(name, DISPLAY_NAME_FALLBACK_PROVIDER);
  return { identities: fallback ? [fallback] : [], leftover: null };
}

function identityExists(identities, incoming) {
  const key = identityKey(incoming);
  if (!key) return false;
  return (identities || []).some((row) => identityKey(row) === key);
}

async function findByHardId(PivotOrganizer, tenantKey, identity) {
  const active = activeOrganizerFilter(tenantKey);
  const profileUrl = normalizeProfileUrl(identity?.profileUrl);
  if (profileUrl) {
    const byUrl = await PivotOrganizer.findOne({
      ...active,
      'identities.profileUrl': profileUrl,
    });
    if (byUrl) return byUrl;
  }

  const provider = trimString(identity?.provider);
  const externalId = trimString(identity?.externalId);
  if (!provider || !externalId) return null;

  return PivotOrganizer.findOne({
    ...active,
    'identities.provider': provider,
    'identities.externalId': externalId,
  });
}

async function findByNormalizedName(PivotOrganizer, tenantKey, normalized) {
  if (!normalized) return [];
  return PivotOrganizer.find({
    ...activeOrganizerFilter(tenantKey),
    $or: [{ normalizedName: normalized }, { 'aliases.normalized': normalized }],
  });
}

async function touchOrganizer(doc, { identity, rawName, now }) {
  const aliases = upsertOrganizerAlias(doc.aliases, rawName, ALIAS_SOURCE);
  if (aliases !== doc.aliases) {
    doc.aliases = aliases;
  }

  const identities = Array.isArray(doc.identities) ? doc.identities : [];
  if (identity && !identityExists(identities, identity)) {
    identities.push(identity);
    doc.identities = identities;
  }

  if (!doc.imageUrl && identity?.imageUrl) {
    doc.imageUrl = identity.imageUrl;
  }

  doc.lastResolvedAt = now;
  await doc.save();
  return doc;
}

async function createOrganizer(PivotOrganizer, { tenantKey, identity, displayName, now }) {
  const rawName = canonicalNameForCreate(identity, displayName);
  const normalized = normalizeOrganizerName(rawName);
  const aliases = upsertOrganizerAlias([], rawName, ALIAS_SOURCE);
  const payload = {
    tenantKey,
    canonicalName: rawName,
    normalizedName: normalized || rawName.toLowerCase(),
    aliases: aliases.length ? aliases : undefined,
    identities: identity ? [identity] : undefined,
    ...(identity?.imageUrl ? { imageUrl: identity.imageUrl } : {}),
    lastResolvedAt: now,
  };

  try {
    return await PivotOrganizer.create(payload);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const raced = await findByHardId(PivotOrganizer, tenantKey, identity);
    if (raced) {
      return touchOrganizer(raced, {
        identity,
        rawName: rawNameOf(identity, displayName),
        now,
      });
    }
    throw error;
  }
}

function outcomeRow(organizerId, identity, extra = {}) {
  return {
    organizerId: organizerId ? String(organizerId) : null,
    identity: identity || null,
    ...extra,
  };
}

async function resolveOne(PivotOrganizer, { tenantKey, identity, displayName, now }) {
  const rawName = rawNameOf(identity, displayName);
  const normalized = normalizeOrganizerName(rawName);

  if (hasHardId(identity)) {
    const existing = await findByHardId(PivotOrganizer, tenantKey, identity);
    if (existing) {
      await touchOrganizer(existing, { identity, rawName, now });
      return { kind: 'attached', organizerId: existing._id, identity };
    }
    const created = await createOrganizer(PivotOrganizer, {
      tenantKey,
      identity,
      displayName,
      now,
    });
    return { kind: 'created', organizerId: created._id, identity };
  }

  if (!normalized || looksLikeJoinedMultiHost(rawName)) {
    return { kind: 'unlinked', identity, name: rawName, normalizedName: normalized };
  }

  const matches = await findByNormalizedName(PivotOrganizer, tenantKey, normalized);
  if (matches.length >= 2) {
    return {
      kind: 'ambiguous',
      identity,
      name: rawName,
      normalizedName: normalized,
      candidateIds: matches.map((row) => String(row._id)),
    };
  }
  if (matches.length === 1) {
    await touchOrganizer(matches[0], { identity, rawName, now });
    return { kind: 'attached', organizerId: matches[0]._id, identity };
  }

  const created = await createOrganizer(PivotOrganizer, {
    tenantKey,
    identity,
    displayName: rawName || displayName,
    now,
  });
  return { kind: 'created', organizerId: created._id, identity };
}

/**
 * Resolve unique organizers for one draft (or a cached identity batch).
 *
 * @param {object} params
 * @param {import('mongoose').Connection} params.db
 * @param {string} [params.tenantKey]
 * @param {string} [params.school]
 * @param {object[]} [params.identities]
 * @param {string} [params.displayName]
 * @returns {Promise<{
 *   organizerIds: string[],
 *   created: object[],
 *   attached: object[],
 *   ambiguous: object[],
 * }>}
 */
async function resolveOrganizers(params = {}) {
  const db = params.db;
  const tenantKey = resolveTenantKey(params);
  if (!db) {
    throw new Error('resolveOrganizers requires db (tenant connection).');
  }
  if (!tenantKey) {
    throw new Error('resolveOrganizers requires tenantKey.');
  }

  const { PivotOrganizer } = getModels({ db }, 'PivotOrganizer');
  const { identities, leftover } = identitiesToResolve(params.identities, params.displayName);
  const empty = { organizerIds: [], created: [], attached: [], ambiguous: [] };
  if (leftover || !identities.length) {
    return empty;
  }

  const now = new Date();
  const organizerIds = [];
  const created = [];
  const attached = [];
  const ambiguous = [];
  const seenIds = new Set();

  for (const identity of identities) {
    const result = await resolveOne(PivotOrganizer, {
      tenantKey,
      identity,
      displayName: params.displayName,
      now,
    });

    if (result.kind === 'ambiguous') {
      ambiguous.push({
        name: result.name,
        normalizedName: result.normalizedName,
        candidateIds: result.candidateIds,
        identity: result.identity,
      });
      continue;
    }

    if (result.kind !== 'created' && result.kind !== 'attached') {
      continue;
    }

    const organizerId = String(result.organizerId);
    const row = outcomeRow(organizerId, result.identity);
    if (result.kind === 'created') created.push(row);
    else attached.push(row);

    if (!seenIds.has(organizerId)) {
      seenIds.add(organizerId);
      organizerIds.push(organizerId);
    }
  }

  return { organizerIds, created, attached, ambiguous };
}

function uniqueOrganizerIds(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      const id = String(value || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function cacheKeyForIdentity(identity, displayName) {
  return (
    identityKey(identity) ||
    `name::${normalizeOrganizerName(identity?.name || displayName)}`
  );
}

async function resolveIdentityOnce({ db, tenantKey, identity, displayName, cache }) {
  const key = cacheKeyForIdentity(identity, displayName);
  if (cache.has(key)) return cache.get(key);

  const result = await resolveOrganizers({
    db,
    tenantKey,
    identities: identity ? [identity] : [],
    displayName,
  });
  const entry = {
    organizerIds: result.organizerIds,
    ambiguous: result.ambiguous,
  };
  cache.set(key, entry);
  return entry;
}

function draftFromEntry(entry) {
  if (entry?.draft && typeof entry.draft === 'object') return entry.draft;
  if (entry && typeof entry === 'object') return entry;
  return null;
}

/**
 * Stamp `organizerIds` on each crawl draft. Resolves each distinct identity
 * once (in-memory cache) — not once per event.
 *
 * Mutates `entry.draft.organizerIds` (empty array = already resolved / leftover).
 */
async function attachOrganizerIdsToDrafts({ db, tenantKey, drafts = [], stats = null } = {}) {
  if (!db) {
    throw new Error('attachOrganizerIdsToDrafts requires db (tenant connection).');
  }

  const cache = new Map();
  let resolved = 0;
  let ambiguous = 0;
  let unlinked = 0;

  for (const entry of drafts) {
    const draft = draftFromEntry(entry);
    if (!draft) continue;

    const displayName = draft.hostName;
    const { identities, leftover } = identitiesToResolve(
      draft.hostIdentities || draft.identities,
      displayName,
    );

    if (leftover || !identities.length) {
      draft.organizerIds = [];
      unlinked += 1;
      continue;
    }

    const organizerIds = [];
    let sawAmbiguous = false;
    for (const identity of identities) {
      const cached = await resolveIdentityOnce({
        db,
        tenantKey,
        identity,
        displayName: identity.name || displayName,
        cache,
      });
      if (cached.ambiguous?.length) {
        sawAmbiguous = true;
        continue;
      }
      organizerIds.push(...cached.organizerIds);
    }

    draft.organizerIds = uniqueOrganizerIds(organizerIds);
    if (draft.organizerIds.length) {
      resolved += 1;
    } else if (sawAmbiguous) {
      ambiguous += 1;
    } else {
      unlinked += 1;
    }
  }

  if (stats && typeof stats === 'object') {
    stats.organizerResolved = (stats.organizerResolved || 0) + resolved;
    stats.organizerAmbiguous = (stats.organizerAmbiguous || 0) + ambiguous;
    stats.organizerUnlinked = (stats.organizerUnlinked || 0) + unlinked;
    stats.organizerUniqueIdentities = cache.size;
  }

  return { cacheSize: cache.size, resolved, ambiguous, unlinked };
}

module.exports = {
  resolveOrganizers,
  attachOrganizerIdsToDrafts,
  uniqueOrganizerIds,
  normalizeOrganizerName,
  normalizeProfileUrl,
  identitiesToResolve,
  upsertOrganizerAlias,
  ALIAS_SOURCE,
};
