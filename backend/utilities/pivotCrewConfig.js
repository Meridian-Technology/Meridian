/**
 * Just Go crew tunables — defaults, merge, and validation for GET /pivot/config `crew`.
 * Keep in sync with Meridian-Mobile/src/pivot/constants/pivotCrewDefaults.ts (Task 0.3).
 */

const PIVOT_CREW_CONFIG_VERSION = 1;

const PICK_ALGORITHMS = new Set(['weighted_majority']);
const PICK_TIE_BREAKS = new Set(['most_registered_then_earliest_start']);

const PIVOT_CREW_CONFIG_DEFAULTS = Object.freeze({
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

function validateFeedMixPatch(patch, path = 'feedMix') {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: `${path} must be an object.` };
  }

  const out = {};
  const fields = [
    'personalInterestWeight',
    'crewSignalWeight',
    'friendSignalWeight',
    'explorationWeight',
  ];

  for (const field of fields) {
    if (patch[field] === undefined) continue;
    const result = clampUnitWeight(patch[field], `${path}.${field}`);
    if (result.error) return { error: result.error };
    out[field] = result.value;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validateInterestBleedPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'interestBleed must be an object.' };
  }

  const out = {};
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') {
      return { error: 'interestBleed.enabled must be a boolean.' };
    }
    out.enabled = patch.enabled;
  }
  if (patch.maxWeight !== undefined) {
    const result = clampUnitWeight(patch.maxWeight, 'interestBleed.maxWeight');
    if (result.error) return { error: result.error };
    out.maxWeight = result.value;
  }
  if (patch.requiresCrewMemberSwipe !== undefined) {
    if (typeof patch.requiresCrewMemberSwipe !== 'boolean') {
      return { error: 'interestBleed.requiresCrewMemberSwipe must be a boolean.' };
    }
    out.requiresCrewMemberSwipe = patch.requiresCrewMemberSwipe;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validateQuorumPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'quorum must be an object.' };
  }

  const out = {};
  if (patch.minSwipeParticipation !== undefined) {
    const result = clampUnitWeight(
      patch.minSwipeParticipation,
      'quorum.minSwipeParticipation',
    );
    if (result.error) return { error: result.error };
    out.minSwipeParticipation = result.value;
  }
  if (patch.minActiveMembers !== undefined) {
    const result = clampPositiveInt(patch.minActiveMembers, 'quorum.minActiveMembers', {
      min: 1,
      max: 100,
    });
    if (result.error) return { error: result.error };
    out.minActiveMembers = result.value;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validateJudgementPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'judgement must be an object.' };
  }

  const out = {};
  if (patch.windowHoursBeforeEvent !== undefined) {
    const result = clampPositiveInt(
      patch.windowHoursBeforeEvent,
      'judgement.windowHoursBeforeEvent',
      { min: 1, max: 168 },
    );
    if (result.error) return { error: result.error };
    out.windowHoursBeforeEvent = result.value;
  }
  if (patch.minHoursAfterDeckComplete !== undefined) {
    const result = clampPositiveInt(
      patch.minHoursAfterDeckComplete,
      'judgement.minHoursAfterDeckComplete',
      { min: 0, max: 168 },
    );
    if (result.error) return { error: result.error };
    out.minHoursAfterDeckComplete = result.value;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validatePickPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'pick must be an object.' };
  }

  const out = {};
  if (patch.algorithm !== undefined) {
    const algorithm = String(patch.algorithm).trim();
    if (!PICK_ALGORITHMS.has(algorithm)) {
      return { error: `pick.algorithm must be one of: ${Array.from(PICK_ALGORITHMS).join(', ')}.` };
    }
    out.algorithm = algorithm;
  }
  if (patch.interestedWeight !== undefined) {
    const result = clampPositiveNumber(patch.interestedWeight, 'pick.interestedWeight', {
      min: 0,
      max: 10,
    });
    if (result.error) return { error: result.error };
    out.interestedWeight = result.value;
  }
  if (patch.registeredWeight !== undefined) {
    const result = clampPositiveNumber(patch.registeredWeight, 'pick.registeredWeight', {
      min: 0,
      max: 10,
    });
    if (result.error) return { error: result.error };
    out.registeredWeight = result.value;
  }
  if (patch.tieBreak !== undefined) {
    const tieBreak = String(patch.tieBreak).trim();
    if (!PICK_TIE_BREAKS.has(tieBreak)) {
      return { error: `pick.tieBreak must be one of: ${Array.from(PICK_TIE_BREAKS).join(', ')}.` };
    }
    out.tieBreak = tieBreak;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validateCrossCrewPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'crossCrew must be an object.' };
  }

  const out = {};
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') {
      return { error: 'crossCrew.enabled must be a boolean.' };
    }
    out.enabled = patch.enabled;
  }
  if (patch.minSharedFriends !== undefined) {
    const result = clampPositiveInt(patch.minSharedFriends, 'crossCrew.minSharedFriends', {
      min: 0,
      max: 50,
    });
    if (result.error) return { error: result.error };
    out.minSharedFriends = result.value;
  }
  if (patch.surfaceCopyKey !== undefined) {
    const surfaceCopyKey = String(patch.surfaceCopyKey).trim();
    if (!surfaceCopyKey || surfaceCopyKey.length > 64) {
      return { error: 'crossCrew.surfaceCopyKey must be 1–64 characters.' };
    }
    out.surfaceCopyKey = surfaceCopyKey;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

function validateNudgesPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'nudges must be an object.' };
  }

  const out = {};
  if (patch.soloCreateCrewAfterWeeks !== undefined) {
    const result = clampPositiveInt(
      patch.soloCreateCrewAfterWeeks,
      'nudges.soloCreateCrewAfterWeeks',
      { min: 0, max: 52 },
    );
    if (result.error) return { error: result.error };
    out.soloCreateCrewAfterWeeks = result.value;
  }
  if (patch.unfinishedSwipeReminderHours !== undefined) {
    const result = clampPositiveInt(
      patch.unfinishedSwipeReminderHours,
      'nudges.unfinishedSwipeReminderHours',
      { min: 1, max: 168 },
    );
    if (result.error) return { error: result.error };
    out.unfinishedSwipeReminderHours = result.value;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

/**
 * Validate a sparse pivotCrewConfig patch (tenant admin / stored override).
 */
function validatePivotCrewConfigPatch(body = {}) {
  if (body === null || body === undefined) {
    return { ok: true, patch: undefined };
  }
  if (!isPlainObject(body)) {
    return { error: 'pivotCrewConfig must be an object.' };
  }

  if (body.version !== undefined) {
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1 || version > PIVOT_CREW_CONFIG_VERSION) {
      return {
        error: `pivotCrewConfig.version must be an integer from 1 to ${PIVOT_CREW_CONFIG_VERSION}.`,
      };
    }
  }

  const out = {};
  const feedMix = validateFeedMixPatch(body.feedMix);
  if (feedMix.error) return feedMix;
  if (feedMix.patch) out.feedMix = feedMix.patch;

  const interestBleed = validateInterestBleedPatch(body.interestBleed);
  if (interestBleed.error) return interestBleed;
  if (interestBleed.patch) out.interestBleed = interestBleed.patch;

  const quorum = validateQuorumPatch(body.quorum);
  if (quorum.error) return quorum;
  if (quorum.patch) out.quorum = quorum.patch;

  const judgement = validateJudgementPatch(body.judgement);
  if (judgement.error) return judgement;
  if (judgement.patch) out.judgement = judgement.patch;

  const pick = validatePickPatch(body.pick);
  if (pick.error) return pick;
  if (pick.patch) out.pick = pick.patch;

  const crossCrew = validateCrossCrewPatch(body.crossCrew);
  if (crossCrew.error) return crossCrew;
  if (crossCrew.patch) out.crossCrew = crossCrew.patch;

  const nudges = validateNudgesPatch(body.nudges);
  if (nudges.error) return nudges;
  if (nudges.patch) out.nudges = nudges.patch;

  return { ok: true, patch: Object.keys(out).length ? out : {} };
}

/**
 * Merge tenant-stored sparse overrides onto shipped defaults for API responses.
 */
function mergePivotCrewConfig(stored) {
  const merged = deepMerge(cloneDefaults(), isPlainObject(stored) ? stored : {});
  merged.version = PIVOT_CREW_CONFIG_VERSION;
  return merged;
}

function mergePivotCrewConfigOverrides(existing = {}, delta = {}) {
  if (!isPlainObject(delta) || Object.keys(delta).length === 0) {
    return isPlainObject(existing) ? { ...existing } : {};
  }
  return deepMerge(isPlainObject(existing) ? existing : {}, delta);
}

module.exports = {
  PIVOT_CREW_CONFIG_VERSION,
  PIVOT_CREW_CONFIG_DEFAULTS,
  mergePivotCrewConfig,
  mergePivotCrewConfigOverrides,
  validatePivotCrewConfigPatch,
};
