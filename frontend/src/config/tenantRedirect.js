/**
 * Tenant / www handling: www.meridian.study is for landing pages only.
 * Subdomain is enforced for auth and app; user must choose school on first login/register.
 */

const ROOT_HOSTS = ['www.meridian.study', 'meridian.study'];
const TENANT_KEYS = ['rpi', 'tvcog']; // keep in sync with backend connectionsManager

export function isWww() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  if (ROOT_HOSTS.includes(host.toLowerCase())) return true;
  if (process.env.NODE_ENV !== 'production' && host === 'localhost') return true;
  return false;
}

/** Paths allowed on www (landing only). Everything else requires a tenant subdomain. */
const WWW_ALLOWED_PATHS = [
  '/',
  '/landing',
  '/mobile',
  '/contact',
  '/support',
  '/privacy-policy',
  '/terms-of-service',
  '/child-safety-standards',
  '/booking',
  '/documentation',
  '/error',
  '/select-school',
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
