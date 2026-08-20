import {
  cityChipLabel,
  decorateFlyers,
  detectStorePlatform,
  formatIsoWeekToken,
  formatLandingDropSpoken,
  formatLandingWhen,
  padDropUnit,
  pickLandingCity,
  isWaitlistLandingMode,
  landingPosterStack,
  landingSwipeRotate,
  landingSwipeTint,
  landingTenantKeyFromParam,
  resolveDeckSwipeAxis,
  resolveNextLandingDropAt,
  scopeLandingCities,
  shouldHideCampusBanner,
  splitLandingDropCountdown,
} from './justGoLandingUtils';

describe('resolveDeckSwipeAxis', () => {
  it('stays undecided until the finger travels far enough', () => {
    expect(resolveDeckSwipeAxis(4, 2)).toBeNull();
    expect(resolveDeckSwipeAxis(0, 0)).toBeNull();
  });

  it('locks to x only when the swipe is clearly horizontal', () => {
    expect(resolveDeckSwipeAxis(24, 6)).toBe('x');
    expect(resolveDeckSwipeAxis(-30, 10)).toBe('x');
  });

  it('prefers vertical scroll on vertical and diagonal moves', () => {
    expect(resolveDeckSwipeAxis(6, 24)).toBe('y');
    expect(resolveDeckSwipeAxis(20, 20)).toBe('y');
  });
});

describe('landingPosterStack', () => {
  it('keeps the focused card straight', () => {
    expect(landingPosterStack(0, 2)).toEqual({ rotateDeg: 0, scale: 1 });
  });

  it('tilts peek cards around center like the app stack', () => {
    expect(landingPosterStack(1, 0)).toEqual({ rotateDeg: 2.6, scale: 0.992 });
    expect(landingPosterStack(1, 1)).toEqual({ rotateDeg: -2.6, scale: 0.992 });
    expect(landingPosterStack(2, 0).scale).toBe(0.984);
  });
});

describe('landingSwipeRotate', () => {
  it('caps at nine degrees a third of the way across the screen', () => {
    expect(landingSwipeRotate(125, 375)).toBeCloseTo(9);
    expect(landingSwipeRotate(-125, 375)).toBeCloseTo(-9);
    expect(landingSwipeRotate(0, 375)).toBe(0);
  });
});

describe('landingSwipeTint', () => {
  it('fills the overlay across a sixth of the screen', () => {
    expect(landingSwipeTint(60, 375)).toBeCloseTo(1);
    expect(landingSwipeTint(0, 375)).toBe(0);
  });
});

