/**
 * Tenant / www handling: meridian.study (www) is for landing + login/register only.
 * App and dashboard require a tenant subdomain (e.g. rpi.meridian.study).
 */

const ROOT_HOSTS = ['www.meridian.study', 'meridian.study'];
const TENANT_KEYS = ['rpi', 'tvcog']; // used for school dropdown on www; keep in sync with backend connectionsManager

export function isWww() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  return ROOT_HOSTS.includes(host.toLowerCase());
}

/** Paths that are allowed on www (landing + auth). Everything else requires a tenant subdomain. */
const WWW_ALLOWED_PATHS = [
  '/',
  '/login',
  '/register',
  '/landing',
  '/mobile',
  '/contact',
  '/support',
  '/privacy-policy',
  '/terms-of-service',
  '/child-safety-standards',
  '/forgot-password',
  '/reset-password',
  '/auth/saml/callback',
  '/auth/apple/callback',
  '/booking',
  '/org-invites',
  '/org-invites/landing',
  '/org-invites/accept',
  '/org-invites/decline',
  '/qr',
  '/check-in',
  '/documentation',
  '/new-badge',
  '/org',
  '/error',
];

export function isPathAllowedOnWww(pathname) {
  const path = (pathname || '/').split('?')[0] || '/';
  return WWW_ALLOWED_PATHS.some(allowed => {
    if (allowed === '/') return path === '/';
    return path === allowed || path.startsWith(allowed + '/');
  });
}

export function getTenantRedirectUrl(tenantKey, pathname = window.location.pathname, search = window.location.search) {
  if (process.env.NODE_ENV !== 'production') {
    return `${window.location.origin}${pathname}${search}`;
  }
  return `https://${tenantKey}.meridian.study${pathname}${search}`;
}

export function getTenantKeys() {
  return TENANT_KEYS;
}

export function setLastTenant(tenantKey) {
  try {
    localStorage.setItem('lastTenant', tenantKey);
  } catch (_) {}
}

export function getLastTenant() {
  try {
    return localStorage.getItem('lastTenant');
  } catch (_) {
    return null;
  }
}
