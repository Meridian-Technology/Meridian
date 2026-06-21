const { verifyToken } = require('./verifyToken');
const { requireAdmin } = require('./requireAdmin');
const { isDemoTenant } = require('../constants/demoTenant');

/**
 * In development, demo-tenant admin routes work without an existing admin session.
 * In production, set DEMO_BOOTSTRAP_SECRET and pass x-demo-bootstrap-secret header
 * or { bootstrapSecret } in the body for one-time bootstrap operations.
 */
function isDemoBootstrapAllowed(req) {
    if (!isDemoTenant(req.school)) return false;
    if (process.env.NODE_ENV !== 'production') return true;
    const secret = process.env.DEMO_BOOTSTRAP_SECRET;
    if (!secret) return false;
    const headerSecret = req.headers['x-demo-bootstrap-secret'];
    const bodySecret = req.body?.bootstrapSecret;
    return (headerSecret && headerSecret === secret) || (bodySecret && bodySecret === secret);
}

function demoAdminGate(req, res, next) {
    if (isDemoBootstrapAllowed(req)) {
        return next();
    }
    verifyToken(req, res, () => {
        requireAdmin(req, res, next);
    });
}

module.exports = {
    isDemoBootstrapAllowed,
    demoAdminGate,
};
