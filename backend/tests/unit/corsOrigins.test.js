const {
  isAllowedCorsOrigin,
  isJustGoPublicHost,
  STATIC_PRODUCTION_ORIGINS,
} = require('../../utilities/corsOrigins');

const PROD = { nodeEnv: 'production', baseDomain: 'meridian.study' };

describe('isAllowedCorsOrigin', () => {
  it('allows justgo.lol and www.justgo.lol in production', () => {
    expect(isAllowedCorsOrigin('https://justgo.lol', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://www.justgo.lol', PROD)).toBe(true);
  });

  it('keeps campus and pinkpulse origins allowed', () => {
    expect(isAllowedCorsOrigin('https://www.meridian.study', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://meridian.study', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://rpi.meridian.study', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://tvcog.meridian.study', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://www.pinkpulse.org', PROD)).toBe(true);
    expect(isAllowedCorsOrigin('https://rpi.pinkpulse.org', PROD)).toBe(true);
  });

  it('allows other tenant subdomains of BASE_DOMAIN', () => {
    expect(isAllowedCorsOrigin('https://brooklyn.meridian.study', PROD)).toBe(true);
  });

  it('rejects unknown and non-https justgo origins', () => {
    expect(isAllowedCorsOrigin('https://evil.example', PROD)).toBe(false);
    expect(isAllowedCorsOrigin('http://justgo.lol', PROD)).toBe(false);
  });

  it('allows missing Origin (non-browser or same-origin tools)', () => {
    expect(isAllowedCorsOrigin('', PROD)).toBe(true);
    expect(isAllowedCorsOrigin(null, PROD)).toBe(true);
  });

  it('in development only allows localhost', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', { nodeEnv: 'development' })).toBe(true);
    expect(isAllowedCorsOrigin('https://justgo.lol', { nodeEnv: 'development' })).toBe(false);
    expect(isAllowedCorsOrigin('https://www.meridian.study', { nodeEnv: 'development' })).toBe(false);
  });

  it('lists justgo hosts next to campus static origins', () => {
    expect(STATIC_PRODUCTION_ORIGINS).toEqual(
      expect.arrayContaining([
        'https://www.meridian.study',
        'https://justgo.lol',
        'https://www.justgo.lol',
      ]),
    );
  });
});

describe('isJustGoPublicHost', () => {
  it('matches apex and www, including a port', () => {
    expect(isJustGoPublicHost('justgo.lol')).toBe(true);
    expect(isJustGoPublicHost('www.justgo.lol')).toBe(true);
    expect(isJustGoPublicHost('justgo.lol:443')).toBe(true);
  });

  it('does not treat campus hosts as Just Go', () => {
    expect(isJustGoPublicHost('www.meridian.study')).toBe(false);
    expect(isJustGoPublicHost('rpi.meridian.study')).toBe(false);
  });
});
