import apiRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import { landingTenantKeyFromParam, readStoredLandingCity } from './justGoLandingUtils';

export const JUSTGO_LANDING_VISITOR_KEY = 'justgo.landing.visitor';
export const JUSTGO_LANDING_SRC_KEY = 'justgo.landing.src';
export const JUSTGO_LANDING_QR_KEY = 'justgo.landing.qr';
export const JUSTGO_LANDING_REF_KEY = 'justgo.landing.ref';
export const JUSTGO_LANDING_EVENT_PATH = '/pivot/landing/event';
export const JUSTGO_LANDING_WAITLIST_PATH = '/pivot/landing/waitlist';

export const JUSTGO_LANDING_SOURCES = Object.freeze(['direct', 'share', 'qr']);

const VISITOR_ID_MAX_LENGTH = 64;

function storageGet(store, key) {
  try {
    return String(store.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function storageSet(store, key, value) {
  try {
    const next = String(value || '').trim();
    if (next) store.setItem(key, next);
  } catch {
    // ignore quota / private mode
  }
}

export function mintLandingVisitorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `jg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrMintLandingVisitorId() {
  const existing = storageGet(window.localStorage, JUSTGO_LANDING_VISITOR_KEY);
  if (existing && existing.length <= VISITOR_ID_MAX_LENGTH) return existing;
  const minted = mintLandingVisitorId().slice(0, VISITOR_ID_MAX_LENGTH);
  storageSet(window.localStorage, JUSTGO_LANDING_VISITOR_KEY, minted);
  return minted;
}

export function normalizeLandingSource(value) {
  const next = String(value || '').trim().toLowerCase();
  return JUSTGO_LANDING_SOURCES.includes(next) ? next : 'direct';
}

function readSearchParam(search, key) {
  if (!search) return '';
  if (typeof search.get === 'function') {
    return String(search.get(key) || '').trim();
  }
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  return String(params.get(key) || '').trim();
}

/** Write src/qr/ref from the current URL so later CTA clicks still attribute. */
export function persistLandingAttribution(search) {
  const src = readSearchParam(search, 'src');
  const qr = readSearchParam(search, 'qr');
  const ref = readSearchParam(search, 'ref').toLowerCase();
  if (src) {
    storageSet(window.sessionStorage, JUSTGO_LANDING_SRC_KEY, normalizeLandingSource(src));
  } else if (ref) {
    // Share URLs are `{origin}/{city}?ref={shareCode}` — source=share is implied.
    storageSet(window.sessionStorage, JUSTGO_LANDING_SRC_KEY, 'share');
  }
  if (qr) storageSet(window.sessionStorage, JUSTGO_LANDING_QR_KEY, qr);
  if (ref) storageSet(window.sessionStorage, JUSTGO_LANDING_REF_KEY, ref);
}

export function readLandingAttribution(search) {
  const srcQuery = readSearchParam(search, 'src');
  const qrQuery = readSearchParam(search, 'qr');
  const refQuery = readSearchParam(search, 'ref').toLowerCase();
  const refStored = storageGet(window.sessionStorage, JUSTGO_LANDING_REF_KEY).toLowerCase();
  const sourceFromQuery = srcQuery
    ? normalizeLandingSource(srcQuery)
    : refQuery
      ? 'share'
      : '';
  return {
    source: normalizeLandingSource(
      sourceFromQuery || storageGet(window.sessionStorage, JUSTGO_LANDING_SRC_KEY),
    ),
    qrName: qrQuery || storageGet(window.sessionStorage, JUSTGO_LANDING_QR_KEY) || null,
    refCode: refQuery || refStored || null,
  };
}

export function resolveLandingEventTenantKey(lockedTenantKey, { forView = false } = {}) {
  const fromUrl = landingTenantKeyFromParam(lockedTenantKey);
  if (fromUrl) return fromUrl;
  if (forView) return null;
  return landingTenantKeyFromParam(readStoredLandingCity()) || null;
}

function compactBody(body) {
  const out = {};
  Object.entries(body).forEach(([key, value]) => {
    if (value == null || value === '') return;
    out[key] = value;
  });
  return out;
}

function locationBits() {
  if (typeof window === 'undefined' || !window.location) {
    return { host: 'unknown', path: '/' };
  }
  return {
    host: window.location.host || 'unknown',
    path: window.location.pathname || '/',
  };
}

export function buildLandingEventBody({
  type,
  tenantKey,
  store,
  search,
  visitorId,
} = {}) {
  const attribution = readLandingAttribution(search ?? window.location?.search);
  const loc = locationBits();
  return compactBody({
    type,
    visitorId: visitorId || getOrMintLandingVisitorId(),
    tenantKey: tenantKey || null,
    source: attribution.source,
    qr: attribution.qrName,
    ref: attribution.refCode,
    host: loc.host,
    path: loc.path,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    store: type === 'store_click' ? store || 'ios' : null,
  });
}

function analyticsProps(body) {
  return compactBody({
    tenantKey: body.tenantKey,
    source: body.source,
    store: body.store,
  });
}

export function postLandingEvent(body) {
  return apiRequest(JUSTGO_LANDING_EVENT_PATH, body).catch(() => {});
}

export function recordLandingView({ tenantKey, search } = {}) {
  persistLandingAttribution(search ?? window.location?.search);
  const body = buildLandingEventBody({
    type: 'view',
    tenantKey: resolveLandingEventTenantKey(tenantKey, { forView: true }),
    search,
  });
  analytics.track('justgo_landing_view', analyticsProps(body));
  void postLandingEvent(body);
  return body;
}

export function recordLandingStoreClick({ tenantKey, store = 'ios', search } = {}) {
  persistLandingAttribution(search ?? window.location?.search);
  const body = buildLandingEventBody({
    type: 'store_click',
    tenantKey: resolveLandingEventTenantKey(tenantKey),
    store,
    search,
  });
  analytics.track('justgo_landing_store_click', analyticsProps(body));
  void postLandingEvent(body);
  return body;
}

/** Fire-and-forget. Never preventDefault — a failed POST must not eat the click. */
export function handleLandingStoreClick(event, { tenantKey, store = 'ios' } = {}) {
  recordLandingStoreClick({ tenantKey, store });
}

function waitlistAnalyticsProps(body) {
  return compactBody({
    tenantKey: body.tenantKey,
    source: body.source,
  });
}

export function buildWaitlistPayload({ phone, tenantKey, search } = {}) {
  const attribution = readLandingAttribution(search ?? window.location?.search);
  return compactBody({
    phone: String(phone || '').trim(),
    tenantKey: landingTenantKeyFromParam(tenantKey),
    visitorId: getOrMintLandingVisitorId(),
    source: attribution.source,
    qrName: attribution.qrName,
    ref: attribution.refCode,
  });
}

/**
 * Public waitlist signup. Mixpanel props never include phone.
 * Returns `{ data }` or `{ error, errorCode, status }`.
 */
export async function submitLandingWaitlist({ phone, tenantKey, search } = {}) {
  persistLandingAttribution(search ?? window.location?.search);
  const key = landingTenantKeyFromParam(tenantKey);
  if (!key) {
    return { error: true, errorCode: 'CITY_REQUIRED', status: 400 };
  }
  const payload = buildWaitlistPayload({ phone, tenantKey: key, search });
  if (!payload.phone) {
    return { error: true, errorCode: 'INVALID_PHONE', status: 400 };
  }

  analytics.track('justgo_landing_waitlist_submit', waitlistAnalyticsProps(payload));
  const res = await apiRequest(JUSTGO_LANDING_WAITLIST_PATH, payload);
  if (res?.error) {
    return {
      error: true,
      errorCode: res.errorCode || (res.code === 409 ? 'WAITLIST_DUPLICATE' : 'WAITLIST_ERROR'),
      status: typeof res.code === 'number' ? res.code : 400,
      message: res.error,
    };
  }
  return { data: res?.data || {} };
}
