const {
  PIVOT_DECK_CONFIG_VERSION,
  PIVOT_DECK_CONFIG_DEFAULTS,
  mergePivotDeckConfig,
  mergePivotDeckConfigOverrides,
  validatePivotDeckConfigPatch,
} = require('../../utilities/pivotDeckConfig');

describe('pivotDeckConfig', () => {
  describe('mergePivotDeckConfig', () => {
    it('returns documented defaults when stored config is missing', () => {
      const merged = mergePivotDeckConfig(undefined);
      expect(merged.version).toBe(PIVOT_DECK_CONFIG_VERSION);
      expect(merged.softMax).toBe(15);
      expect(merged.hardMax).toBe(18);
      expect(merged.leewayRatio).toBe(0.85);
      expect(merged.highScoreFloor).toBe(0.7);
      expect(merged.weights).toEqual({
        friendGoing: 1.5,
        friendInterested: 0.5,
        personalInterest: 0.7,
        crewSignal: 0.2,
        negativeTag: 0.4,
      });
    });

    it('deep-merges partial tenant overrides onto defaults', () => {
      const merged = mergePivotDeckConfig({
        softMax: 12,
        weights: { friendGoing: 2 },
      });

      expect(merged.softMax).toBe(12);
      expect(merged.hardMax).toBe(18);
      expect(merged.weights.friendGoing).toBe(2);
      expect(merged.weights.personalInterest).toBe(0.7);
      expect(merged.version).toBe(PIVOT_DECK_CONFIG_VERSION);
    });

    it('clamps softMax down to hardMax when stored values invert', () => {
      const merged = mergePivotDeckConfig({
        softMax: 20,
        hardMax: 16,
      });
      expect(merged.hardMax).toBe(16);
      expect(merged.softMax).toBe(16);
    });
  });

  describe('mergePivotDeckConfigOverrides', () => {
    it('merges sparse stored patches for tenant rows', () => {
      const merged = mergePivotDeckConfigOverrides(
        { softMax: 12 },
        { weights: { negativeTag: 1 } },
      );

      expect(merged.softMax).toBe(12);
      expect(merged.weights.negativeTag).toBe(1);
    });
  });

  describe('validatePivotDeckConfigPatch', () => {
    it('accepts a valid partial patch', () => {
      const result = validatePivotDeckConfigPatch({
        softMax: 12,
        hardMax: 16,
        weights: { personalInterest: 0.8 },
      });

      expect(result.ok).toBe(true);
      expect(result.patch).toEqual({
        softMax: 12,
        hardMax: 16,
        weights: { personalInterest: 0.8 },
      });
    });

    it('rejects softMax greater than hardMax when both are provided', () => {
      const result = validatePivotDeckConfigPatch({
        softMax: 20,
        hardMax: 10,
      });
      expect(result.error).toMatch(/softMax/);
    });

    it('rejects out-of-range unit weight', () => {
      const result = validatePivotDeckConfigPatch({
        weights: { personalInterest: 1.5 },
      });
      expect(result.error).toMatch(/personalInterest/);
    });

    it('rejects friend bonus above 5', () => {
      const result = validatePivotDeckConfigPatch({
        weights: { friendGoing: 6 },
      });
      expect(result.error).toMatch(/friendGoing/);
    });

    it('rejects invalid version', () => {
      const result = validatePivotDeckConfigPatch({ version: 99 });
      expect(result.error).toMatch(/version/);
    });
  });

  describe('PIVOT_DECK_CONFIG_DEFAULTS', () => {
    it('matches the drop-deck contract', () => {
      expect(PIVOT_DECK_CONFIG_DEFAULTS).toEqual({
        version: 1,
        softMax: 15,
        hardMax: 18,
        leewayRatio: 0.85,
        highScoreFloor: 0.7,
        weights: {
          friendGoing: 1.5,
          friendInterested: 0.5,
          personalInterest: 0.7,
          crewSignal: 0.2,
          negativeTag: 0.4,
        },
      });
    });
  });
});
