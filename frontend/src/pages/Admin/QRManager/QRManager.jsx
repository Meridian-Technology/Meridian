import React, { useState, useEffect, useRef, useMemo } from 'react';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../components/Popup/Popup';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import EmptyState from '../../../components/EmptyState/EmptyState';
import CreateQRModal from './components/CreateQRModal';
import EditQRModal from './components/EditQRModal';
import EventDashboardChart from '../../ClubDash/EventsManagement/components/EventDashboard/components/EventDashboardChart/EventDashboardChart';
import DateTimePicker from '../../../components/DateTimePicker/DateTimePicker';
import './QRManager.scss';

function SparklinePreview({ data = [], color = '#4DAA57', width = 72, height = 28, id }) {
    if (!data?.length) return null;
    const values = data.map((d) => d.y);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const padding = 2;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const points = values.map((v, i) => {
        const x = padding + (i / (values.length - 1 || 1)) * w;
        const y = padding + h - ((v - min) / range) * h;
        return `${x},${y}`;
    });
    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `${linePath} L ${padding + w},${padding + h} L ${padding},${padding + h} Z`;
    const gradId = `sparkline-grad-${id || 'default'}`;
    return (
        <svg width={width} height={height} className="qr-sparkline" aria-hidden>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function toLibraryDotType(uiType) {
    if (uiType === 'rounded' || uiType === 'teardrop') return 'extra-rounded';
    return uiType || 'extra-rounded';
}

function toLibraryCornerType(uiType) {
    if (uiType === 'dot') return { square: 'dot', dot: 'dot' };
    if (uiType === 'rounded' || uiType === 'teardrop') return { square: 'extra-rounded', dot: 'extra-rounded' };
    return { square: uiType || 'extra-rounded', dot: uiType === 'extra-rounded' ? 'extra-rounded' : 'square' };
}

function formatSemanticDate(dateStr) {
    const parsed = dateStr?.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
    if (isNaN(parsed.getTime())) return null;
    const date = parsed;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StyledQRCode({ url, fgColor = '#414141', bgColor = '#ffffff', transparentBg = false, dotType = 'extra-rounded', cornerType = 'extra-rounded', size = 200 }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!url || !containerRef.current) return;

        const loadQR = async () => {
            const { default: QRCodeStyling } = await import('qr-code-styling');
            const corners = toLibraryCornerType(cornerType);
            const qr = new QRCodeStyling({
                width: size,
                height: size,
                type: 'svg',
                data: url,
                dotsOptions: { color: fgColor, type: toLibraryDotType(dotType) },
                backgroundOptions: { color: transparentBg ? 'transparent' : bgColor },
                cornersSquareOptions: { type: corners.square, color: fgColor },
                cornersDotOptions: { type: corners.dot, color: fgColor }
            });
            containerRef.current.innerHTML = '';
            qr.append(containerRef.current);
        };
        loadQR();
        return () => {
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, [url, fgColor, bgColor, transparentBg, dotType, cornerType, size]);

    return <div ref={containerRef} className="styled-qr-container" style={{ width: size, height: size }} />;
}

const QRManager = () => {
    const { addNotification } = useNotification();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingQR, setEditingQR] = useState(null);
    const [expandedQR, setExpandedQR] = useState(null);
    const [splitByQR, setSplitByQR] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [dateRangeOverride, setDateRangeOverride] = useState(null);

    const qrParams = new URLSearchParams({
        page: currentPage,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    const analyticsUrl = useMemo(() => {
        const base = '/api/qr/analytics';
        if (!dateRangeOverride?.startDate || !dateRangeOverride?.endDate) return base;
        const params = new URLSearchParams({
            startDate: dateRangeOverride.startDate,
            endDate: dateRangeOverride.endDate
        });
        return `${base}?${params}`;
    }, [dateRangeOverride]);

    const { data: qrData, loading: qrLoading, error: qrError, refetch: refetchQRCodes } = useFetch(`/api/qr?${qrParams}`);
    const { data: analyticsData, refetch: refetchAnalytics } = useFetch(analyticsUrl);

    const qrCodes = qrData?.qrCodes || [];
    const totalPages = qrData?.pagination?.totalPages || 1;
    const summary = analyticsData?.summary || {};
    const dailyScans = analyticsData?.dailyScans || {};
    const byQR = analyticsData?.byQR || [];
    const dateRange = analyticsData?.dateRange || {};

    function fillDateRange(startStr, endStr, dataMap) {
        if (!startStr || !endStr) return [];
        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T23:59:59');
        const result = [];
        const d = new Date(start);
        while (d <= end) {
            const key = d.toISOString().slice(0, 10);
            result.push({ x: key, y: dataMap[key] ?? 0 });
            d.setDate(d.getDate() + 1);
        }
        return result;
    }

    function toDateStr(val) {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }

    const todayStr = toDateStr(new Date());
    const effectiveDateRange = (dateRangeOverride?.startDate && dateRangeOverride?.endDate)
        ? dateRangeOverride
        : dateRange;

    const pickerMinDate = dateRange?.startDate ? new Date(dateRange.startDate + 'T00:00:00') : null;
    const pickerMaxDate = todayStr ? new Date(todayStr + 'T23:59:59') : new Date();
    const startPickerMax = effectiveDateRange?.endDate ? new Date(effectiveDateRange.endDate + 'T23:59:59') : pickerMaxDate;
    const endPickerMin = effectiveDateRange?.startDate ? new Date(effectiveDateRange.startDate + 'T00:00:00') : pickerMinDate;

    const handleStartDateChange = (iso) => {
        if (!iso) return;
        const d = toDateStr(iso);
        setDateRangeOverride((prev) => ({
            startDate: d,
            endDate: prev?.endDate || effectiveDateRange?.endDate || todayStr
        }));
    };
    const handleEndDateChange = (iso) => {
        if (!iso) return;
        const d = toDateStr(iso);
        setDateRangeOverride((prev) => ({
            startDate: prev?.startDate || effectiveDateRange?.startDate,
            endDate: d
        }));
    };
    const clearDateRangeOverride = () => setDateRangeOverride(null);

    function toCumulative(data) {
        let sum = 0;
        return data.map((d) => {
            sum += d.y;
            return { ...d, y: sum };
        });
    }

    const chartEndDate = dateRange.endDate && todayStr && dateRange.endDate > todayStr ? todayStr : dateRange.endDate;
    const chartData = toCumulative(fillDateRange(dateRange.startDate, chartEndDate, dailyScans));
    const chartXDomain = dateRange.startDate && dateRange.endDate
        ? fillDateRange(dateRange.startDate, dateRange.endDate, {}).map((d) => d.x)
        : undefined;

    const CHART_SERIES_COLORS = ['#4DAA57', '#2563eb', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const chartSeries = splitByQR
        ? byQR
              .filter((q) => {
                  const qrStart = toDateStr(q.createdAt);
                  return qrStart && chartEndDate;
              })
              .map((q, i) => {
                  const qrStart = toDateStr(q.createdAt);
                  const qrData = toCumulative(fillDateRange(qrStart, chartEndDate, q.dailyScans || {}));
                  return {
                      data: qrData,
                      color: CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length],
                      label: q.name || 'QR'
                  };
              })
              .filter((s) => s.data.length > 0)
        : null;

    const handleDelete = async (qr) => {
        if (!window.confirm(`Delete QR "${qr.name}"?`)) return;
        const res = await apiRequest(`/api/qr/${qr.name}`, null, { method: 'DELETE' });
        if (res.error) {
            addNotification({ title: 'Error', message: res.error, type: 'error' });
        } else {
            refetchQRCodes();
            refetchAnalytics();
            if (expandedQR === qr.name) setExpandedQR(null);
        }
    };

    const copyLink = (name) => {
        const url = `${window.location.origin}/qr/${encodeURIComponent(name)}`;
        navigator.clipboard.writeText(url);
        addNotification({ title: 'Copied', message: 'QR link copied to clipboard', type: 'success' });
    };

    const downloadQR = async (qr) => {
        try {
            const { default: QRCodeStyling } = await import('qr-code-styling');
            const url = `${window.location.origin}/qr/${encodeURIComponent(qr.name)}`;
            const corners = toLibraryCornerType(qr.cornerType || 'extra-rounded');
            const qrInstance = new QRCodeStyling({
                width: 800,
                height: 800,
                type: 'png',
                data: url,
                dotsOptions: { color: qr.fgColor || '#414141', type: toLibraryDotType(qr.dotType) },
                backgroundOptions: { color: qr.transparentBg ? 'transparent' : (qr.bgColor || '#ffffff') },
                cornersSquareOptions: { type: corners.square, color: qr.fgColor || '#414141' },
                cornersDotOptions: { type: corners.dot, color: qr.fgColor || '#414141' }
            });
            const blob = await qrInstance.getRawData('png');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${(qr.name || 'qr').replace(/[^a-z0-9]/gi, '-')}.png`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) {
            addNotification({ title: 'Error', message: 'Failed to download QR', type: 'error' });
        }
    };

    if (qrLoading && qrCodes.length === 0) {
        return (
            <div className="qr-manager">
                <div className="qr-manager-loading">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading QR codes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="qr-manager">
            <div className="qr-manager-header">
                <h1>QR Code Management</h1>
                <button className="create-qr-btn" onClick={() => setShowCreateModal(true)}>
                    <Icon icon="material-symbols:add" />
                    Create QR Code
                </button>
            </div>

            <div className="event-qr-overview-cards">
                <div className="overview-card">
                    <span className="overview-value">{summary.totalQRCodes ?? qrCodes.length ?? 0}</span>
                    <span className="overview-label">QR Codes</span>
                </div>
                <div className="overview-card">
                    <span className="overview-value">{summary.totalScans ?? 0}</span>
                    <span className="overview-label">Total Scans</span>
                </div>
                <div className="overview-card">
                    <span className="overview-value">{summary.totalUniqueScans ?? 0}</span>
                    <span className="overview-label">Unique Scans</span>
                </div>
            </div>

            {(chartData.length > 0 || (chartSeries && chartSeries.length > 0)) && (
                <HeaderContainer
                    icon="mingcute:chart-line-fill"
                    header="Scan Growth"
                    classN="event-qr-chart-card"
                    size="1rem"
                    right={
                        <div className="chart-header-controls">
                            {pickerMinDate && pickerMaxDate && (
                                <div className="chart-date-range-pickers">
                                    <DateTimePicker
                                        label="From"
                                        value={effectiveDateRange?.startDate ? effectiveDateRange.startDate + 'T00:00:00' : null}
                                        onChange={handleStartDateChange}
                                        minDateTime={pickerMinDate}
                                        maxDateTime={startPickerMax}
                                        placeholder="Start date"
                                    />
                                    <DateTimePicker
                                        label="To"
                                        value={effectiveDateRange?.endDate ? effectiveDateRange.endDate + 'T23:59:59' : null}
                                        onChange={handleEndDateChange}
                                        minDateTime={endPickerMin}
                                        maxDateTime={pickerMaxDate}
                                        placeholder="End date"
                                    />
                                    {dateRangeOverride && (
                                        <button
                                            type="button"
                                            className="chart-reset-dates"
                                            onClick={clearDateRangeOverride}
                                            title="Reset to default range"
                                        >
                                            <Icon icon="mdi:refresh" />
                                            Reset
                                        </button>
                                    )}
                                </div>
                            )}
                            {byQR.length > 1 && (
                                <label className="chart-split-toggle">
                                    <input
                                        type="checkbox"
                                        checked={splitByQR}
                                        onChange={(e) => setSplitByQR(e.target.checked)}
                                    />
                                    <span>By QR</span>
                                </label>
                            )}
                        </div>
                    }
                >
                    <div className="chart-wrapper">
                        <EventDashboardChart
                            data={splitByQR ? [] : chartData}
                            series={splitByQR ? chartSeries : null}
                            xDomain={chartXDomain}
                            color="#4DAA57"
                            emptyMessage="No scan data yet"
                        />
                    </div>
                </HeaderContainer>
            )}

            {qrError && (
                <div className="qr-manager-error">
                    {qrError}
                    <button onClick={() => window.location.reload()}>×</button>
                </div>
            )}

            <HeaderContainer
                icon="mdi:qrcode"
                header="Your QR Codes"
                classN="event-qr-list-card"
                size="1rem"
            >
                <div className="event-qr-list">
                    {qrCodes.length === 0 ? (
                        <EmptyState
                            icon="mdi:qrcode"
                            title="No QR codes yet"
                            description="Create one to redirect users to any URL."
                            actions={[{ label: 'Create QR Code', onClick: () => setShowCreateModal(true), primary: true }]}
                        />
                    ) : (
                        qrCodes.map((qr) => {
                            const qrStats = byQR.find((b) => b.name === qr.name) || qr;
                            const isExpanded = expandedQR === qr.name;
                            const qrStart = toDateStr(qr.createdAt || qrStats.createdAt);
                            const qrDataEnd = dateRange.endDate && todayStr && dateRange.endDate > todayStr ? todayStr : dateRange.endDate;
                            const qrDailyData = (qrStart && qrDataEnd)
                                ? toCumulative(fillDateRange(qrStart, qrDataEnd, qrStats.dailyScans || {}))
                                : [];
                            const qrXDomain = (qrStart && dateRange.endDate)
                                ? fillDateRange(qrStart, dateRange.endDate, {}).map((d) => d.x)
                                : undefined;

                            return (
                                <div key={qr.name} className={`event-qr-item ${isExpanded ? 'expanded' : ''} ${!qr.isActive ? 'inactive' : ''}`}>
                                    <div className="event-qr-item-main" onClick={() => setExpandedQR(isExpanded ? null : qr.name)}>
                                        <div className="event-qr-preview">
                                            <StyledQRCode
                                                url={`${window.location.origin}/qr/${encodeURIComponent(qr.name)}`}
                                                fgColor={qr.fgColor}
                                                bgColor={qr.bgColor}
                                                transparentBg={qr.transparentBg}
                                                dotType={qr.dotType}
                                                cornerType={qr.cornerType}
                                                size={80}
                                            />
                                        </div>
                                        <div className="event-qr-info">
                                            <span className="event-qr-name">{qr.name}</span>
                                            {qr.redirectUrl && (
                                                <span className="event-qr-redirect">→ {qr.redirectUrl}</span>
                                            )}
                                            <div className="event-qr-stats-row">
                                                <span className="event-qr-stats">
                                                    {qrStats.scans ?? qr.scans ?? 0} scans
                                                    {qrStats.uniqueScans != null && ` · ${qrStats.uniqueScans} unique`}
                                                </span>
                                                {qrDailyData.length > 0 && (
                                                    <SparklinePreview data={qrDailyData} color="#4DAA57" id={qr.name} />
                                                )}
                                            </div>
                                            {qr.lastScanned && (() => {
                                                const formatted = formatSemanticDate(qr.lastScanned);
                                                return formatted ? <span className="event-qr-meta">Last scan: {formatted}</span> : null;
                                            })()}
                                        </div>
                                        <div className="event-qr-actions" onClick={(e) => e.stopPropagation()}>
                                            <button className="action-btn" onClick={() => setEditingQR(qr)} title="Edit">
                                                <Icon icon="material-symbols:edit" />
                                            </button>
                                            <button className="action-btn" onClick={() => copyLink(qr.name)} title="Copy link">
                                                <Icon icon="material-symbols:content-copy" />
                                            </button>
                                            <button className="action-btn" onClick={() => downloadQR(qr)} title="Download">
                                                <Icon icon="mingcute:download-fill" />
                                            </button>
                                            <button className="action-btn delete" onClick={() => handleDelete(qr)} title="Delete">
                                                <Icon icon="material-symbols:delete" />
                                            </button>
                                        </div>
                                        <Icon icon={isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="expand-icon" />
                                    </div>
                                    {isExpanded && qrDailyData.length > 0 && (
                                        <div className="event-qr-detail-chart">
                                            <EventDashboardChart
                                                data={qrDailyData}
                                                xDomain={qrXDomain}
                                                color="#4DAA57"
                                                height={200}
                                                emptyMessage="No scans yet"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </HeaderContainer>

            {totalPages > 1 && (
                <div className="qr-manager-pagination">
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        Previous
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                        Next
                    </button>
                </div>
            )}

            <Popup isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} customClassName="create-qr-modal-popup">
                <CreateQRModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => { refetchQRCodes(); refetchAnalytics(); }}
                />
            </Popup>

            <Popup isOpen={!!editingQR} onClose={() => setEditingQR(null)} customClassName="create-qr-modal-popup">
                {editingQR && (
                    <EditQRModal
                        qrCode={editingQR}
                        onClose={() => setEditingQR(null)}
                        onSuccess={() => { refetchQRCodes(); refetchAnalytics(); setEditingQR(null); }}
                    />
                )}
            </Popup>
        </div>
    );
};

export default QRManager;
