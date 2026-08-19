const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const {
  PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
} = require('../schemas/pivotCopyPack');
const {
  CATALOG_KEYS,
  CATALOG_SCHEMA_VERSION,
  CATALOG_SHIPPED_ENTRIES,
  CATALOG_SHIPPED_TOKENS,
  COPY_ENTRY_MAX_LENGTH,
  COPY_PATCH_MAX_KEYS,
  COPY_TOKEN_MAX_LENGTH,
  PIVOT_COPY_SCHEMA_VERSION,
  PIVOT_COPY_TOKEN_NAMES,
  getShippedCopyToken,
  isCatalogCopyKey,
  isCopyTokenName,
  isRemoteCopyKey,
} = require('../utilities/pivotCopyCatalog');

/**
 * Consumer copy pointer / ETag revision.
 * `p{platformRev}:t{tenantRev}` — missing row is 0. Tenant wins on merge;
 * this string only versions the two layers, it is not a key list hash.
 */
function formatCopyRevision(platformRevision, tenantRevision) {
  const platform = Number.isFinite(Number(platformRevision))
    ? Math.max(0, Math.trunc(Number(platformRevision)))
    : 0;
  const tenant = Number.isFinite(Number(tenantRevision))
    ? Math.max(0, Math.trunc(Number(tenantRevision)))
    : 0;
  return `p${platform}:t${tenant}`;
}

function copyRevisionEtag(revision) {
  return `"${String(revision ?? '')}"`;
}

/** True when `If-None-Match` matches the composite copy revision. */
function copyRevisionNotModified(ifNoneMatch, revision) {
  if (ifNoneMatch == null || ifNoneMatch === '' || revision == null || revision === '') {
    return false;
  }
  const expected = copyRevisionEtag(revision);
  return String(ifNoneMatch)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      if (part === '*') {
        return true;
      }
      const normalized = part.replace(/^W\//i, '').trim();
      return normalized === expected;
    });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sparseStringMap(value) {
  const source =
    value instanceof Map ? Object.fromEntries(value.entries()) : value;
  if (!isPlainObject(source)) {
    return {};
  }
  const out = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') {
      out[key] = entry;
    }
  }
  return out;
}

function filterStoredEntries(value) {
  const out = {};
  for (const [key, entry] of Object.entries(sparseStringMap(value))) {
    if (isRemoteCopyKey(key)) {
      out[key] = entry;
    }
  }
  return out;
}

function filterStoredTokens(value) {
  const out = {};
  for (const [key, entry] of Object.entries(sparseStringMap(value))) {
    if (isCopyTokenName(key)) {
      out[key] = entry;
    }
  }
  return out;
}

function resolveSchemaVersion(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { schemaVersion: PIVOT_COPY_SCHEMA_VERSION };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      error: 'schemaVersion must be a positive integer.',
      status: 400,
      code: 'INVALID_SCHEMA_VERSION',
    };
  }
  return { schemaVersion: parsed };
}

function normalizeTenantKey(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Stored-union merge: platform keys plus tenant keys (tenant wins).
 * Does not diff against bundled defaults — client falls back on missing keys.
 */
function mergeStoredCopyPacks(platformDoc, tenantDoc, schemaVersion) {
  return {
    revision: formatCopyRevision(platformDoc?.revision, tenantDoc?.revision),
    schemaVersion:
      schemaVersion ||
      PIVOT_COPY_SCHEMA_VERSION ||
      PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
    tokens: {
      ...filterStoredTokens(platformDoc?.tokens),
      ...filterStoredTokens(tenantDoc?.tokens),
    },
    entries: {
      ...filterStoredEntries(platformDoc?.entries),
      ...filterStoredEntries(tenantDoc?.entries),
    },
  };
}

function validateSparseStringPatch(raw, { kind, isAllowed, isKnown, maxLength }) {
  if (raw === undefined) {
    return { ok: true, patch: undefined };
  }
  if (!isPlainObject(raw)) {
    return {
      error: `${kind} must be an object of string values.`,
      status: 400,
      code: 'INVALID_COPY_PATCH',
    };
  }

  const patch = {};
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || !isAllowed(key)) {
      return {
        error: `${kind} key is not remote-allowlisted: ${rawKey}`,
        status: 400,
        code: 'DENIED_COPY_KEY',
      };
    }
    if (isKnown && !isKnown(key)) {
      return {
        error: `${kind} key is not in the shipped catalog: ${rawKey}`,
        status: 400,
        code: 'UNKNOWN_COPY_KEY',
      };
    }
    if (typeof rawValue !== 'string') {
      return {
        error: `${kind}.${key} must be a string.`,
        status: 400,
        code: 'INVALID_COPY_PATCH',
      };
    }
    const value = rawValue.trim();
    if (!value) {
      return {
        error: `${kind}.${key} must be a non-empty string (reset to inherit instead).`,
        status: 400,
        code: 'INVALID_COPY_PATCH',
      };
    }
    if (value.length > maxLength) {
      return {
        error: `${kind}.${key} must be at most ${maxLength} characters.`,
        status: 400,
        code: 'COPY_VALUE_TOO_LONG',
      };
    }
    patch[key] = value;
  }

  return { ok: true, patch };
}

