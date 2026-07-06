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
