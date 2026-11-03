/**
 * Per-city App Clip deck settings (`tenant.pivotClipConfig`). Stored whole,
 * not as a sparse patch: the admin's Content → App Clip tab saves every field.
 *
 * - `deckSource: 'week'` — the live week's clip-flagged cards, then featured,
 *   then last week (the original behaviour).
 * - `deckSource: 'custom'` — `curatedEventIds` in the admin's order, from any
 *   batch week. Falls back to the week deck when none are playable, unless
 *   `fallbackToWeek` is off.
 */

const PIVOT_CLIP_DECK_SOURCES = Object.freeze(['week', 'custom']);
const PIVOT_CLIP_CARD_LIMIT_MAX = 24;
const PIVOT_CLIP_CURATED_MAX = 40;

const PIVOT_CLIP_CONFIG_DEFAULTS = Object.freeze({
  deckSource: 'week',
  cardLimit: 12,
  hidePastEvents: true,
  fallbackToWeek: true,
  curatedEventIds: Object.freeze([]),
});

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCuratedEventIds(value) {
  if (!Array.isArray(value)) {
    return { error: 'curatedEventIds must be an array of event ids.' };
  }
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw ?? '').trim();
    if (!OBJECT_ID_PATTERN.test(id)) {
      return { error: `curatedEventIds has an invalid event id: ${id || '(empty)'}.` };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > PIVOT_CLIP_CURATED_MAX) {
    return { error: `curatedEventIds can hold at most ${PIVOT_CLIP_CURATED_MAX} events.` };
  }
  return { value: ids };
}

/**
 * Validate a full or partial config; missing or null fields take the defaults.
 * Returns `{ config }` or `{ error }`.
 */
function validatePivotClipConfig(body) {
  if (!isPlainObject(body)) {
    return { error: 'pivotClipConfig must be an object.' };
  }
  const config = {
    ...PIVOT_CLIP_CONFIG_DEFAULTS,
    curatedEventIds: [],
  };

  if (body.deckSource != null) {
    if (!PIVOT_CLIP_DECK_SOURCES.includes(body.deckSource)) {
      return { error: 'deckSource must be week or custom.' };
    }
    config.deckSource = body.deckSource;
  }

  if (body.cardLimit != null) {
    const cardLimit = Number(body.cardLimit);
    if (!Number.isInteger(cardLimit) || cardLimit < 1 || cardLimit > PIVOT_CLIP_CARD_LIMIT_MAX) {
      return { error: `cardLimit must be a whole number from 1 to ${PIVOT_CLIP_CARD_LIMIT_MAX}.` };
    }
    config.cardLimit = cardLimit;
  }

  for (const key of ['hidePastEvents', 'fallbackToWeek']) {
    if (body[key] != null) {
      if (typeof body[key] !== 'boolean') {
        return { error: `${key} must be a boolean.` };
      }
      config[key] = body[key];
    }
  }

  if (body.curatedEventIds != null) {
    const ids = normalizeCuratedEventIds(body.curatedEventIds);
    if (ids.error) return { error: ids.error };
    config.curatedEventIds = ids.value;
  }

  return { config };
}

/** Effective settings for a stored value; anything invalid reads as the defaults. */
function mergePivotClipConfig(stored) {
  if (!isPlainObject(stored)) {
    return { ...PIVOT_CLIP_CONFIG_DEFAULTS, curatedEventIds: [] };
  }
  const result = validatePivotClipConfig(stored);
  return result.config || { ...PIVOT_CLIP_CONFIG_DEFAULTS, curatedEventIds: [] };
}

module.exports = {
  PIVOT_CLIP_CONFIG_DEFAULTS,
  PIVOT_CLIP_DECK_SOURCES,
  PIVOT_CLIP_CARD_LIMIT_MAX,
  PIVOT_CLIP_CURATED_MAX,
  validatePivotClipConfig,
  mergePivotClipConfig,
};
