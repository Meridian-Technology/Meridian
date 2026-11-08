const { authenticatePlatformAccessToken } = require('../services/platformAccessTokenService');

function bearerSecret(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Authenticate a platform-admin personal access token.
 * Mounted only on /mcp/carousel. Resolves req.user for the token owner with
 * mfaVerified false, and reads PlatformRole on every request.
 */
async function verifyPlatformAccessToken(req, res, next) {
  const secret = bearerSecret(req);
  if (!secret) {
    return res.status(401).json({
      success: false,
      message: 'No access token provided',
      code: 'NO_TOKEN',
    });
  }

  try {
    const result = await authenticatePlatformAccessToken(req, secret);
    if (result.error) {
      return res.status(result.status || 401).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    const { token, platformRoles } = result.data;
    req.user = {
      globalUserId: String(token.globalUserId),
      userId: null,
      tenantUserId: null,
      roles: ['user'],
      platformRoles,
      mfaConfigured: false,
      mfaVerified: false,
    };
    req.platformAccessToken = {
      id: String(token._id),
      label: token.label,
      displayPrefix: token.displayPrefix,
    };
    return next();
  } catch (err) {
    console.error('[verifyPlatformAccessToken]', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify access token.',
    });
  }
}

module.exports = { verifyPlatformAccessToken };
