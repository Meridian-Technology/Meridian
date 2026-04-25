import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DateRangePicker } from 'rsuite';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    startOfDay,
    endOfDay,
    parseISO,
    subMonths,
    addMonths,
    subWeeks,
    addWeeks,
    subDays,
    addDays,
    startOfHour,
    addHours
} from 'date-fns';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import useAuth from '../../../../hooks/useAuth';
import Popup from '../../../../components/Popup/Popup';
import KeybindTooltip from '../../../../components/Interface/KeybindTooltip/KeybindTooltip';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import ComparisonBadge from '../../../../components/Analytics/Dashboard/ComparisonBadge';
import {
    formatAnalyticsNumber,
    formatAnalyticsDuration,
    buildComparisonVisxSeries,
    buildComparisonVisxSeriesForCalendarMonthView
} from '../../../../utils/analyticsDashboardUtils';
import AdminPlatformMetricChart from './AdminPlatformMetricChart';
import './AdminPlatformAnalytics.scss';
import 'rsuite/DateRangePicker/styles/index.css';

const TREND_METRICS_PARAM =
    'screen_views,sessions,unique_visitors,explore_screen_views,new_users';
const ADMIN_ANALYTICS_CACHE_TTL_MS = 2 * 60 * 1000;
const QUICK_RANGE_OPTIONS = [
    { id: 'month', label: 'month', shortcut: 'M' },
    { id: 'week', label: 'week', shortcut: 'W' },
    { id: 'day', label: 'day', shortcut: 'D' }
];

const TREND_METRIC_DEFS = [
    { key: 'screen_views', title: 'Page views', color: '#45A1FC' },
    { key: 'sessions', title: 'Sessions', color: '#8052FB' },
    { key: 'unique_visitors', title: 'Unique visitors', color: '#2BB673' },
    { key: 'explore_screen_views', title: 'Explore screen views', color: '#FA756D' },
    { key: 'new_users', title: 'New users', color: '#f59e0b' }
];

function computeRange(rangeMode, anchorDate) {
    const now = new Date();
    if (rangeMode === 'all') {
        const start = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
        return { start, end: now };
    }
    if (rangeMode === 'month') {
        return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    }
    if (rangeMode === 'week') {
        return {
            start: startOfWeek(anchorDate, { weekStartsOn: 0 }),
            end: endOfWeek(anchorDate, { weekStartsOn: 0 })
        };
    }
    const d = new Date(anchorDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start: d, end };
}

