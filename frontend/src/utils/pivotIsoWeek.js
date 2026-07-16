/**
 * ISO 8601 week date string (YYYY-Www) for Pivot batchWeek fields.
 * @param {Date} [date]
 * @returns {string}
 */
export function toIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/;

export function isValidIsoWeek(value) {
  return typeof value === 'string' && ISO_WEEK_PATTERN.test(value.trim());
}

/** UTC Date for the Monday starting the given ISO week. */
export function isoWeekToMondayUtc(batchWeek) {
  const match = typeof batchWeek === 'string' && batchWeek.trim().match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4IsoDay + 1 + (week - 1) * 7);
  return monday;
}

/** Shift an ISO week string by delta weeks (negative = earlier); null on invalid input. */
export function shiftIsoWeek(batchWeek, delta) {
  const monday = isoWeekToMondayUtc(batchWeek);
  if (!monday) return null;
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** ISO week for a calendar date in an IANA timezone. */
export function toIsoWeekInTimeZone(date = new Date(), timeZone = 'UTC') {
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
  return toIsoWeek(localDate);
}

/** Derive YYYY-Www from an event start datetime; null if unparseable. */
export function batchWeekFromEventDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toIsoWeek(date);
}

export function formatEventWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Compact when label for pivot deck cards, e.g. `fri · 7pm`. */
export function formatPivotDeckWhen(startTime, endTime) {
  if (!startTime) return '';
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return '';

  const day = start.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const startClock = start
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '');

  if (!endTime) {
    return `${day} · ${startClock}`;
  }

  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) {
    return `${day} · ${startClock}`;
  }

  const endClock = end
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '');

  return `${day} · ${startClock} – ${endClock}`;
}

export function formatSnapshotAge(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * [start, end) UTC range for an ISO week (Monday 00:00 → next Monday 00:00).
 * @returns {{ start: Date, end: Date } | null}
 */
export function isoWeekToUtcRange(batchWeek) {
  const start = isoWeekToMondayUtc(batchWeek);
  if (!start) return null;
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
 * Drop-aligned batch window: drop weekday through the following Wednesday.
 */
export function batchWeekToEventWindowUtcRange(batchWeek, dropDayOfWeek = 4) {
  const monday = isoWeekToMondayUtc(batchWeek);
  if (!monday) return null;
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

/** @deprecated use batchWeekToEventWindowUtcRange */
export function batchWeekToDropCycleUtcRange(batchWeek, dropDayOfWeek = 4) {
  const monday = isoWeekToMondayUtc(batchWeek);
  if (!monday) return null;
  const day = normalizeDropDayOfWeek(dropDayOfWeek);
  const start = new Date(monday);
  start.setUTCDate(monday.getUTCDate() + daysFromIsoMonday(day));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

/**
 * Human-readable drop-cycle range, e.g. "Jul 9 – Jul 15, 2026" (Thu → Wed).
 */
export function formatBatchWeekRange(batchWeek, options = {}) {
  const dropDayOfWeek = normalizeDropDayOfWeek(options.dropDayOfWeek, 4);
  const range = batchWeekToEventWindowUtcRange(batchWeek, dropDayOfWeek);
  if (!range) return '—';
  const timeZone = options.timeZone || 'UTC';
  const { start, end } = range;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
  return `${startLabel} – ${endLabel}`;
}

/**
 * Human-readable Mon–Sun range for a batch week, e.g. "Jun 29 – Jul 5, 2026".
 * Prefer formatBatchWeekRange for Pivot ops UI (drop-aligned Thu–Wed).
 */
export function formatIsoWeekRange(batchWeek, options = {}) {
  const range = isoWeekToUtcRange(batchWeek);
  if (!range) return '—';
  const { start, end } = range;
  const lastDay = new Date(end.getTime() - 1);
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: options.timeZone || 'UTC',
  });
  const endLabel = lastDay.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: options.timeZone || 'UTC',
  });
  return `${startLabel} – ${endLabel}`;
}

/**
 * Derive live / curate / post-mortem anchor weeks from "now" and the current ISO week's drop instant.
 * Mirrors backend resolvePivotStageAnchors.
 *
 * @param {Date} [now]
 * @param {string|Date|null} currentWeekDropAt - drop instant for the current ISO week
 */
export function resolveCurationStageWeeks(now = new Date(), currentWeekDropAt = null) {
  const currentWeek = toIsoWeek(now);
  const dropMs = currentWeekDropAt ? new Date(currentWeekDropAt).getTime() : NaN;
  const dropPending = Number.isFinite(dropMs) && dropMs > now.getTime();

  const liveWeek = dropPending ? shiftIsoWeek(currentWeek, -1) : currentWeek;
  const curateWeek = shiftIsoWeek(liveWeek, 1);
  const postMortemWeek = shiftIsoWeek(liveWeek, -1);

  return {
    currentWeek,
    liveWeek,
    curateWeek,
    postMortemWeek,
    dropPending,
  };
}

/**
 * Which curation mode a batch week should use (mirrors backend resolveStageForBatchWeek).
 */
export function resolveCurationStageForWeek(batchWeek, stageWeeks) {
  if (!isValidIsoWeek(batchWeek) || !stageWeeks?.liveWeek) {
    return 'curate';
  }
  if (batchWeek === stageWeeks.liveWeek) return 'live';
  if (batchWeek < stageWeeks.liveWeek) return 'post-mortem';
  return 'curate';
}

export const CURATION_STAGE_META = {
  'post-mortem': {
    id: 'post-mortem',
    label: 'Post-mortem',
    description: 'This batch already dropped — review how it performed.',
  },
  live: {
    id: 'live',
    label: 'Live batch',
    description: 'This batch is in the feed — monitor interest rates and reach.',
  },
  curate: {
    id: 'curate',
    label: 'Curate',
    description: 'This batch is upcoming — crawl, tag, stage, and release.',
  },
};
