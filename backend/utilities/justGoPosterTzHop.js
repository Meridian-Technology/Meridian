/**
 * Launch hotfix: Iowa posters were printed with SF tracking QRs
 * (`justgo.lol/qr/sf-{n}`). Physical drops are Pacific vs Central, so the hop
 * uses the phone IANA zone (not IP geo) to pick the city landing.
 *
 * Keep in sync with frontend `pages/JustGoLanding/justGoPosterTzHop.js`.
 *
 * Disable with JUSTGO_POSTER_TZ_HOP=0 after a reprint.
 */

const SF_TENANT_KEY = 'sf';
const IOWA_TENANT_KEY = 'iowacity';
const IOWA_QR_PREFIX = 'iowa';

const IOWA_TIME_ZONES = new Set(['America/Chicago', 'US/Central']);
const SF_TIME_ZONES = new Set([
  'America/Los_Angeles',
  'US/Pacific',
  'America/Tijuana',
]);

/** JS `Date#getTimezoneOffset()` during CDT (UTC−5). */
const IOWA_SUMMER_UTC_OFFSET_MINUTES = 300;

function posterTzHopEnabled() {
  const raw = process.env.JUSTGO_POSTER_TZ_HOP;
  if (raw == null || raw === '') return true;
  const normalized = String(raw).trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
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
function iowaSiblingQrName(name) {
  const slug = String(name || '').trim().toLowerCase();
  if (!slug) return '';
  if (slug === SF_TENANT_KEY) return IOWA_QR_PREFIX;
  if (slug.startsWith(`${SF_TENANT_KEY}-`)) {
    return `${IOWA_QR_PREFIX}-${slug.slice(SF_TENANT_KEY.length + 1)}`;
  }
  return `${IOWA_QR_PREFIX}-${slug}`;
}

function isSfPosterQr({ tenantKey, name } = {}) {
  const tenant = String(tenantKey || '').trim().toLowerCase();
  if (tenant === SF_TENANT_KEY) return true;
  if (tenant) return false;
  const slug = String(name || '').trim().toLowerCase();
  return /^sf(?:-|$)/.test(slug);
}

function isIowaPosterTimeZone(timeZone, utcOffsetMinutes) {
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
function resolvePosterTzHopTenant({
  tenantKey,
  name,
  timeZone,
  utcOffsetMinutes,
  enabled = posterTzHopEnabled(),
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
function resolvePosterTzHop(options = {}) {
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

module.exports = {
  SF_TENANT_KEY,
  IOWA_TENANT_KEY,
  IOWA_QR_PREFIX,
  IOWA_TIME_ZONES,
  SF_TIME_ZONES,
  IOWA_SUMMER_UTC_OFFSET_MINUTES,
  posterTzHopEnabled,
  iowaSiblingQrName,
  isSfPosterQr,
  isIowaPosterTimeZone,
  resolvePosterTzHopTenant,
  resolvePosterTzHop,
};
