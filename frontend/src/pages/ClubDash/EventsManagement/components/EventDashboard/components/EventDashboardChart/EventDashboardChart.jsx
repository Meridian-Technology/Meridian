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
 * @param {Array<{ data: Array<{x,y}>, color: string, label: string }>} [props.series] - Multiple series (overrides data when provided)
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
    emptyMessage = 'No data',
    xDomain,
    series,
}) {
    const accessors = { xAccessor, yAccessor };
    const isMultiSeries = series && series.length > 0;
    const displayData = isMultiSeries ? series.flatMap((s) => s.data) : data;
    const allValues = isMultiSeries ? series.flatMap((s) => s.data.map((d) => d.y)) : data.map((d) => d.y);

    if ((!isMultiSeries && (!data || data.length === 0)) || (isMultiSeries && series.every((s) => !s.data?.length))) {
        return (
            <div className="chart-container chart-container-visx">
                <div className="chart-empty">{emptyMessage}</div>
            </div>
        );
    }

    const yMax = Math.max(...allValues, 0) * 1.1 || 10;
    const gradientId = (c) => `chart-gradient-${c.replace('#', '')}`;

    return (
        <div className="chart-container chart-container-visx">
            <XYChart
                theme={chartTheme}
                xScale={{ type: 'band', paddingInner: 0.3, paddingOuter: 0.2, ...(xDomain && { domain: xDomain }) }}
                yScale={{ type: 'linear', domain: [0, yMax] }}
                height={height}
                margin={margin}
            >
                <defs>
                    {isMultiSeries ? (
                        series.map((s, i) => (
                            <linearGradient key={i} id={gradientId(s.color) + i} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                            </linearGradient>
                        ))
                    ) : (
                        <linearGradient id={gradientId(color)} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    )}
                </defs>
                <Grid
                    columns={false}
                    numTicks={4}
                    strokeDasharray="2 4"
                    className="chart-grid"
                />
                <Axis
                    orientation="bottom"
                    tickFormat={xTickFormat}
                    tickLabelProps={() => ({
                        fill: 'var(--light-text)',
                        fontSize: 10,
                        textAnchor: 'middle',
                    })}
                    numTicks={Math.min(xDomain?.length ?? displayData.length, 12)}
                />
                <Axis
                    orientation="left"
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
                            <React.Fragment key={i}>
                                {showArea && s.data?.length > 0 && (
                                    <AreaSeries
                                        dataKey={`series-${i}`}
                                        data={s.data}
                                        xAccessor={accessors.xAccessor}
                                        yAccessor={accessors.yAccessor}
                                        curve={curveMonotoneX}
                                        fillOpacity={0.15}
                                        fill={`url(#${gradientId(s.color)}${i})`}
                                    />
                                )}
                                {showLine && s.data?.length > 0 && (
                                    <>
                                        <LineSeries
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
                                        {showGlyph && (
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
                                    </>
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
                                fillOpacity={0.2}
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
                            </>
                        )}
                    </>
                )}
                <Tooltip
                    className="rsvp-chart-tooltip-wrapper"
                    snapTooltipToDatumX
                    snapTooltipToDatumY
                    showVerticalCrosshair
                    showSeriesGlyphs={isMultiSeries}
                    renderTooltip={({ tooltipData }) => {
                        if (!tooltipData?.datumByKey) return null;
                        const entries = Object.entries(tooltipData.datumByKey).filter(
                            ([k, v]) => v?.datum && (k.startsWith('series-') && !k.includes('series-end'))
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
                                                      style={{ background: s?.color }}
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
            </XYChart>
        </div>
    );
}

export default EventDashboardChart;
