const jwt = require('jsonwebtoken');
const getModels = require('../services/getModelService');
const authGlobalService = require('../services/authGlobalService');
const { validateSession } = require('../utilities/sessionUtils');
const { getCookieDomain } = require('../utilities/cookieUtils');

const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`;
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000;

/**
 * Resolve req.user from decoded JWT: for new tokens (globalUserId) resolve tenant user from TenantMembership;
 * for legacy tokens (userId only) pass through.
 */
async function resolveRequestUser(req, decodedToken) {
    if (decodedToken.globalUserId) {
        const { tenantUserId, tenantUser } = await authGlobalService.resolveTenantUserForRequest(req, decodedToken.globalUserId);
        const roles = tenantUser && tenantUser.roles ? tenantUser.roles : (decodedToken.roles || ['user']);
        req.user = {
            globalUserId: decodedToken.globalUserId,
            userId: tenantUserId,
            tenantUserId,
            roles,
            platformRoles: decodedToken.platformRoles || [],
        };
        return;
    }
    // Legacy token: userId and roles only
    req.user = {
        userId: decodedToken.userId,
        roles: decodedToken.roles || ['user'],
    };
}

const verifyToken = async (req, res, next) => {
    const token = req.cookies.accessToken ||
        (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (token == null) {
        console.log('No token provided');
        return res.status(401).json({
            success: false,
            message: 'No access token provided',
            code: 'NO_TOKEN',
        });
    }

    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        await resolveRequestUser(req, decodedToken);
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Access token expired',
                code: 'TOKEN_EXPIRED',
            });
        }
        return res.status(403).json({
            success: false,
            message: 'Invalid access token',
            code: 'INVALID_TOKEN',
        });
    }
};

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        const { roles } = req.user || {};
        if (!roles || !allowedRoles.some(role => roles.includes(role))) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        next();
    };
}

/**
 * Creates verifyTokenOptional middleware.
 * @param {Object} [options]
 * @param {boolean} [options.requireAuthWhenTokenPresent] - When true, if a token was present but
 *   could not be authenticated (expired + refresh failed, or invalid), return 401 so the client
 *   can retry after refreshing. When false/omitted, proceed without req.user (backwards compatible).
 */
function createVerifyTokenOptional(options = {}) {
  const requireAuthWhenTokenPresent = options.requireAuthWhenTokenPresent === true;

  return async (req, res, next) => {
    const token = req.cookies.accessToken ||
      (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    const refreshToken = req.cookies.refreshToken;

    const tryRefresh = async () => {
      if (!refreshToken) {
        console.log('[Auth] tryRefresh: no refresh token in cookies');
        return false;
      }
      try {
        const validation = await validateSession(refreshToken, req);
        if (!validation.valid) {
          console.log('[Auth] tryRefresh: session invalid:', validation.error);
          return false;
        }
        const { user, globalUser } = validation;
        if (globalUser) {
          const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
          await authGlobalService.issueTokens(req, res, globalUser, user, platformRoles);
          req.user = {
            globalUserId: globalUser._id,
            userId: user ? user._id : null,
            tenantUserId: user ? user._id : null,
            roles: user ? (user.roles || ['user']) : ['user'],
            platformRoles: platformRoles || [],
          };
        } else if (user) {
          const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS,
            path: '/',
          };
          const domain = getCookieDomain(req);
          if (domain) cookieOptions.domain = domain;
          const newAccessToken = jwt.sign(
            { userId: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
          );
          res.cookie('accessToken', newAccessToken, cookieOptions);
          req.user = { userId: user._id, roles: user.roles };
        } else {
          return false;
        }
        console.log('[Auth] Token refreshed successfully for user:', user ? user._id : globalUser?._id);
        return true;
      } catch (refreshError) {
        console.log('[Auth] Refresh failed:', refreshError.message);
        return false;
      }
    };

    if (token == null) {
      console.log('[Auth] No access token, attempting refresh from refreshToken cookie');
      const refreshed = await tryRefresh();
      console.log('[Auth] Refresh result:', refreshed ? 'success' : 'failed');
      return next();
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      await resolveRequestUser(req, decodedToken);
      return next();
    } catch (err) {
      if (err.name !== 'TokenExpiredError') {
        if (requireAuthWhenTokenPresent) {
          return res.status(401).json({
            success: false,
            message: 'Invalid access token',
            code: 'INVALID_TOKEN'
          });
        }
        return next();
      }
      const refreshed = await tryRefresh();
      if (refreshed) {
        return next();
      }
      if (requireAuthWhenTokenPresent && !req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return next();
    }
  };
}

const verifyTokenOptional = createVerifyTokenOptional();
verifyTokenOptional.withOptions = createVerifyTokenOptional;

module.exports = { verifyToken, verifyTokenOptional, authorizeRoles, resolveRequestUser };
