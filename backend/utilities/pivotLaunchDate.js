/**
 * A Pivot city's launch date (`tenant.pivotLaunchDate`, calendar day YYYY-MM-DD).
 * Growth metrics start counting from the drop week that contains it, so
 * pilot/beta activity before launch doesn't skew cohorts and trends.
 */
const LAUNCH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validate a launch date from a tenant update.
 * `undefined` → leave unchanged; `null`/'' → clear; otherwise YYYY-MM-DD.
 * @returns {{ value?: string|null|undefined, error?: string }}
 */
function normalizePivotLaunchDate(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw === null || raw === '') return { value: null };
  const text = String(raw).trim();
  const match = text.match(LAUNCH_DATE_PATTERN);
  if (!match) return { error: 'pivotLaunchDate must be YYYY-MM-DD.' };
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return { error: 'pivotLaunchDate must be a real calendar date.' };
  }
  return { value: text };
}

/** Midnight UTC of a stored launch date, or null when unset/invalid. */
function launchDateToUtc(value) {
  const normalized = normalizePivotLaunchDate(value);
  if (normalized.error || !normalized.value) return null;
  return new Date(`${normalized.value}T00:00:00Z`);
}

module.exports = {
  normalizePivotLaunchDate,
  launchDateToUtc,
};