function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function parseBucketBoundary(bucketValue, boundary = 'start') {
    const raw = String(bucketValue || '');
    if (!raw) return null;

    // Parse yyyy-mm-dd as local calendar-day boundaries.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parsed = parseISO(`${raw}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return null;
        return boundary === 'end' ? endOfDay(parsed) : startOfDay(parsed);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getRangeGranularityRank(mode) {
    if (mode === 'all') return 0;
    if (mode === 'month') return 1;
    if (mode === 'week') return 2;
    if (mode === 'day') return 3;
    if (mode === 'custom') return 4;
    return 5;
}

function toBucketDate(bucket, granularity) {
    if (!bucket) return null;
    if (granularity === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(String(bucket))) {
        const parsed = parseISO(`${bucket}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(bucket);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBucketValue(date, granularity, sampleBucket) {
    if (granularity === 'day') {
        return format(date, 'yyyy-MM-dd');
    }
    if (granularity === 'hour') {
        const sample = String(sampleBucket || '');
        if (sample.endsWith('Z') || sample.includes('.')) {
            return date.toISOString();
        }
        return format(date, "yyyy-MM-dd'T'HH:mm:ss");
    }
    return date.toISOString();
}

function padTimeseriesRows(rows, { granularity, start, end, capEndAtNow = false }) {
    if (!Array.isArray(rows) || !rows.length || !start || !end) return rows;
    if (granularity !== 'day' && granularity !== 'hour') return rows;

    const now = new Date();
    const rawEnd = capEndAtNow && end > now ? now : end;
    const rangeStart = granularity === 'hour' ? startOfHour(start) : startOfDay(start);
    const rangeEnd = granularity === 'hour' ? startOfHour(rawEnd) : startOfDay(rawEnd);
    if (rangeEnd < rangeStart) return rows;

    const sampleBucket = rows[0]?.bucket;
    const byTs = new Map();
    rows.forEach((row) => {
        const dt = toBucketDate(row?.bucket, granularity);
        if (!dt) return;
        const keyDate = granularity === 'hour' ? startOfHour(dt) : startOfDay(dt);
        byTs.set(keyDate.getTime(), Number(row?.value) || 0);
    });

    const padded = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
        const cursorKey = cursor.getTime();
        padded.push({
            bucket: formatBucketValue(cursor, granularity, sampleBucket),
            value: byTs.get(cursorKey) ?? 0
        });
        cursor = granularity === 'hour' ? addHours(cursor, 1) : addDays(cursor, 1);
    }

    return padded;
}

function KpiInfoTitle({ label, info }) {
    return (
        <span className="admin-platform-analytics__kpi-title">
            {label}
            <span className="admin-platform-analytics__kpi-info-wrap">
                <Icon icon="mdi:information-outline" />
                <span className="admin-platform-analytics__kpi-info-tooltip">{info}</span>
            </span>
        </span>
    );
}

function AdminPlatformAnalytics() {
    const { isAuthenticated } = useAuth();
    const [rangeMode, setRangeMode] = useState('month');
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [customRange, setCustomRange] = useState(null);
    const [platformView, setPlatformView] = useState('web');
    const [previousPeriodMode, setPreviousPeriodMode] = useState('adjacent');
    /** 'average' | 'median' — session length KPI (same underlying first→last event window) */
    const [sessionDurationMode, setSessionDurationMode] = useState('average');
    const [debouncedAnchor, setDebouncedAnchor] = useState(() => new Date());
    const [debouncedMode, setDebouncedMode] = useState('month');
    const [debouncedCustomRange, setDebouncedCustomRange] = useState(null);
    const [chartHoverSync, setChartHoverSync] = useState(null);
    const [showFiltersPopup, setShowFiltersPopup] = useState(false);
    const [showDetailedChartsPopup, setShowDetailedChartsPopup] = useState(false);
    const [isCustomRangePickerOpen, setIsCustomRangePickerOpen] = useState(false);
    const handleChartHoverSyncChange = useCallback((signal) => {
        if (!signal || signal.type === 'leave') {
            setChartHoverSync(null);
            return;
        }
        setChartHoverSync(signal);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedAnchor(anchorDate);
            setDebouncedMode(rangeMode);
            setDebouncedCustomRange(customRange);
        }, 350);
        return () => clearTimeout(t);
    }, [anchorDate, rangeMode, customRange]);

    const snapshotParams = useMemo(() => {
        const { start, end } =
            debouncedMode === 'custom' && debouncedCustomRange
                ? debouncedCustomRange
                : computeRange(debouncedMode, debouncedAnchor);
        const prev =
            previousPeriodMode === 'lastYear'
                ? 'year_ago'
                : 'adjacent';
        const granularity = debouncedMode === 'day' ? 'hour' : 'day';
        const params = {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            previousPeriodMode: prev,
            timeseriesGranularity: debouncedMode === 'all' ? 'week' : granularity
        };
        if (platformView !== 'all') {
            params.platform = platformView;
        }
        return params;
    }, [debouncedAnchor, debouncedMode, debouncedCustomRange, platformView, previousPeriodMode]);

    const snapshotUrl = isAuthenticated ? '/dashboard/general-snapshot' : null;

    const { data: snapRes, loading, error, refetch } = useFetch(snapshotUrl, {
        method: 'GET',
        params: snapshotParams,
        cache: { enabled: true, ttlMs: ADMIN_ANALYTICS_CACHE_TTL_MS }
    });

    const payload = snapRes?.data;
    const kpi = payload?.kpiSummary;
    const ts = payload?.timeseries;
    const mobile = payload?.mobileSummary;
    const kpiCurrent = kpi?.current || {};

    const comparisonEnabled = previousPeriodMode !== 'none';

    const prevTimeseriesParams = useMemo(() => {
        if (!comparisonEnabled || !kpi?.windows?.previous || !ts?.granularity) return null;
        const w = kpi.windows.previous;
        const p = {
            startDate: w.start,
            endDate: w.end,
            granularity: ts.granularity,
            metrics: TREND_METRICS_PARAM
        };
        if (platformView !== 'all') {
            p.platform = platformView;
        }
        return p;
    }, [comparisonEnabled, kpi, ts?.granularity, platformView]);

    const prevTsUrl = isAuthenticated && comparisonEnabled && prevTimeseriesParams ? '/dashboard/timeseries' : null;
    const { data: prevTsRes, loading: prevTsLoading } = useFetch(prevTsUrl, {
        method: 'GET',
        params: prevTimeseriesParams || {},
        cache: { enabled: true, ttlMs: ADMIN_ANALYTICS_CACHE_TTL_MS }
    });

    const comparePeriodLabel =
        previousPeriodMode === 'lastYear' ? 'Same window last year' : 'Previous period';
    const metricTotalsFromKpi = useMemo(
        () => ({
            screen_views: kpiCurrent.pageViews,
            sessions: kpiCurrent.sessions,
            unique_visitors: kpiCurrent.uniqueUsers,
            explore_screen_views: kpiCurrent.exploreScreenViews ?? kpiCurrent.explore_screen_views,
            new_users: kpiCurrent.newUsers
        }),
        [kpiCurrent]
    );

    const trendCharts = useMemo(() => {
        const prevInner = prevTsRes?.data;
        const useFullMonthDayDomain = debouncedMode === 'month' && ts?.granularity === 'day';
        const currentWindow =
            debouncedMode === 'custom' && debouncedCustomRange
                ? debouncedCustomRange
                : computeRange(debouncedMode, debouncedAnchor);
        const previousWindowStart = kpi?.windows?.previous?.start ? new Date(kpi.windows.previous.start) : null;
        const previousWindowEnd = kpi?.windows?.previous?.end ? new Date(kpi.windows.previous.end) : null;

        return TREND_METRIC_DEFS.map((def) => {
            const curRows = ts?.series?.[def.key];
            const pRows = comparisonEnabled ? prevInner?.series?.[def.key] : null;
            const curRowsExcludingEnd = Array.isArray(curRows) && curRows.length > 1 ? curRows.slice(0, -1) : curRows;
            const pRowsExcludingEnd = Array.isArray(pRows) && pRows.length > 1 ? pRows.slice(0, -1) : pRows;
            const paddedCurrentRows = padTimeseriesRows(curRowsExcludingEnd, {
                granularity: ts?.granularity,
                start: currentWindow.start,
                end: currentWindow.end,
                capEndAtNow: true
            });
            const paddedPreviousRows = comparisonEnabled
                ? padTimeseriesRows(pRowsExcludingEnd, {
                      granularity: ts?.granularity,
                      start: previousWindowStart,
                      end: previousWindowEnd,
                      capEndAtNow: false
                  })
                : pRowsExcludingEnd;

            if (useFullMonthDayDomain && paddedCurrentRows?.length) {
                const spec = buildComparisonVisxSeriesForCalendarMonthView(
                    debouncedAnchor,
                    paddedCurrentRows,
                    paddedPreviousRows,
                    def.color,
                    { thisPeriod: 'This period', compare: comparePeriodLabel },
                    {
                        compareSubMonths: previousPeriodMode === 'lastYear' ? 12 : 1,
                        excludePreviousPeriodEnd: false
                    }
                );
                return {
                    def,
                    series: spec.series,
                    xDomain: Array.isArray(spec.xDomain) && spec.xDomain.length > 1 ? spec.xDomain.slice(0, -1) : spec.xDomain,
                    showEndGlyph: spec.showEndGlyph,
                    totalValue:
                        metricTotalsFromKpi[def.key] ??
                        paddedCurrentRows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0)
                };
            }

            const { series } = buildComparisonVisxSeries(
                paddedCurrentRows,
                paddedPreviousRows,
                def.color,
                { thisPeriod: 'This period', compare: comparePeriodLabel },
                { excludePreviousPeriodEnd: false }
            );
            return {
                def,
                series,
                xDomain: undefined,
                showEndGlyph: false,
                totalValue:
                    metricTotalsFromKpi[def.key] ??
                    (paddedCurrentRows || []).reduce((sum, row) => sum + (Number(row?.value) || 0), 0)
            };
        });
    }, [ts, prevTsRes, comparisonEnabled, comparePeriodLabel, debouncedMode, debouncedAnchor, previousPeriodMode, metricTotalsFromKpi, debouncedCustomRange, kpi]);

    const showCompare = previousPeriodMode !== 'none' && kpi?.deltas;

    const handleRangeModeChange = useCallback((mode) => {
        const previousMode = rangeMode;
        const previousWindow =
            previousMode === 'custom' && customRange
                ? customRange
                : computeRange(previousMode, anchorDate);
        const shrinkingToMoreGranular =
            getRangeGranularityRank(mode) > getRangeGranularityRank(previousMode);
        const baseDate = shrinkingToMoreGranular ? previousWindow.start : new Date();

        setRangeMode(mode);
        if (mode !== 'custom') {
            setCustomRange(null);
        }
        if (mode === 'all') return;
        if (mode === 'custom') return;
        if (mode === 'month') setAnchorDate(startOfMonth(baseDate));
        else if (mode === 'week') setAnchorDate(startOfWeek(baseDate, { weekStartsOn: 0 }));
        else setAnchorDate(startOfDay(baseDate));
    }, [rangeMode, customRange, anchorDate]);
    const handleTrendRangeSelect = useCallback(({ startXValue, endXValue }) => {
        if (!startXValue || !endXValue) return;
        const normalizedStart = parseBucketBoundary(startXValue, 'start');
        const normalizedEnd = parseBucketBoundary(endXValue, 'end');
        if (!normalizedStart || !normalizedEnd) return;
        setCustomRange({ start: normalizedStart, end: normalizedEnd });
        setRangeMode('custom');
        setAnchorDate(normalizedStart);
    }, []);
    const resetCustomRange = useCallback(() => {
        setCustomRange(null);
        setRangeMode('month');
        setAnchorDate(startOfMonth(new Date()));
    }, []);
    const applyCustomDateRange = useCallback((nextRange, shouldClosePicker = false) => {
        if (!Array.isArray(nextRange) || nextRange.length !== 2 || !nextRange[0] || !nextRange[1]) return;
        const [start, end] = nextRange;
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
        if (endDate <= startDate) return;
        setCustomRange({ start: startDate, end: endDate });
        setRangeMode('custom');
        setAnchorDate(startDate);
        if (shouldClosePicker) {
            setIsCustomRangePickerOpen(false);
        }
    }, []);
    const handleCustomDateRangeChange = useCallback((nextRange) => {
        applyCustomDateRange(nextRange, true);
    }, [applyCustomDateRange]);
    const handleCustomDateRangeSelect = useCallback((nextRange) => {
        applyCustomDateRange(nextRange, true);
    }, [applyCustomDateRange]);

    const navPrev = useCallback(() => {
        if (rangeMode === 'month') setAnchorDate((d) => subMonths(startOfMonth(d), 1));
        else if (rangeMode === 'week') setAnchorDate((d) => subWeeks(startOfWeek(d, { weekStartsOn: 0 }), 1));
        else if (rangeMode === 'day') setAnchorDate((d) => subDays(d, 1));
        else if (rangeMode === 'custom' && customRange?.start && customRange?.end) {
            const windowMs = customRange.end.getTime() - customRange.start.getTime();
            if (windowMs <= 0) return;
            const nextStart = new Date(customRange.start.getTime() - windowMs);
            const nextEnd = new Date(customRange.end.getTime() - windowMs);
            setCustomRange({ start: nextStart, end: nextEnd });
            setAnchorDate(nextStart);
        }
    }, [rangeMode, customRange]);
    const navNext = useCallback(() => {
        if (rangeMode === 'month') setAnchorDate((d) => addMonths(startOfMonth(d), 1));
        else if (rangeMode === 'week') setAnchorDate((d) => addWeeks(startOfWeek(d, { weekStartsOn: 0 }), 1));
        else if (rangeMode === 'day') setAnchorDate((d) => addDays(d, 1));
        else if (rangeMode === 'custom' && customRange?.start && customRange?.end) {
            const windowMs = customRange.end.getTime() - customRange.start.getTime();
            if (windowMs <= 0) return;
            const nextStart = new Date(customRange.start.getTime() + windowMs);
            const nextEnd = new Date(customRange.end.getTime() + windowMs);
            setCustomRange({ start: nextStart, end: nextEnd });
            setAnchorDate(nextStart);
        }
    }, [rangeMode, customRange]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (rangeMode === 'all' || isTypingTarget(event.target)) return;
            const key = String(event.key || '').toLowerCase();
            if (showFiltersPopup && event.key === 'Escape') {
                setShowFiltersPopup(false);
                return;
            }
            if (key === 'm' || key === 'w' || key === 'd') {
                event.preventDefault();
                if (key === 'm') handleRangeModeChange('month');
                else if (key === 'w') handleRangeModeChange('week');
                else handleRangeModeChange('day');
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                navPrev();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                navNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [rangeMode, navPrev, navNext, showFiltersPopup, handleRangeModeChange]);

    if (!isAuthenticated) {
        return null;
    }

    if (loading && !payload) {
        return <div className="admin-platform-analytics loading">Loading platform analytics…</div>;
    }

    if (error) {
        return (
            <div className="admin-platform-analytics error">
                <p>{error}</p>
                <button type="button" className="admin-platform-analytics__btn" onClick={() => refetch()}>
                    Retry
                </button>
            </div>
        );
    }

    const cur = kpi?.current || {};
    const prev = kpi?.previous || {};
    const d = kpi?.deltas || {};

    const sessionSeconds =
        sessionDurationMode === 'median'
            ? cur.medianSessionDuration ?? cur.avgSessionDuration
            : cur.avgSessionDuration;
    const sessionPrevSeconds =
        sessionDurationMode === 'median'
            ? prev.medianSessionDuration ?? prev.avgSessionDuration
            : prev.avgSessionDuration;
    const sessionDelta =
        sessionDurationMode === 'median'
            ? d.medianSessionDuration ?? d.avgSessionDuration
            : d.avgSessionDuration;
    const uniqueDevicesCurrentRaw = cur.uniqueDevices ?? cur.unique_devices ?? mobile?.overview?.uniqueDevices;
    const uniqueDevicesPrevious = prev.uniqueDevices ?? prev.unique_devices;
    const uniqueDevicesDelta = d.uniqueDevices ?? d.unique_devices;
    const hasUniqueDevicesMetric = uniqueDevicesCurrentRaw !== undefined && uniqueDevicesCurrentRaw !== null;
    const windowLabelMap = {
        month: 'Month',
        week: 'Week',
        day: 'Day',
        custom: 'Custom',
        all: 'All time'
    };
    const comparisonLabelMap = {
        none: 'No comparison',
        adjacent: 'Previous period',
        lastYear: 'Same window last year'
    };
    const detailedRangeBoundsLabel = (() => {
        if (rangeMode === 'custom' && customRange) {
            return `${format(customRange.start, 'MMM d, yyyy h:mm aa')} – ${format(customRange.end, 'MMM d, yyyy h:mm aa')}`;
        }
        if (rangeMode === 'all') {
            const allRange = computeRange('all', anchorDate);
            return `${format(allRange.start, 'MMM d, yyyy')} – ${format(allRange.end, 'MMM d, yyyy')}`;
        }
        const computed = computeRange(rangeMode, anchorDate);
        return `${format(computed.start, 'MMM d, yyyy')} – ${format(computed.end, 'MMM d, yyyy')}`;
    })();

    return (
        <div className="admin-platform-analytics">
            <div className="top-content">
                <div className="admin-platform-analytics__toolbar">
                    <div className="admin-platform-analytics__toolbar-left">
                        {rangeMode !== 'all' && rangeMode !== 'custom' ? (
                            <div className="admin-platform-analytics__nav admin-platform-analytics__nav--inline">
                                <button type="button" onClick={navPrev} aria-label="Previous">
                                    <Icon icon="mdi:chevron-left" />
                                </button>
                                <span>
                                    {rangeMode === 'month' &&
                                        `${format(startOfMonth(anchorDate), 'MMM d')} – ${format(endOfMonth(anchorDate), 'MMM d, yyyy')}`}
                                    {rangeMode === 'week' &&
                                        `${format(startOfWeek(anchorDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(
                                            endOfWeek(anchorDate, { weekStartsOn: 0 }),
                                            'MMM d, yyyy'
                                        )}`}
                                    {rangeMode === 'day' && format(anchorDate, 'MMM d, yyyy')}
                                </span>
                                <button type="button" onClick={navNext} aria-label="Next">
                                    <Icon icon="mdi:chevron-right" />
                                </button>
                            </div>
                        ) : rangeMode === 'custom' && customRange ? (
                            <div className="admin-platform-analytics__nav admin-platform-analytics__nav--inline admin-platform-analytics__nav--all">
                                <span>
                                    {`${format(customRange.start, 'MMM d, yyyy')} – ${format(customRange.end, 'MMM d, yyyy')}`}
                                </span>
                            </div>
                        ) : (
                            <div className="admin-platform-analytics__nav admin-platform-analytics__nav--inline admin-platform-analytics__nav--all">
                                <span>All time range (last 366 days)</span>
                            </div>
                        )}
                        <div className="admin-platform-analytics__quick-window-buttons" aria-label="Quick window controls">
                            {QUICK_RANGE_OPTIONS.map(({ id, label, shortcut }) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`admin-platform-analytics__kbd-tooltip-button ${rangeMode === id ? 'active' : ''}`}
                                    onClick={() => handleRangeModeChange(id)}
                                >
                                    {label}
                                    <KeybindTooltip
                                        label={`${label[0].toUpperCase()}${label.slice(1)}`}
                                        keybind={shortcut}
                                    />
                                </button>
                            ))}
                        </div>
                        <div className="admin-platform-analytics__active-filters" aria-label="Current filters">
                            <span>Window: {windowLabelMap[rangeMode] || rangeMode}</span>
                            <span>Comparison: {comparisonLabelMap[previousPeriodMode] || previousPeriodMode}</span>
                            <span>Surface: {platformView === 'all' ? 'All platforms' : platformView}</span>
                            <span>Session stat: {sessionDurationMode === 'median' ? 'Median' : 'Average'}</span>
                        </div>
                    </div>
                    <div className="admin-platform-analytics__toolbar-right">
                        <div className="admin-platform-analytics__date-range-picker-wrap">
                            <DateRangePicker
                                value={customRange ? [customRange.start, customRange.end] : null}
                                onChange={handleCustomDateRangeChange}
                                onSelect={handleCustomDateRangeSelect}
                                format="MMM dd, yyyy hh:mm aa"
                                character=" - "
                                placeholder="Custom date/time range"
                                placement="bottomEnd"
                                showMeridian
                                showTime
                                showOneCalendar
                                editable={false}
                                cleanable={false}
                                ranges={[]}
                                open={isCustomRangePickerOpen}
                                onOpen={() => setIsCustomRangePickerOpen(true)}
                                onClose={() => setIsCustomRangePickerOpen(false)}
                            />
                        </div>
                        <div className="admin-platform-analytics__filters-trigger-wrap">
                            <button
                                type="button"
                                className="admin-platform-analytics__filters-trigger"
                                onClick={() => setShowFiltersPopup((v) => !v)}
                                aria-expanded={showFiltersPopup}
                                aria-haspopup="dialog"
                            >
                                <Icon icon="mdi:tune-variant" />
                                Filters
                            </button>
                            {showFiltersPopup ? (
                                <div className="admin-platform-analytics__filters-popup" role="dialog" aria-label="Analytics display filters">
                                <div className="admin-platform-analytics__popup-group">
                                    <span>Window</span>
                                    <div className="admin-platform-analytics__popup-buttons">
                                        {['month', 'week', 'day', 'all'].map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                className={`admin-platform-analytics__kbd-tooltip-button ${rangeMode === m ? 'active' : ''}`}
                                                onClick={() => handleRangeModeChange(m)}
                                            >
                                                {m}
                                                {m === 'month' || m === 'week' || m === 'day' ? (
                                                    <KeybindTooltip
                                                        label={m === 'month' ? 'Month' : m === 'week' ? 'Week' : 'Day'}
                                                        keybind={m === 'month' ? 'M' : m === 'week' ? 'W' : 'D'}
                                                    />
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="admin-platform-analytics__popup-group">
                                    <span>Comparison</span>
                                    <div className="admin-platform-analytics__popup-buttons">
                                        {[
                                            { id: 'none', label: 'No comparison' },
                                            { id: 'adjacent', label: 'Previous period' },
                                            { id: 'lastYear', label: 'Same window last year' }
                                        ].map(({ id, label }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                className={previousPeriodMode === id ? 'active' : ''}
                                                onClick={() => setPreviousPeriodMode(id)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="admin-platform-analytics__popup-group">
                                    <span>Surface</span>
                                    <div className="admin-platform-analytics__popup-buttons">
                                        {['web', 'mobile', 'all'].map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                className={platformView === p ? 'active' : ''}
                                                onClick={() => setPlatformView(p)}
                                            >
                                                {p === 'all' ? 'All platforms' : p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="admin-platform-analytics__popup-group">
                                    <span>Session length</span>
                                    <div className="admin-platform-analytics__popup-buttons">
                                        {[
                                            { id: 'average', label: 'Average' },
                                            { id: 'median', label: 'Median' }
                                        ].map(({ id, label }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                className={sessionDurationMode === id ? 'active' : ''}
                                                onClick={() => setSessionDurationMode(id)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="admin-platform-analytics__popup-footer">
                                    <button type="button" onClick={() => setShowFiltersPopup(false)}>
                                        Close
                                    </button>
                                </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="analytics-container admin-platform-analytics__kpis">
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="Total users"
                                info="How many accounts exist overall up to this point. This is your full user base, not just activity in this window."
                            />
                        }
                        value={formatAnalyticsNumber(cur.totalUsers)}
                        subtitle={<span>Cumulative (User model)</span>}
                        icon="mdi:account-group"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="New users"
                                info="How many people joined during the selected time window."
                            />
                        }
                        value={formatAnalyticsNumber(cur.newUsers)}
                        subtitle={
                            showCompare ? (
                                <ComparisonBadge delta={d.newUsers} previous={prev.newUsers} />
                            ) : (
                                <span>Registered in window</span>
                            )
                        }
                        icon="mdi:account-plus"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="Unique visitors"
                                info="How many different people visited during this window (each person counted once)."
                            />
                        }
                        value={formatAnalyticsNumber(cur.uniqueUsers)}
                        subtitle={
                            showCompare ? <ComparisonBadge delta={d.uniqueUsers} previous={prev.uniqueUsers} /> : <span>Pipeline</span>
                        }
                        icon="mdi:account-multiple"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="Unique devices"
                                info="How many different phones/computers were used during this window."
                            />
                        }
                        value={hasUniqueDevicesMetric ? formatAnalyticsNumber(uniqueDevicesCurrentRaw) : '—'}
                        subtitle={
                            showCompare && uniqueDevicesPrevious != null && hasUniqueDevicesMetric ? (
                                <ComparisonBadge delta={uniqueDevicesDelta} previous={uniqueDevicesPrevious} />
                            ) : (
                                <span>
                                    {hasUniqueDevicesMetric
                                        ? 'Distinct devices in window'
                                        : 'Not available for this surface yet'}
                                </span>
                            )
                        }
                        icon="mdi:devices"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="Sessions"
                                info="How many separate visits happened in this window."
                            />
                        }
                        value={formatAnalyticsNumber(cur.sessions)}
                        subtitle={
                            showCompare ? <ComparisonBadge delta={d.sessions} previous={prev.sessions} /> : <span>Distinct session_id</span>
                        }
                        icon="mdi:chart-timeline"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label="Page views"
                                info="How many screens/pages were viewed in total during this window."
                            />
                        }
                        value={formatAnalyticsNumber(cur.pageViews)}
                        subtitle={
                            showCompare ? <ComparisonBadge delta={d.pageViews} previous={prev.pageViews} /> : <span>screen_view</span>
                        }
                        icon="mdi:eye"
                    />
                    <KpiCard
                        title={
                            <KpiInfoTitle
                                label={sessionDurationMode === 'median' ? 'Median session' : 'Avg session'}
                                info={
                                    sessionDurationMode === 'median'
                                        ? 'A typical session length, where very long or very short sessions affect the result less.'
                                        : 'The average amount of time people spend per visit.'
                                }
                            />
                        }
                        value={formatAnalyticsDuration(sessionSeconds)}
                        subtitle={
                            showCompare ? (
                                <ComparisonBadge delta={sessionDelta} previous={sessionPrevSeconds} />
                            ) : (
                                <span>
                                    {sessionDurationMode === 'median'
                                        ? 'Median · first to last event'
                                        : 'Mean · first to last event'}
                                </span>
                            )
                        }
                        icon="mdi:clock-outline"
                    />
                </div>
            </div>

            <div className="admin-migration-section admin-platform-analytics__chart-wrap">
                <div className="admin-platform-analytics__chart-header">
                    <h3>Trends</h3>
                    <div className="admin-platform-analytics__chart-actions">
                        <button
                            type="button"
                            className="admin-platform-analytics__chart-reset-btn"
                            onClick={() => setShowDetailedChartsPopup(true)}
                        >
                            Detailed view
                        </button>
                        <button
                            type="button"
                            className="admin-platform-analytics__chart-reset-btn"
                            onClick={resetCustomRange}
                            disabled={rangeMode !== 'custom'}
                        >
                            Reset
                        </button>
                    </div>
                </div>
                <div className="admin-platform-analytics__charts-grid">
                    {trendCharts.map(({ def, series, xDomain, showEndGlyph, totalValue }) => (
                        <AdminPlatformMetricChart
                            key={def.key}
                            title={def.title}
                            totalValue={formatAnalyticsNumber(totalValue)}
                            series={series}
                            granularity={ts?.granularity || 'day'}
                            loadingCompare={comparisonEnabled && prevTsLoading}
                            emptyMessage="No data for this metric in range"
                            xDomain={xDomain}
                            showEndGlyph={showEndGlyph}
                            syncId={`admin-trend-${def.key}`}
                            hoverSyncSignal={chartHoverSync}
                            onHoverSyncChange={handleChartHoverSyncChange}
                            enableRangeSelection
                            onRangeSelect={handleTrendRangeSelect}
                        />
                    ))}
                </div>
            </div>

            <Popup
                isOpen={showDetailedChartsPopup}
                onClose={() => setShowDetailedChartsPopup(false)}
                customClassName="wider-content admin-platform-analytics__detailed-popup"
            >
                <div className="admin-platform-analytics__detailed-popup-body">
                    <div className="admin-platform-analytics__detailed-popup-header">
                        <h3>Detailed trend graphs</h3>
                        <p>Expanded charts with denser point-level detail. Uses the same date range and comparison settings.</p>
                    </div>
                    <div className="admin-platform-analytics__detailed-popup-controls">
                        <div className="admin-platform-analytics__detailed-popup-bounds admin-platform-analytics__detailed-popup-bounds--prominent">
                            <strong>Date bounds:</strong> {detailedRangeBoundsLabel}
                        </div>
                        <div className="admin-platform-analytics__detailed-popup-controls-right">
                            <div className="admin-platform-analytics__quick-window-buttons" aria-label="Detailed quick window controls">
                                {QUICK_RANGE_OPTIONS.map(({ id, label, shortcut }) => (
                                    <button
                                        key={`detailed-${id}`}
                                        type="button"
                                        className={`admin-platform-analytics__kbd-tooltip-button ${rangeMode === id ? 'active' : ''}`}
                                        onClick={() => handleRangeModeChange(id)}
                                    >
                                        {label}
                                        <KeybindTooltip
                                            label={`${label[0].toUpperCase()}${label.slice(1)}`}
                                            keybind={shortcut}
                                        />
                                    </button>
                                ))}
                            </div>
                            <div className="admin-platform-analytics__date-range-picker-wrap">
                                <DateRangePicker
                                    value={customRange ? [customRange.start, customRange.end] : null}
                                    onChange={handleCustomDateRangeChange}
                                    onSelect={handleCustomDateRangeSelect}
                                    format="MMM dd, yyyy hh:mm aa"
                                    character=" - "
                                    placeholder="Custom date/time range"
                                    placement="bottomEnd"
                                    showMeridian
                                    showTime
                                    showOneCalendar
                                    editable={false}
                                    cleanable={false}
                                    ranges={[]}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="admin-platform-analytics__detailed-popup-charts">
                        {trendCharts.map(({ def, series, xDomain, showEndGlyph, totalValue }) => (
                            <AdminPlatformMetricChart
                                key={`detailed-${def.key}`}
                                title={def.title}
                                totalValue={formatAnalyticsNumber(totalValue)}
                                series={series}
                                granularity={ts?.granularity || 'day'}
                                loadingCompare={comparisonEnabled && prevTsLoading}
                                emptyMessage="No data for this metric in range"
                                xDomain={xDomain}
                                showEndGlyph={showEndGlyph}
                                syncId={`admin-trend-detail-${def.key}`}
                                hoverSyncSignal={chartHoverSync}
                                onHoverSyncChange={handleChartHoverSyncChange}
                                height={220}
                                detailedView
                                enableRangeSelection
                                onRangeSelect={handleTrendRangeSelect}
                            />
                        ))}
                    </div>
                </div>
            </Popup>

            <div className="admin-migration-section admin-platform-analytics__mobile">
                <h3>
                    <Icon icon="mdi:cellphone" /> Mobile app snapshot
                </h3>
                <p className="admin-migration-hint">iOS + Android (same pipeline as web). API errors are a release-health signal.</p>
                <div className="admin-platform-analytics__mobile-grid">
                    <div>
                        <strong>Sessions</strong>
                        <div>{formatAnalyticsNumber(mobile?.overview?.sessions)}</div>
                    </div>
                    <div>
                        <strong>Screen views</strong>
                        <div>{formatAnalyticsNumber(mobile?.overview?.pageViews)}</div>
                    </div>
                    <div>
                        <strong>Unique users</strong>
                        <div>{formatAnalyticsNumber(mobile?.overview?.uniqueUsers)}</div>
                    </div>
                </div>
                <div className="admin-platform-analytics__two-col">
                    <div>
                        <h4>Top screens</h4>
                        <ul>
                            {(mobile?.topScreens || []).slice(0, 8).map((row, i) => (
                                <li key={i}>
                                    <span>{row.screen}</span>
                                    <span>{formatAnalyticsNumber(row.views)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4>Top events</h4>
                        <ul>
                            {(mobile?.topEvents || []).slice(0, 8).map((row, i) => (
                                <li key={i}>
                                    <span>{row.event}</span>
                                    <span>{formatAnalyticsNumber(row.count)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="admin-platform-analytics__two-col">
                    <div>
                        <h4>Versions</h4>
                        <ul>
                            {(mobile?.versionAdoption || []).slice(0, 6).map((row, i) => (
                                <li key={i}>
                                    <span>
                                        {row.platform} {row.app_version || '—'}
                                    </span>
                                    <span>{formatAnalyticsNumber(row.users)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4>API errors by version</h4>
                        <ul>
                            {(mobile?.apiErrorsByVersion || []).map((row, i) => (
                                <li key={i}>
                                    <span>{row.app_version}</span>
                                    <span>{formatAnalyticsNumber(row.count)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="admin-platform-analytics__links">
                <Link to="/analytics-dashboard">Open full web analytics tables</Link>
            </div>

            <p className="admin-platform-analytics__footnote">
                When “Exclude admins from tracking” is enabled in Beacon, admin users are not counted in pipeline metrics. Totals from
                the User collection are unaffected.
            </p>
        </div>
    );
}

export default AdminPlatformAnalytics;
