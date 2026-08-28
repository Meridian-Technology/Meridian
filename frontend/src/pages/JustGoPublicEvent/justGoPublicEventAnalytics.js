import { analytics } from '../../services/analytics/analytics';

export const PUBLIC_EVENT_ANALYTICS_EVENTS = Object.freeze({
  view: 'justgo_public_event_view',
  appOpenAttempt: 'justgo_public_event_app_open_attempt',
  appStoreClick: 'justgo_public_event_app_store_click',
  googlePlayClick: 'justgo_public_event_google_play_click',
});

const ALLOWED_PLATFORMS = new Set(['ios', 'android', 'desktop', 'unknown']);

export function publicEventShareSource(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return params.get('src') === 'share' ? 'share' : 'direct';
}

export function publicEventAnalyticsProperties({ eventId, platform, search, store } = {}) {
  const properties = {
    event_id: String(eventId || ''),
    source: publicEventShareSource(search),
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : 'unknown',
  };
  if (store === 'ios' || store === 'android') properties.store = store;
  return properties;
}

function track(name, options) {
  analytics.track(name, publicEventAnalyticsProperties(options));
}

export function trackPublicEventView(options) {
  track(PUBLIC_EVENT_ANALYTICS_EVENTS.view, options);
}

export function trackPublicEventAppOpenAttempt(options) {
  track(PUBLIC_EVENT_ANALYTICS_EVENTS.appOpenAttempt, options);
}

export function trackPublicEventStoreClick(options) {
  const name = options?.store === 'android'
    ? PUBLIC_EVENT_ANALYTICS_EVENTS.googlePlayClick
    : PUBLIC_EVENT_ANALYTICS_EVENTS.appStoreClick;
  track(name, options);
}
