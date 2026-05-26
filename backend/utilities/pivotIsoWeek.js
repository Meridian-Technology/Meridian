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

module.exports = {
  toIsoWeek,
  isValidIsoWeek,
  ISO_WEEK_PATTERN,
};
