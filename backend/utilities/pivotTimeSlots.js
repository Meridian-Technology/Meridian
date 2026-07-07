/**
 * Normalize and serialize Pivot catalog showtimes stored on
 * `customFields.pivot.timeSlots` (movies, theatre, multi-performance events).
 */

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @param {unknown} rawSlots
 * @returns {Array<{ id: string, start_time: Date, end_time: Date | null, label: string | null }>}
 */
function normalizePivotTimeSlots(rawSlots) {
  if (!Array.isArray(rawSlots) || !rawSlots.length) {
    return [];
  }

  const slots = [];
  const seenIds = new Set();

  for (const raw of rawSlots) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const id = trimString(raw.id);
    const start = parseDate(raw.start_time ?? raw.startTime);
    if (!id || !start || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    const end = parseDate(raw.end_time ?? raw.endTime);
    const label = trimString(raw.label) || null;

    slots.push({
      id,
      start_time: start,
      end_time: end,
      label,
    });
  }

  slots.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
  return slots;
}

function resolveTimeSlotLabel(slot) {
  if (slot.label) {
    return slot.label;
  }

  return slot.start_time
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '');
}

/**
 * @param {Array<{ id: string, start_time: Date, end_time: Date | null, label: string | null }>} slots
 * @param {Map<string, { friendsGoing: object[], friendsGoingCount: number }>} [socialBySlotId]
 */
function serializePivotTimeSlots(slots, socialBySlotId = new Map()) {
  return slots.map((slot) => {
    const social = socialBySlotId.get(slot.id) || {
      friendsGoing: [],
      friendsGoingCount: 0,
    };

    return {
      id: slot.id,
      start_time: slot.start_time.toISOString(),
      ...(slot.end_time ? { end_time: slot.end_time.toISOString() } : {}),
      label: resolveTimeSlotLabel(slot),
      friendsGoing: social.friendsGoing,
      friendsGoingCount: social.friendsGoingCount,
    };
  });
}

function eventHasTimeSlots(pivotMeta) {
  return normalizePivotTimeSlots(pivotMeta?.timeSlots).length > 0;
}

function findTimeSlotById(pivotMeta, timeSlotId) {
  const key = trimString(timeSlotId);
  if (!key) {
    return null;
  }
  return normalizePivotTimeSlots(pivotMeta?.timeSlots).find((slot) => slot.id === key) || null;
}

function isTimeSlotUpcoming(slot, now = new Date()) {
  const end = slot.end_time || slot.start_time;
  return end > now;
}

function isUpcomingWithTimeSlots(pivotMeta, now = new Date()) {
  const slots = normalizePivotTimeSlots(pivotMeta?.timeSlots);
  if (!slots.length) {
    return null;
  }
  return slots.some((slot) => isTimeSlotUpcoming(slot, now));
}

function resolveEventEarliestStart(pivotMeta, fallbackStart) {
  const slots = normalizePivotTimeSlots(pivotMeta?.timeSlots);
  if (!slots.length) {
    return fallbackStart;
  }
  return slots[0].start_time;
}

function resolveEventLatestEnd(pivotMeta, fallbackEnd) {
  const slots = normalizePivotTimeSlots(pivotMeta?.timeSlots);
  if (!slots.length) {
    return fallbackEnd;
  }

  let latest = null;
  for (const slot of slots) {
    const candidate = slot.end_time || slot.start_time;
    if (!latest || candidate > latest) {
      latest = candidate;
    }
  }
  return latest;
}

module.exports = {
  normalizePivotTimeSlots,
  serializePivotTimeSlots,
  resolveTimeSlotLabel,
  eventHasTimeSlots,
  findTimeSlotById,
  isTimeSlotUpcoming,
  isUpcomingWithTimeSlots,
  resolveEventEarliestStart,
  resolveEventLatestEnd,
};
