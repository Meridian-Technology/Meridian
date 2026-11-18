import { analytics } from '../../services/analytics/analytics';
import {
  PUBLIC_EVENT_ANALYTICS_EVENTS,
  publicEventAnalyticsProperties,
  publicEventShareSource,
  trackPublicEventAppOpenAttempt,
  trackPublicEventStoreClick,
  recordPublicListingView,
  trackPublicEventView,
} from './justGoPublicEventAnalytics';

jest.mock('../../services/analytics/analytics', () => ({
  analytics: { track: jest.fn(), getAnonymousId: jest.fn() },
}));

const BASE = { eventId: 'event-123', platform: 'ios', search: '?src=share' };

describe('justGoPublicEventAnalytics', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    analytics.track.mockReset();
    analytics.getAnonymousId.mockReset();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('preserves only the stable share source', () => {
    expect(publicEventShareSource('?src=share&utm_source=private')).toBe('share');
    expect(publicEventShareSource('?src=email')).toBe('direct');
  });

  it('allowlists properties and normalizes untrusted values', () => {
    expect(publicEventAnalyticsProperties({
      ...BASE, platform: 'bot', store: 'other', userId: 'secret', attendeeEmail: 'private@example.com',
    })).toEqual({ event_id: 'event-123', source: 'share', platform: 'unknown' });
  });

  it('uses centrally defined names for views and app-open attempts', () => {
    trackPublicEventView(BASE);
    trackPublicEventAppOpenAttempt(BASE);
    expect(analytics.track).toHaveBeenNthCalledWith(1, PUBLIC_EVENT_ANALYTICS_EVENTS.view, {
      event_id: 'event-123', source: 'share', platform: 'ios',
    });
    expect(analytics.track).toHaveBeenNthCalledWith(2, PUBLIC_EVENT_ANALYTICS_EVENTS.appOpenAttempt, {
      event_id: 'event-123', source: 'share', platform: 'ios',
    });
  });

  it('distinguishes App Store and Google Play clicks', () => {
    trackPublicEventStoreClick({ ...BASE, store: 'ios' });
    trackPublicEventStoreClick({ ...BASE, platform: 'android', store: 'android' });
    expect(analytics.track).toHaveBeenNthCalledWith(1, PUBLIC_EVENT_ANALYTICS_EVENTS.appStoreClick, {
      event_id: 'event-123', source: 'share', platform: 'ios', store: 'ios',
    });
    expect(analytics.track).toHaveBeenNthCalledWith(2, PUBLIC_EVENT_ANALYTICS_EVENTS.googlePlayClick, {
      event_id: 'event-123', source: 'share', platform: 'android', store: 'android',
    });
  });

  it('records the listing view on the server with the analytics visitor id', () => {
    analytics.getAnonymousId.mockReturnValue('visitor-1234-abcd');
    trackPublicEventView(BASE);

    expect(global.fetch).toHaveBeenCalledWith('/api/public/events/event-123/view', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'visitor-1234-abcd' }),
    });
  });

  it('records the view without a visitor id when analytics has none', () => {
    recordPublicListingView('event-123');

    expect(global.fetch.mock.calls[0][1].body).toBe('{}');
  });

  it('never throws when the view request fails', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));

    expect(() => recordPublicListingView('event-123')).not.toThrow();
    await Promise.resolve();
  });

  it('skips the request without an event id', () => {
    recordPublicListingView('');

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
