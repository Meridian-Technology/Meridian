/**
 * Just Go drop-deck tunables — defaults, merge, and validation for per-user
 * scored decks (rules_v1). Sparse tenant overrides live on `pivotDeckConfig`.
 */

const PIVOT_DECK_CONFIG_VERSION = 1;
const DECK_SIZE_MIN = 1;
const DECK_SIZE_MAX = 40;
const SCORE_WEIGHT_MAX = 5;

const PIVOT_DECK_CONFIG_DEFAULTS = Object.freeze({
  version: PIVOT_DECK_CONFIG_VERSION,
  softMax: 15,
  hardMax: 18,
  leewayRatio: 0.85,
  highScoreFloor: 0.7,
  weights: Object.freeze({
    friendGoing: 1.5,
    friendInterested: 0.5,
    personalInterest: 0.7,
    crewSignal: 0.2,
    negativeTag: 0.4,
  }),
});

function cloneDefaults() {
  return JSON.parse(JSON.stringify(PIVOT_DECK_CONFIG_DEFAULTS));
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

function clampNumber(value, fieldName, { min, max, integer = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { error: `${fieldName} must be a number between ${min} and ${max}.` };
  }
  if (integer && !Number.isInteger(num)) {
    return { error: `${fieldName} must be an integer between ${min} and ${max}.` };
  }
  return { value: num };
}

function validateWeightsPatch(patch) {
  if (patch === undefined) return { ok: true, patch: undefined };
  if (!isPlainObject(patch)) {
    return { error: 'weights must be an object.' };
  }

  const out = {};
  const unitFields = ['personalInterest', 'crewSignal'];
  const scoreFields = ['friendGoing', 'friendInterested', 'negativeTag'];

  for (const field of unitFields) {
    if (patch[field] === undefined) continue;
    const result = clampNumber(patch[field], `weights.${field}`, { min: 0, max: 1 });
    if (result.error) return { error: result.error };
    out[field] = result.value;
  }

  for (const field of scoreFields) {
    if (patch[field] === undefined) continue;
    const result = clampNumber(patch[field], `weights.${field}`, {
      min: 0,
      max: SCORE_WEIGHT_MAX,
    });
    if (result.error) return { error: result.error };
    out[field] = result.value;
  }

  return { ok: true, patch: Object.keys(out).length ? out : undefined };
}

/**
 * Validate a sparse pivotDeckConfig patch (tenant admin / stored override).
 */
function validatePivotDeckConfigPatch(body = {}) {
  if (body === null || body === undefined) {
    return { ok: true, patch: undefined };
  }
  if (!isPlainObject(body)) {
    return { error: 'pivotDeckConfig must be an object.' };
  }

  if (body.version !== undefined) {
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1 || version > PIVOT_DECK_CONFIG_VERSION) {
      return {
        error: `pivotDeckConfig.version must be an integer from 1 to ${PIVOT_DECK_CONFIG_VERSION}.`,
      };
    }
  }

  const out = {};

  if (body.softMax !== undefined) {
    const result = clampNumber(body.softMax, 'softMax', {
      min: DECK_SIZE_MIN,
      max: DECK_SIZE_MAX,
      integer: true,
    });
    if (result.error) return result;
    out.softMax = result.value;
  }

  if (body.hardMax !== undefined) {
    const result = clampNumber(body.hardMax, 'hardMax', {
      min: DECK_SIZE_MIN,
      max: DECK_SIZE_MAX,
      integer: true,
    });
    if (result.error) return result;
    out.hardMax = result.value;
  }

  const softMax = out.softMax ?? PIVOT_DECK_CONFIG_DEFAULTS.softMax;
  const hardMax = out.hardMax ?? PIVOT_DECK_CONFIG_DEFAULTS.hardMax;
  if (out.softMax !== undefined && out.hardMax !== undefined && softMax > hardMax) {
    return { error: 'softMax must be less than or equal to hardMax.' };
  }

  if (body.leewayRatio !== undefined) {
    const result = clampNumber(body.leewayRatio, 'leewayRatio', { min: 0, max: 1 });
    if (result.error) return result;
    out.leewayRatio = result.value;
  }

  if (body.highScoreFloor !== undefined) {
    const result = clampNumber(body.highScoreFloor, 'highScoreFloor', {
      min: 0,
      max: SCORE_WEIGHT_MAX,
    });
    if (result.error) return result;
    out.highScoreFloor = result.value;
  }

  const weights = validateWeightsPatch(body.weights);
  if (weights.error) return weights;
  if (weights.patch) out.weights = weights.patch;

  return { ok: true, patch: Object.keys(out).length ? out : {} };
}

function mergePivotDeckConfig(stored) {
  const merged = deepMerge(cloneDefaults(), isPlainObject(stored) ? stored : {});
  merged.version = PIVOT_DECK_CONFIG_VERSION;
  const hardMax = Math.min(
    DECK_SIZE_MAX,
    Math.max(DECK_SIZE_MIN, Number(merged.hardMax) || PIVOT_DECK_CONFIG_DEFAULTS.hardMax),
  );
  const softMax = Math.min(
    hardMax,
    Math.max(DECK_SIZE_MIN, Number(merged.softMax) || PIVOT_DECK_CONFIG_DEFAULTS.softMax),
  );
  merged.hardMax = hardMax;
  merged.softMax = softMax;
  return merged;
}

function mergePivotDeckConfigOverrides(existing = {}, delta = {}) {
  if (!isPlainObject(delta) || Object.keys(delta).length === 0) {
    return isPlainObject(existing) ? { ...existing } : {};
  }
  return deepMerge(isPlainObject(existing) ? existing : {}, delta);
}

module.exports = {
  PIVOT_DECK_CONFIG_VERSION,
  PIVOT_DECK_CONFIG_DEFAULTS,
  DECK_SIZE_MIN,
  DECK_SIZE_MAX,
  SCORE_WEIGHT_MAX,
  mergePivotDeckConfig,
  mergePivotDeckConfigOverrides,
  validatePivotDeckConfigPatch,
};
