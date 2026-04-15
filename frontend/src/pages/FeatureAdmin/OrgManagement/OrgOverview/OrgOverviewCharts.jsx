import React from 'react';
import { XYChart, Axis, Grid, BarSeries, Tooltip, buildChartTheme } from '@visx/xychart';
import EventDashboardChart from '../../../ClubDash/EventsManagement/components/EventDashboard/components/EventDashboardChart/EventDashboardChart';

const chartTheme = buildChartTheme({
    colors: ['#4DAA57', '#2f80ed', '#e07a21'],
    backgroundColor: 'transparent',
    gridColor: 'rgba(0, 0, 0, 0.12)',
    gridColorDark: 'rgba(0, 0, 0, 0.2)',
    tickLength: 0
});

const formatDateLabel = (value) => {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getSparseTickValues = (values, maxTicks = 8) => {
    if (!Array.isArray(values) || values.length === 0) return undefined;
    if (values.length <= maxTicks) return undefined;
    const step = Math.ceil(values.length / maxTicks);
    const sparse = [];
    for (let i = 0; i < values.length; i += step) {
        sparse.push(values[i]);
    }
    if (sparse[sparse.length - 1] !== values[values.length - 1]) {
        sparse.push(values[values.length - 1]);
    }
    return sparse;
};

const SERIES_COLORS = {
    views: '#2f80ed',
    registrations: '#4DAA57',
    sources: '#4DAA57'
};

function OrgOverviewCharts({ variant = 'trend', data = [] }) {
    if (!Array.isArray(data) || data.length === 0) {
        return <div className="org-overview-chart-empty">No analytics data yet for this range.</div>;
    }

    if (variant === 'sources') {
        const max = Math.max(...data.map((d) => d.value), 0);
        const sourceTickValues = getSparseTickValues(data.map((d) => d.source), 6);
        return (
            <div className="org-overview-chart">
                <XYChart
                    theme={chartTheme}
                    height={260}
                    margin={{ top: 12, right: 12, bottom: 34, left: 48 }}
                    xScale={{ type: 'band', paddingInner: 0.3 }}
                    yScale={{ type: 'linear', domain: [0, Math.max(5, max * 1.15)] }}
                >
                    <Grid columns={false} numTicks={4} strokeDasharray="2 4" />
                    <Axis orientation="bottom" tickFormat={(v) => String(v)} tickValues={sourceTickValues} />
                    <Axis orientation="left" numTicks={4} />
                    <BarSeries dataKey="Views" data={data} xAccessor={(d) => d.source} yAccessor={(d) => d.value} />
                    <Tooltip
                        className="org-overview-tooltip-wrapper"
                        snapTooltipToDatumX
                        snapTooltipToDatumY
                        showVerticalCrosshair
                        showSeriesGlyphs
                        renderTooltip={({ tooltipData }) => {
                            const point = tooltipData?.nearestDatum?.datum
                                || tooltipData?.datumByKey?.Views?.datum;
                            if (!point) return null;
                            return (
                                <div className="org-overview-tooltip">
                                    <strong>{point.source}</strong>
                                    <div className="org-overview-tooltip-row">
                                        <span className="org-overview-tooltip-dot org-overview-tooltip-dot-source" />
                                        <p>{point.value} views</p>
                                    </div>
                                </div>
                            );
                        }}
                    />
                </XYChart>
                <div className="org-overview-chart-legend">
                    <div className="org-overview-chart-legend-item">
                        <span className="org-overview-chart-legend-dot org-overview-chart-legend-dot-source" />
                        <span>Views by source</span>
                    </div>
                </div>
            </div>
        );
    }

    const trendData = data.map((row) => ({
        date: row.date,
        views: row.views || 0,
        registrations: row.registrations || 0
    }));
    const trendSeries = [
        {
            label: 'Event views',
            color: SERIES_COLORS.views,
            data: trendData.map((row) => ({ x: row.date, y: row.views }))
        },
        {
            label: 'Registrations',
            color: SERIES_COLORS.registrations,
            data: trendData.map((row) => ({ x: row.date, y: row.registrations }))
        }
    ];

    return (
        <div className="org-overview-chart">
            <EventDashboardChart
                series={trendSeries}
                xTickFormat={formatDateLabel}
                height={280}
                showArea={false}
                showLine
                showGlyph
                emptyMessage="No analytics data yet for this range."
            />
            <div className="org-overview-chart-legend">
                <div className="org-overview-chart-legend-item">
                    <span className="org-overview-chart-legend-dot org-overview-chart-legend-dot-views" />
                    <span>Event views</span>
                </div>
                <div className="org-overview-chart-legend-item">
                    <span className="org-overview-chart-legend-dot org-overview-chart-legend-dot-registrations" />
                    <span>Registrations</span>
                </div>
            </div>
        </div>
    );
}

export default OrgOverviewCharts;
