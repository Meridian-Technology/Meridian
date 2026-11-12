const crypto = require('crypto');

/**
 * Keyed hashes for analytics identifiers derived from IP addresses, user agents
 * or visitor ids.
 *
 * A plain SHA-256 of an IPv4 address can be reversed by hashing all 2^32
 * addresses, so stored identifiers are HMACed with a server secret instead.
 * Keyed values carry a `k1:` prefix so migrations can tell them apart from the
 * unkeyed values written before.
 *
 * `keyDigest` takes an existing unkeyed digest, so a migration can convert old
 * values into exactly what new writes produce for the same visitor.
 *
 * Production requires ANALYTICS_HASH_SECRET and never falls back: every key
 * writes the same `k1:` prefix, so values hashed under a fallback key could
 * never be converted once the real secret is set. Without the secret nothing
 * is stored and the server logs an error. Elsewhere (dev, test) the key falls
 * back to one derived from JWT_SECRET.
 */

const KEYED_PREFIX = 'k1:';
const KEYED_LENGTH = 32;
const DERIVATION_LABEL = 'meridian-analytics-hash-v1';

let reportedMissingKey = false;

function reportMissingKey() {
  if (reportedMissingKey) return;
  reportedMissingKey = true;
  console.error('[analytics-hash] ANALYTICS_HASH_SECRET is not set: IP and visitor hashes are not stored.');
}

function hashKey() {
  if (process.env.ANALYTICS_HASH_SECRET) return process.env.ANALYTICS_HASH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    reportMissingKey();
    return null;
  }
  if (process.env.JWT_SECRET) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET).update(DERIVATION_LABEL).digest();
  }
  return null;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isKeyedHash(value) {
  return typeof value === 'string' && value.startsWith(KEYED_PREFIX);
}

/** Keyed form of an existing unkeyed digest. Null when there is no digest or no key. */
function keyDigest(digest) {
  if (digest == null || digest === '') return null;
  const key = hashKey();
  if (!key) return null;
  const mac = crypto.createHmac('sha256', key).update(String(digest)).digest('hex');
  return `${KEYED_PREFIX}${mac.slice(0, KEYED_LENGTH)}`;
}

/** Keyed hash of a raw identifier (IP, `ip-userAgent`, visitor id). */
function analyticsHash(raw) {
  if (raw == null || raw === '') return null;
  return keyDigest(sha256Hex(raw));
}

/** Called at startup so a missing production secret shows up in the boot log. */
function checkAnalyticsHashKey() {
  return Boolean(hashKey());
}

module.exports = {
  KEYED_PREFIX,
  checkAnalyticsHashKey,
  analyticsHash,
  keyDigest,
  isKeyedHash,
  sha256Hex,
};
