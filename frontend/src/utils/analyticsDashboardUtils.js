import {
    eachDayOfInterval,
    endOfMonth,
    format,
    isSameMonth,
    parseISO,
    startOfMonth,
    subMonths
} from 'date-fns';

/**
 * Shared formatters and helpers for platform analytics dashboards
 * (Admin General + Feature Admin Analytics).
 */

export function formatAnalyticsNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat().format(num);
}

export function formatAnalyticsDuration(seconds) {
    if (!seconds && seconds !== 0) return '0s';
    const s = Math.round(Number(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

export function formatDeltaPercent(delta) {
    if (delta === null || delta === undefined || Number.isNaN(delta)) return '—';
    const pct = Math.round(delta * 100);
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct}%`;
}

/**
 * Merge timeseries series objects into Chart.js-friendly labels + datasets.
 * @param {Record<string, Array<{ bucket: string, value: number }>>} series
 */
export function buildTimeseriesChartData(series, colors) {
    const palette = colors || ['#45A1FC', '#8052FB', '#2BB673', '#FA756D', '#f59e0b'];
    if (!series || typeof series !== 'object') {
        return { labels: [], datasets: [] };
    }
    const allBuckets = new Set();
    Object.values(series).forEach((rows) => {
        if (Array.isArray(rows)) rows.forEach((r) => r?.bucket && allBuckets.add(r.bucket));
    });
    const labels = [...allBuckets].sort();
    const keys = Object.keys(series).filter((k) => Array.isArray(series[k]) && series[k].length);
    const datasets = keys.map((key, i) => ({
        label: key.replace(/_/g, ' '),
        data: labels.map((lb) => {
            const row = series[key].find((r) => r.bucket === lb);
            return row ? row.value : 0;
        }),
        borderColor: palette[i % palette.length],
        backgroundColor: 'transparent',
        tension: 0.2,
        fill: false,
        pointRadius: 0,
        borderWidth: 2
    }));
    return { labels, datasets };
}

/**
 * Axis / tick label for a timeseries bucket string from the API.
 * @param {'hour'|'day'|'week'} granularity
 */
export function formatBucketAxisLabel(bucket, granularity) {
    if (bucket == null || bucket === '') return '';
    if (granularity === 'hour') {
        const d = new Date(bucket);
        if (Number.isNaN(d.getTime())) return String(bucket).slice(11, 16);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (granularity === 'week') {
        return String(bucket).replace(/^(\d{4})-W(\d+)$/, (_, y, w) => `${y} W${w}`);
    }
    const d = new Date(bucket);
    if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return String(bucket).slice(0, 10);
}

/**
 * Build series config for @visx/xychart (e.g. EventDashboardChart) with optional comparison line.
 * Uses the same x (bucket key) for both lines so the band scale aligns.
 * Comparison uses the same stroke color as the primary series with a dashed stroke; both get area fills.
 */
export function buildComparisonVisxSeries(
    currentRows,
    previousRows,
    color,
    labels = {},
    options = {}
) {
    const labelThis = labels.thisPeriod || 'This period';
    const labelCompare = labels.compare || 'Comparison';
    const compareStrokeDasharray = options.compareStrokeDasharray ?? '5 5';
    const compareStrokeOpacity =
        typeof options.compareStrokeOpacity === 'number' ? options.compareStrokeOpacity : 0.6;
    const primaryFillOpacity = options.primaryFillOpacity ?? 0.36;
    const compareFillOpacity = options.compareFillOpacity ?? 0.24;
    const excludePreviousPeriodEnd = options.excludePreviousPeriodEnd ?? true;

    if (!currentRows?.length) {
        return { series: [] };
    }

    if (!previousRows?.length) {
        const data = currentRows.map((r) => ({ x: r.bucket, y: r.value }));
        return {
            series: [{ data, color, label: labelThis, fillOpacity: primaryFillOpacity }]
        };
    }

    const len = Math.min(currentRows.length, previousRows.length);
    const cur = [];
    const prev = [];
    for (let i = 0; i < len; i++) {
        const x = currentRows[i].bucket;
        cur.push({ x, y: currentRows[i].value });
        if (excludePreviousPeriodEnd && i === len - 1) continue;
        prev.push({ x, y: previousRows[i]?.value ?? 0 });
    }

    return {
        series: [
            { data: cur, color, label: labelThis, fillOpacity: primaryFillOpacity },
            {
                data: prev,
                color,
                label: labelCompare,
                strokeDasharray: compareStrokeDasharray,
                strokeOpacity: compareStrokeOpacity,
                fillOpacity: compareFillOpacity
            }
        ]
    };
}

/**
 * Ordered `yyyy-MM-dd` keys for every calendar day in the month containing `anchorDate`.
 */
export function fullDayDomainForCalendarMonth(anchorDate) {
    return eachDayOfInterval({
        start: startOfMonth(anchorDate),
        end: endOfMonth(anchorDate)
    }).map((d) => format(d, 'yyyy-MM-dd'));
}

/**
 * Month view (day buckets): full month on the x-axis. Primary “this period” only includes days
 * through today when viewing the current month. Comparison uses one point per calendar day for
 * the whole month (same x labels as the domain), with y from `compareSubMonths` earlier
 * (1 = adjacent month, 12 = year-ago same calendar day).
 */
export function buildComparisonVisxSeriesForCalendarMonthView(
    anchorDate,
    currentRows,
    previousRows,
    color,
    labels = {},
    options = {}
) {
    const labelThis = labels.thisPeriod || 'This period';
    const labelCompare = labels.compare || 'Comparison';
    const compareStrokeDasharray = options.compareStrokeDasharray ?? '5 5';
    const compareStrokeOpacity =
        typeof options.compareStrokeOpacity === 'number' ? options.compareStrokeOpacity : 0.6;
    const primaryFillOpacity = options.primaryFillOpacity ?? 0.36;
    const compareFillOpacity = options.compareFillOpacity ?? 0.24;
    const compareSubMonths = typeof options.compareSubMonths === 'number' ? options.compareSubMonths : 1;
    const excludePreviousPeriodEnd = options.excludePreviousPeriodEnd ?? true;

    const fullDomain = fullDayDomainForCalendarMonth(anchorDate);
    const monthStart = fullDomain[0];
    const monthEnd = fullDomain[fullDomain.length - 1];
    const now = new Date();
    const viewingCurrentMonth = isSameMonth(anchorDate, now);
    const todayIso = format(now, 'yyyy-MM-dd');
    const cutoffIso = viewingCurrentMonth && todayIso < monthEnd ? todayIso : monthEnd;

    const curBy = new Map((currentRows || []).map((r) => [r.bucket, Number(r.value) || 0]));
    const curInRange = fullDomain
        .filter((x) => x >= monthStart && x <= cutoffIso)
        .map((x) => ({ bucket: x, value: curBy.get(x) ?? 0 }));

    if (!curInRange.length) {
        return { series: [], xDomain: undefined, showEndGlyph: false };
    }

    const prevBy = new Map((previousRows || []).map((r) => [r.bucket, r.value]));
    const prevEnd = (previousRows || []).length
        ? (previousRows || [])
              .map((r) => r?.bucket)
              .filter(Boolean)
              .sort()
              .slice(-1)[0]
        : null;

    const cur = curInRange.map((r) => ({ x: r.bucket, y: Number(r.value) || 0 }));

    const buildPrevAcrossFullMonth = () =>
        fullDomain
            .map((x) => {
                const prevKey = format(subMonths(parseISO(`${x}T12:00:00`), compareSubMonths), 'yyyy-MM-dd');
                if (excludePreviousPeriodEnd && prevEnd && prevKey === prevEnd) {
                    return null;
                }
                if (!prevBy.has(prevKey)) {
                    return null;
                }
                return { x, y: prevBy.get(prevKey) };
            })
            .filter(Boolean);

    if (!previousRows?.length) {
        return {
            series: [{ data: cur, color, label: labelThis, fillOpacity: primaryFillOpacity }],
            xDomain: fullDomain,
            showEndGlyph: viewingCurrentMonth && cur.length > 0
        };
    }

    return {
        series: [
            { data: cur, color, label: labelThis, fillOpacity: primaryFillOpacity },
            {
                data: buildPrevAcrossFullMonth(),
                color,
                label: labelCompare,
                strokeDasharray: compareStrokeDasharray,
                strokeOpacity: compareStrokeOpacity,
                fillOpacity: compareFillOpacity
            }
        ],
        xDomain: fullDomain,
        showEndGlyph: viewingCurrentMonth && cur.length > 0
    };
}
