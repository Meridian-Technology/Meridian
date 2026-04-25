import React from 'react';
import {
    XYChart,
    Axis,
    Grid,
    AreaSeries,
    LineSeries,
    GlyphSeries,
    buildChartTheme,
    Tooltip,
    DataContext,
    TooltipContext
} from '@visx/xychart';
import { curveMonotoneX } from '@visx/curve';
import '../../EventDashboard.scss';

const defaultAccessors = {
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
};

const chartTheme = buildChartTheme({
    colors: ['#22c55e', '#94a3b8'],
    backgroundColor: 'transparent',
    gridColor: 'rgba(0, 0, 0, 0.14)',
    gridColorDark: 'rgba(0, 0, 0, 0.2)',
    tickLength: 0,
});

function bandCenterX(xScale, bandwidth, xCat) {
    return Number(xScale(xCat)) + bandwidth / 2;
}

const CHART_BAND_PADDING_INNER = 0.12;
const CHART_BAND_PADDING_OUTER = 0;

function centerRatioForBandIndex(index, total, paddingInner = CHART_BAND_PADDING_INNER, paddingOuter = CHART_BAND_PADDING_OUTER) {
    if (!Number.isFinite(index) || total <= 0) return null;
    const denominator = total - paddingInner + 2 * paddingOuter;
    if (denominator <= 0) return null;
    return (index + paddingOuter + (1 - paddingInner) / 2) / denominator;
}

function nearestBandIndexForLocalX(localX, width, total, paddingInner = CHART_BAND_PADDING_INNER, paddingOuter = CHART_BAND_PADDING_OUTER) {
    if (!Number.isFinite(localX) || !Number.isFinite(width) || width <= 0 || total <= 0) return null;
    const denominator = total - paddingInner + 2 * paddingOuter;
    if (denominator <= 0) return null;
    const stepPx = width / denominator;
    const raw = localX / stepPx - paddingOuter - (1 - paddingInner) / 2;
    return Math.max(0, Math.min(total - 1, Math.round(raw)));
}

/** Pixel y along straight segments between band centers (smooth x vs snapped tooltip values). */
function interpolateLineYAtPixelX(pxX, sortedPoints, xScale, yScale, xAcc, yAcc, bandwidth) {
    if (!sortedPoints?.length || !xScale || !yScale) return null;
    const centers = sortedPoints.map((d) => bandCenterX(xScale, bandwidth, xAcc(d)));
    const ys = sortedPoints.map((d) => Number(yScale(yAcc(d))));
    if (!Number.isFinite(centers[0]) || !Number.isFinite(ys[0])) return null;

    if (pxX <= centers[0]) {
        return { cx: pxX, cy: ys[0] };
    }
    const last = centers.length - 1;
    if (pxX >= centers[last]) {
        return { cx: pxX, cy: ys[last] };
    }
    for (let i = 0; i < last; i += 1) {
        const p0 = centers[i];
        const p1 = centers[i + 1];
        if (pxX >= p0 && pxX <= p1) {
            const t = p1 === p0 ? 0 : (pxX - p0) / (p1 - p0);
            return { cx: pxX, cy: ys[i] + t * (ys[i + 1] - ys[i]) };
        }
    }
    return null;
}

