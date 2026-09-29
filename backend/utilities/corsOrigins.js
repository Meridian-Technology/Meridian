/**
 * Production CORS / Socket.IO origins.
 * justgo.lol is a public Just Go host, not a campus tenant subdomain of BASE_DOMAIN.
 */

const BASE_DOMAIN = process.env.MERIDIAN_BASE_DOMAIN || 'meridian.study';

const STATIC_PRODUCTION_ORIGINS = Object.freeze([
  'https://www.meridian.study',
  'https://meridian.study',
  'https://rpi.meridian.study',
  'https://tvcog.meridian.study',
  'https://rpi.pinkpulse.org',
  'https://tvcog.pinkpulse.org',
  'https://www.pinkpulse.org',
  'https://pinkpulse.org',
  'https://justgo.lol',
  'https://www.justgo.lol',
]);

const JUSTGO_PUBLIC_HOSTS = Object.freeze(['justgo.lol', 'www.justgo.lol']);

function hostnameFromHostHeader(host) {
  return String(host || '').split(':')[0].trim().toLowerCase();
}

function isJustGoPublicHost(host) {
  return JUSTGO_PUBLIC_HOSTS.includes(hostnameFromHostHeader(host));
}

/**
 * Tailscale's CGNAT range (100.64.0.0/10) — lets a dev hit the API from
 * another device on their tailnet (phone, second laptop) during local testing.
 */
function isTailscaleDevOrigin(origin) {
  const match = /^http:\/\/(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(?::\d+)?$/.exec(
    String(origin || ''),
  );
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first === 100 && second >= 64 && second <= 127;
}

function isAllowedCorsOrigin(origin, options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const baseDomain = options.baseDomain ?? BASE_DOMAIN;
  if (!origin) return true;
  if (nodeEnv !== 'production') {
    return String(origin).startsWith('http://localhost') || isTailscaleDevOrigin(origin);
  }
  if (STATIC_PRODUCTION_ORIGINS.includes(origin)) return true;
  const escaped = String(baseDomain).replace(/\./g, '\\.');
  return new RegExp(`^https://[a-z0-9_-]+\\.${escaped}$`).test(origin);
}

module.exports = {
  STATIC_PRODUCTION_ORIGINS,
  JUSTGO_PUBLIC_HOSTS,
  isJustGoPublicHost,
  isTailscaleDevOrigin,
  isAllowedCorsOrigin,
};
