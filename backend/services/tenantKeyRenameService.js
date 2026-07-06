const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const {
  DEFAULT_TENANTS,
  normalizeTenantRow,
} = require('../constants/defaultTenants');
const {
  getTenantByKey,
  getMergedTenants,
  getStoredTenantRows,
  saveTenantRows,
  syncTenantUriCache,
  toStoredTenantRow,
} = require('./tenantConfigService');
const {
  connectToDatabase,
  invalidateTenantConnection,
} = require('../connectionsManager');

const DEFAULT_TENANT_KEYS = new Set(DEFAULT_TENANTS.map((row) => row.tenantKey));
const RESERVED_TENANT_KEYS = new Set([...DEFAULT_TENANT_KEYS, 'www']);

function validateTenantKeyFormat(tenantKey) {
  const key = String(tenantKey || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(key)) {
    return {
      error:
        'tenantKey must be 2–32 chars, start with a letter, lowercase alphanumeric/underscore/hyphen.',
    };
  }
  if (key === 'www') {
    return { error: 'tenantKey "www" is reserved.' };
  }
  return { ok: true, tenantKey: key };
}

function isDefaultTenantKey(tenantKey) {
  return DEFAULT_TENANT_KEYS.has(String(tenantKey || '').trim().toLowerCase());
}

async function updatePivotWeeklySnapshotTenantKeys(req, oldTenantKey, newTenantKey) {
  const { PivotWeeklySnapshot } = getGlobalModels(req, 'PivotWeeklySnapshot');
  const result = await PivotWeeklySnapshot.updateMany(
    { 'tenants.tenantKey': oldTenantKey },
    { $set: { 'tenants.$[elem].tenantKey': newTenantKey } },
    { arrayFilters: [{ 'elem.tenantKey': oldTenantKey }] },
  );
  return result.modifiedCount || 0;
}

async function updateTenantDbSchoolFields(tenant, oldTenantKey, newTenantKey) {
  const dbRouteKey = tenant.subdomain || tenant.tenantKey;
  let db;
  try {
    db = await connectToDatabase(dbRouteKey);
  } catch (error) {
    return {
      error: `Could not connect to tenant database to update school fields: ${error.message}`,
    };
  }

  const reqLike = { db, school: oldTenantKey };
  const { SAMLConfig, ShuttleConfig } = getModels(reqLike, 'SAMLConfig', 'ShuttleConfig');

  const [samlResult, shuttleResult] = await Promise.all([
    SAMLConfig.updateMany({ school: oldTenantKey }, { $set: { school: newTenantKey } }),
    ShuttleConfig.updateMany({ school: oldTenantKey }, { $set: { school: newTenantKey } }),
  ]);

  return {
    samlConfigsUpdated: samlResult.modifiedCount || 0,
    shuttleConfigsUpdated: shuttleResult.modifiedCount || 0,
  };
}

function invalidateTenantConnections(tenant, oldTenantKey, newTenantKey) {
  const keys = new Set(
    [
      oldTenantKey,
      newTenantKey,
      tenant?.subdomain,
      tenant?.tenantKey,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );
  keys.forEach((key) => invalidateTenantConnection(key));
}

/**
 * Rename a dynamically provisioned tenant and cascade tenantKey updates to global
 * and tenant-scoped documents that reference the old key.
 */
async function renameTenantKey(req, oldTenantKey, newTenantKey, updatedBy = null) {
  const oldKey = String(oldTenantKey || '').trim().toLowerCase();
  const formatValidation = validateTenantKeyFormat(newTenantKey);
  if (formatValidation.error) {
    return { error: formatValidation.error, status: 400 };
  }
  const newKey = formatValidation.tenantKey;

  if (oldKey === newKey) {
    return { ok: true, tenantKey: newKey, renamed: false };
  }

  if (isDefaultTenantKey(oldKey)) {
    return {
      error: 'Built-in tenants (rpi, tvcog) cannot be renamed.',
      status: 403,
      code: 'DEFAULT_TENANT_IMMUTABLE',
    };
  }

  if (RESERVED_TENANT_KEYS.has(newKey)) {
    return {
      error: `Tenant key "${newKey}" is reserved.`,
      status: 400,
      code: 'TENANT_KEY_RESERVED',
    };
  }

  const existing = await getTenantByKey(req, oldKey, { exact: true });
  if (!existing) {
    return { error: 'Tenant not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  }

  const tenants = await getMergedTenants(req);
  if (tenants.some((row) => row.tenantKey === newKey)) {
    return {
      error: `Tenant "${newKey}" already exists.`,
      status: 409,
      code: 'TENANT_EXISTS',
    };
  }

  const {
    TenantMembership,
    PivotReferralCode,
  } = getGlobalModels(req, 'TenantMembership', 'PivotReferralCode');

  const [membershipResult, referralResult, snapshotsUpdated, tenantDbResult] = await Promise.all([
    TenantMembership.updateMany({ tenantKey: oldKey }, { $set: { tenantKey: newKey } }),
    PivotReferralCode.updateMany({ tenantKey: oldKey }, { $set: { tenantKey: newKey } }),
    updatePivotWeeklySnapshotTenantKeys(req, oldKey, newKey),
    updateTenantDbSchoolFields(existing, oldKey, newKey),
  ]);

  if (tenantDbResult?.error) {
    return { error: tenantDbResult.error, status: 400, code: 'TENANT_DB_UPDATE_FAILED' };
  }

  const renamedTenant = normalizeTenantRow({ ...existing, tenantKey: newKey });
  const stored = await getStoredTenantRows(req);
  const withoutOld = stored.filter((row) => row.tenantKey !== oldKey);
  const newStoredRow = toStoredTenantRow(renamedTenant);
  if (!newStoredRow) {
    return {
      error: 'Unable to persist renamed tenant row.',
      status: 500,
      code: 'TENANT_CONFIG_PERSIST_FAILED',
    };
  }
  await saveTenantRows(req, [...withoutOld, newStoredRow], updatedBy);

  invalidateTenantConnections(existing, oldKey, newKey);
  await syncTenantUriCache(req);

  return {
    ok: true,
    renamed: true,
    tenantKey: newKey,
    previousTenantKey: oldKey,
    updates: {
      tenantMemberships: membershipResult.modifiedCount || 0,
      pivotReferralCodes: referralResult.modifiedCount || 0,
      pivotWeeklySnapshots: snapshotsUpdated,
      samlConfigs: tenantDbResult.samlConfigsUpdated,
      shuttleConfigs: tenantDbResult.shuttleConfigsUpdated,
    },
  };
}

module.exports = {
  DEFAULT_TENANT_KEYS,
  RESERVED_TENANT_KEYS,
  validateTenantKeyFormat,
  isDefaultTenantKey,
  renameTenantKey,
};
