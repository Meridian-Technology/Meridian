const getModels = require('../services/getModelService');
const getGlobalModels = require('../services/getGlobalModelService');

/**
 * Middleware: require platform admin OR tenant admin/root.
 * Use after verifyToken. Allows platform admins to access any tenant without a local User.
 */
async function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const platformRoles = req.user.platformRoles || [];
    if (platformRoles.includes('platform_admin') || platformRoles.includes('root')) {
        return next();
    }

    if (req.user.globalUserId) {
        const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
        const pr = await PlatformRole.findOne({ globalUserId: req.user.globalUserId });
        if (pr && pr.roles && (pr.roles.includes('platform_admin') || pr.roles.includes('root'))) {
            return next();
        }
    }

    if (req.user.userId) {
        const { User } = getModels(req, 'User');
        const user = await User.findById(req.user.userId);
        if (user && user.roles && (user.roles.includes('admin') || user.roles.includes('root'))) {
            return next();
        }
    }

    return res.status(403).json({ message: 'Forbidden' });
}

module.exports = { requireAdmin };
