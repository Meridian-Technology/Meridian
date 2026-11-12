const crypto = require('crypto');
const {
  analyticsHash,
  checkAnalyticsHashKey,
  keyDigest,
  isKeyedHash,
  sha256Hex,
} = require('../../utilities/analyticsHash');

describe('analyticsHash', () => {
  const originalSecret = process.env.ANALYTICS_HASH_SECRET;
  const originalJwt = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.ANALYTICS_HASH_SECRET = originalSecret;
    process.env.JWT_SECRET = originalJwt;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
  });

  it('is keyed, prefixed and stable for the same input', () => {
    process.env.ANALYTICS_HASH_SECRET = 'secret-a';
    const value = analyticsHash('203.0.113.7');

    expect(isKeyedHash(value)).toBe(true);
    expect(value).toMatch(/^k1:[a-f0-9]{32}$/);
    expect(analyticsHash('203.0.113.7')).toBe(value);
    expect(value).not.toContain(sha256Hex('203.0.113.7').slice(0, 32));
  });

  it('changes with the key, so a leaked hash cannot be brute-forced without it', () => {
    process.env.ANALYTICS_HASH_SECRET = 'secret-a';
    const first = analyticsHash('203.0.113.7');
    process.env.ANALYTICS_HASH_SECRET = 'secret-b';

    expect(analyticsHash('203.0.113.7')).not.toBe(first);
  });

  it('converts an old unkeyed digest into exactly what a new write produces', () => {
    process.env.ANALYTICS_HASH_SECRET = 'secret-a';
    const oldStored = crypto.createHash('sha256').update('203.0.113.7').digest('hex');

    expect(keyDigest(oldStored)).toBe(analyticsHash('203.0.113.7'));
  });

  it('derives a key from JWT_SECRET when no analytics secret is set', () => {
    delete process.env.ANALYTICS_HASH_SECRET;
    process.env.JWT_SECRET = 'jwt-secret';

    expect(isKeyedHash(analyticsHash('203.0.113.7'))).toBe(true);
  });

  it('stores nothing without a key or without a value', () => {
    delete process.env.ANALYTICS_HASH_SECRET;
    delete process.env.JWT_SECRET;
    expect(analyticsHash('203.0.113.7')).toBeNull();

    process.env.ANALYTICS_HASH_SECRET = 'secret-a';
    expect(analyticsHash('')).toBeNull();
    expect(analyticsHash(null)).toBeNull();
    expect(keyDigest('')).toBeNull();
  });

  it('never falls back to JWT_SECRET in production, and says so', () => {
    delete process.env.ANALYTICS_HASH_SECRET;
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.NODE_ENV = 'production';
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(checkAnalyticsHashKey()).toBe(false);
    expect(analyticsHash('203.0.113.7')).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ANALYTICS_HASH_SECRET'));
    error.mockRestore();

    process.env.ANALYTICS_HASH_SECRET = 'secret-a';
    expect(checkAnalyticsHashKey()).toBe(true);
  });
});
