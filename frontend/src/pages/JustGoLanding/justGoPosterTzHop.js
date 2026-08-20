/**
 * Launch hotfix: Iowa posters were printed with SF tracking QRs
 * (`justgo.lol/qr/sf-{n}`). Physical drops are Pacific vs Central, so the hop
 * uses the phone IANA zone (not IP geo) to pick the city landing.
 *
 * Keep in sync with backend `utilities/justGoPosterTzHop.js`.
 */

export const SF_TENANT_KEY = 'sf';
export const IOWA_TENANT_KEY = 'iowacity';
export const IOWA_QR_PREFIX = 'iowa';

export const IOWA_TIME_ZONES = new Set(['America/Chicago', 'US/Central']);
export const SF_TIME_ZONES = new Set([
  'America/Los_Angeles',
  'US/Pacific',
  'America/Tijuana',
]);

/** JS `Date#getTimezoneOffset()` during CDT (UTC−5). */
export const IOWA_SUMMER_UTC_OFFSET_MINUTES = 300;

export const JUSTGO_POSTER_TZ_HOP_ENABLED = true;

export function getBrowserTimeZone() {
  try {
    return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
  } catch {
    return '';
  }
}

export function getBrowserUtcOffsetMinutes() {
  try {
    return new Date().getTimezoneOffset();
  } catch {
    return null;
  }
}

function normalizeTimeZone(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseUtcOffsetMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** `sf-1` → `iowa-1`; `sf` → `iowa`. Used so Iowa scans increment Iowa QR rows. */
export function iowaSiblingQrName(name) {
  const slug = String(name || '').trim().toLowerCase();
  if (!slug) return '';
  if (slug === SF_TENANT_KEY) return IOWA_QR_PREFIX;
  if (slug.startsWith(`${SF_TENANT_KEY}-`)) {
    return `${IOWA_QR_PREFIX}-${slug.slice(SF_TENANT_KEY.length + 1)}`;
  }
  return `${IOWA_QR_PREFIX}-${slug}`;
}

export function isSfPosterQr({ tenantKey, name } = {}) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  if (tenant === SF_TENANT_KEY) return true;
  if (tenant) return false;
  const slug = String(name || '').trim().toLowerCase();
  return /^sf(?:-|$)/.test(slug);
}

export function isIowaPosterTimeZone(timeZone, utcOffsetMinutes) {
  const tz = normalizeTimeZone(timeZone);
  if (tz) {
    if (IOWA_TIME_ZONES.has(tz)) return true;
    if (SF_TIME_ZONES.has(tz)) return false;
    return false;
  }
  return parseUtcOffsetMinutes(utcOffsetMinutes) === IOWA_SUMMER_UTC_OFFSET_MINUTES;
}

/**
 * SF-owned poster QR + Iowa/Central phone zone → Iowa landing.
 * Anything else keeps the QR’s tenant (printed SF destination).
 */
export function resolvePosterTzHopTenant({
  tenantKey,
  name,
  timeZone,
  utcOffsetMinutes,
  enabled = JUSTGO_POSTER_TZ_HOP_ENABLED,
} = {}) {
  const current = String(tenantKey || '').trim().toLowerCase();
  if (!enabled || !current) return current;
  if (!isSfPosterQr({ tenantKey: current, name })) return current;
  if (!isIowaPosterTimeZone(timeZone, utcOffsetMinutes)) return current;
  return IOWA_TENANT_KEY;
}

/**
 * City + QR name to attribute. Iowa scans map `sf-{n}` → `iowa-{n}` before
 * any increment so Launch QR rows stay on the Iowa tenant.
 */
export function resolvePosterTzHop(options = {}) {
  const currentTenant = String(options.tenantKey || '').trim().toLowerCase();
  const currentName = String(options.name || '').trim().toLowerCase();
  const tenantKey = resolvePosterTzHopTenant(options);
  if (!tenantKey || tenantKey === currentTenant) {
    return { tenantKey: currentTenant, name: currentName, remapped: false };
  }
  return {
    tenantKey,
    name: iowaSiblingQrName(currentName) || currentName,
    remapped: true,
  };
}

export function applyPosterTzHop(data, options = {}) {
  if (!data || typeof data !== 'object') return data;
  const hop = resolvePosterTzHop({
    tenantKey: data.tenantKey,
    name: data.name,
    timeZone: options.timeZone,
    utcOffsetMinutes: options.utcOffsetMinutes,
    enabled: options.enabled,
  });
  if (!hop.remapped) return data;
  return {
    ...data,
    tenantKey: hop.tenantKey,
    name: hop.name,
    path: `/${hop.tenantKey}`,
    posterTzHop: true,
  };
}
