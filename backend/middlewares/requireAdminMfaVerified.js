const getModels = require('../services/getModelService');

/**
 * Require a session that has passed admin MFA. Use after verifyToken and an
 * admin check. Reads mfaConfigured the way requireAdmin does (token claim or
 * the tenant user's adminMfa), but unlike requireAdmin it also refuses an
 * admin who has no MFA configured at all.
 */
async function requireAdminMfaVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'NO_TOKEN',
    });
  }

  let tenantUser = null;
  if (req.user.userId) {
    const { User } = getModels(req, 'User');
    tenantUser = await User.findById(req.user.userId).select('adminMfa').lean();
  }

  const mfaConfiguredByToken = Boolean(req.user.mfaConfigured);
  const mfaConfiguredByDb = Boolean(
    (tenantUser?.adminMfa?.totp?.enabled && tenantUser?.adminMfa?.totp?.secret) ||
    (Array.isArray(tenantUser?.adminMfa?.passkeys) && tenantUser.adminMfa.passkeys.length > 0)
  );
  const mfaConfigured = mfaConfiguredByToken || mfaConfiguredByDb;
  const mfaVerified = Boolean(req.user.mfaVerified);

  if (!mfaConfigured) {
    return res.status(403).json({
      success: false,
      message: 'Set up admin MFA, then sign in again, to make this change.',
      code: 'ADMIN_MFA_NOT_CONFIGURED',
      mfaConfigured: false,
      mfaVerified,
    });
  }
  if (!mfaVerified) {
    return res.status(403).json({
      success: false,
      message: 'Admin MFA is required',
      code: 'ADMIN_MFA_REQUIRED',
      mfaConfigured: true,
      mfaVerified: false,
    });
  }

  return next();
}

module.exports = { requireAdminMfaVerified };
