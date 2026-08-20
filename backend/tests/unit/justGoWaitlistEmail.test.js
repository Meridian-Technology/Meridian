const { normalizeWaitlistEmail } = require('../../utilities/justGoWaitlistEmail');

describe('normalizeWaitlistEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeWaitlistEmail('  Alex@Example.COM  ')).toBe('alex@example.com');
    expect(normalizeWaitlistEmail('you@email.com')).toBe('you@email.com');
  });

  it('rejects garbage', () => {
    expect(normalizeWaitlistEmail('')).toBeNull();
    expect(normalizeWaitlistEmail('   ')).toBeNull();
    expect(normalizeWaitlistEmail('not-an-email')).toBeNull();
    expect(normalizeWaitlistEmail('nope@')).toBeNull();
    expect(normalizeWaitlistEmail('@example.com')).toBeNull();
  });
});