function countPatchKeys(entries, tokens) {
  const entryCount =
    entries && isPlainObject(entries) ? Object.keys(entries).length : 0;
  const tokenCount =
    tokens && isPlainObject(tokens) ? Object.keys(tokens).length : 0;
  return entryCount + tokenCount;
}

/**
 * Validate a sparse PATCH body. ICU is not parsed; the client falls back to
 * bundled copy on a broken template. Keys must be in the shipped catalog.
 *
 * @returns {{ ok: true, entries?: object, tokens?: object } | { error, status, code }}
 */
function validateCopyPatch({ entries, tokens } = {}) {
  if (entries === undefined && tokens === undefined) {
    return {
      error: 'Patch must include entries and/or tokens.',
      status: 400,
      code: 'INVALID_COPY_PATCH',
    };
  }

  if (countPatchKeys(entries, tokens) > COPY_PATCH_MAX_KEYS) {
    return {
      error: `Patch may update at most ${COPY_PATCH_MAX_KEYS} keys at a time.`,
      status: 400,
      code: 'COPY_PATCH_TOO_LARGE',
    };
  }

  const entriesResult = validateSparseStringPatch(entries, {
    kind: 'entries',
    isAllowed: isRemoteCopyKey,
    isKnown: isCatalogCopyKey,
    maxLength: COPY_ENTRY_MAX_LENGTH,
  });
  if (entriesResult.error) {
    return entriesResult;
  }

  const tokensResult = validateSparseStringPatch(tokens, {
    kind: 'tokens',
    isAllowed: isCopyTokenName,
    maxLength: COPY_TOKEN_MAX_LENGTH,
  });
  if (tokensResult.error) {
    return tokensResult;
  }

  const nextEntries = entriesResult.patch;
  const nextTokens = tokensResult.patch;
  const hasEntries = nextEntries && Object.keys(nextEntries).length > 0;
  const hasTokens = nextTokens && Object.keys(nextTokens).length > 0;
  if (!hasEntries && !hasTokens) {
    return {
      error: 'Patch must include at least one entries or tokens value.',
      status: 400,
      code: 'INVALID_COPY_PATCH',
    };
  }

  return {
    ok: true,
    entries: hasEntries ? nextEntries : undefined,
    tokens: hasTokens ? nextTokens : undefined,
  };
}

function requireGlobalDb(req) {
  if (!req?.globalDb) {
    return {
      error: 'Global database context required.',
      status: 500,
    };
  }
  return null;
}

