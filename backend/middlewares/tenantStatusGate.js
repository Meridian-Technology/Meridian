const jwt = require('jsonwebtoken');
const getGlobalModels = require('../services/getGlobalModelService');

function getModels(req, ...names) {
    return require('../services/getModelService')(req, ...names);
}
const authGlobalService = require('../services/authGlobalService');
const { isAdminLevelAccount } = require('../services/adminMfaService');

/** Paths reachable while a tenant is coming_soon / maintenance (login + status page + assets). */
const PUBLIC_DURING_TENANT_OUTAGE_PREFIXES = [
  '/login',
  '/signup',
  '/register',
  '/validate-token',
  '/refresh-token',
  '/tenant-status',
  '/auth/',
  '/google-login',
  '/apple-login',
  '/forgot-password',
  '/verify-code',
  '/reset-password',
  '/mfa/',
  '/health',
  '/api/tenant-config',
  '/pivot',
  '/static',
  '/assets',
  '/favicon',
  '/manifest.json',
  '/proxy-image',
];

function normalizePath(req) {
  const raw = (req.path || req.url || '').split('?')[0];
  return raw && raw.trim() !== '' ? raw : '/';
}

function isPublicPathDuringTenantOutage(path) {
  return PUBLIC_DURING_TENANT_OUTAGE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function readAccessToken(req) {
  return (
    req.cookies?.accessToken ||
    (req.headers.authorization && req.headers.authorization.split(' ')[1])
  );
}

/**
 * True when the caller is a platform or tenant admin (used to bypass coming_soon / maintenance gates).
 */
async function isAdminLevelRequest(req) {
  const token = readAccessToken(req);
  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const platformRoles = Array.isArray(decoded.platformRoles) ? decoded.platformRoles : [];

    if (platformRoles.includes('platform_admin') || platformRoles.includes('root')) {
      return true;
    }

    if (decoded.globalUserId && req.globalDb) {
      const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
      const pr = await PlatformRole.findOne({ globalUserId: decoded.globalUserId }).lean();
      if (pr?.roles?.includes('platform_admin') || pr?.roles?.includes('root')) {
        return true;
      }
    }

    let tenantUser = null;
    if (decoded.globalUserId && req.db) {
      const { tenantUser: resolved } = await authGlobalService.resolveTenantUserForRequest(
        req,
        decoded.globalUserId
      );
      tenantUser = resolved;
    } else if (decoded.userId && req.db) {
      const { User } = getModels(req, 'User');
      tenantUser = await User.findById(decoded.userId).lean();
    }

    return isAdminLevelAccount(tenantUser, platformRoles);
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} status - tenant lifecycle status
 * @returns {boolean} skip coming_soon / maintenance enforcement
 */
async function shouldBypassTenantStatusGate(req, status) {
  if (!status || status === 'active' || status === 'hidden') return true;

  const path = normalizePath(req);
  if (isPublicPathDuringTenantOutage(path)) return true;

  return isAdminLevelRequest(req);
}

module.exports = {
  shouldBypassTenantStatusGate,
  isAdminLevelRequest,
  isPublicPathDuringTenantOutage,
};