function SmoothHoverDots({ isMultiSeries, series, data, xAccessor, yAccessor, color }) {
    const { xScale, yScale } = React.useContext(DataContext) || {};
    const tooltipCtx = React.useContext(TooltipContext);

    if (!tooltipCtx?.tooltipOpen || xScale == null || yScale == null) return null;
    const pxX = tooltipCtx.tooltipLeft;
    if (pxX == null || Number.isNaN(Number(pxX))) return null;

    const bw = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() : 0;

    const renderDot = (sorted, lineColor, fillOpacity = 1) => {
        const pos = interpolateLineYAtPixelX(pxX, sorted, xScale, yScale, xAccessor, yAccessor, bw);
        if (!pos || !Number.isFinite(pos.cx) || !Number.isFinite(pos.cy)) return null;
        return (
            <circle
                cx={pos.cx}
                cy={pos.cy}
                r={4}
                fill={lineColor}
                fillOpacity={fillOpacity}
                stroke="#fff"
                strokeWidth={2}
                paintOrder="fill"
            />
        );
    };

    if (isMultiSeries && series?.length) {
        return (
            <g className="event-dashboard-chart__hover-dots" style={{ pointerEvents: 'none' }}>
                {series.map((s, i) => {
                    if (!s.data?.length) return null;
                    const sorted = [...s.data].sort((a, b) => {
                        const xa = xAccessor(a);
                        const xb = xAccessor(b);
                        return xa < xb ? -1 : xa > xb ? 1 : 0;
                    });
                    const fillOpacity = typeof s.strokeOpacity === 'number' ? s.strokeOpacity : 1;
                    const dot = renderDot(sorted, s.color, fillOpacity);
                    return dot ? <g key={i}>{dot}</g> : null;
                })}
            </g>
        );
    }

    if (data?.length) {
        const sorted = [...data].sort((a, b) => {
            const xa = xAccessor(a);
            const xb = xAccessor(b);
            return xa < xb ? -1 : xa > xb ? 1 : 0;
        });
        const dot = renderDot(sorted, color, 1);
        return dot ? <g className="event-dashboard-chart__hover-dots">{dot}</g> : null;
    }

    return null;
}

function SyncedHoverOverlay({
    syncId,
    hoverSyncSignal,
    xValues,
    xAccessor,
    yAccessor,
    xTickFormat,
    isMultiSeries,
    series,
    data,
    color,
}) {
    const { xScale, yScale } = React.useContext(DataContext) || {};
    if (!xScale || !yScale || !hoverSyncSignal || hoverSyncSignal.sourceId === syncId || hoverSyncSignal.type !== 'move') {
        return null;
    }
    if (!xValues?.length) return null;

    const bw = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() : 0;
    const xRange = xScale.range?.() || [];
    if (xRange.length < 2) return null;
    const xLeft = Math.min(...xRange);
    const xRight = Math.max(...xRange);
    const ratio = Math.max(0, Math.min(1, Number(hoverSyncSignal.ratio) || 0));
    // Keep mirrored line smooth by following the shared normalized x-position.
    const pxX = xLeft + ratio * (xRight - xLeft);
    if (!Number.isFinite(pxX)) return null;

    // Keep mirrored values notched to the nearest bucket for consistent numbers.
    let idx = xValues.indexOf(hoverSyncSignal.xValue);
    if (idx < 0) {
        let nearestIdx = 0;
        let nearestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < xValues.length; i += 1) {
            const center = bandCenterX(xScale, bw, xValues[i]);
            const dist = Math.abs(center - pxX);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }
        idx = nearestIdx;
    }
    const xVal = xValues[idx];
    if (xVal == null) return null;

    const yRange = yScale.range?.() || [];
    if (!yRange.length) return null;
    const yTop = Math.min(...yRange);
    const yBottom = Math.max(...yRange);

    const rows = isMultiSeries
        ? (series || []).map((s) => {
              const datum = s?.data?.find((d) => xAccessor(d) === xVal);
              return datum
                  ? {
                        label: s?.label || 'Series',
                        value: Math.round(datum.y),
                        color: s?.color || '#94a3b8',
                    }
                  : null;
          }).filter(Boolean)
        : (() => {
              const datum = (data || []).find((d) => xAccessor(d) === xVal);
              return datum ? [{ label: 'Value', value: Math.round(datum.y), color }] : [];
          })();
    const syncedDots = isMultiSeries
        ? (series || []).map((s, i) => {
              if (!s?.data?.length) return null;
              const sorted = [...s.data].sort((a, b) => {
                  const xa = xAccessor(a);
                  const xb = xAccessor(b);
                  return xa < xb ? -1 : xa > xb ? 1 : 0;
              });
              const pos = interpolateLineYAtPixelX(pxX, sorted, xScale, yScale, xAccessor, yAccessor, bw);
              if (!pos || !Number.isFinite(pos.cy)) return null;
              const fillOpacity = typeof s?.strokeOpacity === 'number' ? s.strokeOpacity : 1;
              return (
                  <circle
                      key={`synced-dot-${i}`}
                      cx={pxX}
                      cy={pos.cy}
                      r={4}
                      fill={s?.color || '#94a3b8'}
                      fillOpacity={fillOpacity}
                      stroke="#fff"
                      strokeWidth={2}
                      paintOrder="fill"
                  />
              );
          })
        : (() => {
              if (!data?.length) return [];
              const sorted = [...data].sort((a, b) => {
                  const xa = xAccessor(a);
                  const xb = xAccessor(b);
                  return xa < xb ? -1 : xa > xb ? 1 : 0;
              });
              const pos = interpolateLineYAtPixelX(pxX, sorted, xScale, yScale, xAccessor, yAccessor, bw);
              if (!pos || !Number.isFinite(pos.cy)) return [];
              return [
                  <circle
                      key="synced-dot-single"
                      cx={pxX}
                      cy={pos.cy}
                      r={4}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={2}
                      paintOrder="fill"
                  />
              ];
          })();

    const dateLabel = xTickFormat ? xTickFormat(xVal) : String(xVal);
    const tooltipWidth = 180;
    const tooltipHeight = 30 + rows.length * 22;
    const tooltipX = Math.max(xLeft + 6, Math.min(pxX + 12, xRight - tooltipWidth - 6));
    const tooltipY = yTop + 8;

    return (
        <g className="event-dashboard-chart__synced-overlay" style={{ pointerEvents: 'none' }}>
            <line
                x1={pxX}
                x2={pxX}
                y1={yTop}
                y2={yBottom}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeOpacity={1}
                strokeDasharray="1 4"
                strokeLinecap="round"
            />
            {syncedDots}
            <foreignObject x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
                <div className="rsvp-chart-tooltip">
                    <div className="rsvp-chart-tooltip-date">{dateLabel}</div>
                    {rows.map((r, i) => (
                        <div key={`${r.label}-${i}`} className="rsvp-chart-tooltip-row">
                            <span
                                className="rsvp-chart-tooltip-dot rsvp-chart-tooltip-dot-actual"
                                style={{ background: r.color }}
                            />
                            {r.label}: {r.value}
                        </div>
                    ))}
                </div>
            </foreignObject>
        </g>
    );
}

