const { isAppVersionAtLeast } = require('../utilities/appVersion');

const APP_VERSION_HEADER = 'X-App-Version';

/**
 * Gate new ritual routes until the client sends a store version at or above min.
 * Old binaries never call gated routes; existing routes stay ungated.
 */
function requireMinAppVersion(minVersion) {
  return (req, res, next) => {
    const appVersion = req.get(APP_VERSION_HEADER)?.trim();

    if (!appVersion || !isAppVersionAtLeast(appVersion, minVersion)) {
      return res.status(426).json({
        success: false,
        code: 'APP_UPGRADE_REQUIRED',
        minAppVersion: minVersion,
        message: 'App upgrade required.',
      });
    }

    return next();
  };
}

module.exports = {
  APP_VERSION_HEADER,
  requireMinAppVersion,
};
