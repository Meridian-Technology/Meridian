import {
  cityChipLabel,
  decorateFlyers,
  detectStorePlatform,
  formatIsoWeekToken,
  formatLandingWhen,
  pickLandingCity,
} from './justGoLandingUtils';

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

describe('formatLandingWhen', () => {
  it('formats a compact weekday and clock', () => {
    const localFriday = new Date(2026, 7, 14, 19, 0, 0);
    expect(formatLandingWhen(localFriday)).toBe('fri · 7pm');
  });
});
