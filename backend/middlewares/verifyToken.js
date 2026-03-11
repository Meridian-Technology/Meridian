const jwt = require('jsonwebtoken');
const getModels = require('../services/getModelService');
const authGlobalService = require('../services/authGlobalService');

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

const verifyTokenOptional = async (req, res, next) => {
    const token = req.cookies.accessToken ||
        (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (token == null) {
        return next();
    }

    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        await resolveRequestUser(req, decodedToken);
        return next();
    } catch (err) {
        if (err.name !== 'TokenExpiredError') {
            return next();
        }
        // Try refresh
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return next();
        }
        try {
            const { validateSession } = require('../utilities/sessionUtils');
            const validation = await validateSession(refreshToken, req);
            if (!validation.valid || !validation.user) {
                return next();
            }
            const user = validation.user;
            const globalUser = validation.globalUser;
            if (globalUser) {
                const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
                await authGlobalService.issueTokens(req, res, globalUser, user, platformRoles);
                req.user = {
                    globalUserId: globalUser._id,
                    userId: user._id,
                    tenantUserId: user._id,
                    roles: user.roles || ['user'],
                    platformRoles: platformRoles,
                };
            } else {
                const cookieOptions = {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: ACCESS_TOKEN_EXPIRY_MS,
                    path: '/',
                };
                if (process.env.NODE_ENV === 'production') cookieOptions.domain = '.meridian.study';
                const newAccessToken = jwt.sign(
                    { userId: user._id, roles: user.roles },
                    process.env.JWT_SECRET,
                    { expiresIn: ACCESS_TOKEN_EXPIRY }
                );
                res.cookie('accessToken', newAccessToken, cookieOptions);
                req.user = { userId: user._id, roles: user.roles };
            }
        } catch (refreshError) {
            // Continue without req.user
        }
        return next();
    }
};

module.exports = { verifyToken, verifyTokenOptional, authorizeRoles, resolveRequestUser };
