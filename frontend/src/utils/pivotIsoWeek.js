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
