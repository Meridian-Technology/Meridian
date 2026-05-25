const getGlobalModels = require('../services/getGlobalModelService');

/**
 * Require platform_admin or root. Use after verifyToken.
 */
async function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const tokenRoles = req.user.platformRoles || [];
  let allowed = tokenRoles.includes('platform_admin') || tokenRoles.includes('root');

  if (!allowed && req.user.globalUserId) {
    const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
    const pr = await PlatformRole.findOne({ globalUserId: req.user.globalUserId }).lean();
    if (pr?.roles?.includes('platform_admin') || pr?.roles?.includes('root')) {
      allowed = true;
    }
  }

  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Platform admin required.' });
  }

  return next();
}

module.exports = { requirePlatformAdmin };
