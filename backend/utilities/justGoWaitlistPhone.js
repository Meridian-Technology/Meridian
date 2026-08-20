const { normalizeContactPhone } = require('./pivotContactHash');

const E164_MAX_DIGITS = 15;
const E164_MIN_DIGITS = 11;

/**
 * US-first E.164 for Just Go waitlist.
 * 10-digit NANP → +1; already-prefixed numbers keep their country code.
 * Returns null for garbage (INVALID_PHONE).
 */
function normalizeWaitlistPhoneE164(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const digits = normalizeContactPhone(trimmed);
  if (!digits) return null;
  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) return null;

  if (digits.length === 11 && digits.startsWith('1')) {
    const npa = digits[1];
    if (npa === '0' || npa === '1') return null;
  }

  return `+${digits}`;
}

module.exports = {
  normalizeWaitlistPhoneE164,
  E164_MAX_DIGITS,
  E164_MIN_DIGITS,
};
