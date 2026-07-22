const {
  normalizeContactEmail,
  normalizeContactPhone,
  hashContactEmail,
  hashContactPhone,
  hashContactIdentifiers,
  hashNormalizedContactValue,
  isValidContactHash,
} = require('../../utilities/pivotContactHash');

describe('pivotContactHash utilities', () => {
  describe('normalizeContactEmail', () => {
    it('lowercases and trims valid emails', () => {
      expect(normalizeContactEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    });

    it('returns null for invalid emails', () => {
      expect(normalizeContactEmail('not-an-email')).toBeNull();
      expect(normalizeContactEmail('')).toBeNull();
    });
  });

  describe('normalizeContactPhone', () => {
    it('normalizes 10-digit US numbers to country code 1', () => {
      expect(normalizeContactPhone('(415) 555-0100')).toBe('14155550100');
    });

    it('keeps 11-digit numbers that already include country code', () => {
      expect(normalizeContactPhone('+1 415 555 0100')).toBe('14155550100');
    });

    it('returns null for too-short numbers', () => {
      expect(normalizeContactPhone('12345')).toBeNull();
    });
  });

  describe('hashContactEmail', () => {
    it('produces stable sha256 hex digests', () => {
      const hash = hashContactEmail('friend@example.com');
      expect(isValidContactHash(hash)).toBe(true);
      expect(hash).toBe(hashNormalizedContactValue('friend@example.com'));
    });
  });

  describe('hashContactPhone', () => {
    it('hashes normalized phone digits', () => {
      const hash = hashContactPhone('415-555-0100');
      expect(isValidContactHash(hash)).toBe(true);
      expect(hash).toBe(hashNormalizedContactValue('14155550100'));
    });
  });

  describe('hashContactIdentifiers', () => {
    it('dedupes and hashes mixed identifiers in memory', () => {
      const hashes = hashContactIdentifiers([
        { type: 'email', value: 'friend@example.com' },
        { type: 'email', value: 'FRIEND@example.com' },
        { type: 'phone', value: '4155550100' },
        { type: 'invalid', value: 'skip-me' },
      ]);

      expect(hashes).toHaveLength(2);
      expect(hashes[0].type).toBe('email');
      expect(hashes[1].type).toBe('phone');
    });
  });
});