describe('formatIsoWeekToken', () => {
  it('returns the ISO week token the drop uses', () => {
    expect(formatIsoWeekToken(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(formatIsoWeekToken(new Date(2026, 7, 16))).toBe('2026-W33');
  });
});

describe('detectStorePlatform', () => {
  it('sends android user agents to play', () => {
    expect(detectStorePlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
  });

  it('defaults everyone else to the app store', () => {
    expect(detectStorePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('ios');
    expect(detectStorePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('ios');
  });
});

describe('decorateFlyers', () => {
  const flyers = [{ id: 'a', title: 'night market' }, { id: 'b', title: 'warehouse show' }];

  it('stamps city names onto flyers without inventing a live catalog', () => {
    const decorated = decorateFlyers(flyers, [
      { cityDisplayName: 'Brooklyn' },
      { cityDisplayName: 'Troy' },
    ]);
    expect(decorated[0].city).toBe('Brooklyn');
    expect(decorated[1].city).toBe('Troy');
  });

  it('leaves city empty when the public list is down', () => {
    expect(decorateFlyers(flyers, [])[0].city).toBeNull();
  });
});

describe('cityChipLabel', () => {
  it('lowercases the public city name', () => {
    expect(cityChipLabel({ cityDisplayName: 'New York City' })).toBe('new york city');
  });
});

describe('landingTenantKeyFromParam', () => {
  it('normalizes a city slug and ignores creator', () => {
    expect(landingTenantKeyFromParam(' Troy ')).toBe('troy');
    expect(landingTenantKeyFromParam('creator')).toBe('');
    expect(landingTenantKeyFromParam('')).toBe('');
  });

  it('ignores reserved apex slugs so they are not treated as cities', () => {
    expect(landingTenantKeyFromParam('qr')).toBe('');
    expect(landingTenantKeyFromParam('invite')).toBe('');
    expect(landingTenantKeyFromParam('justgo')).toBe('');
    expect(landingTenantKeyFromParam('platform-admin')).toBe('');
  });
});

describe('shouldHideCampusBanner', () => {
  it('hides campus chrome on /justgo and /invite on any host', () => {
    expect(shouldHideCampusBanner('/justgo', false)).toBe(true);
    expect(shouldHideCampusBanner('/justgo/troy', false)).toBe(true);
    expect(shouldHideCampusBanner('/invite', false)).toBe(true);
    expect(shouldHideCampusBanner('/', false)).toBe(false);
    expect(shouldHideCampusBanner('/privacy-policy', false)).toBe(false);
  });

  it('hides the banner on Just Go landing, city, qr, and legal pages', () => {
    expect(shouldHideCampusBanner('/', true)).toBe(true);
    expect(shouldHideCampusBanner('/troy', true)).toBe(true);
    expect(shouldHideCampusBanner('/qr/poster-night', true)).toBe(true);
    expect(shouldHideCampusBanner('/privacy-policy', true)).toBe(true);
    expect(shouldHideCampusBanner('/terms-of-service', true)).toBe(true);
  });
});

describe('scopeLandingCities', () => {
  const cities = [
    { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn' },
    { tenantKey: 'troy', cityDisplayName: 'Troy' },
  ];

  it('keeps every city on the general landing', () => {
    expect(scopeLandingCities(cities, '')).toEqual(cities);
  });

  it('keeps only the locked tenant', () => {
    expect(scopeLandingCities(cities, 'TROY')).toEqual([cities[1]]);
  });

  it('returns none when that city is not live', () => {
    expect(scopeLandingCities(cities, 'paris')).toEqual([]);
  });
});

describe('pickLandingCity', () => {
  const cities = [
    { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn' },
    { tenantKey: 'troy', cityDisplayName: 'Troy' },
  ];

  it('restores the stored city when it is still live', () => {
    expect(pickLandingCity(cities, 'troy').tenantKey).toBe('troy');
  });

  it('falls back to the first city', () => {
    expect(pickLandingCity(cities, 'missing').tenantKey).toBe('brooklyn');
    expect(pickLandingCity([], 'troy')).toBeNull();
  });
});

describe('isWaitlistLandingMode', () => {
  it('treats a missing city as not waitlist so the form does not flash', () => {
    expect(isWaitlistLandingMode(null)).toBe(false);
    expect(isWaitlistLandingMode(undefined)).toBe(false);
  });

  it('defaults missing landingMode to waitlist and only launched is store CTAs', () => {
    expect(isWaitlistLandingMode({ tenantKey: 'troy' })).toBe(true);
    expect(isWaitlistLandingMode({ tenantKey: 'troy', landingMode: 'waitlist' })).toBe(true);
    expect(isWaitlistLandingMode({ tenantKey: 'brooklyn', landingMode: 'launched' })).toBe(false);
  });
});

describe('formatLandingWhen', () => {
  it('formats a compact weekday and clock', () => {
    const localFriday = new Date(2026, 7, 14, 19, 0, 0);
    expect(formatLandingWhen(localFriday)).toBe('fri · 7pm');
  });
});

describe('resolveNextLandingDropAt', () => {
  it('counts down to this week’s Thursday 6pm ET before the drop', () => {
    expect(resolveNextLandingDropAt(new Date('2026-08-12T16:00:00.000Z')).toISOString()).toBe(
      '2026-08-13T22:00:00.000Z',
    );
    expect(resolveNextLandingDropAt(new Date('2026-08-13T21:59:00.000Z')).toISOString()).toBe(
      '2026-08-13T22:00:00.000Z',
    );
  });

  it('rolls to next Thursday once this week’s drop has fired', () => {
    expect(resolveNextLandingDropAt(new Date('2026-08-13T22:00:00.000Z')).toISOString()).toBe(
      '2026-08-20T22:00:00.000Z',
    );
  });

  it('keeps 6pm local across the fall DST change', () => {
    expect(resolveNextLandingDropAt(new Date('2026-11-04T16:00:00.000Z')).toISOString()).toBe(
      '2026-11-05T23:00:00.000Z',
    );
  });
});

describe('splitLandingDropCountdown', () => {
  it('splits remaining time into scoreboard units', () => {
    expect(splitLandingDropCountdown(2 * 86400000 + 14 * 3600000 + 8 * 60000 + 32000)).toEqual({
      days: 2,
      hours: 14,
      minutes: 8,
      seconds: 32,
      live: false,
      soon: false,
      imminent: false,
    });
  });

  it('marks the last day and last hour', () => {
    expect(splitLandingDropCountdown(23 * 3600000).soon).toBe(true);
    expect(splitLandingDropCountdown(59 * 60000).imminent).toBe(true);
    expect(splitLandingDropCountdown(0).live).toBe(true);
  });
});

describe('formatLandingDropSpoken', () => {
  it('speaks the remaining time without ticking seconds', () => {
    expect(
      formatLandingDropSpoken({ days: 2, hours: 14, minutes: 8, seconds: 32, live: false }),
    ).toBe('next drop in 2 days 14 hours');
    expect(
      formatLandingDropSpoken({ days: 0, hours: 0, minutes: 3, seconds: 12, live: false }),
    ).toBe('next drop in 3 minutes');
    expect(formatLandingDropSpoken({ live: true })).toBe('the drop is live');
  });
});

describe('padDropUnit', () => {
  it('keeps the scoreboard two digits wide', () => {
    expect(padDropUnit(4)).toBe('04');
    expect(padDropUnit(14)).toBe('14');
  });
});
