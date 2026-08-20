import {
  IOWA_TENANT_KEY,
  IOWA_SUMMER_UTC_OFFSET_MINUTES,
  SF_TENANT_KEY,
  applyPosterTzHop,
  isIowaPosterTimeZone,
  isSfPosterQr,
  resolvePosterTzHopTenant,
} from './justGoPosterTzHop';

describe('justGoPosterTzHop', () => {
  it('treats sf tenant and sf-* names as SF posters', () => {
    expect(isSfPosterQr({ tenantKey: 'sf', name: 'poster-a' })).toBe(true);
    expect(isSfPosterQr({ tenantKey: 'iowacity', name: 'sf-1' })).toBe(false);
    expect(isSfPosterQr({ name: 'sf-1' })).toBe(true);
    expect(isSfPosterQr({ tenantKey: 'nyc', name: 'poster-a' })).toBe(false);
  });

  it('recognizes Iowa from IANA Central, not Pacific', () => {
    expect(isIowaPosterTimeZone('America/Chicago')).toBe(true);
    expect(isIowaPosterTimeZone('America/Los_Angeles', IOWA_SUMMER_UTC_OFFSET_MINUTES)).toBe(false);
    expect(isIowaPosterTimeZone('', IOWA_SUMMER_UTC_OFFSET_MINUTES)).toBe(true);
  });

  it('hops SF poster QRs in Central time to iowacity', () => {
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

  it('rewrites sf-1 to iowa-1 and does not double-map an already Iowa payload', () => {
    expect(
      applyPosterTzHop(
        { name: 'iowa-1', tenantKey: IOWA_TENANT_KEY, path: `/${IOWA_TENANT_KEY}` },
        { timeZone: 'America/Chicago' },
      ),
    ).toEqual({
      name: 'iowa-1',
      tenantKey: IOWA_TENANT_KEY,
      path: `/${IOWA_TENANT_KEY}`,
    });
  });

  it('stamps posterTzHop and rewrites the QR name to the Iowa sibling', () => {
    expect(
      applyPosterTzHop(
        { name: 'sf-1', tenantKey: 'sf', path: '/sf' },
        { timeZone: 'America/Chicago' },
      ),
    ).toEqual({
      name: 'iowa-1',
      tenantKey: IOWA_TENANT_KEY,
      path: `/${IOWA_TENANT_KEY}`,
      posterTzHop: true,
    });
  });
});
