/**
 * Cookie domain helper for multi-tenant auth.
 * In production, cookies must be scoped to the base domain so they work across subdomains
 * (e.g. rpi.pinkpulse.org and www.pinkpulse.org share cookies when domain is .pinkpulse.org).
 * Staging (pinkpulse.org) and production (meridian.study) both need correct domain.
 */
function getCookieDomain(req) {
  if (process.env.NODE_ENV !== 'production') return undefined;
  const host = (req && req.hostname) || (req && req.headers && req.headers.host && req.headers.host.split(':')[0]) || '';
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return undefined;
  const parts = host.split('.');
  if (parts.length < 2) return undefined;
  const base = parts.slice(-2).join('.');
  return base ? `.${base}` : undefined;
}

module.exports = { getCookieDomain };
