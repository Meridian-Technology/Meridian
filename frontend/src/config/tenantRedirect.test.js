import {
  JUSTGO_HOST_OVERRIDE_KEY,
  getCurrentTenantKey,
  isJustGoHost,
  isJustGoWwwHost,
  isPathAllowedOnJustGoHost,
  isPathAllowedOnWww,
  isWww,
  justGoApexUrl,
  tenantKeyFromHostname,
} from './tenantRedirect';

describe('isJustGoHost', () => {
  afterEach(() => {
    window.localStorage.removeItem(JUSTGO_HOST_OVERRIDE_KEY);
  });

  it('is true for justgo.lol and www.justgo.lol', () => {
    expect(isJustGoHost('justgo.lol')).toBe(true);
    expect(isJustGoHost('www.justgo.lol')).toBe(true);
    expect(isJustGoHost('JUSTGO.LOL')).toBe(true);
  });

  it('is false for campus meridian and school subdomains', () => {
    expect(isJustGoHost('meridian.study')).toBe(false);
    expect(isJustGoHost('www.meridian.study')).toBe(false);
    expect(isJustGoHost('rpi.meridian.study')).toBe(false);
  });

  it('lets localhost opt into Just Go apex without changing campus npm start', () => {
    expect(isJustGoHost('localhost')).toBe(false);
    window.localStorage.setItem(JUSTGO_HOST_OVERRIDE_KEY, '1');
    expect(isJustGoHost('localhost')).toBe(true);
    expect(isJustGoHost('meridian.study')).toBe(false);
  });
});

describe('justGo www → apex', () => {
  it('treats only www.justgo.lol as the www host', () => {
    expect(isJustGoWwwHost('www.justgo.lol')).toBe(true);
    expect(isJustGoWwwHost('justgo.lol')).toBe(false);
    expect(isJustGoWwwHost('www.meridian.study')).toBe(false);
  });

  it('builds apex URLs for the canonical public origin', () => {
    expect(justGoApexUrl('/troy?ref=abc')).toBe('https://justgo.lol/troy?ref=abc');
    expect(justGoApexUrl('/')).toBe('https://justgo.lol/');
  });
});

describe('isWww', () => {
  it('keeps campus marketing-host behavior', () => {
    expect(isWww('meridian.study')).toBe(true);
    expect(isWww('www.meridian.study')).toBe(true);
    expect(isWww('www.pinkpulse.org')).toBe(true);
    expect(isWww('rpi.meridian.study')).toBe(false);
    expect(isWww('localhost')).toBe(true);
  });

  it('does not treat Just Go public hosts as campus www', () => {
    expect(isWww('justgo.lol')).toBe(false);
    expect(isWww('www.justgo.lol')).toBe(false);
  });
});

describe('getCurrentTenantKey / tenantKeyFromHostname', () => {
  afterEach(() => {
    window.localStorage.removeItem(JUSTGO_HOST_OVERRIDE_KEY);
    window.localStorage.removeItem('devTenantOverride');
    window.localStorage.removeItem('lastTenant');
  });

  it('does not treat justgo or www as school tenant keys', () => {
    expect(tenantKeyFromHostname('justgo.lol')).toBeNull();
    expect(tenantKeyFromHostname('www.justgo.lol')).toBeNull();
    expect(tenantKeyFromHostname('justgo.meridian.study')).toBeNull();
    expect(tenantKeyFromHostname('www.meridian.study')).toBeNull();
    expect(getCurrentTenantKey('justgo.lol')).toBeNull();
  });

  it('still reads campus school subdomains', () => {
    expect(tenantKeyFromHostname('rpi.meridian.study')).toBe('rpi');
    expect(getCurrentTenantKey('rpi.meridian.study')).toBe('rpi');
  });

  it('ignores campus tenant override when localhost is Just Go apex', () => {
    window.localStorage.setItem('devTenantOverride', 'rpi');
    expect(getCurrentTenantKey('localhost')).toBe('rpi');
    window.localStorage.setItem(JUSTGO_HOST_OVERRIDE_KEY, '1');
    expect(getCurrentTenantKey('localhost')).toBeNull();
  });
});

describe('isPathAllowedOnJustGoHost', () => {
  it('allows the generic landing, city slugs, and reserved prefixes', () => {
    expect(isPathAllowedOnJustGoHost('/')).toBe(true);
    expect(isPathAllowedOnJustGoHost('/troy')).toBe(true);
    expect(isPathAllowedOnJustGoHost('/qr/poster-night')).toBe(true);
    expect(isPathAllowedOnJustGoHost('/justgo/creator/login')).toBe(true);
    expect(isPathAllowedOnJustGoHost('/privacy-policy')).toBe(true);
  });

  it('does not open campus www to city slugs', () => {
    expect(isPathAllowedOnWww('/troy')).toBe(false);
    expect(isPathAllowedOnWww('/justgo')).toBe(true);
    expect(isPathAllowedOnWww('/justgo/troy')).toBe(true);
  });
});
