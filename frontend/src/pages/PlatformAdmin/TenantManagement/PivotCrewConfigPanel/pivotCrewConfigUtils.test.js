import {
  PIVOT_CREW_CONFIG_DEFAULTS,
  buildCrewConfigSavePreview,
  countStoredOverrides,
  extractCrewConfigOverrides,
  formatJsonDiff,
  mergePivotCrewConfig,
  validateEffectiveCrewConfig,
} from './pivotCrewConfigUtils';

describe('pivotCrewConfigUtils', () => {
  it('merges stored overrides onto defaults', () => {
    const merged = mergePivotCrewConfig({
      feedMix: { crewSignalWeight: 0.35 },
    });

    expect(merged.feedMix.crewSignalWeight).toBe(0.35);
    expect(merged.feedMix.personalInterestWeight).toBe(0.7);
  });

  it('extracts only non-default values for tenant storage', () => {
    const effective = mergePivotCrewConfig({
      feedMix: { crewSignalWeight: 0.35 },
    });

    expect(extractCrewConfigOverrides(effective)).toEqual({
      feedMix: { crewSignalWeight: 0.35 },
    });
  });

  it('returns empty overrides when config matches defaults', () => {
    expect(extractCrewConfigOverrides(PIVOT_CREW_CONFIG_DEFAULTS)).toEqual({});
  });

  it('rejects invalid feed mix weights', () => {
    const invalid = mergePivotCrewConfig({});
    invalid.feedMix.personalInterestWeight = 1.5;

    expect(validateEffectiveCrewConfig(invalid).error).toMatch(/personalInterestWeight/);
  });

  it('builds save preview with stored patch snapshot', () => {
    const next = mergePivotCrewConfig({});
    next.quorum.minActiveMembers = 3;

    const preview = buildCrewConfigSavePreview(undefined, next);

    expect(preview.hasChanges).toBe(true);
    expect(preview.storedPatch).toEqual({
      quorum: { minActiveMembers: 3 },
    });
  });

  it('formats json diff lines for changed values', () => {
    const before = { quorum: { minActiveMembers: 2 } };
    const after = { quorum: { minActiveMembers: 3 } };
    const lines = formatJsonDiff(before, after);

    expect(lines.some((line) => line.type === 'remove')).toBe(true);
    expect(lines.some((line) => line.type === 'add')).toBe(true);
  });

  it('counts top-level override sections', () => {
    expect(countStoredOverrides(undefined)).toBe(0);
    expect(
      countStoredOverrides({
        feedMix: { crewSignalWeight: 0.3 },
        nudges: { unfinishedSwipeReminderHours: 8 },
      }),
    ).toBe(2);
  });
});
