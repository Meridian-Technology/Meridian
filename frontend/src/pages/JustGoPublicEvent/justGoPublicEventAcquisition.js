import {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
} from '../JustGoLanding/justGoLandingCopy';

export function detectPublicEventPlatform(navigatorLike) {
  const userAgent = String(navigatorLike?.userAgent || '');
  const platform = String(navigatorLike?.platform || '');
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);

  if (/android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Mac/i.test(platform) && touchPoints > 1) return 'ios';
  if (/Windows|Macintosh|CrOS|Linux/i.test(`${userAgent} ${platform}`)) return 'desktop';
  return 'unknown';
}

export function publicEventStoreChoices(platform, copy) {
  const stores = {
    ios: { id: 'ios', label: copy.appStore, url: JUSTGO_IOS_STORE_URL },
    android: { id: 'android', label: copy.googlePlay, url: JUSTGO_PLAY_STORE_URL },
  };
  if (platform === 'ios') return [stores.ios];
  if (platform === 'android') return [stores.android];
  return [stores.ios, stores.android];
}
