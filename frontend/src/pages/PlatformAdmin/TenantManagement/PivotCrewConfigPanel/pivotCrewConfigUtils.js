/** Keep in sync with Meridian/backend/utilities/pivotCrewConfig.js */

export const PIVOT_CREW_CONFIG_VERSION = 1;

export const PIVOT_CREW_CONFIG_DEFAULTS = Object.freeze({
  version: PIVOT_CREW_CONFIG_VERSION,
  feedMix: Object.freeze({
    personalInterestWeight: 0.7,
    crewSignalWeight: 0.2,
    friendSignalWeight: 0.05,
    explorationWeight: 0.05,
  }),
  interestBleed: Object.freeze({
    enabled: true,
    maxWeight: 0.15,
    requiresCrewMemberSwipe: false,
  }),
  quorum: Object.freeze({
    minSwipeParticipation: 0.6,
    minActiveMembers: 2,
  }),
  judgement: Object.freeze({
    windowHoursBeforeEvent: 24,
    minHoursAfterDeckComplete: 6,
    consensusWindowMinutes: 180,
    swapResetBonusMinutes: 15,
    crewSwapBudget: 2,
  }),
  pick: Object.freeze({
    algorithm: 'weighted_majority',
    interestedWeight: 1,
    registeredWeight: 1.5,
    tieBreak: 'most_registered_then_earliest_start',
  }),
  crossCrew: Object.freeze({
    enabled: true,
    minSharedFriends: 1,
    surfaceCopyKey: 'another_crew_going',
  }),
  nudges: Object.freeze({
    soloCreateCrewAfterWeeks: 2,
    unfinishedSwipeReminderHours: 12,
  }),
});

const PICK_ALGORITHMS = new Set(['weighted_majority']);
const PICK_TIE_BREAKS = new Set(['most_registered_then_earliest_start']);

function cloneDefaults() {
  return JSON.parse(JSON.stringify(PIVOT_CREW_CONFIG_DEFAULTS));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) {
    return { ...base };
  }

  const out = { ...base };
  Object.keys(override).forEach((key) => {
    const value = override[key];
    if (value === undefined) {
      return;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
      return;
    }
    out[key] = value;
  });
  return out;
}

export function mergePivotCrewConfig(stored) {
  const merged = deepMerge(cloneDefaults(), isPlainObject(stored) ? stored : {});
  merged.version = PIVOT_CREW_CONFIG_VERSION;
  return merged;
}

function diffSection(value, defaults) {
  if (!isPlainObject(value) || !isPlainObject(defaults)) {
    return value === defaults ? undefined : value;
  }

  const out = {};
  Object.keys(defaults).forEach((key) => {
    if (!(key in value)) {
      return;
    }
    const child = diffSection(value[key], defaults[key]);
    if (child !== undefined) {
      out[key] = child;
    }
  });

  return Object.keys(out).length ? out : undefined;
}

/** Strip values matching shipped defaults — sparse override for tenant storage. */
export function extractCrewConfigOverrides(effectiveConfig) {
  const sections = [
    'feedMix',
    'interestBleed',
    'quorum',
    'judgement',
    'pick',
    'crossCrew',
    'nudges',
  ];
  const out = {};

  sections.forEach((section) => {
    const patch = diffSection(effectiveConfig?.[section], PIVOT_CREW_CONFIG_DEFAULTS[section]);
    if (patch !== undefined) {
      out[section] = patch;
    }
  });

  return out;
}

function clampUnitWeight(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    return { error: `${fieldName} must be a number between 0 and 1.` };
  }
  return { value: num };
}

function clampPositiveInt(value, fieldName, { min = 1, max = 168 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
    return { error: `${fieldName} must be an integer between ${min} and ${max}.` };
  }
  return { value: num };
}

function clampPositiveNumber(value, fieldName, { min = 0, max = 1000 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { error: `${fieldName} must be a number between ${min} and ${max}.` };
  }
  return { value: num };
}

