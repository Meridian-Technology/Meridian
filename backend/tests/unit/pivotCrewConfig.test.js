const {
  PIVOT_CREW_CONFIG_VERSION,
  PIVOT_CREW_CONFIG_DEFAULTS,
  mergePivotCrewConfig,
  mergePivotCrewConfigOverrides,
  validatePivotCrewConfigPatch,
} = require('../../utilities/pivotCrewConfig');

describe('pivotCrewConfig', () => {
  describe('mergePivotCrewConfig', () => {
    it('returns documented defaults when stored config is missing', () => {
      const merged = mergePivotCrewConfig(undefined);
      expect(merged.version).toBe(PIVOT_CREW_CONFIG_VERSION);
      expect(merged.feedMix.personalInterestWeight).toBe(0.7);
      expect(merged.quorum.minSwipeParticipation).toBe(0.6);
      expect(merged.pick.algorithm).toBe('weighted_majority');
    });

    it('deep-merges partial tenant overrides onto defaults', () => {
      const merged = mergePivotCrewConfig({
        feedMix: { crewSignalWeight: 0.35 },
        interestBleed: { enabled: false },
      });

      expect(merged.feedMix.personalInterestWeight).toBe(0.7);
      expect(merged.feedMix.crewSignalWeight).toBe(0.35);
      expect(merged.interestBleed.enabled).toBe(false);
      expect(merged.interestBleed.maxWeight).toBe(0.15);
      expect(merged.version).toBe(PIVOT_CREW_CONFIG_VERSION);
    });
  });

  describe('mergePivotCrewConfigOverrides', () => {
    it('merges sparse stored patches for tenant rows', () => {
      const merged = mergePivotCrewConfigOverrides(
        { feedMix: { crewSignalWeight: 0.25 } },
        { nudges: { unfinishedSwipeReminderHours: 8 } },
      );

      expect(merged.feedMix.crewSignalWeight).toBe(0.25);
      expect(merged.nudges.unfinishedSwipeReminderHours).toBe(8);
    });
  });

  describe('validatePivotCrewConfigPatch', () => {
    it('accepts valid partial patch', () => {
      const result = validatePivotCrewConfigPatch({
        feedMix: { explorationWeight: 0.1 },
        quorum: { minActiveMembers: 3 },
      });

      expect(result.ok).toBe(true);
      expect(result.patch).toEqual({
        feedMix: { explorationWeight: 0.1 },
        quorum: { minActiveMembers: 3 },
      });
    });

    it('rejects out-of-range feed mix weight', () => {
      const result = validatePivotCrewConfigPatch({
        feedMix: { personalInterestWeight: 1.5 },
      });

      expect(result.error).toMatch(/personalInterestWeight/);
    });

    it('rejects unknown pick algorithm', () => {
      const result = validatePivotCrewConfigPatch({
        pick: { algorithm: 'magic_8_ball' },
      });

      expect(result.error).toMatch(/pick.algorithm/);
    });

    it('rejects invalid version', () => {
      const result = validatePivotCrewConfigPatch({ version: 99 });
      expect(result.error).toMatch(/version/);
    });
  });

  describe('PIVOT_CREW_CONFIG_DEFAULTS', () => {
    it('matches crew social plan contract', () => {
      expect(PIVOT_CREW_CONFIG_DEFAULTS.feedMix).toEqual({
        personalInterestWeight: 0.7,
        crewSignalWeight: 0.2,
        friendSignalWeight: 0.05,
        explorationWeight: 0.05,
      });
      expect(PIVOT_CREW_CONFIG_DEFAULTS.crossCrew.surfaceCopyKey).toBe(
        'another_crew_going',
      );
      expect(PIVOT_CREW_CONFIG_DEFAULTS.judgement).toEqual({
        windowHoursBeforeEvent: 24,
        minHoursAfterDeckComplete: 6,
        consensusWindowMinutes: 180,
        swapResetBonusMinutes: 15,
        crewSwapBudget: 2,
      });
    });
  });

  describe('judgement consensus knobs', () => {
    it('accepts consensus window, swap bonus, and crew swap budget', () => {
      const result = validatePivotCrewConfigPatch({
        judgement: {
          consensusWindowMinutes: 120,
          swapResetBonusMinutes: 10,
          crewSwapBudget: 1,
        },
      });
      expect(result.ok).toBe(true);
      expect(result.patch.judgement).toEqual({
        consensusWindowMinutes: 120,
        swapResetBonusMinutes: 10,
        crewSwapBudget: 1,
      });
    });

    it('rejects out-of-range consensus window', () => {
      const result = validatePivotCrewConfigPatch({
        judgement: { consensusWindowMinutes: 10 },
      });
      expect(result.error).toMatch(/consensusWindowMinutes/);
    });
  });
});