function HoverSyncReporter({ syncId, onHoverSyncChange, xAccessor, isPointerInsideRef }) {
    const { xScale } = React.useContext(DataContext) || {};
    const tooltipCtx = React.useContext(TooltipContext);
    const lastEmittedRef = React.useRef({ xValue: null, ratio: null, tooltipOpen: false });

    React.useEffect(() => {
        if (!syncId || !onHoverSyncChange || !xScale || !tooltipCtx?.tooltipOpen || !isPointerInsideRef?.current) {
            lastEmittedRef.current = { xValue: null, ratio: null, tooltipOpen: false };
            return;
        }
        const tooltipLeft = Number(tooltipCtx.tooltipLeft);
        if (!Number.isFinite(tooltipLeft)) return;
        const range = xScale.range?.() || [];
        if (range.length < 2) return;
        const xLeft = Math.min(...range);
        const xRight = Math.max(...range);
        const width = xRight - xLeft;
        if (width <= 0) return;

        const nearestDatum = tooltipCtx.tooltipData?.nearestDatum?.datum;
        const datumByKey = tooltipCtx.tooltipData?.datumByKey;
        const fallbackDatum = datumByKey ? Object.values(datumByKey)[0]?.datum : null;
        const xValue = nearestDatum ? xAccessor(nearestDatum) : fallbackDatum ? xAccessor(fallbackDatum) : null;
        if (xValue == null) return;

        const ratio = Math.max(0, Math.min(1, (tooltipLeft - xLeft) / width));
        const roundedRatio = Math.round(ratio * 1000) / 1000;
        const last = lastEmittedRef.current;
        if (last.tooltipOpen && last.xValue === xValue && last.ratio === roundedRatio) {
            return;
        }

        lastEmittedRef.current = { xValue, ratio: roundedRatio, tooltipOpen: true };
        onHoverSyncChange({
            sourceId: syncId,
            type: 'move',
            xValue,
            ratio: roundedRatio,
            ts: Date.now()
        });
    }, [syncId, onHoverSyncChange, xAccessor, xScale, tooltipCtx, isPointerInsideRef]);

    return null;
}

