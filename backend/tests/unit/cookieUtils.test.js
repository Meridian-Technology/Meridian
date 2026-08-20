const { getCookieDomain } = require('../../utilities/cookieUtils');

describe('getCookieDomain', () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it('is unset outside production so localhost cookies stay host-only', () => {
    process.env.NODE_ENV = 'test';
    expect(getCookieDomain({ hostname: 'justgo.lol' })).toBeUndefined();
    expect(getCookieDomain({ hostname: 'www.meridian.study' })).toBeUndefined();
  });

  it('scopes production cookies to the request registrable domain', () => {
    process.env.NODE_ENV = 'production';
    expect(getCookieDomain({ hostname: 'www.meridian.study' })).toBe('.meridian.study');
    expect(getCookieDomain({ hostname: 'rpi.meridian.study' })).toBe('.meridian.study');
    expect(getCookieDomain({ hostname: 'justgo.lol' })).toBe('.justgo.lol');
    expect(getCookieDomain({ hostname: 'www.justgo.lol' })).toBe('.justgo.lol');
  });
});
