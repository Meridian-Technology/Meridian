/**
 * Multi-event pick slots for crew judgement.
 * Tenant ceiling: crewConfig.judgement.maxPickSlots (1–2).
 * Per-crew override: crew.maxPickSlots (null = inherit).
 */

const PIVOT_CREW_MAX_PICK_SLOTS_CAP = 2;
const PIVOT_CREW_MAX_PICK_SLOTS_DEFAULT = 1;

function clampMaxPickSlots(value, fallback = PIVOT_CREW_MAX_PICK_SLOTS_DEFAULT) {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    return fallback;
  }
  return Math.max(1, Math.min(PIVOT_CREW_MAX_PICK_SLOTS_CAP, n));
}

/**
 * Effective capacity for a crew this week.
 * Prefer frozen weekState.maxPickSlots once judgement has opened.
 */
function resolveEffectiveMaxPickSlots({
  weekState = null,
  crew = null,
  crewConfig = null,
} = {}) {
  if (
    weekState?.maxPickSlots != null &&
    Number.isInteger(Number(weekState.maxPickSlots))
  ) {
    return clampMaxPickSlots(weekState.maxPickSlots);
  }
  if (crew?.maxPickSlots != null && Number.isInteger(Number(crew.maxPickSlots))) {
    return clampMaxPickSlots(crew.maxPickSlots);
  }
  const fromConfig = crewConfig?.judgement?.maxPickSlots;
  return clampMaxPickSlots(fromConfig, PIVOT_CREW_MAX_PICK_SLOTS_DEFAULT);
}

/** Normalize legacy single proposedEventId → ordered id list. */
function normalizeProposedEventIds(weekState, maxPickSlots = PIVOT_CREW_MAX_PICK_SLOTS_CAP) {
  const cap = clampMaxPickSlots(maxPickSlots, PIVOT_CREW_MAX_PICK_SLOTS_CAP);
  const fromArray = Array.isArray(weekState?.proposedEventIds)
    ? weekState.proposedEventIds
        .map((id) => id?.toString?.() || String(id))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) {
    return [...new Set(fromArray)].slice(0, cap);
  }
  const primary =
    weekState?.proposedEventId?.toString?.() ||
    (weekState?.proposedEventId ? String(weekState.proposedEventId) : null);
  return primary ? [primary] : [];
}

function normalizeOriginalProposedEventIds(
  weekState,
  maxPickSlots = PIVOT_CREW_MAX_PICK_SLOTS_CAP,
) {
  const cap = clampMaxPickSlots(maxPickSlots, PIVOT_CREW_MAX_PICK_SLOTS_CAP);
  const fromArray = Array.isArray(weekState?.originalProposedEventIds)
    ? weekState.originalProposedEventIds
        .map((id) => id?.toString?.() || String(id))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) {
    return [...new Set(fromArray)].slice(0, cap);
  }
  const primary =
    weekState?.originalProposedEventId?.toString?.() ||
    weekState?.proposedEventId?.toString?.() ||
    null;
  return primary ? [primary] : [];
}

/** Keep primary scalar fields in sync with the ordered set. */
function syncPrimaryProposedFields(proposedEventIds, originalProposedEventIds = null) {
  const ids = Array.isArray(proposedEventIds) ? proposedEventIds.filter(Boolean) : [];
  const originals = Array.isArray(originalProposedEventIds)
    ? originalProposedEventIds.filter(Boolean)
    : ids;
  return {
    proposedEventIds: ids,
    proposedEventId: ids[0] || null,
    originalProposedEventIds: originals.length ? originals : ids,
    originalProposedEventId: (originals[0] || ids[0] || null),
  };
}

function resolveSwapTargetEventIdExcluding(weekState, slottedIds = []) {
  if (!weekState?.voteBreakdown?.length) {
    return null;
  }
  const excluded = new Set(
    (slottedIds || []).map((id) => id?.toString?.() || String(id)).filter(Boolean),
  );
  const primary = weekState.proposedEventId?.toString?.() || null;
  if (primary) {
    excluded.add(primary);
  }
  const runnerEntry = weekState.voteBreakdown.find((entry) => {
    const eventId = entry.eventId.toString();
    return !excluded.has(eventId);
  });
  return runnerEntry?.eventId?.toString?.() || null;
}

function getAllowedPickEventIds(weekState) {
  const ids = [];
  for (const entry of weekState?.voteBreakdown || []) {
    const id = entry.eventId?.toString?.();
    if (id) {
      ids.push(id);
    }
  }
  for (const id of normalizeProposedEventIds(weekState)) {
    ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * Validate establish/replace set for confirm.
 * Returns { ok, eventIds } or { error, status, code }.
 */
function validateProposedEventIdsInput(rawIds, { maxPickSlots, allowedEventIds }) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return {
      error: 'eventIds must be a non-empty array.',
      status: 400,
      code: 'INVALID_EVENT_IDS',
    };
  }
  const cap = clampMaxPickSlots(maxPickSlots);
  if (rawIds.length > cap) {
    return {
      error: `At most ${cap} pick${cap === 1 ? '' : 's'} allowed for this crew.`,
      status: 400,
      code: 'TOO_MANY_PICKS',
    };
  }
  const normalized = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const id = raw?.toString?.() || String(raw);
    if (!id || seen.has(id)) {
      continue;
    }
    if (!allowedEventIds.includes(id)) {
      return {
        error: 'Each eventId must be one of the top crew candidates for this week.',
        status: 400,
        code: 'INVALID_CANDIDATE',
      };
    }
    seen.add(id);
    normalized.push(id);
  }
  if (normalized.length === 0) {
    return {
      error: 'eventIds must include at least one valid event.',
      status: 400,
      code: 'INVALID_EVENT_IDS',
    };
  }
  return { ok: true, eventIds: normalized };
}

module.exports = {
  PIVOT_CREW_MAX_PICK_SLOTS_CAP,
  PIVOT_CREW_MAX_PICK_SLOTS_DEFAULT,
  clampMaxPickSlots,
  resolveEffectiveMaxPickSlots,
  normalizeProposedEventIds,
  normalizeOriginalProposedEventIds,
  syncPrimaryProposedFields,
  resolveSwapTargetEventIdExcluding,
  getAllowedPickEventIds,
  validateProposedEventIdsInput,
};
