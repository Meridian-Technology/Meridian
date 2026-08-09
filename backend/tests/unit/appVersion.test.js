const {
  parseAppVersion,
  compareAppVersions,
  isAppVersionAtLeast,
} = require('../../utilities/appVersion');

describe('appVersion', () => {
  describe('parseAppVersion', () => {
    it('parses major.minor.patch', () => {
      expect(parseAppVersion('1.0.9')).toEqual({ major: 1, minor: 0, patch: 9 });
      expect(parseAppVersion('2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('ignores pre-release and build suffixes for parsing', () => {
      expect(parseAppVersion('1.0.9-beta.1')).toEqual({ major: 1, minor: 0, patch: 9 });
      expect(parseAppVersion('1.0.9+build.42')).toEqual({ major: 1, minor: 0, patch: 9 });
    });

    it('returns null for invalid versions', () => {
      expect(parseAppVersion('')).toBeNull();
      expect(parseAppVersion('1.0')).toBeNull();
      expect(parseAppVersion('v1.0.0')).toBeNull();
      expect(parseAppVersion(null)).toBeNull();
    });
  });

  describe('compareAppVersions', () => {
    it('orders semver tuples correctly', () => {
      expect(compareAppVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareAppVersions('1.0.1', '1.0.0')).toBe(1);
      expect(compareAppVersions('1.0.9', '1.0.9')).toBe(0);
      expect(compareAppVersions('2.0.0', '1.9.9')).toBe(1);
      expect(compareAppVersions('1.10.0', '1.9.9')).toBe(1);
    });

    it('returns null when either operand is invalid', () => {
      expect(compareAppVersions('bad', '1.0.0')).toBeNull();
      expect(compareAppVersions('1.0.0', '')).toBeNull();
    });
  });

  describe('isAppVersionAtLeast', () => {
    it('returns true when current meets or exceeds minimum', () => {
      expect(isAppVersionAtLeast('1.0.9', '1.0.0')).toBe(true);
      expect(isAppVersionAtLeast('2.0.0', '2.0.0')).toBe(true);
      expect(isAppVersionAtLeast('2.1.0', '2.0.0')).toBe(true);
    });

    it('returns false when current is below minimum or invalid', () => {
      expect(isAppVersionAtLeast('1.0.8', '1.0.9')).toBe(false);
      expect(isAppVersionAtLeast('', '1.0.0')).toBe(false);
      expect(isAppVersionAtLeast(undefined, '1.0.0')).toBe(false);
    });
  });
});