function XScaleRangeReporter({ xScaleRangeRef }) {
    const { xScale } = React.useContext(DataContext) || {};

    React.useEffect(() => {
        const range = xScale?.range?.();
        if (!range || range.length < 2) return;
        const xLeft = Math.min(...range);
        const xRight = Math.max(...range);
        if (!Number.isFinite(xLeft) || !Number.isFinite(xRight) || xRight <= xLeft) return;
        xScaleRangeRef.current = { xLeft, xRight };
    }, [xScale, xScaleRangeRef]);

    return null;
}

function RangeSelectionOverlay({ xValues, selection }) {
    const { xScale, yScale } = React.useContext(DataContext) || {};
    if (!xScale || !yScale || !selection || !xValues?.length) return null;

    const xRange = xScale.range?.() || [];
    const yRange = yScale.range?.() || [];
    if (xRange.length < 2 || yRange.length < 2) return null;

    const xLeft = Math.min(...xRange);
    const xRight = Math.max(...xRange);
    const yTop = Math.min(...yRange);
    const yBottom = Math.max(...yRange);
    const bandWidth = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() : 0;

    const start = Math.max(0, Math.min(selection.startIdx, xValues.length - 1));
    const end = Math.max(0, Math.min(selection.endIdx, xValues.length - 1));
    const from = Math.min(start, end);
    const to = Math.max(start, end);

    const fromX = Number(xScale(xValues[from]));
    const toX = Number(xScale(xValues[to]));
    if (!Number.isFinite(fromX) || !Number.isFinite(toX)) return null;

    const left = Math.max(xLeft, Math.min(fromX, toX));
    const right = Math.min(xRight, Math.max(fromX, toX) + bandWidth);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;

    return (
        <g className="event-dashboard-chart__range-selection" style={{ pointerEvents: 'none' }}>
            <rect
                x={left}
                y={yTop}
                width={right - left}
                height={Math.max(0, yBottom - yTop)}
                fill="rgba(37, 99, 235, 0.14)"
            />
            <line
                x1={left}
                x2={left}
                y1={yTop}
                y2={yBottom}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
                strokeDasharray="4 4"
            />
            <line
                x1={right}
                x2={right}
                y1={yTop}
                y2={yBottom}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
                strokeDasharray="4 4"
            />
        </g>
    );
}

/** Max labeled notches on the x-axis (bands / hover stay full width; only tick labels are thinned). */
const MAX_X_TICKS = 6;
const MAX_X_TICKS_LONG_RANGE = 5;

function getSparseTickValues(values, maxTicks = MAX_X_TICKS) {
    if (!values?.length) return undefined;
    if (values.length <= maxTicks) return undefined;
    const step = Math.ceil(values.length / maxTicks);
    const result = [];
    for (let i = 0; i < values.length; i += step) result.push(values[i]);
    if (result[result.length - 1] !== values[values.length - 1]) {
        result.push(values[values.length - 1]);
    }
    return result;
}

function formatSemanticDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Reusable line/area chart for EventDashboard. Purely the graph - no stats header, toggles, or legend.
 * @param {Object} props
 * @param {Array<{x: string, y: number}>} props.data - Chart data
 * @param {Function} [props.xAccessor] - Default (d) => d.x
 * @param {Function} [props.yAccessor] - Default (d) => d.y
 * @param {Function} [props.xTickFormat] - Default formatSemanticDate
 * @param {number} [props.height=280]
 * @param {Object} [props.margin]
 * @param {string} [props.color='#22c55e']
 * @param {boolean} [props.showArea=true]
 * @param {boolean} [props.showLine=true]
 * @param {boolean} [props.showGlyph=true] - End point dot
 * @param {string} [props.emptyMessage='No data']
 * @param {string[]} [props.xDomain] - Optional x-axis domain (e.g. full date range when data stops earlier)
 * @param {Array<{ data: Array<{x,y}>, color: string, label: string, strokeDasharray?: string, strokeOpacity?: number, fillOpacity?: number }>} [props.series] - Multiple series (overrides data when provided). Optional strokeDasharray for dashed comparison lines; strokeOpacity for dashed stroke only; fillOpacity overrides default area opacity per series.
 * @param {string} [props.dashedLineBackdropStroke] - Solid stroke drawn under dashed lines so gaps match the chart surface (not stacked area fills). Defaults to CSS var --background with white fallback.
 */
