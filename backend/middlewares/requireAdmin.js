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

async function hasAdminPermission(req, permission) {
    if (!req.user) {
        return false;
    }

    const platformRoles = req.user.platformRoles || [];
    if (platformRoles.includes('root') || platformRoles.includes('platform_admin')) {
        return true;
    }

    if (req.user.globalUserId) {
        const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
        const pr = await PlatformRole.findOne({ globalUserId: req.user.globalUserId }).lean();
        if (!pr) {
            return false;
        }
        if ((pr.roles || []).includes('root') || (pr.roles || []).includes('platform_admin')) {
            return true;
        }
        const tenantKey = String(req.school || '').toLowerCase();
        const tenantPermissions = Array.isArray(pr.tenantPermissions) ? pr.tenantPermissions : [];
        const permissionsForTenant = tenantPermissions.find((row) => row.tenantKey === tenantKey);
        return Array.isArray(permissionsForTenant?.permissions) && permissionsForTenant.permissions.includes(permission);
    }

    const { User } = getModels(req, 'User');
    const tenantUser = req.user.userId ? await User.findById(req.user.userId).lean() : null;
    if (!tenantUser) {
        return false;
    }
    const roles = tenantUser.roles || [];
    return roles.includes('admin') || roles.includes('root');
}

function requireAdminPermission(permission) {
    return async (req, res, next) => {
        try {
            const isAllowed = await hasAdminPermission(req, permission);
            if (!isAllowed) {
                return res.status(403).json({
                    success: false,
                    message: `Missing required admin permission: ${permission}`,
                    code: 'ADMIN_PERMISSION_REQUIRED'
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error validating admin permission'
            });
        }
    };
}

module.exports = { requireAdmin, hasAdminPermission, requireAdminPermission };
