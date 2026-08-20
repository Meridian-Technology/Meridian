const {
  IOWA_TENANT_KEY,
  IOWA_SUMMER_UTC_OFFSET_MINUTES,
  SF_TENANT_KEY,
  iowaSiblingQrName,
  isIowaPosterTimeZone,
  isSfPosterQr,
  resolvePosterTzHop,
  resolvePosterTzHopTenant,
} = require('../../utilities/justGoPosterTzHop');

describe('justGoPosterTzHop', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JUSTGO_POSTER_TZ_HOP;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('treats sf tenant and sf-* names as SF posters', () => {
    expect(isSfPosterQr({ tenantKey: 'sf', name: 'poster-a' })).toBe(true);
    expect(isSfPosterQr({ tenantKey: 'SF', name: 'sf-1' })).toBe(true);
    expect(isSfPosterQr({ tenantKey: 'iowacity', name: 'sf-1' })).toBe(false);
    expect(isSfPosterQr({ name: 'sf-1' })).toBe(true);
    expect(isSfPosterQr({ tenantKey: 'nyc', name: 'poster-a' })).toBe(false);
  });

  it('recognizes Iowa from IANA Central, not from Pacific or offset-when-IANA-present', () => {
    expect(isIowaPosterTimeZone('America/Chicago')).toBe(true);
    expect(isIowaPosterTimeZone('US/Central')).toBe(true);
    expect(isIowaPosterTimeZone('America/Los_Angeles', IOWA_SUMMER_UTC_OFFSET_MINUTES)).toBe(false);
    expect(isIowaPosterTimeZone('America/New_York')).toBe(false);
    expect(isIowaPosterTimeZone('', IOWA_SUMMER_UTC_OFFSET_MINUTES)).toBe(true);
    expect(isIowaPosterTimeZone('', 420)).toBe(false);
  });

  it('hops SF poster QRs in Central time to iowacity and leaves Pacific on sf', () => {
    expect(
      resolvePosterTzHopTenant({
        tenantKey: SF_TENANT_KEY,
        name: 'sf-1',
        timeZone: 'America/Chicago',
      }),
    ).toBe(IOWA_TENANT_KEY);

    expect(
      resolvePosterTzHopTenant({
        tenantKey: SF_TENANT_KEY,
        name: 'sf-1',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe(SF_TENANT_KEY);
  });

  it('does not remap other cities scanned from Iowa', () => {
    expect(
      resolvePosterTzHopTenant({
        tenantKey: 'nyc',
        name: 'poster-a',
        timeZone: 'America/Chicago',
      }),
    ).toBe('nyc');
  });

  it('falls back to JS timezoneOffset only when IANA is missing', () => {
    expect(
      resolvePosterTzHopTenant({
        tenantKey: 'sf',
        name: 'sf-2',
        utcOffsetMinutes: IOWA_SUMMER_UTC_OFFSET_MINUTES,
      }),
    ).toBe(IOWA_TENANT_KEY);
  });

  it('can be disabled with JUSTGO_POSTER_TZ_HOP=0', () => {
    process.env.JUSTGO_POSTER_TZ_HOP = '0';
    expect(
      resolvePosterTzHopTenant({
        tenantKey: 'sf',
        name: 'sf-1',
        timeZone: 'America/Chicago',
      }),
    ).toBe('sf');
  });

  it('maps printed SF QR names onto Iowa sibling slugs', () => {
    expect(iowaSiblingQrName('sf-1')).toBe('iowa-1');
    expect(iowaSiblingQrName('sf-12')).toBe('iowa-12');
    expect(iowaSiblingQrName('sf')).toBe('iowa');
    expect(
      resolvePosterTzHop({
        tenantKey: SF_TENANT_KEY,
        name: 'sf-1',
        timeZone: 'America/Chicago',
      }),
    ).toEqual({ tenantKey: IOWA_TENANT_KEY, name: 'iowa-1', remapped: true });
    expect(
      resolvePosterTzHop({
        tenantKey: SF_TENANT_KEY,
        name: 'sf-1',
        timeZone: 'America/Los_Angeles',
      }),
    ).toEqual({ tenantKey: SF_TENANT_KEY, name: 'sf-1', remapped: false });
  });
});
