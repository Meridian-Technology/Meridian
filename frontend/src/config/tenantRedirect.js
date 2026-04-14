/**
 * Tenant / www handling: www.meridian.study is for landing pages only.
 * Subdomain is enforced for auth and app; user must choose school on first login/register.
 */

const ROOT_HOSTS = ['www.meridian.study', 'meridian.study'];
const TENANT_CONFIG_CACHE_KEY = 'tenantConfigCache';
const DEFAULT_TENANTS = [
  {
    tenantKey: 'rpi',
    name: 'Rensselaer Polytechnic Institute',
    subdomain: 'rpi',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
  },
  {
    tenantKey: 'tvcog',
    name: 'Center of Gravity',
    subdomain: 'tvcog',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
  },
];
const VISIBLE_STATUSES = new Set(['active', 'coming_soon', 'maintenance']);
const TENANT_DISPLAY_NAMES = DEFAULT_TENANTS.reduce((acc, tenant) => {
  acc[tenant.tenantKey] = tenant.name;
  return acc;
}, {});

function normalizeTenantRows(rows = []) {
  return rows
    .map((row) => {
      const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
      if (!tenantKey) return null;
      const status = String(row?.status || 'active').trim();
      return {
        tenantKey,
        name: String(row?.name || tenantKey).trim(),
        subdomain: String(row?.subdomain || tenantKey).trim().toLowerCase(),
        location: String(row?.location || '').trim(),
        status: ['active', 'coming_soon', 'maintenance', 'hidden'].includes(status) ? status : 'active',
        statusMessage: String(row?.statusMessage || '').trim(),
      };
    })
    .filter(Boolean);
}

function mergeTenantRows(baseRows = [], overrideRows = []) {
  const byKey = new Map();
  normalizeTenantRows(baseRows).forEach((row) => byKey.set(row.tenantKey, row));
  normalizeTenantRows(overrideRows).forEach((row) => {
    const base = byKey.get(row.tenantKey) || {};
    byKey.set(row.tenantKey, { ...base, ...row });
  });
  return Array.from(byKey.values());
}

function getCachedTenantConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TENANT_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tenants)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function setTenantConfigCache(tenants = []) {
  if (typeof window === 'undefined') return;
  try {
    const merged = mergeTenantRows(DEFAULT_TENANTS, tenants);
    localStorage.setItem(
      TENANT_CONFIG_CACHE_KEY,
      JSON.stringify({
        tenants: merged,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (_) {}
}

export function getTenantDefinitions(options = {}) {
  const includeHidden = !!options.includeHidden;
  const cached = getCachedTenantConfig();
  const merged = mergeTenantRows(DEFAULT_TENANTS, cached?.tenants || []);
  if (includeHidden) return merged;
  return merged.filter((tenant) => VISIBLE_STATUSES.has(tenant.status));
}

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
  '/tenant-status',
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

export function getTenantKeys(options = {}) {
  return getTenantDefinitions(options).map((tenant) => tenant.tenantKey);
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
  const tenantMap = getTenantDefinitions({ includeHidden: true }).reduce((acc, tenant) => {
    acc[tenant.tenantKey] = tenant.name;
    return acc;
  }, {});
  return (key && tenantMap[key]) || (key && TENANT_DISPLAY_NAMES[key]) || key || 'Institution';
}