function serializePack(doc) {
  if (!doc) {
    return null;
  }
  return {
    scope: doc.scope,
    tenantKey: doc.tenantKey ?? null,
    schemaVersion: doc.schemaVersion,
    revision: doc.revision,
    tokens: filterStoredTokens(doc.tokens),
    entries: filterStoredEntries(doc.entries),
    updatedBy: doc.updatedBy ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

async function loadPackDocs(req, tenantKey) {
  const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
  const platform = await PivotCopyPack.findOne({ scope: 'platform' }).lean();
  let tenant = null;
  if (tenantKey) {
    tenant = await PivotCopyPack.findOne({
      scope: 'tenant',
      tenantKey,
    }).lean();
  }
  return { platform, tenant };
}

/**
 * Consumer overlay: stored union of platform + optional tenant packs.
 * Missing rows yield empty maps and revision `p0:t0` (or `pN:t0`).
 */
async function getMergedCopyPack(req, options = {}) {
  const missing = requireGlobalDb(req);
  if (missing) {
    return missing;
  }

  const schema = resolveSchemaVersion(options.schemaVersion);
  if (schema.error) {
    return schema;
  }

  const tenantKey = normalizeTenantKey(options.tenantKey);
  const { platform, tenant } = await loadPackDocs(req, tenantKey);
  return {
    data: mergeStoredCopyPacks(platform, tenant, schema.schemaVersion),
  };
}

function toCopyPointer(pack) {
  return {
    revision: pack.revision,
    schemaVersion: pack.schemaVersion,
  };
}

const EMPTY_COPY_POINTER = Object.freeze({
  revision: formatCopyRevision(0, 0),
  schemaVersion: PIVOT_COPY_SCHEMA_VERSION,
});

const EMPTY_MERGED_COPY_PACK = Object.freeze({
  revision: formatCopyRevision(0, 0),
  schemaVersion: PIVOT_COPY_SCHEMA_VERSION,
  tokens: Object.freeze({}),
  entries: Object.freeze({}),
});

/**
 * Push send paths must never fail because copy is down. Missing globalDb,
 * lookup errors, and empty overlays all yield `p0:t0` / `{}`.
 */
async function getMergedCopyPackOrEmpty(req, options = {}) {
  try {
    const result = await getMergedCopyPack(req, options);
    if (result?.data && typeof result.data === 'object') {
      return result.data;
    }
  } catch (error) {
    console.warn('[pivot] copy pack lookup failed for push', {
      tenantKey: options.tenantKey || null,
      error: error?.message,
    });
  }
  return EMPTY_MERGED_COPY_PACK;
}

const LANDING_COPY_SHARED_KEYS = Object.freeze(['brand.name', 'brand.cta']);

function isLandingCopyEntryKey(path) {
  if (typeof path !== 'string') {
    return false;
  }
  if (path.startsWith('landing.')) {
    return isRemoteCopyKey(path);
  }
  return LANDING_COPY_SHARED_KEYS.includes(path);
}

function filterLandingCopyPack(pack) {
  const source = pack && typeof pack === 'object' ? pack : EMPTY_MERGED_COPY_PACK;
  const entries = {};
  for (const [key, value] of Object.entries(source.entries || {})) {
    if (typeof value === 'string' && isLandingCopyEntryKey(key)) {
      entries[key] = value;
    }
  }
  const tokens = {};
  for (const name of PIVOT_COPY_TOKEN_NAMES) {
    const value = source.tokens?.[name];
    if (typeof value === 'string') {
      tokens[name] = value;
    }
  }
  return {
    revision: source.revision || formatCopyRevision(0, 0),
    schemaVersion: source.schemaVersion || PIVOT_COPY_SCHEMA_VERSION,
    tokens,
    entries,
  };
}

/**
 * Public landing overlay: platform pack only, landing + brand keys.
 * Never throws — empty overlay when copy is down.
 */
async function getPlatformLandingCopy(req, options = {}) {
  const pack = await getMergedCopyPackOrEmpty(req, {
    tenantKey: null,
    schemaVersion: options.schemaVersion,
  });
  return { data: filterLandingCopyPack(pack) };
}

/**
 * Tiny consumer pointer for GET /pivot/config. Never includes entries/tokens.
 */
async function getCopyPointer(req, options = {}) {
  const merged = await getMergedCopyPack(req, options);
  if (merged.error) {
    return merged;
  }
  return { data: toCopyPointer(merged.data) };
}

/**
 * Consumer GET /pivot/copy: same tenant gate as GET /pivot/config, then
 * stored-union overlay. Empty overlay is a valid payload.
 */
async function getPivotCopy(req, options = {}) {
  const tenantKey = req.school || options.tenantKey;
  if (!tenantKey) {
    return { error: 'Tenant context required.', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    console.warn('[pivot] GET /pivot/copy non-pivot tenant', {
      tenantKey: tenant.tenantKey,
      tenantType: tenant.tenantType,
      pivotPilot: tenant.pivotPilot === true,
      reqSchool: tenantKey,
      xTenant: req.headers?.['x-tenant'] || null,
      host: req.headers?.host || null,
    });
    return {
      error: 'Pivot copy is only available for pivot city tenants.',
      status: 400,
    };
  }

  return getMergedCopyPack(req, {
    tenantKey: tenant.tenantKey,
    schemaVersion: options.schemaVersion,
  });
}

async function loadOrCreatePack(PivotCopyPack, { scope, tenantKey }) {
  const query =
    scope === 'platform'
      ? { scope: 'platform' }
      : { scope: 'tenant', tenantKey };
  let doc = await PivotCopyPack.findOne(query);
  if (!doc) {
    doc = new PivotCopyPack({
      scope,
      tenantKey: scope === 'platform' ? null : tenantKey,
      schemaVersion: PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
      revision: 0,
      tokens: {},
      entries: {},
    });
  }
  return doc;
}

/**
 * Live write: merge sparse keys onto one pack and bump `revision`.
 * Does not create the other scope's row.
 */
async function patchCopyPack(req, options = {}) {
  const missing = requireGlobalDb(req);
  if (missing) {
    return missing;
  }

  const scope = options.scope;
  if (scope !== 'platform' && scope !== 'tenant') {
    return {
      error: 'scope must be platform or tenant.',
      status: 400,
      code: 'INVALID_COPY_SCOPE',
    };
  }

  let tenantKey = null;
  if (scope === 'tenant') {
    const resolved = await requirePivotCopyTenant(req, options.tenantKey);
    if (resolved.error) {
      return resolved;
    }
    tenantKey = resolved.tenantKey;
  }

  const validation = validateCopyPatch({
    entries: options.entries,
    tokens: options.tokens,
  });
  if (validation.error) {
    return validation;
  }

  const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
  const doc = await loadOrCreatePack(PivotCopyPack, { scope, tenantKey });

  if (validation.entries) {
    doc.entries = {
      ...sparseStringMap(doc.entries),
      ...validation.entries,
    };
    doc.markModified('entries');
  }
  if (validation.tokens) {
    doc.tokens = {
      ...sparseStringMap(doc.tokens),
      ...validation.tokens,
    };
    doc.markModified('tokens');
  }

  doc.revision = (Number(doc.revision) || 0) + 1;
  doc.updatedBy =
    options.updatedBy ||
    req.user?.email ||
    req.user?.globalUserId ||
    req.user?.userId ||
    null;

  await doc.save();
  return { data: serializePack(doc) };
}

function emptyPackData(scope, tenantKey) {
  return {
    scope,
    tenantKey: tenantKey ?? null,
    schemaVersion: PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
    revision: 0,
    tokens: {},
    entries: {},
    updatedBy: null,
    updatedAt: null,
  };
}

function resolveCopyScope(options = {}) {
  const scope = options.scope || 'platform';
  if (scope !== 'platform' && scope !== 'tenant') {
    return {
      error: 'scope must be platform or tenant.',
      status: 400,
      code: 'INVALID_COPY_SCOPE',
    };
  }
  const tenantKey =
    scope === 'tenant' ? normalizeTenantKey(options.tenantKey) : null;
  if (scope === 'tenant' && !tenantKey) {
    return {
      error: 'tenantKey is required for tenant copy packs.',
      status: 400,
      code: 'INVALID_COPY_SCOPE',
    };
  }
  return { scope, tenantKey };
}

function overlayValue(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

function copyLayer({ shipped, platform = null, tenant = null }) {
  return {
    shipped,
    platform,
    tenant,
    effective: tenant ?? platform ?? shipped,
  };
}

function buildCopyLayerMap(shippedMap, platformMap, tenantMap = {}) {
  const layers = {};
  for (const [key, shipped] of Object.entries(shippedMap)) {
    layers[key] = copyLayer({
      shipped,
      platform: overlayValue(platformMap, key),
      tenant: overlayValue(tenantMap, key),
    });
  }
  return layers;
}

function catalogShippedEntries() {
  const catalogEntries = {};
  for (const [key, shipped] of Object.entries(CATALOG_SHIPPED_ENTRIES)) {
    if (isCatalogCopyKey(key)) {
      catalogEntries[key] = shipped;
    }
  }
  return catalogEntries;
}

function catalogShippedTokens() {
  const catalogTokens = {};
  for (const name of PIVOT_COPY_TOKEN_NAMES) {
    const shipped = getShippedCopyToken(name);
    if (typeof shipped === 'string') {
      catalogTokens[name] = shipped;
    }
  }
  return catalogTokens;
}

/**
 * Admin tenant writes / layer GET: pack rows only exist for pivot cities.
 */
async function requirePivotCopyTenant(req, tenantKey) {
  const normalized = normalizeTenantKey(tenantKey);
  if (!normalized) {
    return {
      error: 'tenantKey is required for tenant copy packs.',
      status: 400,
      code: 'INVALID_COPY_SCOPE',
    };
  }

  const tenant = await getTenantByKey(req, normalized);
  if (!tenant) {
    return {
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }
  if (!isPivotTenant(tenant)) {
    return {
      error: 'Pivot copy is only available for pivot city tenants.',
      status: 400,
      code: 'NOT_PIVOT_TENANT',
    };
  }

  return { tenantKey: tenant.tenantKey || normalized };
}

/**
 * Editor catalog: allowlisted keys, kind, params, shipped default.
 * No database. Confirm-modal is a frontend concern.
 */
function getCopyCatalog() {
  return {
    data: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      tokens: PIVOT_COPY_TOKEN_NAMES.map((name) => ({
        name,
        kind: 'string',
        params: [],
        shipped: CATALOG_SHIPPED_TOKENS[name],
      })),
      keys: CATALOG_KEYS,
    },
  };
}

/**
 * Editor layers: shipped / platform / tenant / effective per catalog key.
 * Platform GET keeps tenant null (inherit only). Tenant GET: city wins,
 * then platform, then shipped.
 */
async function getCopyLayers(req, options = {}) {
  const missing = requireGlobalDb(req);
  if (missing) {
    return missing;
  }

  const scopeResult = resolveCopyScope(options);
  if (scopeResult.error) {
    return scopeResult;
  }
  const { scope } = scopeResult;
  let tenantKey = scopeResult.tenantKey;

  if (scope === 'tenant') {
    const resolved = await requirePivotCopyTenant(req, tenantKey);
    if (resolved.error) {
      return resolved;
    }
    tenantKey = resolved.tenantKey;
  }

  const { platform, tenant } = await loadPackDocs(
    req,
    scope === 'tenant' ? tenantKey : null,
  );
  const platformEntries = filterStoredEntries(platform?.entries);
  const platformTokens = filterStoredTokens(platform?.tokens);
  const tenantEntries =
    scope === 'tenant' ? filterStoredEntries(tenant?.entries) : {};
  const tenantTokens =
    scope === 'tenant' ? filterStoredTokens(tenant?.tokens) : {};

  return {
    data: {
      scope,
      tenantKey: scope === 'tenant' ? tenantKey : null,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision:
        scope === 'tenant'
          ? Number(tenant?.revision) || 0
          : Number(platform?.revision) || 0,
      compositeRevision: formatCopyRevision(
        platform?.revision,
        tenant?.revision,
      ),
      tokens: buildCopyLayerMap(
        catalogShippedTokens(),
        platformTokens,
        tenantTokens,
      ),
      entries: buildCopyLayerMap(
        catalogShippedEntries(),
        platformEntries,
        tenantEntries,
      ),
    },
  };
}

async function getPlatformCopyLayers(req) {
  return getCopyLayers(req, { scope: 'platform' });
}

function normalizeResetKeyList(raw, { kind, isAllowed, isKnown }) {
  if (raw === undefined) {
    return { ok: true, keys: [] };
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const keys = [];
  for (const rawKey of list) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || !isAllowed(key)) {
      return {
        error: `${kind} key is not remote-allowlisted: ${rawKey}`,
        status: 400,
        code: 'DENIED_COPY_KEY',
      };
    }
    if (isKnown && !isKnown(key)) {
      return {
        error: `${kind} key is not in the shipped catalog: ${rawKey}`,
        status: 400,
        code: 'UNKNOWN_COPY_KEY',
      };
    }
    keys.push(key);
  }
  return { ok: true, keys };
}

function omitKeys(source, remove) {
  if (!remove.length) {
    return { next: source, removed: 0 };
  }
  const drop = new Set(remove);
  const next = {};
  let removed = 0;
  for (const [key, value] of Object.entries(source)) {
    if (drop.has(key)) {
      removed += 1;
      continue;
    }
    next[key] = value;
  }
  return { next, removed };
}

/**
 * Live reset: delete stored keys so the layer inherits shipped (platform)
 * or platform-then-shipped (tenant). Bumps revision only when a stored
 * key was actually removed.
 */
async function resetCopyPack(req, options = {}) {
  const missing = requireGlobalDb(req);
  if (missing) {
    return missing;
  }

  const scopeResult = resolveCopyScope(options);
  if (scopeResult.error) {
    return scopeResult;
  }
  const { scope } = scopeResult;
  let tenantKey = scopeResult.tenantKey;

  if (scope === 'tenant') {
    const resolved = await requirePivotCopyTenant(req, tenantKey);
    if (resolved.error) {
      return resolved;
    }
    tenantKey = resolved.tenantKey;
  }

  const entriesResult = normalizeResetKeyList(options.entries, {
    kind: 'entries',
    isAllowed: isRemoteCopyKey,
    isKnown: isCatalogCopyKey,
  });
  if (entriesResult.error) {
    return entriesResult;
  }
  const tokensResult = normalizeResetKeyList(options.tokens, {
    kind: 'tokens',
    isAllowed: isCopyTokenName,
  });
  if (tokensResult.error) {
    return tokensResult;
  }

  if (!entriesResult.keys.length && !tokensResult.keys.length) {
    return {
      error: 'Reset must include at least one entries or tokens key.',
      status: 400,
      code: 'INVALID_COPY_RESET',
    };
  }

  const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
  const query =
    scope === 'platform'
      ? { scope: 'platform' }
      : { scope: 'tenant', tenantKey };
  const doc = await PivotCopyPack.findOne(query);
  if (!doc) {
    return { data: emptyPackData(scope, tenantKey) };
  }

  const entries = omitKeys(sparseStringMap(doc.entries), entriesResult.keys);
  const tokens = omitKeys(sparseStringMap(doc.tokens), tokensResult.keys);
  if (entries.removed === 0 && tokens.removed === 0) {
    return { data: serializePack(doc) };
  }

  if (entries.removed) {
    doc.entries = entries.next;
    doc.markModified('entries');
  }
  if (tokens.removed) {
    doc.tokens = tokens.next;
    doc.markModified('tokens');
  }
  doc.revision = (Number(doc.revision) || 0) + 1;
  doc.updatedBy =
    options.updatedBy ||
    req.user?.email ||
    req.user?.globalUserId ||
    req.user?.userId ||
    null;
  await doc.save();

  // Empty Mixed maps must be $set as `{}` — document.save() can leave the
  // last dotted key (`ticker.week`) in Mongo when the assigned object is empty.
  const emptySet = {};
  if (entries.removed && Object.keys(entries.next).length === 0) {
    emptySet.entries = {};
    doc.entries = {};
  }
  if (tokens.removed && Object.keys(tokens.next).length === 0) {
    emptySet.tokens = {};
    doc.tokens = {};
  }
  if (Object.keys(emptySet).length > 0) {
    await PivotCopyPack.updateOne({ _id: doc._id }, { $set: emptySet });
  }

  return { data: serializePack(doc) };
}

module.exports = {
  formatCopyRevision,
  copyRevisionEtag,
  copyRevisionNotModified,
  mergeStoredCopyPacks,
  validateCopyPatch,
  getMergedCopyPack,
  getMergedCopyPackOrEmpty,
  getPlatformLandingCopy,
  filterLandingCopyPack,
  getCopyPointer,
  getPivotCopy,
  getCopyCatalog,
  getCopyLayers,
  getPlatformCopyLayers,
  patchCopyPack,
  resetCopyPack,
  EMPTY_COPY_POINTER,
  EMPTY_MERGED_COPY_PACK,
  COPY_REVISION_FORMAT: 'p{platformRev}:t{tenantRev}',
};
