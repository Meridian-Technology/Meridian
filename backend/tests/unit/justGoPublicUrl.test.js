const {
  JUSTGO_PUBLIC_ORIGIN,
  justGoPublicOrigin,
  justGoPublicUrl,
  justGoWaitlistShareUrl,
  justGoLandingQrUrl,
  justGoLandingQrHopUrl,
} = require('../../utilities/justGoPublicUrl');

describe('justGoPublicUrl (backend)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JUSTGO_PUBLIC_ORIGIN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses https://justgo.lol in production', () => {
    expect(justGoPublicOrigin(null, { nodeEnv: 'production' })).toBe(JUSTGO_PUBLIC_ORIGIN);
    expect(justGoPublicUrl('/nyc', null, { nodeEnv: 'production' })).toBe('https://justgo.lol/nyc');
  });

  it('honors JUSTGO_PUBLIC_ORIGIN override', () => {
    process.env.JUSTGO_PUBLIC_ORIGIN = 'https://preview.justgo.lol/';
    expect(justGoPublicOrigin()).toBe('https://preview.justgo.lol');
  });

  it('uses the request host in non-production', () => {
    const req = {
      get: (header) => (header === 'host' ? 'localhost:3000' : undefined),
    };
    expect(justGoPublicOrigin(req, { nodeEnv: 'development' })).toBe('http://localhost:3000');
  });

  it('builds a waitlist share URL with ref, not the phone', () => {
    const url = justGoWaitlistShareUrl('NYC', 'abc123xyzz', null, { nodeEnv: 'production' });
    expect(url).toBe('https://justgo.lol/nyc?ref=abc123xyzz');
    expect(url).not.toMatch(/415|phone|\+/i);
  });

  it('builds a landing QR payload URL at /qr/{name}', () => {
    expect(justGoLandingQrUrl('Poster-A', null, { nodeEnv: 'production' })).toBe(
      'https://justgo.lol/qr/poster-a',
    );
    expect(justGoLandingQrUrl('troy', null, { nodeEnv: 'production' })).toBe(
      'https://justgo.lol/qr/troy',
    );
  });

  it('builds a QR hop URL with src=qr and preserved extra query', () => {
    expect(justGoLandingQrHopUrl('Troy', 'Poster-A', null, '?utm=ig', { nodeEnv: 'production' })).toBe(
      'https://justgo.lol/troy?utm=ig&src=qr&qr=poster-a',
    );
  });
});
