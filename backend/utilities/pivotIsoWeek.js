/**
 * ISO 8601 week date string (YYYY-Www) for Pivot batchWeek fields.
 * @param {Date} [date]
 * @returns {string}
 */
function toIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/;

function isValidIsoWeek(value) {
  return typeof value === 'string' && ISO_WEEK_PATTERN.test(value.trim());
}

/**
 * UTC Date for the Monday 00:00 that starts the given ISO week.
 * @param {string} batchWeek - YYYY-Www
 * @returns {Date}
 */
function isoWeekToMondayUtc(batchWeek) {
  if (!isValidIsoWeek(batchWeek)) {
    throw new Error(`Invalid batchWeek "${batchWeek}" — expected YYYY-Www`);
  }

  const [, yearStr, weekStr] = batchWeek.match(/^(\d{4})-W(\d{2})$/);
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4IsoDay + 1 + (week - 1) * 7);
  return monday;
}

/**
 * [start, end) UTC range covering the given ISO week (Monday 00:00 → next Monday 00:00).
 * @param {string} batchWeek - YYYY-Www
 * @returns {{ start: Date, end: Date }}
 */
function isoWeekToUtcRange(batchWeek) {
  const start = isoWeekToMondayUtc(batchWeek);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function daysFromIsoMonday(dayOfWeek) {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function normalizeDropDayOfWeek(value, fallback = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(6, Math.max(0, Math.trunc(parsed)));
}

/**
 * Drop-aligned batch window: drop weekday through the following Wednesday
 * (day before the next week's drop). E.g. Thu Jul 9 – Wed Jul 15 for W28.
 */
function batchWeekToEventWindowUtcRange(batchWeek, dropDayOfWeek = 4) {
  const monday = isoWeekToMondayUtc(batchWeek);
  const day = normalizeDropDayOfWeek(dropDayOfWeek);
  const dropDate = new Date(monday);
  dropDate.setUTCDate(monday.getUTCDate() + daysFromIsoMonday(day));
  const lastDay = new Date(dropDate);
  lastDay.setUTCDate(dropDate.getUTCDate() + 6);
  const start = new Date(
    Date.UTC(dropDate.getUTCFullYear(), dropDate.getUTCMonth(), dropDate.getUTCDate(), 12),
  );
  const end = new Date(
    Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate(), 12),
  );
  return { start, end };
}

/** [dropDay 00:00 UTC, next dropDay 00:00 UTC) — used for interval queries. */
function batchWeekToDropCycleUtcRange(batchWeek, dropDayOfWeek = 4) {
  const monday = isoWeekToMondayUtc(batchWeek);
  const day = normalizeDropDayOfWeek(dropDayOfWeek);
  const start = new Date(monday);
  start.setUTCDate(monday.getUTCDate() + daysFromIsoMonday(day));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

function formatZonedCalendarDate(date, timeZone, options = {}) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...options,
    timeZone,
  });
}

/**
 * Human-readable drop-cycle range, e.g. "Jul 9 – Jul 15, 2026" (Thu → Wed).
 */
function formatBatchWeekRangeLabel(batchWeek, options = {}) {
  const dropDayOfWeek = normalizeDropDayOfWeek(options.dropDayOfWeek, 4);
  let range;
  try {
    range = batchWeekToEventWindowUtcRange(batchWeek, dropDayOfWeek);
  } catch {
    return null;
  }

  const timeZone = options.timeZone || 'UTC';
  const { start, end } = range;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = formatZonedCalendarDate(start, timeZone, {
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endLabel = formatZonedCalendarDate(end, timeZone, { year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

/** ISO week string from UTC calendar components (avoids local-timezone getters). */
function toIsoWeekUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * ISO week for a calendar date in an IANA timezone (Pivot city local date).
 * @param {Date} [date]
 * @param {string} [timeZone='UTC']
 */
function toIsoWeekInTimeZone(date = new Date(), timeZone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const localDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  return toIsoWeekUtc(localDate);
}

/**
 * Shift an ISO week string by a number of weeks (negative = earlier).
 * @param {string} batchWeek - YYYY-Www
 * @param {number} delta
 * @returns {string}
 */
function shiftIsoWeek(batchWeek, delta) {
  const monday = isoWeekToMondayUtc(batchWeek);
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  return toIsoWeekUtc(monday);
}

/**
 * Derive batchWeek (YYYY-Www) from an event's actual start datetime.
 * Uses the event's local calendar date via Date getters (same as toIsoWeek).
 * @param {Date|string|number|null|undefined} value
 * @returns {string|null}
 */
function batchWeekFromEventDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toIsoWeek(date);
}

/**
 * Resolve which batch week an ingest should land in.
 *
 * Default: ISO week of the event start (or first time-slot start).
 * Override: pass forceBatchWeek + batchWeek to pin every write to a week.
 * Fallback: batchWeek (when no event date) → current ISO week.
 *
 * @param {{
 *   forceBatchWeek?: boolean,
 *   batchWeek?: string|null,
 *   startTime?: Date|string|null,
 *   timeSlots?: Array<{ start_time?: Date|string }>,
 *   now?: Date,
 * }} options
 * @returns {{ batchWeek: string, source: 'forced'|'event-date'|'fallback'|'current' } | { error, status, code }}
 */
function resolveEventBatchWeek(options = {}) {
  const now = options.now || new Date();
  const forced = Boolean(options.forceBatchWeek);
  const explicit = typeof options.batchWeek === 'string' ? options.batchWeek.trim() : '';

  if (forced) {
    if (!explicit || !isValidIsoWeek(explicit)) {
      return {
        error: 'batchWeek is required when forceBatchWeek is set (YYYY-Www).',
        status: 400,
        code: 'BATCH_WEEK_REQUIRED',
      };
    }
    return { batchWeek: explicit, source: 'forced' };
  }

  const fromStart = batchWeekFromEventDate(options.startTime);
  if (fromStart) {
    return { batchWeek: fromStart, source: 'event-date' };
  }

  const slots = Array.isArray(options.timeSlots) ? options.timeSlots : [];
  for (const slot of slots) {
    const fromSlot = batchWeekFromEventDate(slot?.start_time);
    if (fromSlot) {
      return { batchWeek: fromSlot, source: 'event-date' };
    }
  }

  if (explicit) {
    if (!isValidIsoWeek(explicit)) {
      return {
        error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
        status: 400,
        code: 'INVALID_BATCH_WEEK',
      };
    }
    return { batchWeek: explicit, source: 'fallback' };
  }

  return { batchWeek: toIsoWeek(now), source: 'current' };
}

module.exports = {
  toIsoWeek,
  toIsoWeekInTimeZone,
  isValidIsoWeek,
  isoWeekToMondayUtc,
  isoWeekToUtcRange,
  batchWeekToEventWindowUtcRange,
  batchWeekToDropCycleUtcRange,
  formatBatchWeekRangeLabel,
  daysFromIsoMonday,
  normalizeDropDayOfWeek,
  shiftIsoWeek,
  batchWeekFromEventDate,
  resolveEventBatchWeek,
  ISO_WEEK_PATTERN,
};
