/** Keep in sync with Meridian/backend/utilities/pivotDeckConfig.js */

export const PIVOT_DECK_CONFIG_VERSION = 1;
export const DECK_SIZE_MIN = 1;
export const DECK_SIZE_MAX = 40;
export const SCORE_WEIGHT_MAX = 5;

export const PIVOT_DECK_CONFIG_DEFAULTS = Object.freeze({
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

export function mergePivotDeckConfig(stored) {
  const merged = deepMerge(cloneDefaults(), isPlainObject(stored) ? stored : {});
  merged.version = PIVOT_DECK_CONFIG_VERSION;
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

export function extractDeckConfigOverrides(effectiveConfig) {
  const out = {};
  ['softMax', 'hardMax', 'leewayRatio', 'highScoreFloor'].forEach((field) => {
    if (
      effectiveConfig?.[field] !== undefined &&
      effectiveConfig[field] !== PIVOT_DECK_CONFIG_DEFAULTS[field]
    ) {
      out[field] = effectiveConfig[field];
    }
  });

  const weights = diffSection(
    effectiveConfig?.weights,
    PIVOT_DECK_CONFIG_DEFAULTS.weights,
  );
  if (weights !== undefined) {
    out.weights = weights;
  }

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

export function validateEffectiveDeckConfig(config) {
  if (!isPlainObject(config)) {
    return { error: 'Drop deck config must be an object.' };
  }

  const softMax = clampNumber(config.softMax, 'softMax', {
    min: DECK_SIZE_MIN,
    max: DECK_SIZE_MAX,
    integer: true,
  });
  if (softMax.error) return softMax;

  const hardMax = clampNumber(config.hardMax, 'hardMax', {
    min: DECK_SIZE_MIN,
    max: DECK_SIZE_MAX,
    integer: true,
  });
  if (hardMax.error) return hardMax;

  if (softMax.value > hardMax.value) {
    return { error: 'softMax must be less than or equal to hardMax.' };
  }

  const leewayRatio = clampNumber(config.leewayRatio, 'leewayRatio', { min: 0, max: 1 });
  if (leewayRatio.error) return leewayRatio;

  const highScoreFloor = clampNumber(config.highScoreFloor, 'highScoreFloor', {
    min: 0,
    max: SCORE_WEIGHT_MAX,
  });
  if (highScoreFloor.error) return highScoreFloor;

  const weights = config.weights || {};
  for (const field of ['personalInterest', 'crewSignal']) {
    const result = clampNumber(weights[field], `weights.${field}`, { min: 0, max: 1 });
    if (result.error) return result;
  }
  for (const field of ['friendGoing', 'friendInterested', 'negativeTag']) {
    const result = clampNumber(weights[field], `weights.${field}`, {
      min: 0,
      max: SCORE_WEIGHT_MAX,
    });
    if (result.error) return result;
  }

  return { ok: true };
}

export function buildDeckConfigSavePreview(storedOverrides, nextEffective) {
  const beforeEffective = mergePivotDeckConfig(storedOverrides);
  const afterEffective = {
    ...nextEffective,
    version: PIVOT_DECK_CONFIG_VERSION,
  };
  const storedPatch = extractDeckConfigOverrides(afterEffective);

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

export const DROP_DECK_SCORE_FORMULA = [
  'score =',
  '  friendGoing × friends going',
  '  + friendInterested × friends interested',
  '  + crewSignal × (1.5 × crew going + crew interested)',
  '  + personalInterest × matching interest tags',
  '  + crew interest bleed (≤ crew config maxWeight)',
  '  − negativeTag × tags from events rated under 3',
].join('\n');
