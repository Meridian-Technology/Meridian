/**
 * Mobile update gate tunables for GET /pivot/config `mobile`.
 * Env overrides support release sequencing without redeploying tenant config.
 */

const { isAppVersionAtLeast, parseAppVersion } = require('./appVersion');

const PIVOT_MOBILE_DEFAULT_MESSAGE = 'update to keep going with your crew this week';

const PIVOT_MOBILE_STORE_URLS = Object.freeze({
  ios: 'https://apps.apple.com/us/app/meridian-go/id6755217537',
  android: 'market://details?id=com.meridian.mobile',
});

const PIVOT_MOBILE_CONFIG_DEFAULTS = Object.freeze({
  minAppVersion: '1.0.0',
  forceUpdate: false,
  storeUrls: PIVOT_MOBILE_STORE_URLS,
  message: PIVOT_MOBILE_DEFAULT_MESSAGE,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) {
    return { ...base };
  }

  const out = { ...base };
  Object.keys(override).forEach((key) => {
    const value = override[key];
    if (value === undefined) {
      return;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
      return;
    }
    out[key] = value;
  });
  return out;
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(PIVOT_MOBILE_CONFIG_DEFAULTS));
}

function parseEnvBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
}

function readEnvMobileOverrides() {
  const out = {};

  if (process.env.PIVOT_MOBILE_MIN_APP_VERSION?.trim()) {
    out.minAppVersion = process.env.PIVOT_MOBILE_MIN_APP_VERSION.trim();
  }

  const forceUpdate = parseEnvBoolean(process.env.PIVOT_MOBILE_FORCE_UPDATE);
  if (forceUpdate !== undefined) {
    out.forceUpdate = forceUpdate;
  }

  if (process.env.PIVOT_MOBILE_UPDATE_MESSAGE?.trim()) {
    out.message = process.env.PIVOT_MOBILE_UPDATE_MESSAGE.trim();
  }

  const iosUrl = process.env.PIVOT_MOBILE_STORE_URL_IOS?.trim();
  const androidUrl = process.env.PIVOT_MOBILE_STORE_URL_ANDROID?.trim();
  if (iosUrl || androidUrl) {
    out.storeUrls = {};
    if (iosUrl) out.storeUrls.ios = iosUrl;
    if (androidUrl) out.storeUrls.android = androidUrl;
  }

  return out;
}

function validateAppVersionString(value, fieldName) {
  const version = String(value).trim();
  if (!parseAppVersion(version)) {
    return { error: `${fieldName} must be semver format major.minor.patch (e.g. 1.0.9).` };
  }
  return { value: version };
}

function validatePivotMobileConfigPatch(body = {}) {
  if (body === null || body === undefined) {
    return { ok: true, patch: undefined };
  }
  if (!isPlainObject(body)) {
    return { error: 'pivotMobileConfig must be an object.' };
  }

  const out = {};

  if (body.minAppVersion !== undefined) {
    const result = validateAppVersionString(body.minAppVersion, 'minAppVersion');
    if (result.error) return { error: result.error };
    out.minAppVersion = result.value;
  }

  if (body.forceUpdate !== undefined) {
    if (typeof body.forceUpdate !== 'boolean') {
      return { error: 'forceUpdate must be a boolean.' };
    }
    out.forceUpdate = body.forceUpdate;
  }

  if (body.message !== undefined) {
    const message = String(body.message).trim();
    if (!message || message.length > 240) {
      return { error: 'message must be 1–240 characters.' };
    }
    out.message = message;
  }

  if (body.storeUrls !== undefined) {
    if (!isPlainObject(body.storeUrls)) {
      return { error: 'storeUrls must be an object.' };
    }
    const storeUrls = {};
    if (body.storeUrls.ios !== undefined) {
      const ios = String(body.storeUrls.ios).trim();
      if (!ios || ios.length > 512) {
        return { error: 'storeUrls.ios must be 1–512 characters.' };
      }
      storeUrls.ios = ios;
    }
    if (body.storeUrls.android !== undefined) {
      const android = String(body.storeUrls.android).trim();
      if (!android || android.length > 512) {
        return { error: 'storeUrls.android must be 1–512 characters.' };
      }
      storeUrls.android = android;
    }
    if (Object.keys(storeUrls).length) {
      out.storeUrls = storeUrls;
    }
  }

  return { ok: true, patch: Object.keys(out).length ? out : {} };
}

/**
 * Resolve mobile config for GET /pivot/config: defaults → tenant override → env override.
 */
function mergePivotMobileConfig(stored) {
  const merged = deepMerge(cloneDefaults(), isPlainObject(stored) ? stored : {});
  const envOverrides = readEnvMobileOverrides();
  return deepMerge(merged, envOverrides);
}

function isAppVersionAllowed(appVersion, mobileConfig) {
  return isAppVersionAtLeast(appVersion, mobileConfig.minAppVersion);
}

module.exports = {
  PIVOT_MOBILE_CONFIG_DEFAULTS,
  PIVOT_MOBILE_DEFAULT_MESSAGE,
  PIVOT_MOBILE_STORE_URLS,
  mergePivotMobileConfig,
  validatePivotMobileConfigPatch,
  isAppVersionAllowed,
  readEnvMobileOverrides,
};
