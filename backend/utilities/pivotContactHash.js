const crypto = require('crypto');

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const DEFAULT_PHONE_REGION = '1';

/**
 * Normalize an email for contact matching (lowercase, trimmed).
 * @param {string} value
 * @returns {string|null}
 */
function normalizeContactEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return null;
  }
  return normalized;
}

/**
 * Normalize a phone number to digits with a leading country code (US default region 1).
 * @param {string} value
 * @param {string} [defaultRegion]
 * @returns {string|null}
 */
function normalizeContactPhone(value, defaultRegion = DEFAULT_PHONE_REGION) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  let normalized = digits;
  if (normalized.length === 10) {
    normalized = `${defaultRegion}${normalized}`;
  } else if (normalized.length === 11 && normalized.startsWith(defaultRegion)) {
    normalized = normalized;
  } else if (normalized.length < 10) {
    return null;
  }

  return normalized;
}

/**
 * SHA-256 hex digest of a normalized identifier string.
 * @param {string} normalizedValue
 * @returns {string}
 */
function hashNormalizedContactValue(normalizedValue) {
  return crypto.createHash('sha256').update(normalizedValue, 'utf8').digest('hex');
}

/**
 * Hash a raw email after normalization.
 * @param {string} value
 * @returns {string|null}
 */
function hashContactEmail(value) {
  const normalized = normalizeContactEmail(value);
  return normalized ? hashNormalizedContactValue(normalized) : null;
}

/**
 * Hash a raw phone after normalization.
 * @param {string} value
 * @param {string} [defaultRegion]
 * @returns {string|null}
 */
function hashContactPhone(value, defaultRegion = DEFAULT_PHONE_REGION) {
  const normalized = normalizeContactPhone(value, defaultRegion);
  return normalized ? hashNormalizedContactValue(normalized) : null;
}

/**
 * Hash identifiers server-side (in memory only — never persisted as raw values).
 * @param {Array<{ type: string, value: string }>} identifiers
 * @returns {Array<{ type: 'email'|'phone', hash: string }>}
 */
function hashContactIdentifiers(identifiers = []) {
  const seen = new Set();
  const hashes = [];

  for (const row of identifiers) {
    const type = String(row?.type || '').trim().toLowerCase();
    const value = String(row?.value || '').trim();
    if (!value || (type !== 'email' && type !== 'phone')) {
      continue;
    }

    const hash =
      type === 'email' ? hashContactEmail(value) : hashContactPhone(value);
    if (!hash) {
      continue;
    }

    const key = `${type}:${hash}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hashes.push({ type, hash });
  }

  return hashes;
}

/**
 * @param {string} hash
 * @returns {boolean}
 */
function isValidContactHash(hash) {
  return SHA256_HEX_RE.test(String(hash || '').trim().toLowerCase());
}

module.exports = {
  DEFAULT_PHONE_REGION,
  SHA256_HEX_RE,
  normalizeContactEmail,
  normalizeContactPhone,
  hashNormalizedContactValue,
  hashContactEmail,
  hashContactPhone,
  hashContactIdentifiers,
  isValidContactHash,
};
