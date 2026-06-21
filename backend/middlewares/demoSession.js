const jwt = require('jsonwebtoken');
const { getDemoSessionUser, getDemoAccessTokenFromRequest, clearDemoAccessCookie } = require('../services/demoCredentialService');

async function requireDemoSession(req, res, next) {
    const token = getDemoAccessTokenFromRequest(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Demo session required',
            code: 'DEMO_AUTH_REQUIRED',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.isDemoSession) {
            return res.status(403).json({
                success: false,
                message: 'Demo session required',
                code: 'DEMO_AUTH_REQUIRED',
            });
        }

        const session = await getDemoSessionUser(req.db, decoded);
        if (!session?.credential) {
            return res.status(401).json({
                success: false,
                message: 'Demo session expired or revoked',
                code: 'DEMO_SESSION_INVALID',
            });
        }

        req.user = {
            userId: decoded.userId,
            roles: decoded.roles || ['user'],
            isDemoSession: true,
            demoCredentialId: decoded.demoCredentialId,
            demoCredentialLabel: decoded.demoCredentialLabel || '',
        };
        req.demoSession = session;
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Demo session expired',
                code: 'DEMO_SESSION_EXPIRED',
            });
        }
        return res.status(403).json({
            success: false,
            message: 'Invalid demo session',
            code: 'DEMO_SESSION_INVALID',
        });
    }
}

module.exports = { requireDemoSession };
