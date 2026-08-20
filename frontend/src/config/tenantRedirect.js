/**
 * Tenant / www handling: www.meridian.study is for landing pages only.
 * Subdomain is enforced for auth and app; user must choose school on first login/register.
 *
 * justgo.lol is a third host class (Just Go apex) — not campus www, not a school subdomain.
 * Local/dev: set localStorage justgoHostOverride=1 to treat localhost as that apex
 * without changing campus `npm start`.
 */

const ROOT_HOSTS = ['www.meridian.study', 'meridian.study'];
export const JUSTGO_PUBLIC_HOSTS = Object.freeze(['justgo.lol', 'www.justgo.lol']);
export const JUSTGO_HOST_OVERRIDE_KEY = 'justgoHostOverride';
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

/** Pivot pilot cities use referral/onboarding — not the campus institution picker. */
export function isPivotTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}

function normalizeTenantRows(rows = []) {
  return rows
    .map((row) => {
      const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
      if (!tenantKey) return null;
      const status = String(row?.status || 'active').trim();
      const tenantType = row?.tenantType === 'pivot' ? 'pivot' : 'campus';
      return {
        tenantKey,
        name: String(row?.name || tenantKey).trim(),
        subdomain: String(row?.subdomain || tenantKey).trim().toLowerCase(),
        location: String(row?.location || '').trim(),
        status: ['active', 'coming_soon', 'maintenance', 'hidden'].includes(status) ? status : 'active',
        statusMessage: String(row?.statusMessage || '').trim(),
        tenantType,
        pivotPilot: row?.pivotPilot === true || tenantType === 'pivot',
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
  const includePivot = !!options.includePivot;
  const cached = getCachedTenantConfig();
  let merged = mergeTenantRows(DEFAULT_TENANTS, cached?.tenants || []);
  if (!includePivot) {
    merged = merged.filter((tenant) => !isPivotTenant(tenant));
  }
  if (includeHidden) return merged;
  return merged.filter((tenant) => VISIBLE_STATUSES.has(tenant.status));
}

function currentHostname() {
  if (typeof window === 'undefined') return '';
  return String(window.location.hostname || '').toLowerCase();
}

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase();
}

export function isJustGoPublicHostname(hostname) {
  return JUSTGO_PUBLIC_HOSTS.includes(normalizeHostname(hostname));
}

export function readJustGoHostOverride() {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(JUSTGO_HOST_OVERRIDE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/** True on justgo.lol / www.justgo.lol, or localhost with justgoHostOverride=1 (dev only). */
export function isJustGoHost(hostname = currentHostname()) {
  const host = normalizeHostname(hostname);
  if (isJustGoPublicHostname(host)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return host === 'localhost' && readJustGoHostOverride();
}

/** Canonical public origin. www.justgo.lol should 301 here once DNS exists. */
export const JUSTGO_APEX_ORIGIN = 'https://justgo.lol';

export function isJustGoWwwHost(hostname = currentHostname()) {
  return normalizeHostname(hostname) === 'www.justgo.lol';
}

/** Absolute apex URL for a same-host path (used to drop www). */
export function justGoApexUrl(pathWithSearch = '/') {
  const next = pathWithSearch == null || pathWithSearch === '' ? '/' : String(pathWithSearch);
  if (next.startsWith('http')) return next;
  return `${JUSTGO_APEX_ORIGIN}${next.startsWith('/') ? next : `/${next}`}`;
}

export function isWww(hostname = currentHostname()) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  // Just Go apex is not campus marketing www (www.justgo.lol would otherwise match www.*).
  if (isJustGoPublicHostname(host)) return false;
  if (ROOT_HOSTS.includes(host)) return true;
  if (host.startsWith('www.')) return true;
  if (process.env.NODE_ENV !== 'production' && host === 'localhost') return true;
  return false;
}

/** Paths allowed on www (landing only). Everything else requires a tenant subdomain. */
const WWW_ALLOWED_PATHS = [
  '/',
  '/landing',
  '/mobile',
  '/invite',
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
  '/platform-admin',
  '/admin/pivot',
  '/justgo',
  '/login',
];

// /platform-admin/pivot/:tenantKey is covered by the '/platform-admin' prefix check in isPathAllowedOnWww.

export function isPathAllowedOnWww(pathname) {
  const path = (pathname || '/').split('?')[0] || '/';
  return WWW_ALLOWED_PATHS.some(allowed => {
    if (allowed === '/') return path === '/';
    return path === allowed || path.startsWith(allowed + '/');
  });
}

/** Public paths on justgo.lol — city slugs plus reserved prefixes. Used so Layout never sends this host to /select-school. */
const JUSTGO_HOST_ALLOWED_PATHS = Object.freeze([
  '/',
  '/qr',
  '/creator',
  '/invite',
  '/privacy-policy',
  '/terms-of-service',
  '/login',
  '/platform-admin',
  '/admin',
  '/justgo',
  '/error',
  '/tenant-status',
]);

export function isPathAllowedOnJustGoHost(pathname) {
  const path = (pathname || '/').split('?')[0] || '/';
  if (path === '/') return true;
  if (JUSTGO_HOST_ALLOWED_PATHS.some((allowed) => {
    if (allowed === '/') return false;
    return path === allowed || path.startsWith(`${allowed}/`);
  })) {
    return true;
  }
  // justgo.lol/{city} — a single path segment is a tenant slug, not a campus app route.
  return path.split('/').filter(Boolean).length === 1;
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

/** School tenant from hostname. justgo / www are never tenant keys. */
export function tenantKeyFromHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || isJustGoPublicHostname(host)) return null;
  const sub = host.split('.')[0];
  if (sub && sub !== 'www' && sub !== 'meridian' && sub !== 'justgo') {
    return sub;
  }
  return null;
}

/** Get current tenant key from hostname (production) or devTenantOverride (dev). */
export function getCurrentTenantKey(hostname = currentHostname()) {
  if (typeof window === 'undefined' && !hostname) return null;
  const host = normalizeHostname(hostname);
  if (isJustGoPublicHostname(host)) return null;
  if (process.env.NODE_ENV !== 'production' && host === 'localhost') {
    if (readJustGoHostOverride()) return null;
    try {
      return localStorage.getItem('devTenantOverride') || getLastTenant() || null;
    } catch (_) {
      return getLastTenant();
    }
  }
  return tenantKeyFromHostname(host);
}

/** Get display name for current tenant. */
export function getCurrentTenantDisplayName() {
  const key = getCurrentTenantKey();
  const tenantMap = getTenantDefinitions({ includeHidden: true, includePivot: true }).reduce((acc, tenant) => {
    acc[tenant.tenantKey] = tenant.name;
    return acc;
  }, {});
  return (key && tenantMap[key]) || (key && TENANT_DISPLAY_NAMES[key]) || key || 'Institution';
}
