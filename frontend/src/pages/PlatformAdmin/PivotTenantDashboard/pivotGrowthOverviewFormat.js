/** Formatting for the Growth → Overview panel. Weeks arrive as `startDate` YYYY-MM-DD (UTC). */

const DAY_MS = 24 * 60 * 60 * 1000;

// Retention cells are Just Go orange (accent #FF4F1F, Meridian-Mobile
// pivotTheme.ts) at an opacity that grows with the rate. 0% keeps a faint tint
// so the cell still reads as a cell. Ink text everywhere except a solid (100%)
// cell, which takes white text.
const RETENTION_RGB = '255, 79, 31';
const RETENTION_MIN_ALPHA = 0.08;

function parseDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Sep 24" */
export function formatWeekStart(startDate) {
  const date = parseDay(startDate);
  return date ? shortDate(date) : '—';
}

/** "Sep 24, 2026" for a YYYY-MM-DD calendar day. */
export function formatCalendarDate(value) {
  const date = parseDay(value);
  return date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : '—';
}

/** "Sep 24 – Sep 30" — a drop week runs seven days from its drop day. */
export function formatWeekRange(startDate) {
  const date = parseDay(startDate);
  if (!date) return '—';
  return `${shortDate(date)} – ${shortDate(new Date(date.getTime() + 6 * DAY_MS))}`;
}

/** Whole percent, or one decimal under 10% so small rates don't collapse to 0%. */
export function formatPercent(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  const pct = Number(rate) * 100;
  if (pct > 0 && pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function formatRatio(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

/**
 * Week-over-week change for a stat tile.
 * kind "count" → relative % change; "rate" → percentage points; "ratio" → absolute.
 */
export function describeDelta(value, previous, kind = 'count') {
  if (value == null || previous == null) return null;
  const current = Number(value);
  const prior = Number(previous);
  if (Number.isNaN(current) || Number.isNaN(prior)) return null;

  let amount;
  let text;
  if (kind === 'rate') {
    amount = Math.round((current - prior) * 100);
    text = `${Math.abs(amount)} pts`;
  } else if (kind === 'ratio') {
    amount = Math.round((current - prior) * 100) / 100;
    text = Math.abs(amount).toFixed(2);
  } else {
    if (!prior) return current ? { direction: 'up', text: 'new', label: 'up from 0' } : null;
    amount = Math.round(((current - prior) / prior) * 100);
    text = `${Math.abs(amount)}%`;
  }

  if (!amount) return { direction: 'flat', text: 'flat', label: 'no change' };
  const direction = amount > 0 ? 'up' : 'down';
  return { direction, text, label: `${direction} ${text}` };
}

/** Background and ink for a retention cell. */
export function retentionCellColors(rate) {
  if (rate == null) return null;
  const clamped = Math.min(1, Math.max(0, Number(rate)));
  const alpha = Math.round((RETENTION_MIN_ALPHA + (1 - RETENTION_MIN_ALPHA) * clamped) * 100) / 100;
  return {
    background: `rgba(${RETENTION_RGB}, ${alpha})`,
    color: alpha >= 1 ? '#ffffff' : '#1a1714',
  };
}
