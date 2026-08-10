/**
 * Pure geometry and arithmetic for the Insights tab. No copy and no React here so the funnel maths
 * and the chart paths can be asserted directly.
 */

/**
 * Total page views.
 *
 * `EventAnalytics.views` counts logged-in views only — anonymous ones land in `anonymousViews` — so
 * anything user-facing has to add them. The daily series counts every `viewHistory` entry, so this
 * is what keeps the funnel total and the chart agreeing.
 */
export function totalViewCount(analytics) {
  return (analytics?.views ?? 0) + (analytics?.anonymousViews ?? 0);
}

/** New positive intent for a day: both series are first-touch, so they add up. */
export function dailyInterestCount(day) {
  return (day?.interested ?? 0) + (day?.registered ?? 0);
}

/**
 * Funnel steps, ordered, each with its conversion off the previous step.
 *
 * Values mirror the ops event-performance row field for field: `interested` is ops'
 * `interestedTotal` (interested + registered, everyone who showed positive intent), and `tapped`
 * counts *people* who opened the ticket link (`externalOpenUsers`) rather than total taps, so a
 * conversion cannot exceed 100% just because someone tapped twice.
 *
 * @returns {Array<{ key: string, value: number, conversion: number|null }>}
 */
export function buildIntentFunnel(stats) {
  const intents = stats?.intents;
  const interested = (intents?.interested ?? 0) + (intents?.registered ?? 0);

  const values = [
    { key: 'views', value: totalViewCount(stats?.analytics) },
    { key: 'interested', value: interested },
    { key: 'tapped', value: intents?.externalOpenUsers ?? 0 },
    { key: 'registered', value: intents?.registered ?? 0 },
  ];

  return values.map((step, index) => {
    const previous = index > 0 ? values[index - 1].value : null;
    return {
      ...step,
      conversion: previous ? step.value / previous : null,
    };
  });
}

/** Widest bar wins; the rest are relative to it. */
export function funnelBarWidth(value, steps) {
  const max = Math.max(1, ...steps.map((step) => step.value ?? 0));
  return Math.max(2, ((value ?? 0) / max) * 100);
}

export function formatConversion(fraction) {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  return `${Math.round(fraction * 100)}%`;
}

function buildPath(values, max, { padding, innerWidth, innerHeight }) {
  const lastIndex = values.length - 1 || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / lastIndex) * innerWidth;
    const y = padding + innerHeight - (value / max) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(' L ')}`;
}

/**
 * Geometry for the dual-series chart: a views area behind a new-interest line.
 *
 * Hand-rolled rather than pulled from the visx stack the campus dashboard uses — two static series
 * with no tooltips or axes do not justify the dependency, and the Just Go registers want plain
 * accent/ticker strokes rather than themed chart chrome.
 *
 * **The series are scaled independently.** Views outrun interest by an order of magnitude, so a
 * shared axis would flatten the interest line onto the floor. The caller must label each series with
 * its own peak, which `peakViews` / `peakInterest` provide — a dual scale that isn't labelled
 * invites the reader to compare heights that aren't comparable.
 *
 * @returns {null|{ width, height, areaPath, linePath, peakViews, peakInterest, hasSignal }}
 */
export function buildInsightsChart(daily, options = {}) {
  const { width = 640, height = 160, padding = 6 } = options;
  const series = Array.isArray(daily) ? daily : [];
  if (series.length < 2) return null;

  const views = series.map((day) => day?.views ?? 0);
  const interest = series.map((day) => dailyInterestCount(day));
  const peakViews = Math.max(...views, 0);
  const peakInterest = Math.max(...interest, 0);

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const geometry = { padding, innerWidth, innerHeight };

  const viewsLine = buildPath(views, Math.max(peakViews, 1), geometry);
  const floor = (padding + innerHeight).toFixed(2);

  return {
    width,
    height,
    areaPath: `${viewsLine} L ${(padding + innerWidth).toFixed(2)},${floor} L ${padding.toFixed(2)},${floor} Z`,
    linePath: buildPath(interest, Math.max(peakInterest, 1), geometry),
    peakViews,
    peakInterest,
    hasSignal: peakViews > 0 || peakInterest > 0,
  };
}

/** Window bounds for the chart caption. */
export function dailyWindowLabel(daily) {
  const series = Array.isArray(daily) ? daily : [];
  if (!series.length) return null;
  return { first: series[0]?.date || null, last: series[series.length - 1]?.date || null };
}

export function sumDaily(daily, pick) {
  return (Array.isArray(daily) ? daily : []).reduce((total, day) => total + (pick(day) || 0), 0);
}
