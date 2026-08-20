const EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lowercase trimmed email for Just Go waitlist.
 * Returns null for garbage (INVALID_EMAIL).
 */
function normalizeWaitlistEmail(value) {
  if (value == null) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

module.exports = {
  normalizeWaitlistEmail,
  EMAIL_MAX_LENGTH,
};
