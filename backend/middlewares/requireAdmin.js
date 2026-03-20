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
    let isAdmin = platformRoles.includes('platform_admin') || platformRoles.includes('root');

    if (req.user.globalUserId) {
        const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
        const pr = await PlatformRole.findOne({ globalUserId: req.user.globalUserId });
        if (pr && pr.roles && (pr.roles.includes('platform_admin') || pr.roles.includes('root'))) {
            isAdmin = true;
        }
    }

    let tenantUser = null;
    if (req.user.userId) {
        const { User } = getModels(req, 'User');
        tenantUser = await User.findById(req.user.userId);
        if (!isAdmin && tenantUser && tenantUser.roles && (tenantUser.roles.includes('admin') || tenantUser.roles.includes('root'))) {
            isAdmin = true;
        }
    }

    if (!isAdmin) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const mfaConfiguredByToken = Boolean(req.user.mfaConfigured);
    const mfaConfiguredByDb = Boolean(
        (tenantUser?.adminMfa?.totp?.enabled && tenantUser?.adminMfa?.totp?.secret) ||
        (Array.isArray(tenantUser?.adminMfa?.passkeys) && tenantUser.adminMfa.passkeys.length > 0)
    );
    const mfaConfigured = mfaConfiguredByToken || mfaConfiguredByDb;
    if (mfaConfigured && !req.user.mfaVerified) {
        return res.status(403).json({
            message: 'Admin MFA is required',
            code: 'ADMIN_MFA_REQUIRED',
            mfaConfigured: mfaConfigured,
            mfaVerified: Boolean(req.user.mfaVerified),
        });
    }

    return next();
}

module.exports = { requireAdmin };
