const jwt = require('jsonwebtoken');
const { getDemoAccessTokenFromRequest } = require('../services/demoCredentialService');
const { DEMO_ROUTE_PREFIX } = require('../constants/demoTenant');

const DEMO_WRITE_ALLOWLIST = [
    `${DEMO_ROUTE_PREFIX}/auth/login`,
    `${DEMO_ROUTE_PREFIX}/auth/logout`,
];

function attachDemoUserFromToken(req, res, next) {
    if (req.user?.isDemoSession) return next();

    const token = getDemoAccessTokenFromRequest(req);
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.isDemoSession) return next();
        req.user = {
            ...(req.user || {}),
            userId: decoded.userId,
            roles: decoded.roles || ['user'],
            isDemoSession: true,
            demoCredentialId: decoded.demoCredentialId,
            demoCredentialLabel: decoded.demoCredentialLabel || '',
        };
    } catch (_) {
        // ignore — downstream auth middleware will handle invalid tokens
    }
    return next();
}

function blockDemoWrites(req, res, next) {
    if (!req.user?.isDemoSession) return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const path = req.path || req.url || '';
    if (DEMO_WRITE_ALLOWLIST.some((allowed) => path === allowed || path.endsWith(allowed))) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only',
        code: 'DEMO_READ_ONLY',
    });
}

module.exports = {
    attachDemoUserFromToken,
    blockDemoWrites,
};