const SERIES_COLORS = ['#4DAA57', '#2563eb', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function EventDashboardChart({
    data = [],
    xAccessor = defaultAccessors.xAccessor,
    yAccessor = defaultAccessors.yAccessor,
    xTickFormat = formatSemanticDate,
    height = 280,
    margin = { top: 12, right: 12, bottom: 28, left: 36 },
    color = '#22c55e',
    showArea = true,
    showLine = true,
    showGlyph = true,
    /** When true with multi-series, only the first series gets an end-point glyph (e.g. “today” marker). */
    showGlyphPrimaryOnly = false,
    showPointMarkers = false,
    emptyMessage = 'No data',
    xDomain,
    series,
    dashedLineBackdropStroke = 'var(--background, #ffffff)',
    debugInteractions = false,
    debugPrefix = 'EventDashboardChart',
    syncId,
    hoverSyncSignal,
    onHoverSyncChange,
    enableRangeSelection = false,
    onRangeSelect,
}) {
    const containerRef = React.useRef(null);
    const lastMoveLogAtRef = React.useRef(0);
    const lastTooltipLogAtRef = React.useRef(0);
    const pointerInsideRef = React.useRef(false);
    const xScaleRangeRef = React.useRef(null);
    const [isPointerInside, setIsPointerInside] = React.useState(false);
    const [dragSelection, setDragSelection] = React.useState(null);
    const accessors = { xAccessor, yAccessor };
    const isMultiSeries = series && series.length > 0;
    const displayData = isMultiSeries ? series.flatMap((s) => s.data) : data;
    const allValues = isMultiSeries ? series.flatMap((s) => s.data.map((d) => d.y)) : data.map((d) => d.y);
    const baseXValues = isMultiSeries
        ? [...new Set(series.flatMap((s) => s.data.map((d) => xAccessor(d))))].sort()
        : data.map((d) => xAccessor(d));
    const xValues =
        xDomain && Array.isArray(xDomain) && xDomain.length ? [...xDomain] : baseXValues;
    const xTickValues = getSparseTickValues(
        xValues,
        xValues.length > 40 ? MAX_X_TICKS_LONG_RANGE : MAX_X_TICKS
    );

    const yMax = Math.max(...allValues, 0) * 1.1 || 10;
    const gradientId = (c) => `chart-gradient-${c.replace('#', '')}`;
    const getBandIndexFromMouseEvent = React.useCallback(
        (e) => {
            if (!containerRef.current || !xScaleRangeRef.current || !xValues?.length) return null;
            const { xLeft, xRight } = xScaleRangeRef.current;
            const width = xRight - xLeft;
            if (!Number.isFinite(width) || width <= 0) return null;
            const rect = containerRef.current.getBoundingClientRect();
            const localX = e.clientX - rect.left - xLeft;
            return nearestBandIndexForLocalX(localX, width, xValues.length);
        },
        [xValues]
    );
    const finishRangeSelection = React.useCallback(() => {
        if (!enableRangeSelection || !onRangeSelect || !dragSelection || !xValues?.length) {
            setDragSelection(null);
            return;
        }
        const from = Math.max(0, Math.min(Math.min(dragSelection.startIdx, dragSelection.endIdx), xValues.length - 1));
        const to = Math.max(0, Math.min(Math.max(dragSelection.startIdx, dragSelection.endIdx), xValues.length - 1));
        if (to <= from) {
            setDragSelection(null);
            return;
        }
        onRangeSelect({
            startXValue: xValues[from],
            endXValue: xValues[to]
        });
        setDragSelection(null);
    }, [enableRangeSelection, onRangeSelect, dragSelection, xValues]);
    React.useEffect(() => {
        if (!dragSelection) return;
        const handleMouseUp = () => finishRangeSelection();
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [dragSelection, finishRangeSelection]);
    const maybeLog = (ref, message, payload, everyMs = 350) => {
        if (!debugInteractions) return;
        const now = Date.now();
        if (now - ref.current < everyMs) return;
        ref.current = now;
        console.log(`[${debugPrefix}] ${message}`, payload);
    };

    if ((!isMultiSeries && (!data || data.length === 0)) || (isMultiSeries && series.every((s) => !s.data?.length))) {
        return (
            <div className="chart-container chart-container-visx">
                <div className="chart-empty">{emptyMessage}</div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="chart-container chart-container-visx"
            onMouseMove={(e) => {
                pointerInsideRef.current = true;
                setIsPointerInside((prev) => (prev ? prev : true));
                if (enableRangeSelection && dragSelection) {
                    const idx = getBandIndexFromMouseEvent(e);
                    if (idx != null) {
                        setDragSelection((prev) => (prev ? { ...prev, endIdx: idx } : prev));
                    }
                }
                maybeLog(
                    lastMoveLogAtRef,
                    'mousemove',
                    {
                        x: e.clientX,
                        y: e.clientY,
                        targetTag: e.target?.tagName || 'unknown',
                        isMultiSeries
                    },
                    450
                );
            }}
            onMouseLeave={() => {
                pointerInsideRef.current = false;
                setIsPointerInside(false);
                if (enableRangeSelection && dragSelection) {
                    finishRangeSelection();
                }
                if (debugInteractions) {
                    console.log(`[${debugPrefix}] mouseleave`);
                }
                if (!syncId || !onHoverSyncChange) return;
                onHoverSyncChange({
                    sourceId: syncId,
                    type: 'leave',
                    ts: Date.now()
                });
            }}
            onMouseDown={(e) => {
                if (!enableRangeSelection || !onRangeSelect || e.button !== 0) return;
                const idx = getBandIndexFromMouseEvent(e);
                if (idx == null) return;
                setDragSelection({ startIdx: idx, endIdx: idx });
            }}
            onMouseUp={() => {
                if (!dragSelection) return;
                finishRangeSelection();
            }}
        >
            <XYChart
                theme={chartTheme}
                xScale={{
                    type: 'band',
                    paddingInner: CHART_BAND_PADDING_INNER,
                    paddingOuter: CHART_BAND_PADDING_OUTER,
                    ...(xDomain && { domain: xDomain })
                }}
                yScale={{ type: 'linear', domain: [0, yMax] }}
                height={height}
                margin={margin}
            >
                <defs>
                    {isMultiSeries ? (
                        series.map((s, i) => (
                            <linearGradient key={i} id={gradientId(s.color) + i} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={s.color} stopOpacity={0.48} />
                                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                            </linearGradient>
                        ))
                    ) : (
                        <linearGradient id={gradientId(color)} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    )}
                </defs>
                <Grid
                    columns
                    numTicks={4}
                    strokeDasharray="2 4"
                    className="chart-grid"
                />
                <Axis
                    orientation="bottom"
                    hideAxisLine
                    tickLength={0}
                    tickFormat={xTickFormat}
                    tickValues={xTickValues}
                    tickLabelProps={() => ({
                        fill: 'var(--light-text)',
                        fontSize: 10,
                        textAnchor: 'middle',
                    })}
                    numTicks={
                        xTickValues != null
                            ? xTickValues.length
                            : Math.min(xDomain?.length ?? xValues.length, 8)
                    }
                />
                <Axis
                    orientation="left"
                    hideAxisLine
                    tickLength={0}
                    tickLabelProps={() => ({
                        fill: 'var(--light-text)',
                        fontSize: 10,
                        textAnchor: 'end',
                        dx: -4,
                    })}
                    numTicks={4}
                />
                {isMultiSeries ? (
                    <>
                        {series.map((s, i) => (
                            <React.Fragment key={`area-wrap-${i}`}>
                                {showArea && s.data?.length > 0 && (
                                    <AreaSeries
                                        dataKey={`series-${i}`}
                                        data={s.data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        curve={curveMonotoneX}
                                        fillOpacity={typeof s.fillOpacity === 'number' ? s.fillOpacity : 0.26}
                                        fill={`url(#${gradientId(s.color)}${i})`}
                                    />
                                )}
                            </React.Fragment>
                        ))}
                        {series.map((s, i) =>
                            showLine && s.data?.length > 0 && s.strokeDasharray ? (
                                <React.Fragment key={`dash-line-wrap-${i}`}>
                                    <LineSeries
                                        dataKey={`series-dash-backdrop-${i}`}
                                        data={s.data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        curve={curveMonotoneX}
                                        stroke={dashedLineBackdropStroke}
                                        strokeWidth={5}
                                        strokeLinecap="butt"
                                        strokeLinejoin="round"
                                        enableEvents={false}
                                    />
                                    <LineSeries
                                        dataKey={`series-${i}`}
                                        data={s.data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        curve={curveMonotoneX}
                                        stroke={s.color}
                                        strokeWidth={2}
                                        strokeDasharray={s.strokeDasharray}
                                        strokeLinecap="butt"
                                        strokeLinejoin="round"
                                        {...(typeof s.strokeOpacity === 'number'
                                            ? { strokeOpacity: s.strokeOpacity }
                                            : {})}
                                    />
                                </React.Fragment>
                            ) : null
                        )}
                        {series.map((s, i) =>
                            showLine && s.data?.length > 0 && !s.strokeDasharray ? (
                                <LineSeries
                                    key={`solid-line-${i}`}
                                    dataKey={`series-${i}`}
                                    data={s.data}
                                    xAccessor={accessors.xAccessor}
                                    yAccessor={accessors.yAccessor}
                                    curve={curveMonotoneX}
                                    stroke={s.color}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            ) : null
                        )}
                        {series.map((s, i) => (
                            <React.Fragment key={`glyph-wrap-${i}`}>
                                {showLine &&
                                    showGlyph &&
                                    s.data?.length > 0 &&
                                    (!showGlyphPrimaryOnly || i === 0) && (
                                    <GlyphSeries
                                        dataKey={`series-end-${i}`}
                                        data={[s.data[s.data.length - 1]]}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        size={8}
                                        enableEvents={false}
                                        renderGlyph={({ key, x, y }) => (
                                            <circle
                                                key={key}
                                                cx={x}
                                                cy={y}
                                                r={4}
                                                fill={s.color}
                                                stroke="#fff"
                                                strokeWidth={2}
                                            />
                                        )}
                                    />
                                )}
                                {showLine && showPointMarkers && s.data?.length > 0 && (
                                    <GlyphSeries
                                        dataKey={`series-points-${i}`}
                                        data={s.data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        size={10}
                                        enableEvents={false}
                                        renderGlyph={({ key, x, y }) => (
                                            <circle
                                                key={key}
                                                cx={x}
                                                cy={y}
                                                r={2.2}
                                                fill={s.color}
                                                fillOpacity={0.9}
                                            />
                                        )}
                                    />
                                )}
                            </React.Fragment>
                        ))}
                    </>
                ) : (
                    <>
                        {showArea && (
                            <AreaSeries
                                dataKey="series"
                                data={data}
                                xAccessor={accessors.xAccessor}
                                yAccessor={accessors.yAccessor}
                                curve={curveMonotoneX}
                                fillOpacity={0.3}
                                fill={`url(#${gradientId(color)})`}
                            />
                        )}
                        {showLine && (
                            <>
                                <LineSeries
                                    dataKey="series"
                                    data={data}
                                    xAccessor={accessors.xAccessor}
                                    yAccessor={accessors.yAccessor}
                                    curve={curveMonotoneX}
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                {showGlyph && data.length > 0 && (
                                    <GlyphSeries
                                        dataKey="series-end"
                                        data={[data[data.length - 1]]}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        size={8}
                                        enableEvents={false}
                                        renderGlyph={({ key, x, y }) => (
                                            <circle
                                                key={key}
                                                cx={x}
                                                cy={y}
                                                r={4}
                                                fill={color}
                                                stroke="#fff"
                                                strokeWidth={2}
                                            />
                                        )}
                                    />
                                )}
                                {showPointMarkers && (
                                    <GlyphSeries
                                        dataKey="series-points"
                                        data={data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        size={10}
                                        enableEvents={false}
                                        renderGlyph={({ key, x, y }) => (
                                            <circle
                                                key={key}
                                                cx={x}
                                                cy={y}
                                                r={2.2}
                                                fill={color}
                                                fillOpacity={0.9}
                                            />
                                        )}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
                {isPointerInside ? (
                    <Tooltip
                        className="rsvp-chart-tooltip-wrapper"
                        snapTooltipToDatumX={false}
                        snapTooltipToDatumY
                        showVerticalCrosshair
                        showSeriesGlyphs={false}
                        showDatumGlyph={false}
                        zIndex={10002}
                        verticalCrosshairStyle={{
                            stroke: '#94a3b8',
                            strokeWidth: 1,
                            strokeOpacity: 1,
                            strokeDasharray: '1 4',
                            strokeLinecap: 'round'
                        }}
                        renderTooltip={({ tooltipData }) => {
                            maybeLog(
                                lastTooltipLogAtRef,
                                'tooltip render',
                                {
                                    hasNearest: !!tooltipData?.nearestDatum,
                                    keys: tooltipData?.datumByKey ? Object.keys(tooltipData.datumByKey) : [],
                                },
                                200
                            );
                            if (!tooltipData?.datumByKey) return null;
                            const entries = Object.entries(tooltipData.datumByKey).filter(
                                ([k, v]) =>
                                    v?.datum &&
                                    k.startsWith('series-') &&
                                    !k.includes('series-end') &&
                                    !k.includes('dash-backdrop')
                            );
                            if (entries.length === 0) return null;
                            const first = entries[0][1];
                            const dateStr = first?.datum?.x;
                            if (!dateStr) return null;
                            return (
                                <div className="rsvp-chart-tooltip">
                                    <div className="rsvp-chart-tooltip-date">{xTickFormat(dateStr)}</div>
                                    {isMultiSeries
                                        ? entries.map(([key, v], i) => {
                                              const idx = parseInt(key.replace('series-', ''), 10);
                                              const s = series[idx];
                                              return (
                                                  <div key={key} className="rsvp-chart-tooltip-row">
                                                      <span
                                                          className="rsvp-chart-tooltip-dot rsvp-chart-tooltip-dot-actual"
                                                          style={{
                                                              background: s?.color,
                                                              opacity:
                                                                  typeof s?.strokeOpacity === 'number'
                                                                      ? s.strokeOpacity
                                                                      : 1
                                                          }}
                                                      />
                                                      {s?.label}: {Math.round(v.datum.y)}
                                                  </div>
                                              );
                                          })
                                        : (
                                            <div className="rsvp-chart-tooltip-row">
                                                <span
                                                    className="rsvp-chart-tooltip-dot rsvp-chart-tooltip-dot-actual"
                                                    style={{ background: color }}
                                                />
                                                {Math.round(first.datum.y)}
                                            </div>
                                        )}
                                </div>
                            );
                        }}
                    />
                ) : null}
                <SmoothHoverDots
                    isMultiSeries={isMultiSeries}
                    series={series}
                    data={data}
                    xAccessor={xAccessor}
                    yAccessor={yAccessor}
                    color={color}
                />
                <SyncedHoverOverlay
                    syncId={syncId}
                    hoverSyncSignal={hoverSyncSignal}
                    xValues={xValues}
                    xAccessor={xAccessor}
                    yAccessor={yAccessor}
                    xTickFormat={xTickFormat}
                    isMultiSeries={isMultiSeries}
                    series={series}
                    data={data}
                    color={color}
                />
                <HoverSyncReporter
                    syncId={syncId}
                    onHoverSyncChange={onHoverSyncChange}
                    xAccessor={xAccessor}
                    isPointerInsideRef={pointerInsideRef}
                />
                <XScaleRangeReporter xScaleRangeRef={xScaleRangeRef} />
                {enableRangeSelection ? (
                    <RangeSelectionOverlay xValues={xValues} selection={dragSelection} />
                ) : null}
            </XYChart>
        </div>
    );
}

export default EventDashboardChart;
