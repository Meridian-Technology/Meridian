import {
  JUSTGO_LANDING_EVENT_PATH,
  JUSTGO_LANDING_QR_KEY,
  JUSTGO_LANDING_REF_KEY,
  JUSTGO_LANDING_SRC_KEY,
  JUSTGO_LANDING_VISITOR_KEY,
  JUSTGO_LANDING_WAITLIST_PATH,
  buildLandingEventBody,
  buildWaitlistPayload,
  getOrMintLandingVisitorId,
  handleLandingStoreClick,
  normalizeLandingSource,
  persistLandingAttribution,
  readLandingAttribution,
  recordLandingStoreClick,
  recordLandingView,
  resolveLandingEventTenantKey,
  submitLandingWaitlist,
} from './justGoLandingTracking';

const mockApi = jest.fn();
const mockTrack = jest.fn();

jest.mock('../../utils/postRequest', () => (...args) => mockApi(...args));
jest.mock('../../services/analytics/analytics', () => ({
  analytics: {
    screen: jest.fn(),
    track: (...args) => mockTrack(...args),
  },
}));

describe('justGoLandingTracking (Task 1.3)', () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockTrack.mockReset();
    mockApi.mockResolvedValue({ success: true });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe('visitor id', () => {
    it('mints justgo.landing.visitor and reuses it', () => {
      const first = getOrMintLandingVisitorId();
      const second = getOrMintLandingVisitorId();
      expect(first).toBeTruthy();
      expect(first.length).toBeLessThanOrEqual(64);
      expect(second).toBe(first);
      expect(window.localStorage.getItem(JUSTGO_LANDING_VISITOR_KEY)).toBe(first);
    });
  });

  describe('attribution', () => {
    it('normalizes src to qr, share, or direct', () => {
      expect(normalizeLandingSource('QR')).toBe('qr');
      expect(normalizeLandingSource('share')).toBe('share');
      expect(normalizeLandingSource('email')).toBe('direct');
      expect(normalizeLandingSource('')).toBe('direct');
    });

    it('persists src, qr, and ref in sessionStorage', () => {
      persistLandingAttribution('?src=share&qr=poster-night&ref=abc');
      expect(window.sessionStorage.getItem(JUSTGO_LANDING_SRC_KEY)).toBe('share');
      expect(window.sessionStorage.getItem(JUSTGO_LANDING_QR_KEY)).toBe('poster-night');
      expect(window.sessionStorage.getItem(JUSTGO_LANDING_REF_KEY)).toBe('abc');
    });

    it('implies source=share from ?ref= and stores justgo.landing.ref', () => {
      persistLandingAttribution('?ref=AbC123xyzz');
      expect(window.sessionStorage.getItem(JUSTGO_LANDING_REF_KEY)).toBe('abc123xyzz');
      expect(window.sessionStorage.getItem(JUSTGO_LANDING_SRC_KEY)).toBe('share');
      expect(readLandingAttribution('?ref=AbC123xyzz')).toEqual({
        source: 'share',
        qrName: null,
        refCode: 'abc123xyzz',
      });
    });

    it('keeps an explicit src=qr ahead of a ref on the same URL', () => {
      expect(readLandingAttribution('?src=qr&qr=poster-a&ref=abc')).toEqual({
        source: 'qr',
        qrName: 'poster-a',
        refCode: 'abc',
      });
    });

    it('reads persisted attribution when the URL no longer has query params', () => {
      persistLandingAttribution(new URLSearchParams('src=qr&qr=poster-a'));
      expect(readLandingAttribution('')).toEqual({
        source: 'qr',
        qrName: 'poster-a',
        refCode: null,
      });
    });
  });

  describe('recordLandingView', () => {
    it('posts a generic view without tenantKey', () => {
      const body = recordLandingView({ tenantKey: '', search: '' });

      expect(body.type).toBe('view');
      expect(body.tenantKey).toBeUndefined();
      expect(body.source).toBe('direct');
      expect(mockTrack).toHaveBeenCalledWith('justgo_landing_view', { source: 'direct' });
      expect(mockApi).toHaveBeenCalledWith(JUSTGO_LANDING_EVENT_PATH, body);
    });

    it('stamps tenantKey from the city URL', () => {
      const body = recordLandingView({
        tenantKey: 'Troy',
        search: '?src=qr&qr=poster-night',
      });

      expect(body).toEqual(
        expect.objectContaining({
          type: 'view',
          tenantKey: 'troy',
          source: 'qr',
          qr: 'poster-night',
        }),
      );
      expect(mockTrack).toHaveBeenCalledWith('justgo_landing_view', {
        tenantKey: 'troy',
        source: 'qr',
      });
    });
  });

  describe('recordLandingStoreClick', () => {
    it('posts store_click with store and Mixpanel props without a phone', () => {
      persistLandingAttribution('?src=share&ref=code-1');
      const body = recordLandingStoreClick({ tenantKey: 'nyc', store: 'ios' });

      expect(body).toEqual(
        expect.objectContaining({
          type: 'store_click',
          tenantKey: 'nyc',
          store: 'ios',
          source: 'share',
          ref: 'code-1',
        }),
      );
      expect(mockTrack).toHaveBeenCalledWith('justgo_landing_store_click', {
        tenantKey: 'nyc',
        source: 'share',
        store: 'ios',
      });
      const props = mockTrack.mock.calls[0][1];
      expect(props).not.toHaveProperty('phone');
      expect(mockApi).toHaveBeenCalledWith(JUSTGO_LANDING_EVENT_PATH, body);
    });

    it('does not block when the POST rejects', () => {
      mockApi.mockRejectedValue(new Error('offline'));
      expect(() =>
        recordLandingStoreClick({ tenantKey: 'nyc', store: 'ios' }),
      ).not.toThrow();
    });
  });

  describe('handleLandingStoreClick', () => {
    it('does not preventDefault', () => {
      const event = { preventDefault: jest.fn() };
      handleLandingStoreClick(event, { tenantKey: 'nyc', store: 'ios' });
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('resolveLandingEventTenantKey', () => {
    it('uses the URL city for views and stored city for later clicks', () => {
      expect(resolveLandingEventTenantKey('', { forView: true })).toBeNull();
      window.localStorage.setItem('justgo.landing.city', 'brooklyn');
      expect(resolveLandingEventTenantKey('', { forView: true })).toBeNull();
      expect(resolveLandingEventTenantKey('')).toBe('brooklyn');
      expect(resolveLandingEventTenantKey('troy')).toBe('troy');
    });
  });

  describe('buildLandingEventBody', () => {
    it('omits empty optional fields', () => {
      const body = buildLandingEventBody({ type: 'view', tenantKey: null });
      expect(body).not.toHaveProperty('tenantKey');
      expect(body).not.toHaveProperty('qr');
      expect(body).not.toHaveProperty('ref');
      expect(body).not.toHaveProperty('store');
    });
  });

  describe('submitLandingWaitlist', () => {
    it('does not post without a city', async () => {
      const result = await submitLandingWaitlist({ phone: '555-0100', tenantKey: '' });
      expect(result).toEqual({ error: true, errorCode: 'CITY_REQUIRED', status: 400 });
      expect(mockApi).not.toHaveBeenCalled();
      expect(mockTrack).not.toHaveBeenCalled();
    });

    it('posts waitlist and tracks Mixpanel without a phone', async () => {
      mockApi.mockResolvedValue({
        success: true,
        data: { shareUrl: 'https://justgo.lol/troy?ref=abc', friendsJoined: 0, tenantKey: 'troy' },
      });
      persistLandingAttribution('?src=share&ref=code-1');
      const result = await submitLandingWaitlist({ phone: '555-0100', tenantKey: 'Troy' });

      expect(result.data).toEqual(
        expect.objectContaining({ shareUrl: 'https://justgo.lol/troy?ref=abc', tenantKey: 'troy' }),
      );
      expect(mockTrack).toHaveBeenCalledWith('justgo_landing_waitlist_submit', {
        tenantKey: 'troy',
        source: 'share',
        store: 'ios',
      });
      const props = mockTrack.mock.calls[0][1];
      expect(props).not.toHaveProperty('phone');
      expect(mockApi).toHaveBeenCalledWith(
        JUSTGO_LANDING_WAITLIST_PATH,
        expect.objectContaining({
          phone: '555-0100',
          tenantKey: 'troy',
          source: 'share',
          ref: 'code-1',
          visitorId: expect.any(String),
          store: 'ios',
        }),
      );
    });

    it('maps a duplicate as WAITLIST_DUPLICATE', async () => {
      mockApi.mockResolvedValue({
        error: 'already on the list',
        code: 409,
        errorCode: 'WAITLIST_DUPLICATE',
      });
      const result = await submitLandingWaitlist({ phone: '555-0100', tenantKey: 'troy' });
      expect(result).toEqual(
        expect.objectContaining({
          error: true,
          errorCode: 'WAITLIST_DUPLICATE',
          status: 409,
        }),
      );
    });
  });

  describe('buildWaitlistPayload', () => {
    it('includes attribution and never invents a city', () => {
      persistLandingAttribution('?src=qr&qr=poster-night');
      expect(buildWaitlistPayload({ phone: '555-0100', tenantKey: 'troy' })).toEqual(
        expect.objectContaining({
          phone: '555-0100',
          tenantKey: 'troy',
          source: 'qr',
          qrName: 'poster-night',
        }),
      );
    });

    it('sends ref from a share URL as source=share', () => {
      persistLandingAttribution('?ref=FriendCode1');
      expect(buildWaitlistPayload({ phone: '555-0100', tenantKey: 'troy' })).toEqual(
        expect.objectContaining({
          phone: '555-0100',
          tenantKey: 'troy',
          source: 'share',
          ref: 'friendcode1',
          store: 'ios',
        }),
      );
    });

    it('stamps android from the user agent', () => {
      const original = window.navigator.userAgent;
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (Linux; Android 14)',
      });
      expect(buildWaitlistPayload({ phone: '555-0100', tenantKey: 'troy' }).store).toBe('android');
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: original,
      });
    });
  });
});
