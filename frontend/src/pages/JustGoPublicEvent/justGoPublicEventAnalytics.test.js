import { analytics } from '../../services/analytics/analytics';
import {
  PUBLIC_EVENT_ANALYTICS_EVENTS,
  publicEventAnalyticsProperties,
  publicEventShareSource,
  trackPublicEventAppOpenAttempt,
  trackPublicEventStoreClick,
  trackPublicEventView,
} from './justGoPublicEventAnalytics';

jest.mock('../../services/analytics/analytics', () => ({ analytics: { track: jest.fn() } }));

const BASE = { eventId: 'event-123', platform: 'ios', search: '?src=share' };

describe('justGoPublicEventAnalytics', () => {
  beforeEach(() => analytics.track.mockReset());

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
});
