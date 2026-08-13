import {
  PIVOT_DECK_CONFIG_DEFAULTS,
  buildDeckConfigSavePreview,
  extractDeckConfigOverrides,
  mergePivotDeckConfig,
  validateEffectiveDeckConfig,
} from './pivotDeckConfigUtils';

describe('pivotDeckConfigUtils', () => {
  it('merges partial overrides onto defaults', () => {
    const merged = mergePivotDeckConfig({
      softMax: 12,
      weights: { friendGoing: 2 },
    });
    expect(merged.softMax).toBe(12);
    expect(merged.hardMax).toBe(18);
    expect(merged.weights.friendGoing).toBe(2);
    expect(merged.weights.personalInterest).toBe(0.7);
  });

  it('extracts only overridden fields', () => {
    const effective = mergePivotDeckConfig({
      softMax: 12,
      weights: { friendGoing: 2 },
    });
    expect(extractDeckConfigOverrides(effective)).toEqual({
      softMax: 12,
      weights: { friendGoing: 2 },
    });
    expect(extractDeckConfigOverrides(PIVOT_DECK_CONFIG_DEFAULTS)).toEqual({});
  });

  it('rejects inverted length knobs', () => {
    const invalid = mergePivotDeckConfig({});
    invalid.softMax = 20;
    invalid.hardMax = 10;
    expect(validateEffectiveDeckConfig(invalid).error).toMatch(/softMax/);
  });

  it('builds a save preview when values change', () => {
    const next = mergePivotDeckConfig({ softMax: 12 });
    const preview = buildDeckConfigSavePreview(undefined, next);
    expect(preview.hasChanges).toBe(true);
    expect(preview.storedPatch).toEqual({ softMax: 12 });
  });
});
