/**
 * Daily series window for creator insights.
 *
 * UTC day keys with no timezone option, matching the house pattern in the analytics routes
 * (`$dateToString` with `%Y-%m-%d` and no `timezone`). A creator's chart is a 14-day trend, not a
 * billing report, so a fixed UTC grid is worth more than per-viewer local days: it keeps the
 * buckets stable no matter who reads them.
 */

const CREATOR_DAILY_WINDOW_DAYS = 14;

/** `YYYY-MM-DD` for the UTC day a timestamp falls in. */
function toUtcDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The inclusive window to aggregate over, plus every day key in it.
 *
 * @param {number} [days] Window length, oldest day first.
 * @param {Date} [now] Clock, injectable for tests.
 * @returns {{ startDate: Date, endDate: Date, keys: string[] }}
 */
function buildDailyWindow(days = CREATOR_DAILY_WINDOW_DAYS, now = new Date()) {
  const span = Number.isInteger(days) && days > 0 ? days : CREATOR_DAILY_WINDOW_DAYS;
  const endDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (span - 1)),
  );

  const keys = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = new Date(startDate.getTime());
    day.setUTCDate(startDate.getUTCDate() + offset);
    keys.push(toUtcDateKey(day));
  }

  return { startDate, endDate, keys };
}

function rowsByDate(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (row && typeof row._id === 'string') map.set(row._id, row);
  });
  return map;
}

/**
 * Zero-fill the window so the client can chart it without gap handling. Days with no activity are
 * real zeros, not missing points — a flat stretch is information.
 *
 * @param {string[]} keys Day keys from `buildDailyWindow`
 * @param {object} buckets
 * @param {Array} [buckets.viewRows] `{ _id: dayKey, views }`
 * @param {Array} [buckets.intentRows] `{ _id: dayKey, interested, registered }`
 * @returns {Array<{ date: string, views: number, interested: number, registered: number }>}
 */
function zeroFillDailySeries(keys, { viewRows, intentRows } = {}) {
  const views = rowsByDate(viewRows);
  const intents = rowsByDate(intentRows);

  return (Array.isArray(keys) ? keys : []).map((date) => {
    const intentRow = intents.get(date);
    return {
      date,
      views: views.get(date)?.views ?? 0,
      interested: intentRow?.interested ?? 0,
      registered: intentRow?.registered ?? 0,
    };
  });
}

module.exports = {
  CREATOR_DAILY_WINDOW_DAYS,
  buildDailyWindow,
  toUtcDateKey,
  zeroFillDailySeries,
};
