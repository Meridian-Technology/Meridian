import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import HeaderContainer from '../../../../../components/HeaderContainer/HeaderContainer';
import ProportionalBarList from '../../../../../components/ProportionalBarList/ProportionalBarList';
import FunnelChart from './FunnelChart';
import './EventDashboard.scss';

/** Set to true to preview the funnel with fake event data (Views → Form Opens → Registrations → Check-ins) */
const USE_FAKE_FUNNEL_DATA = false;

const FAKE_FUNNEL_DATA = [
    { label: 'Views', value: 1250 },
    { label: 'Form Opens', value: 680 },
    { label: 'Registrations', value: 312 },
    { label: 'Check-ins', value: 189 },
];

function EventAnalyticsDetail({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [timeRange, setTimeRange] = useState('30d');

    // Fetch detailed analytics using the correct route
    const { data: analyticsData, refetch } = useFetch(
        event?._id ? `/event-analytics/event/${event._id}?timeRange=${timeRange}` : null
    );

    useEffect(() => {
        if (analyticsData?.success) {
            setAnalytics(analyticsData.data);
            setLoading(false);
        } else if (analyticsData && !analyticsData.success) {
            setLoading(false);
        }
    }, [analyticsData]);

    useEffect(() => {
        setLoading(true);
    }, [timeRange]);

    useEffect(() => {
        // Refresh analytics every 30 seconds for real-time updates
        const interval = setInterval(() => {
            refetch();
        }, 30000);

        return () => clearInterval(interval);
    }, [refetch, timeRange]);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num);
    };

    const platform = analytics?.platform || {};
    const safeAnalyticsForFunnel = USE_FAKE_FUNNEL_DATA ? {} : (analytics || {});
    const uniqueViewsTotalForFunnel = (safeAnalyticsForFunnel.uniqueViews || 0) + (safeAnalyticsForFunnel.uniqueAnonymousViews || 0);
    const uniqueRegistrationsTotalForFunnel = safeAnalyticsForFunnel.uniqueRegistrations || 0;

    const funnelData = useMemo(() => {
        if (USE_FAKE_FUNNEL_DATA) return FAKE_FUNNEL_DATA;

        const uniqueViews = platform.uniqueEventViews > 0 ? platform.uniqueEventViews : uniqueViewsTotalForFunnel;
        const uniqueRegs = platform.uniqueRegistrations > 0 ? platform.uniqueRegistrations : uniqueRegistrationsTotalForFunnel;
        const steps = [
            { label: 'Unique viewers', value: uniqueViews },
        ];
        if (event?.registrationFormId) {
            steps.push({ label: 'Opened form', value: platform.uniqueFormOpens || 0 });
        }
        steps.push(
            { label: 'Registrations', value: uniqueRegs },
            { label: 'Check-ins', value: platform.uniqueCheckins || 0 }
        );
        return steps;
    }, [platform, event?.registrationFormId, uniqueViewsTotalForFunnel, uniqueRegistrationsTotalForFunnel]);

    // const handleExport = async () => {
    //     if (!event?._id || !orgId) return;

    //     setExporting(true);
    //     try {
    //         const response = await apiRequest(
    //             `/org-event-management/${orgId}/events/${event._id}/export`,
    //             { format: 'json' },
    //             { method: 'POST' }
    //         );

    //         if (response.success && response.data?.report) {
    //             // Create and download JSON file
    //             const blob = new Blob([JSON.stringify(response.data.report, null, 2)], { type: 'application/json' });
    //             const url = URL.createObjectURL(blob);
    //             const a = document.createElement('a');
    //             a.href = url;
    //             a.download = `event-report-${event.name?.replace(/[^a-z0-9]/gi, '-') || event._id}.json`;
    //             document.body.appendChild(a);
    //             a.click();
    //             document.body.removeChild(a);
    //             URL.revokeObjectURL(url);

    //             addNotification({
    //                 title: 'Success',
    //                 message: 'Report exported successfully',
    //                 type: 'success'
    //             });
    //         } else {
    //             throw new Error(response.message || 'Failed to export report');
    //         }
    //     } catch (error) {
    //         addNotification({
    //             title: 'Error',
    //             message: error.message || 'Failed to export report',
    //             type: 'error'
    //         });
    //     } finally {
    //         setExporting(false);
    //     }
    // };

    if (!USE_FAKE_FUNNEL_DATA && loading) {
        return (
            <div className="event-analytics-detail loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading analytics...</p>
            </div>
        );
    }

    if (!USE_FAKE_FUNNEL_DATA && !analytics) {
        return (
            <div className="event-analytics-detail error">
                <Icon icon="mdi:alert-circle" />
                <p>Failed to load analytics</p>
            </div>
        );
    }

    const safeAnalytics = USE_FAKE_FUNNEL_DATA ? {} : analytics;
    const registrationHistory = safeAnalytics.registrationHistory || [];
    const totalRegistrations = safeAnalytics.registrations || registrationHistory.length || 0;

    // Get view data - viewHistory is filtered by timeRange on backend
    const viewHistory = safeAnalytics.viewHistory || [];
    const loggedInViews = viewHistory.filter(v => !v.isAnonymous && v.userId);
    
    // Use API's total counts for display (filtered by timeRange on backend)
    const loggedInViewsCount = safeAnalytics.views || 0;
    const anonymousViewsCount = safeAnalytics.anonymousViews || 0;
    const totalViews = loggedInViewsCount + anonymousViewsCount;

    const uniqueViewsTotal = (safeAnalytics.uniqueViews || 0) + (safeAnalytics.uniqueAnonymousViews || 0);
    const uniqueRegistrationsTotal = safeAnalytics.uniqueRegistrations || 0;
    const conversionRate = uniqueViewsTotal > 0
        ? ((uniqueRegistrationsTotal / uniqueViewsTotal) * 100).toFixed(1)
        : 0;

    const isEventStarted = event?.start_time && new Date(event.start_time) <= new Date();

    // Calculate recent activity (last 24 hours)
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentViews = viewHistory.filter(v => new Date(v.timestamp) >= last24Hours).length;
    const recentRegistrations = registrationHistory.filter(r => new Date(r.timestamp) >= last24Hours).length;

    return (
        <div className="event-analytics-detail">
            <div className="analytics-header">
                <h3>
                    <Icon icon="mingcute:chart-fill" />
                    Event Analytics
                </h3>
                <div className="analytics-header-controls">
                    <div className="time-range-selector">
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                        </select>
                    </div>
                    <div className="live-indicator">
                        <span className="live-dot"></span>
                        <span>Live</span>
                    </div>
                </div>
            </div>

            {(USE_FAKE_FUNNEL_DATA || totalViews > 0 || totalRegistrations > 0 || platform.checkins > 0 || platform.registrationFormOpens > 0) && (
                <HeaderContainer
                    icon="mingcute:chart-bar-fill"
                    header="Engagement Funnel"
                    subheader={<span className="funnel-subtitle">Unique users at each step</span>}
                    classN="analytics-card funnel-section"
                    size="1rem"
                >
                    <div className="card-content funnel-chart-container">
                        <div className="funnel-chart-wrapper">
                            <FunnelChart data={funnelData} />
                        </div>
                    </div>
                </HeaderContainer>
            )}

            <HeaderContainer
                icon="mingcute:chart-fill"
                header="Key Metrics"
                classN="analytics-card key-metrics-section"
                size="1rem"
            >
                <div className="card-content">
                    <div className="key-metrics-grid">
                        <div className="key-metric key-metric-primary">
                            <span className="key-metric-value">{formatNumber(totalRegistrations)}</span>
                            <span className="key-metric-label">Registrations</span>
                        </div>
                        {isEventStarted && (
                            <div className="key-metric key-metric-primary">
                                <span className="key-metric-value">{formatNumber(platform.checkins || 0)}</span>
                                <span className="key-metric-label">Check-ins</span>
                            </div>
                        )}
                        <div className="key-metric">
                            <span className="key-metric-value">{formatNumber(totalViews)}</span>
                            <span className="key-metric-label">Views</span>
                            <span className="key-metric-subtitle">Total, includes repeat</span>
                        </div>
                        <div className="key-metric">
                            <span className="key-metric-value">{formatNumber(uniqueViewsTotal)}</span>
                            <span className="key-metric-label">Unique Viewers</span>
                        </div>
                        <div className="key-metric">
                            <span className="key-metric-value">{conversionRate}%</span>
                            <span className="key-metric-label">Conversion</span>
                            <span className="key-metric-subtitle">View → Registration</span>
                        </div>
                    </div>
                    <div className="key-metrics-details">
                        <div className="key-metrics-detail-group">
                            <span className="key-metrics-detail-label">Views</span>
                            <span className="key-metrics-detail-value">
                                {formatNumber(loggedInViewsCount)} logged-in · {formatNumber(anonymousViewsCount)} anonymous
                            </span>
                        </div>
                        <div className="key-metrics-detail-group">
                            <span className="key-metrics-detail-label">Agenda opens</span>
                            <span className="key-metrics-detail-value">{formatNumber(platform.agendaViews || 0)}</span>
                        </div>
                        <div className="key-metrics-detail-group">
                            <span className="key-metrics-detail-label">Last 24h</span>
                            <span className="key-metrics-detail-value">
                                {recentViews} views · {recentRegistrations} registrations
                            </span>
                        </div>
                    </div>
                </div>
            </HeaderContainer>

            {((totalViews > 0 &&
                (((platform.referrerSources?.org_page ?? 0) + (platform.referrerSources?.explore ?? 0) + (platform.referrerSources?.direct ?? 0)) > 0 ||
                    (platform.qrReferrerSources?.length ?? 0) > 0)) ||
                loggedInViews.length > 0) && (
                <div className="analytics-sources-row">
                    {totalViews > 0 && (() => {
                        const referrerSources = platform.referrerSources || { org_page: 0, explore: 0, direct: 0 };
                        const qrSources = platform.qrReferrerSources || [];
                        const sourceItems = [
                            { key: 'direct', label: 'Direct', icon: 'mdi:arrow-right', value: referrerSources.direct },
                            { key: 'explore', label: 'Explore', icon: 'mingcute:compass-fill', value: referrerSources.explore },
                            { key: 'org_page', label: 'Org Page', icon: 'mdi:domain', value: referrerSources.org_page },
                            ...qrSources.map(({ qr_id, name, count }) => ({
                                key: `qr_${qr_id}`,
                                label: name,
                                icon: 'mdi:qrcode',
                                value: count
                            }))
                        ];
                        const hasSourceData = sourceItems.some((item) => (item.value ?? 0) > 0);
                        return hasSourceData && (
                            <ProportionalBarList
                                items={sourceItems}
                                header="Sources"
                                icon="mdi:source-branch"
                                classN="analytics-card sources-section proportional-bar-list-container"
                                size="1rem"
                                formatValue={formatNumber}
                            />
                        );
                    })()}
                    {loggedInViews.length > 0 && (
                        <HeaderContainer
                            icon="mingcute:eye-fill"
                            header="Logged-in Views"
                            classN="analytics-card logged-in-views-section"
                            size="1rem"
                        >
                            <div className="logged-in-views-list">
                                {loggedInViews.slice(0, 20).map((view, index) => (
                                    <div key={index} className="history-item">
                                        <div className="history-icon">
                                            <Icon icon="mingcute:eye-fill" />
                                        </div>
                                        <div className="history-content">
                                            <p className="history-time">{formatDate(view.timestamp)}</p>
                                            <p className="history-detail">User viewed this event</p>
                                        </div>
                                    </div>
                                ))}
                                {loggedInViews.length > 20 && (
                                    <div className="views-more">
                                        <span>+{loggedInViews.length - 20} more views</span>
                                    </div>
                                )}
                            </div>
                        </HeaderContainer>
                    )}
                </div>
            )}

            {platform.registrationFormOpens > 0 && (
                <HeaderContainer
                    icon="mdi:form-select"
                    header="Registration Form"
                    classN="analytics-card registration-form-section"
                    size="1rem"
                >
                    <div className="card-content">
                        <div className="registration-form-metrics">
                            <div className="form-metric">
                                <span className="form-metric-value">{formatNumber(platform.uniqueFormOpens || 0)}</span>
                                <span className="form-metric-label">Unique form openers</span>
                            </div>
                            <div className="form-metric">
                                <span className="form-metric-value">
                                    {(platform.uniqueFormOpens || 0) > 0
                                        ? ((totalRegistrations / (platform.uniqueFormOpens || 1)) * 100).toFixed(1)
                                        : 0}%
                                </span>
                                <span className="form-metric-label">Form conversion</span>
                                <span className="form-metric-subtitle">Opened form → Registered</span>
                            </div>
                            <div className="form-metric form-metric-bounces">
                                <span className="form-metric-value">{formatNumber(platform.registrationFormBounces || 0)}</span>
                                <span className="form-metric-label">Opened but did not register</span>
                                <span className="form-metric-subtitle">Total opens, not unique</span>
                            </div>
                        </div>
                    </div>
                </HeaderContainer>
            )}

            {/* <div className="analytics-actions">
                <button 
                    className="btn-export" 
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <Icon icon={exporting ? "mdi:loading" : "mdi:download"} className={exporting ? "spinner" : ""} />
                    <span>{exporting ? 'Exporting...' : 'Export Report'}</span>
                </button>
            </div> */}
        </div>
    );
}

export default EventAnalyticsDetail;
