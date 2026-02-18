import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
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
import './EventDashboard.scss';

const accessors = {
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
};

function toLocalDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const chartTheme = buildChartTheme({
    colors: ['#22c55e', '#94a3b8'],
    backgroundColor: 'transparent',
    gridColor: 'rgba(0, 0, 0, 0.14)',
    gridColorDark: 'rgba(0, 0, 0, 0.2)',
    tickLength: 0,
});

function generateFakeRegistrations(eventCreated, dayBeforeEvent, targetAttendance) {
    const registrations = {};
    const start = new Date(eventCreated);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dayBeforeEvent);
    end.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const targetTotal = 500;
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const currentDate = new Date(d);
        currentDate.setHours(0, 0, 0, 0);
        if (currentDate <= now) days.push(currentDate.toISOString().split('T')[0]);
    }
    if (days.length === 0) return registrations;
    const spikeDays = new Set();
    while (spikeDays.size < Math.min(3, Math.floor(days.length * 0.15))) {
        spikeDays.add(Math.floor(Math.random() * days.length));
    }
    const quietDays = new Set();
    while (quietDays.size < Math.min(5, Math.floor(days.length * 0.25))) {
        quietDays.add(Math.floor(Math.random() * days.length));
    }
    const weights = days.map((_, i) => {
        const t = i / Math.max(1, days.length - 1);
        const early = 1.5 - t;
        const late = 0.5 + t;
        const mid = 0.8 + 0.4 * Math.sin(t * Math.PI);
        let w = early * 0.25 + late * 0.35 + mid * 0.4;
        if (spikeDays.has(i)) w *= 2.5 + Math.random();
        if (quietDays.has(i)) w *= 0.1 + Math.random() * 0.2;
        return Math.max(0.01, w + (Math.random() - 0.3));
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const raw = weights.map((w) => Math.round((w / totalWeight) * targetTotal));
    const diff = targetTotal - raw.reduce((a, b) => a + b, 0);
    raw[raw.length - 1] += diff;
    days.forEach((dayKey, i) => {
        const count = Math.max(0, raw[i] || 0);
        if (count > 0) registrations[dayKey] = count;
    });
    return registrations;
}

function RSVPGrowthChart({ eventId, orgId, expectedAttendance, registrationCount }) {
    const [isCumulative, setIsCumulative] = useState(true);
    const [useFakeRsvpData, setUseFakeRsvpData] = useState(false);

    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    const rsvpGrowthUrl = eventId && orgId
        ? `/org-event-management/${orgId}/events/${eventId}/rsvp-growth${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ''}`
        : null;
    const { data: growthData, loading, error } = useFetch(rsvpGrowthUrl);

    const { dailyData, requiredGrowth, targetAttendance, isFrozen, requiredPerDay } = useMemo(() => {
        if (!growthData?.success || !growthData?.data) {
            console.log('[RSVPGrowthChart] no growthData', { success: growthData?.success, hasData: !!growthData?.data });
            return { dailyData: [], requiredGrowth: [], targetAttendance: 0, isFrozen: false, requiredPerDay: 0 };
        }
        const { registrations: rawRegistrations = {}, eventCreated, eventStart, expectedAttendance } = growthData.data;
        console.log('[RSVPGrowthChart] raw API data', {
            rawRegistrations,
            eventCreated,
            eventStart,
            expectedAttendance
        });
        const dayBeforeEventTemp = new Date(eventStart);
        dayBeforeEventTemp.setDate(dayBeforeEventTemp.getDate() - 1);
        dayBeforeEventTemp.setHours(0, 0, 0, 0);
        const registrations = useFakeRsvpData
            ? generateFakeRegistrations(eventCreated, dayBeforeEventTemp, expectedAttendance)
            : rawRegistrations;
        const now = new Date();
        const eventCreatedDate = new Date(eventCreated);
        const eventStartDate = new Date(eventStart);
        const cutoffDate = eventStartDate < now ? eventStartDate : now;
        const cutoffDateNormalized = new Date(cutoffDate);
        cutoffDateNormalized.setHours(23, 59, 59, 999);

        const eventCreatedNormalized = new Date(eventCreatedDate);
        eventCreatedNormalized.setHours(0, 0, 0, 0);
        const lastChartDate = new Date(eventStartDate);
        lastChartDate.setHours(0, 0, 0, 0);
        // Include event start date so registrations on the day-of are shown

        const dailyData = [];
        let cumulativeRSVPs = 0;
        for (let d = new Date(eventCreatedNormalized); d <= lastChartDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            currentDate.setHours(0, 0, 0, 0);
            const dayKey = toLocalDateKey(currentDate);
            const dailyRSVPs = currentDate <= cutoffDateNormalized ? (registrations[dayKey] || 0) : 0;
            cumulativeRSVPs += dailyRSVPs;
            dailyData.push({ date: dayKey, dailyRSVPs, cumulativeRSVPs });
        }

        const target = useFakeRsvpData ? 500 : (expectedAttendance || 0);
        const actualDays = dailyData.length;
        const originalRequiredPerDay = actualDays > 0 ? target / actualDays : 0;
        const requiredGrowth = dailyData.map((day, i) => ({
            date: day.date,
            required: i === dailyData.length - 1 ? target : (i + 1) * originalRequiredPerDay,
        }));

        console.log('[RSVPGrowthChart] dailyData computed', {
            dailyDataLength: dailyData.length,
            sampleDays: dailyData.slice(0, 3).map((d) => ({ date: d.date, dailyRSVPs: d.dailyRSVPs, cumulativeRSVPs: d.cumulativeRSVPs })),
            lastDay: dailyData[dailyData.length - 1],
            daysWithRegistrations: dailyData.filter((d) => d.dailyRSVPs > 0)
        });

        return {
            dailyData,
            requiredGrowth,
            targetAttendance: target,
            isFrozen: eventStartDate < now,
            requiredPerDay: originalRequiredPerDay,
        };
    }, [growthData, useFakeRsvpData]);

    const statsFromProps = registrationCount !== undefined || (expectedAttendance ?? 0) > 0;
    const StatsHeader = () => (
        <div className="chart-stats-inline">
            <div className="chart-stat-item">
                <span className="chart-stat-value">{registrationCount ?? 0}</span>
                <span className="chart-stat-label">Registered</span>
            </div>
            {(expectedAttendance ?? 0) > 0 && (
                <div className="chart-stat-item">
                    <span className="chart-stat-value">{expectedAttendance}</span>
                    <span className="chart-stat-label">Expected</span>
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="rsvp-growth-chart rsvp-growth-chart-visx">
                {statsFromProps && (
                    <div className="chart-header">
                        <StatsHeader />
                    </div>
                )}
                <div className="chart-loading">Loading growth data...</div>
            </div>
        );
    }

    if (error || !growthData?.success) {
        return (
            <div className="rsvp-growth-chart rsvp-growth-chart-visx">
                {statsFromProps && (
                    <div className="chart-header">
                        <StatsHeader />
                    </div>
                )}
                <div className="chart-error">Error loading growth data</div>
            </div>
        );
    }

    const currentRSVPs = useFakeRsvpData
        ? (dailyData?.[dailyData.length - 1]?.cumulativeRSVPs ?? 0)
        : (registrationCount ?? dailyData?.[dailyData.length - 1]?.cumulativeRSVPs ?? 0);
    const displayExpected = useFakeRsvpData ? targetAttendance : (expectedAttendance ?? targetAttendance ?? 0);
    const todayStr = toLocalDateKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateKey(yesterday);
    const todayDaily = dailyData?.find((d) => d.date === todayStr)?.dailyRSVPs ?? 0;
    const yesterdayDaily = dailyData?.find((d) => d.date === yesterdayStr)?.dailyRSVPs ?? 0;
    const dailyChangePercent =
        yesterdayDaily > 0
            ? Math.round(((todayDaily - yesterdayDaily) / yesterdayDaily) * 100)
            : todayDaily > 0
              ? 100
              : 0;
    const hasChartData = dailyData && dailyData.length > 0;

    if (!hasChartData) {
        return (
            <div className="rsvp-growth-chart rsvp-growth-chart-visx rsvp-growth-chart-minimal">
                <div className="chart-header">
                    <div className="chart-stats-inline">
                        <div className="chart-stat-item">
                            <span className="chart-stat-value">{currentRSVPs}</span>
                            <span className="chart-stat-label">Registered</span>
                        </div>
                        {displayExpected > 0 && (
                            <div className="chart-stat-item">
                                <span className="chart-stat-value">{displayExpected}</span>
                                <span className="chart-stat-label">Expected</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="chart-empty">No registration data available</div>
            </div>
        );
    }

    const beforeFilter = isCumulative
        ? dailyData.map((day) => ({ x: day.date, y: day.cumulativeRSVPs }))
        : dailyData.map((day) => ({ x: day.date, y: day.dailyRSVPs }));
    const actualData = beforeFilter.filter((d) => d.x <= todayStr);

    console.log('[RSVPGrowthChart] chart data', {
        todayStr,
        isCumulative,
        beforeFilterLength: beforeFilter.length,
        beforeFilterWithY: beforeFilter.filter((d) => d.y > 0),
        actualDataLength: actualData.length,
        actualDataWithY: actualData.filter((d) => d.y > 0),
        filterRemoved: beforeFilter.filter((d) => d.x > todayStr)
    });

    const requiredData = isCumulative
        ? requiredGrowth.map((day) => ({ x: day.date, y: day.required }))
        : dailyData.map((day) => ({
              x: day.date,
              y: Math.round(requiredPerDay * 10) / 10,
          }));

    const yMax = (() => {
        const actualMax = Math.max(...actualData.map((d) => d.y), 0);
        const requiredMax = Math.max(...requiredData.map((d) => d.y), 0);
        const cap = displayExpected > 0 ? displayExpected : Math.max(actualMax, requiredMax);
        return Math.ceil(Math.max(actualMax, requiredMax, cap) * 1.1) || 10;
    })();

    return (
        <div className="rsvp-growth-chart rsvp-growth-chart-visx">
            <div className="chart-header">
                <div className="chart-stats-inline">
                    <div className="chart-stat-item">
                        <span className="chart-stat-value">{currentRSVPs}</span>
                        <span className="chart-stat-label">Registered</span>
                    </div>
                    {displayExpected > 0 && (
                        <div className="chart-stat-item">
                            <span className="chart-stat-value">{displayExpected}</span>
                            <span className="chart-stat-label">Expected</span>
                        </div>
                    )}
                    <div className="chart-stat-item">
                        <span className="chart-stat-value">{todayDaily}</span>
                        <span className="chart-stat-label">
                            Daily
                            {dailyChangePercent !== 0 && (
                                <span
                                    className={`chart-stat-change ${dailyChangePercent > 0 ? 'up' : 'down'}`}
                                    title={dailyChangePercent > 0 ? `Up ${dailyChangePercent}% from yesterday` : `Down ${Math.abs(dailyChangePercent)}% from yesterday`}
                                >
                                    {dailyChangePercent > 0 ? (
                                        <Icon icon="mdi:trending-up" />
                                    ) : (
                                        <Icon icon="mdi:trending-down" />
                                    )}
                                    {Math.abs(dailyChangePercent)}%
                                </span>
                            )}
                        </span>
                    </div>
                </div>
                <div className="chart-header-right">
                    {useFakeRsvpData && (
                        <span className="frozen-badge" style={{ background: 'var(--beacon-accent, #998df2)' }}>
                            Fake data
                        </span>
                    )}
                    {isFrozen && (
                        <span className="frozen-badge">
                            <Icon icon="mdi:lock" />
                            Frozen
                        </span>
                    )}
                    <div className="chart-controls">
                        {/* <button
                            type="button"
                            className={`toggle-btn ${useFakeRsvpData ? 'active' : ''}`}
                            onClick={() => setUseFakeRsvpData((v) => !v)}
                            title="Toggle fake RSVP data for preview"
                        >
                            Fake RSVP
                        </button> */}
                        <button
                            type="button"
                            className={`toggle-btn ${isCumulative ? 'active' : ''}`}
                            onClick={() => setIsCumulative(true)}
                        >
                            Cumulative
                        </button>
                        <button
                            type="button"
                            className={`toggle-btn ${!isCumulative ? 'active' : ''}`}
                            onClick={() => setIsCumulative(false)}
                        >
                            Daily
                        </button>
                    </div>
                </div>
            </div>

            <div className="chart-container chart-container-visx">
                <XYChart
                    theme={chartTheme}
                    xScale={{ type: 'band', paddingInner: 0.3, paddingOuter: 0.2 }}
                    yScale={{ type: 'linear', domain: [0, yMax] }}
                    height={280}
                    margin={{ top: 12, right: 12, bottom: 28, left: 36 }}
                >
                    <Grid
                        columns={false}
                        numTicks={4}
                        strokeDasharray="2 4"
                        className="chart-grid"
                    />
                    <Axis
                        orientation="bottom"
                        tickFormat={formatSemanticDate}
                        tickLabelProps={() => ({
                            fill: 'var(--light-text)',
                            fontSize: 10,
                            textAnchor: 'middle',
                        })}
                        numTicks={Math.min(dailyData.length, 12)}
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
                    {actualData.length > 0 && (
                        <AreaSeries
                            dataKey="actual"
                            data={actualData}
                            xAccessor={accessors.xAccessor}
                            yAccessor={accessors.yAccessor}
                            curve={curveMonotoneX}
                            fillOpacity={0.2}
                            fill="url(#actual-gradient)"
                        />
                    )}
                    <defs>
                        <linearGradient id="actual-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="required-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <AreaSeries
                        dataKey="required"
                        data={requiredData}
                        xAccessor={accessors.xAccessor}
                        yAccessor={accessors.yAccessor}
                        curve={curveMonotoneX}
                        fillOpacity={0.2}
                        fill="url(#required-gradient)"
                        renderLine={false}
                    />
                    {actualData.length > 0 && (
                        <>
                            <LineSeries
                                dataKey="actual"
                                data={actualData}
                                xAccessor={accessors.xAccessor}
                                yAccessor={accessors.yAccessor}
                                curve={curveMonotoneX}
                                stroke="#22c55e"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <GlyphSeries
                                dataKey="actual-end"
                                data={[actualData[actualData.length - 1]]}
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
                                        fill="#22c55e"
                                        stroke="#fff"
                                        strokeWidth={2}
                                    />
                                )}
                            />
                        </>
                    )}
                    <LineSeries
                        dataKey="required"
                        data={requiredData}
                        xAccessor={accessors.xAccessor}
                        yAccessor={accessors.yAccessor}
                        curve={curveMonotoneX}
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <Tooltip
                        className="rsvp-chart-tooltip-wrapper"
                        snapTooltipToDatumX
                        snapTooltipToDatumY
                        showVerticalCrosshair
                        showSeriesGlyphs={false}
                        renderTooltip={({ tooltipData }) => {
                            if (!tooltipData?.datumByKey) return null;
                            const actualDatum = tooltipData.datumByKey?.actual?.datum;
                            const requiredDatum = tooltipData.datumByKey?.required?.datum;
                            const dateStr = (actualDatum || requiredDatum)?.x;
                            if (!dateStr) return null;
                            const label = formatSemanticDate(dateStr);
                            return (
                                <div className="rsvp-chart-tooltip">
                                    <div className="rsvp-chart-tooltip-date">{label}</div>
                                    {actualDatum && (
                                        <div className="rsvp-chart-tooltip-row">
                                            <span className="rsvp-chart-tooltip-dot rsvp-chart-tooltip-dot-actual" />
                                            {isCumulative ? 'Registrations' : 'Daily'}:{' '}
                                            {Math.round(actualDatum.y)}
                                        </div>
                                    )}
                                    {requiredDatum && (
                                        <div className="rsvp-chart-tooltip-row">
                                            <span className="rsvp-chart-tooltip-dot rsvp-chart-tooltip-dot-required" />
                                            {isCumulative ? 'Goal' : 'Daily Goal'}:{' '}
                                            {Math.round(requiredDatum.y * 10) / 10}
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                    />
                </XYChart>
            </div>

            <div className="chart-legend">
                <span className="chart-legend-item">
                    <span className="chart-legend-dot chart-legend-dot-actual" />
                    {isCumulative ? 'Registrations' : 'Daily'}
                </span>
                <span className="chart-legend-item">
                    <span className="chart-legend-dot chart-legend-dot-required" />
                    {isCumulative ? 'Required' : 'Required daily'}
                </span>
            </div>
        </div>
    );
}

export default RSVPGrowthChart;
