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
  if (host.toLowerCase().startsWith('www.')) return true;
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

/** Derive base domain from current host (e.g. rpi.pinkpulse.org → pinkpulse.org, www.pinkpulse.org → pinkpulse.org). */
function getBaseDomain() {
  if (typeof window === 'undefined') return 'meridian.study';
  const host = window.location.hostname || '';
  const parts = host.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return host || 'meridian.study';
}

/** Get the www URL for the current domain (e.g. rpi.pinkpulse.org → https://www.pinkpulse.org). In dev, returns same origin. */
export function getWwwUrl(pathname = '/', search = '') {
  if (typeof window === 'undefined') return '';
  if (process.env.NODE_ENV !== 'production' && window.location.hostname === 'localhost') {
    return `${window.location.origin}${pathname}${search}`;
  }
  const base = getBaseDomain();
  const protocol = window.location.protocol || 'https:';
  return `${protocol}//www.${base}${pathname}${search}`;
}

export function getTenantRedirectUrl(tenantKey, pathname = window.location.pathname, search = window.location.search) {
  if (process.env.NODE_ENV !== 'production') {
    return `${window.location.origin}${pathname}${search}`;
  }
  const base = getBaseDomain();
  const protocol = window.location.protocol || 'https:';
  return `${protocol}//${tenantKey}.${base}${pathname}${search}`;
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

/** In dev, when we have devTenantOverride, we're effectively on that tenant (same origin). */
export function hasDevTenantOverride() {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return !!localStorage.getItem('devTenantOverride');
  } catch (_) {
    return false;
  }
}

/** Display names for tenants (keep in sync with SelectSchool DOMAIN_META). */
const TENANT_DISPLAY_NAMES = {
  rpi: 'Rensselaer Polytechnic Institute',
  tvcog: 'Center of Gravity',
};

/** Get current tenant key from hostname (production) or devTenantOverride (dev). */
export function getCurrentTenantKey() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname || '';
  if (process.env.NODE_ENV !== 'production' && host === 'localhost') {
    try {
      return localStorage.getItem('devTenantOverride') || getLastTenant() || null;
    } catch (_) {
      return getLastTenant();
    }
  }
  const sub = host.split('.')[0];
  if (sub && sub !== 'www' && sub !== 'meridian') {
    return sub;
  }
  return null;
}

/** Get display name for current tenant. */
export function getCurrentTenantDisplayName() {
  const key = getCurrentTenantKey();
  return (key && TENANT_DISPLAY_NAMES[key]) || key || 'Institution';
}
