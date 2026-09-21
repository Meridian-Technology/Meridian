/**
 * Per-city controls for automatically applying completed Pivot compute jobs.
 * Tenant rows intentionally store only overrides; use the merge helper whenever
 * making an authorization decision.
 */

const COMPUTE_APPLY_ORIGINS = Object.freeze(['admin', 'schedule']);
const DEFAULT_AUTO_APPLY_ORIGINS = Object.freeze([...COMPUTE_APPLY_ORIGINS]);

const PIVOT_COMPUTE_APPLY_POLICY_DEFAULTS = Object.freeze({
  trusted: false,
  autoApplyRefresh: false,
  autoApplyDiscovery: false,
  autoApplyOrigins: DEFAULT_AUTO_APPLY_ORIGINS,
  notifyAdminsEmail: true,
  maxNewSources: null,
  maxEventCreates: null,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOrigins(value) {
  if (!Array.isArray(value)) return undefined;
  const origins = [...new Set(value.map((origin) => String(origin).trim()))];
  return origins.every((origin) => COMPUTE_APPLY_ORIGINS.includes(origin)) ? origins : undefined;
}

function normalizeOptionalLimit(value) {
  if (value === null || value === '') return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 0 ? limit : undefined;
}

/** Resolve sparse stored settings into a safe effective policy. */
function mergePivotComputeApplyPolicy(stored) {
  const merged = {
    ...PIVOT_COMPUTE_APPLY_POLICY_DEFAULTS,
    autoApplyOrigins: [...DEFAULT_AUTO_APPLY_ORIGINS],
  };
  if (!isPlainObject(stored)) return merged;

  ['trusted', 'autoApplyRefresh', 'autoApplyDiscovery', 'notifyAdminsEmail'].forEach((key) => {
    if (typeof stored[key] === 'boolean') merged[key] = stored[key];
  });
  if (Object.prototype.hasOwnProperty.call(stored, 'autoApplyOrigins')) {
    const origins = normalizeOrigins(stored.autoApplyOrigins);
    if (origins !== undefined) merged.autoApplyOrigins = origins;
  }
  ['maxNewSources', 'maxEventCreates'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      const limit = normalizeOptionalLimit(stored[key]);
      if (limit !== undefined) merged[key] = limit;
    }
  });
  return merged;
}

function resolvePivotComputeApplyPolicy(tenant = {}) {
  return mergePivotComputeApplyPolicy(tenant?.pivotComputeApply);
}

/** Validate an API/default-tenant sparse patch without filling defaults. */
function validatePivotComputeApplyPolicyPatch(raw) {
  if (raw === null) return { patch: null };
  if (!isPlainObject(raw)) {
    return {
      error: 'pivotComputeApply must be an object.',
      status: 400,
      code: 'INVALID_COMPUTE_APPLY_POLICY',
    };
  }
  const patch = {};
  for (const key of ['trusted', 'autoApplyRefresh', 'autoApplyDiscovery', 'notifyAdminsEmail']) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') {
        return { error: `pivotComputeApply.${key} must be a boolean.`, status: 400, code: 'INVALID_COMPUTE_APPLY_POLICY' };
      }
      patch[key] = raw[key];
    }
  }
  if (raw.autoApplyOrigins !== undefined) {
    const origins = normalizeOrigins(raw.autoApplyOrigins);
    if (origins === undefined) {
      return {
        error: `pivotComputeApply.autoApplyOrigins must be an array containing only: ${COMPUTE_APPLY_ORIGINS.join(', ')}.`,
        status: 400,
        code: 'INVALID_COMPUTE_APPLY_ORIGINS',
      };
    }
    patch.autoApplyOrigins = origins;
  }
  for (const key of ['maxNewSources', 'maxEventCreates']) {
    if (raw[key] !== undefined) {
      const limit = normalizeOptionalLimit(raw[key]);
      if (limit === undefined) {
        return { error: `pivotComputeApply.${key} must be a non-negative integer or null.`, status: 400, code: 'INVALID_COMPUTE_APPLY_GUARDRAIL' };
      }
      patch[key] = limit;
    }
  }
  return { patch };
}

/** Combine stored sparse overrides without materializing default values. */
function mergePivotComputeApplyOverrides(existing, patch) {
  if (patch === null) return undefined;
  return { ...(isPlainObject(existing) ? existing : {}), ...(isPlainObject(patch) ? patch : {}) };
}

function isPivotCityTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}

async function persistPivotComputeApplyPolicy(req, tenant, patch) {
  const { getTenantByKey, upsertStoredTenantRow } = require('../services/tenantConfigService');
  const tenantKey = tenant?.tenantKey;
  if (!tenantKey || !patch || !Object.keys(patch).length) return tenant;

  const current = (await getTenantByKey(req, tenantKey)) || tenant;
  const nextApply = mergePivotComputeApplyOverrides(current.pivotComputeApply, patch);
  return upsertStoredTenantRow(
    req,
    { ...current, pivotComputeApply: nextApply },
    req?.user?.email || null,
  );
}

async function updateCityComputeApplyConfig(req, options = {}) {
  const { getMergedTenants } = require('../services/tenantConfigService');
  const normalizedKey = String(options.tenantKey || '').trim().toLowerCase();
  if (!normalizedKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const tenant = (await getMergedTenants(req)).filter(isPivotCityTenant)
    .find((row) => row.tenantKey === normalizedKey);
  if (!tenant) {
    return {
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }

  const validation = validatePivotComputeApplyPolicyPatch(options.patch);
  if (validation.error) return validation;
  if (!validation.patch || !Object.keys(validation.patch).length) {
    return { error: 'No compute-apply config changes.', status: 400, code: 'NO_CHANGES' };
  }

  try {
    const saved = await persistPivotComputeApplyPolicy(req, tenant, validation.patch);
    return {
      data: {
        tenantKey: tenant.tenantKey,
        policy: resolvePivotComputeApplyPolicy(saved || { pivotComputeApply: mergePivotComputeApplyOverrides(tenant.pivotComputeApply, validation.patch) }),
      },
    };
  } catch (err) {
    return { error: err.message, status: 500, code: 'COMPUTE_APPLY_CONFIG_SAVE_FAILED' };
  }
}

module.exports = {
  COMPUTE_APPLY_ORIGINS,
  DEFAULT_AUTO_APPLY_ORIGINS,
  PIVOT_COMPUTE_APPLY_POLICY_DEFAULTS,
  mergePivotComputeApplyPolicy,
  resolvePivotComputeApplyPolicy,
  validatePivotComputeApplyPolicyPatch,
  mergePivotComputeApplyOverrides,
  persistPivotComputeApplyPolicy,
  updateCityComputeApplyConfig,
};
