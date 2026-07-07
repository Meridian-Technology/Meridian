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

/** ISO week string from UTC calendar components (avoids local-timezone getters). */
function toIsoWeekUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

module.exports = {
  toIsoWeek,
  isValidIsoWeek,
  isoWeekToMondayUtc,
  isoWeekToUtcRange,
  shiftIsoWeek,
  ISO_WEEK_PATTERN,
};
