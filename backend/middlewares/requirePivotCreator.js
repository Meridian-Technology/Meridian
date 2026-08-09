/**
 * Just Go Creator Console gate — use after verifyToken on `/pivot/creator/*`.
 * Resolves an active PivotCreatorGrant for the city tenant; does not use org perms.
 */

const { getActiveCreatorGrant, serializeGrant } = require('../services/pivotCreatorGrantService');
const { resolvePivotTenant } = require('../services/pivotIngestPublishService');

function resolveCreatorUserId(user = {}) {
  return (
    (typeof user.globalUserId === 'string' && user.globalUserId.trim()) ||
    (typeof user.userId === 'string' && user.userId.trim()) ||
    null
  );
}

function resolveTenantKey(req) {
  const fromCreator = typeof req.pivotCreator?.tenantKey === 'string'
    ? req.pivotCreator.tenantKey
    : '';
  const fromSchool = typeof req.school === 'string' ? req.school : '';
  const raw = (fromCreator || fromSchool).trim().toLowerCase();
  if (!raw || raw === 'www') return null;
  return raw;
}

/**
 * Requires verifyToken upstream.
 * Sets req.pivotCreator = { grant, tenantKey, tenant, globalUserId }.
 */
async function requirePivotCreator(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    const globalUserId = resolveCreatorUserId(req.user);
    if (!globalUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    const tenantKey = resolveTenantKey(req);
    if (!tenantKey) {
      return res.status(403).json({
        success: false,
        message: 'Just Go Creator requires a city tenant host (not www).',
        code: 'CREATOR_TENANT_REQUIRED',
      });
    }

    const tenantResult = await resolvePivotTenant(req, tenantKey);
    if (tenantResult.error) {
      // Campus / unknown tenants are a hard forbid for this surface (not a missing resource).
      const notPivot =
        tenantResult.code === 'TENANT_NOT_FOUND' ||
        tenantResult.code === 'NOT_PIVOT_TENANT';
      return res.status(notPivot ? 403 : tenantResult.status || 403).json({
        success: false,
        message: notPivot
          ? 'Just Go Creator is only available on Just Go city tenants.'
          : tenantResult.error,
        code: notPivot ? 'NOT_PIVOT_TENANT' : tenantResult.code || 'NOT_PIVOT_TENANT',
      });
    }

    const grant = await getActiveCreatorGrant(req, {
      globalUserId,
      tenantKey: tenantResult.tenant.tenantKey,
    });

    if (!grant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have Just Go Creator access for this city.',
        code: 'CREATOR_FORBIDDEN',
      });
    }

    req.pivotCreator = {
      grant: serializeGrant(grant),
      tenantKey: tenantResult.tenant.tenantKey,
      tenant: tenantResult.tenant,
      globalUserId,
    };

    return next();
  } catch (err) {
    console.error('[requirePivotCreator]', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify Just Go Creator access.',
      code: 'CREATOR_GATE_ERROR',
    });
  }
}

module.exports = {
  requirePivotCreator,
  resolveCreatorUserId,
  resolveTenantKey,
};
