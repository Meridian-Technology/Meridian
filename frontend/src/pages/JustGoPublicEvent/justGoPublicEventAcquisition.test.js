import {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
} from '../JustGoLanding/justGoLandingCopy';
import {
  detectPublicEventPlatform,
  publicEventStoreChoices,
} from './justGoPublicEventAcquisition';

const copy = { appStore: 'App Store configured', googlePlay: 'Google Play configured' };

describe('public event acquisition', () => {
  it.each([
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel' }, 'desktop'],
    [{ userAgent: '', platform: '' }, 'unknown'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
  ])('detects platform without feature-sniffing timers', (navigatorLike, expected) => {
    expect(detectPublicEventPlatform(navigatorLike)).toBe(expected);
  });

  it('returns only the configured iOS store on iOS', () => {
    expect(publicEventStoreChoices('ios', copy)).toEqual([
      { id: 'ios', label: copy.appStore, url: JUSTGO_IOS_STORE_URL },
    ]);
  });

  it('returns only the configured Play store on Android', () => {
    expect(publicEventStoreChoices('android', copy)).toEqual([
      { id: 'android', label: copy.googlePlay, url: JUSTGO_PLAY_STORE_URL },
    ]);
  });

  it.each(['desktop', 'unknown'])('returns both configured stores on %s', (platform) => {
    expect(publicEventStoreChoices(platform, copy).map(({ id }) => id)).toEqual([
      'ios',
      'android',
    ]);
  });
});
