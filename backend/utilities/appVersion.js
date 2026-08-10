/**
 * Semver-style app version parsing and comparison for mobile X-App-Version headers.
 * Supports major.minor.patch with optional pre-release/build suffix (ignored for ordering).
 */

const APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

function parseAppVersion(version) {
  if (version === null || version === undefined) {
    return null;
  }

  const trimmed = String(version).trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(APP_VERSION_PATTERN);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Compare two app version strings.
 * @returns {-1|0|1} negative if a < b, zero if equal, positive if a > b
 * @returns {null} if either version is invalid
 */
function compareAppVersions(a, b) {
  const parsedA = parseAppVersion(a);
  const parsedB = parseAppVersion(b);

  if (!parsedA || !parsedB) {
    return null;
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }

  return 0;
}

function isAppVersionAtLeast(current, minimum) {
  const comparison = compareAppVersions(current, minimum);
  return comparison !== null && comparison >= 0;
}

module.exports = {
  APP_VERSION_PATTERN,
  parseAppVersion,
  compareAppVersions,
  isAppVersionAtLeast,
};
