const { normalizeWaitlistPhoneE164 } = require('../../utilities/justGoWaitlistPhone');

describe('normalizeWaitlistPhoneE164', () => {
  it('prefixes 10-digit US numbers with +1', () => {
    expect(normalizeWaitlistPhoneE164('(415) 555-0100')).toBe('+14155550100');
    expect(normalizeWaitlistPhoneE164('4155550100')).toBe('+14155550100');
    expect(normalizeWaitlistPhoneE164('415-555-0100')).toBe('+14155550100');
  });

  it('keeps E.164 when country code is already present', () => {
    expect(normalizeWaitlistPhoneE164('+1 415 555 0100')).toBe('+14155550100');
    expect(normalizeWaitlistPhoneE164('14155550100')).toBe('+14155550100');
  });

  it('rejects garbage', () => {
    expect(normalizeWaitlistPhoneE164('')).toBeNull();
    expect(normalizeWaitlistPhoneE164('   ')).toBeNull();
    expect(normalizeWaitlistPhoneE164('not-a-phone')).toBeNull();
    expect(normalizeWaitlistPhoneE164('12345')).toBeNull();
    expect(normalizeWaitlistPhoneE164('0155550100')).toBeNull();
  });
});