export function validateEffectiveCrewConfig(config) {
  if (!isPlainObject(config)) {
    return { error: 'Crew config must be an object.' };
  }

  const feedMix = config.feedMix || {};
  for (const field of [
    'personalInterestWeight',
    'crewSignalWeight',
    'friendSignalWeight',
    'explorationWeight',
  ]) {
    const result = clampUnitWeight(feedMix[field], `feedMix.${field}`);
    if (result.error) return result;
  }

  const interestBleed = config.interestBleed || {};
  if (typeof interestBleed.enabled !== 'boolean') {
    return { error: 'interestBleed.enabled must be a boolean.' };
  }
  const bleedWeight = clampUnitWeight(interestBleed.maxWeight, 'interestBleed.maxWeight');
  if (bleedWeight.error) return bleedWeight;
  if (typeof interestBleed.requiresCrewMemberSwipe !== 'boolean') {
    return { error: 'interestBleed.requiresCrewMemberSwipe must be a boolean.' };
  }

  const quorum = config.quorum || {};
  const swipeParticipation = clampUnitWeight(
    quorum.minSwipeParticipation,
    'quorum.minSwipeParticipation',
  );
  if (swipeParticipation.error) return swipeParticipation;
  const activeMembers = clampPositiveInt(quorum.minActiveMembers, 'quorum.minActiveMembers', {
    min: 1,
    max: 100,
  });
  if (activeMembers.error) return activeMembers;

  const judgement = config.judgement || {};
  const windowHours = clampPositiveInt(
    judgement.windowHoursBeforeEvent,
    'judgement.windowHoursBeforeEvent',
    { min: 1, max: 168 },
  );
  if (windowHours.error) return windowHours;
  const minHoursAfterDeck = clampPositiveInt(
    judgement.minHoursAfterDeckComplete,
    'judgement.minHoursAfterDeckComplete',
    { min: 0, max: 168 },
  );
  if (minHoursAfterDeck.error) return minHoursAfterDeck;
  const consensusWindow = clampPositiveInt(
    judgement.consensusWindowMinutes,
    'judgement.consensusWindowMinutes',
    { min: 30, max: 720 },
  );
  if (consensusWindow.error) return consensusWindow;
  const swapBonus = clampPositiveInt(
    judgement.swapResetBonusMinutes,
    'judgement.swapResetBonusMinutes',
    { min: 0, max: 120 },
  );
  if (swapBonus.error) return swapBonus;
  const swapBudget = clampPositiveInt(
    judgement.crewSwapBudget,
    'judgement.crewSwapBudget',
    { min: 0, max: 5 },
  );
  if (swapBudget.error) return swapBudget;

  const pick = config.pick || {};
  if (!PICK_ALGORITHMS.has(String(pick.algorithm || '').trim())) {
    return { error: `pick.algorithm must be one of: ${Array.from(PICK_ALGORITHMS).join(', ')}.` };
  }
  const interestedWeight = clampPositiveNumber(pick.interestedWeight, 'pick.interestedWeight', {
    min: 0,
    max: 10,
  });
  if (interestedWeight.error) return interestedWeight;
  const registeredWeight = clampPositiveNumber(pick.registeredWeight, 'pick.registeredWeight', {
    min: 0,
    max: 10,
  });
  if (registeredWeight.error) return registeredWeight;
  if (!PICK_TIE_BREAKS.has(String(pick.tieBreak || '').trim())) {
    return { error: `pick.tieBreak must be one of: ${Array.from(PICK_TIE_BREAKS).join(', ')}.` };
  }

  const crossCrew = config.crossCrew || {};
  if (typeof crossCrew.enabled !== 'boolean') {
    return { error: 'crossCrew.enabled must be a boolean.' };
  }
  const sharedFriends = clampPositiveInt(
    crossCrew.minSharedFriends,
    'crossCrew.minSharedFriends',
    { min: 0, max: 50 },
  );
  if (sharedFriends.error) return sharedFriends;
  const surfaceCopyKey = String(crossCrew.surfaceCopyKey || '').trim();
  if (!surfaceCopyKey || surfaceCopyKey.length > 64) {
    return { error: 'crossCrew.surfaceCopyKey must be 1–64 characters.' };
  }

  const nudges = config.nudges || {};
  const soloWeeks = clampPositiveInt(
    nudges.soloCreateCrewAfterWeeks,
    'nudges.soloCreateCrewAfterWeeks',
    { min: 0, max: 52 },
  );
  if (soloWeeks.error) return soloWeeks;
  const reminderHours = clampPositiveInt(
    nudges.unfinishedSwipeReminderHours,
    'nudges.unfinishedSwipeReminderHours',
    { min: 1, max: 168 },
  );
  if (reminderHours.error) return reminderHours;

  return { ok: true };
}

export function buildCrewConfigSavePreview(storedOverrides, nextEffective) {
  const beforeEffective = mergePivotCrewConfig(storedOverrides);
  const afterEffective = {
    ...nextEffective,
    version: PIVOT_CREW_CONFIG_VERSION,
  };
  const storedPatch = extractCrewConfigOverrides(afterEffective);

  return {
    beforeEffective,
    afterEffective,
    storedPatch,
    hasChanges: JSON.stringify(beforeEffective) !== JSON.stringify(afterEffective),
  };
}

export function formatJsonDiff(before, after) {
  const beforeLines = JSON.stringify(before, null, 2).split('\n');
  const afterLines = JSON.stringify(after, null, 2).split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const lines = [];

  for (let index = 0; index < maxLen; index += 1) {
    const left = beforeLines[index];
    const right = afterLines[index];

    if (left === right) {
      if (left !== undefined) {
        lines.push({ type: 'same', text: `  ${left}` });
      }
      continue;
    }

    if (left !== undefined) {
      lines.push({ type: 'remove', text: `- ${left}` });
    }
    if (right !== undefined) {
      lines.push({ type: 'add', text: `+ ${right}` });
    }
  }

  return lines;
}

export function countStoredOverrides(storedOverrides) {
  if (!isPlainObject(storedOverrides) || !Object.keys(storedOverrides).length) {
    return 0;
  }
  return Object.keys(storedOverrides).length;
}
