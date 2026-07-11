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
  // Thursday of the shifted week pins the ISO year.
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

/**
 * Human-readable Mon–Sun range for a batch week, e.g. "Jun 29 – Jul 5, 2026".
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
 * Mirrors backend resolveRunBatchWeek next-drop logic.
 *
 * @param {Date} [now]
 * @param {string|Date|null} currentWeekDropAt - drop instant for the current ISO week
 */
export function resolveCurationStageWeeks(now = new Date(), currentWeekDropAt = null) {
  const currentWeek = toIsoWeek(now);
  const dropMs = currentWeekDropAt ? new Date(currentWeekDropAt).getTime() : NaN;
  const dropPending = Number.isFinite(dropMs) && dropMs > now.getTime();

  const liveWeek = dropPending ? shiftIsoWeek(currentWeek, -1) : currentWeek;
  const curateWeek = dropPending ? currentWeek : shiftIsoWeek(currentWeek, 1);
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
 * Which curation mode a batch week should use, based on its date vs the live week.
 * - past of live → post-mortem
 * - equal to live → live monitoring
 * - after live → curate (upcoming)
 *
 * @param {string} batchWeek
 * @param {{ liveWeek: string }} stageWeeks
 * @returns {'post-mortem'|'live'|'curate'}
 */
export function resolveCurationStageForWeek(batchWeek, stageWeeks) {
  if (!isValidIsoWeek(batchWeek) || !stageWeeks?.liveWeek) {
    return 'curate';
  }
  if (batchWeek === stageWeeks.liveWeek) return 'live';
  if (batchWeek > stageWeeks.liveWeek) return 'curate';
  return 'post-mortem';
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
