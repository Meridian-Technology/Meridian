import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import apiRequest from '../../../../../utils/postRequest';
import HeaderContainer from '../../../../../components/HeaderContainer/HeaderContainer';
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
    const funnelData = useMemo(() => {
        if (USE_FAKE_FUNNEL_DATA) return FAKE_FUNNEL_DATA;

        const totalViews = (analytics?.views ?? 0) + (analytics?.anonymousViews ?? 0);
        const totalRegistrations = analytics?.registrations ?? analytics?.registrationHistory?.length ?? 0;
        const steps = [
            { label: 'Views', value: totalViews },
        ];
        if (event?.registrationFormId) {
            steps.push({ label: 'Form Opens', value: platform.registrationFormOpens || 0 });
        }
        steps.push(
            { label: 'Registrations', value: totalRegistrations },
            { label: 'Check-ins', value: platform.checkins || 0 }
        );
        return steps;
    }, [analytics, platform.registrationFormOpens, platform.checkins, event?.registrationFormId]);

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
    
    // Count filtered views (these are already filtered by timeRange)
    const filteredLoggedInViews = loggedInViews.length;
    const filteredAnonymousViews = viewHistory.filter(v => v.isAnonymous).length;
    const filteredTotalViews = filteredLoggedInViews + filteredAnonymousViews;
    
    // Use API's total counts for display (these are unfiltered totals)
    const loggedInViewsCount = safeAnalytics.views || 0;
    const anonymousViewsCount = safeAnalytics.anonymousViews || 0;
    const totalViews = loggedInViewsCount + anonymousViewsCount;

    const engagementRate = filteredTotalViews > 0
        ? ((totalRegistrations / filteredTotalViews) * 100)
        : (safeAnalytics.engagementRate || 0);

    const uniqueViewsTotal = safeAnalytics.uniqueViews || 0;
    const uniqueRegistrationsTotal = safeAnalytics.uniqueRegistrations || 0;
    const conversionRate = uniqueViewsTotal > 0
        ? ((uniqueRegistrationsTotal / uniqueViewsTotal) * 100).toFixed(1)
        : 0;

    const avgViewsPerUser = uniqueViewsTotal > 0
        ? (totalViews / uniqueViewsTotal).toFixed(1)
        : 0;

    // Calculate recent activity (last 24 hours)
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentViews = viewHistory.filter(v => new Date(v.timestamp) >= last24Hours).length;
    const recentRegistrations = registrationHistory.filter(r => new Date(r.timestamp) >= last24Hours).length;

    const tabViews = platform.tabViews || {};
    const tabEntries = Object.entries(tabViews).sort((a, b) => b[1] - a[1]);

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
                    classN="analytics-card funnel-section"
                    size="1rem"
                >
                    <div className="card-content funnel-chart-container">
                        <div className="funnel-chart-wrapper">
                            <FunnelChart data={funnelData} />
                        </div>
                        {(platform.withdrawals > 0 || platform.checkouts > 0 || platform.registrationFormBounces > 0) && (
                            <div className="funnel-secondary">
                                {platform.registrationFormBounces > 0 && (
                                    <span className="funnel-secondary-item funnel-bounces">
                                        {formatNumber(platform.registrationFormBounces)} opened form but did not register
                                    </span>
                                )}
                                {platform.withdrawals > 0 && (
                                    <span className="funnel-secondary-item">
                                        {formatNumber(platform.withdrawals)} withdrawals
                                    </span>
                                )}
                                {platform.checkouts > 0 && (
                                    <span className="funnel-secondary-item">
                                        {formatNumber(platform.checkouts)} check-outs
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </HeaderContainer>
            )}

            <div className="analytics-grid">
                <HeaderContainer
                    icon="mdi:eye"
                    header="Views"
                    classN="analytics-card"
                    size="1rem"
                >
                    <div className="card-content">
                        <div className="views-grid">
                            <div className="views-squares-wrapper">
                                <div className="view-square-wrapper">
                                    <div className="view-square">
                                        <div className="view-square-content">
                                            <span className="view-value">{formatNumber(loggedInViewsCount)}</span>
                                            <span className="view-label">Logged-in</span>
                                            <span className="view-subtitle">{formatNumber(safeAnalytics.uniqueViews || 0)} unique</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="view-square-wrapper">
                                    <div className="view-square">
                                        <div className="view-square-content">
                                            <span className="view-value">{formatNumber(anonymousViewsCount)}</span>
                                            <span className="view-label">Anonymous</span>
                                            <span className="view-subtitle">{formatNumber(safeAnalytics.uniqueAnonymousViews || 0)} unique</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="view-total-wrapper">
                                <div className="view-total">
                                    <div className="view-total-content">
                                        <span className="view-value">{formatNumber(totalViews)}</span>
                                        <span className="view-label">Total Views</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </HeaderContainer>

                <HeaderContainer
                    icon="mingcute:trending-up-fill"
                    header="Engagement"
                    classN="analytics-card"
                    size="1rem"
                >
                    <div className="card-content">
                        <div className="stat-large">
                            <span className="stat-value">{engagementRate.toFixed(1)}%</span>
                            <span className="stat-label">Engagement Rate</span>
                        </div>
                        <div className="engagement-bar-container">
                            <div className="engagement-bar">
                                <div 
                                    className="engagement-fill" 
                                    style={{ width: `${Math.min(engagementRate, 100)}%` }}
                                />
                            </div>
                        </div>
                        <div className="rsvp-segments-display">
                            <div className="rsvp-segment-item going">
                                <span className="segment-number">{totalRegistrations}</span>
                                <span className="segment-label">Registrations</span>
                            </div>
                        </div>
                    </div>
                </HeaderContainer>

                <HeaderContainer
                    icon="mingcute:chart-line-fill"
                    header="Conversion & Activity"
                    classN="analytics-card"
                    size="1rem"
                >
                    <div className="card-content">
                        <div className="conversion-metrics">
                            <div className="conversion-item">
                                <div className="conversion-value">{conversionRate}%</div>
                                <div className="conversion-label">View-to-Registration</div>
                                <div className="conversion-subtitle">Unique conversion rate</div>
                            </div>
                            <div className="conversion-item">
                                <div className="conversion-value">{totalRegistrations}</div>
                                <div className="conversion-label">Registrations</div>
                                <div className="conversion-subtitle">Total registered</div>
                            </div>
                            <div className="conversion-item">
                                <div className="conversion-value">{avgViewsPerUser}</div>
                                <div className="conversion-label">Avg Views/User</div>
                                <div className="conversion-subtitle">Per unique viewer</div>
                            </div>
                            <div className="conversion-item">
                                <div className="conversion-value">{formatNumber(platform.agendaViews || 0)}</div>
                                <div className="conversion-label">Agenda Opens</div>
                                <div className="conversion-subtitle">Times agenda modal was viewed</div>
                            </div>
                        </div>
                        <div className="recent-activity">
                            <div className="activity-header">
                                <Icon icon="mdi:clock-outline" />
                                <span>Last 24 Hours</span>
                            </div>
                            <div className="activity-stats">
                                <div className="activity-stat">
                                    <span className="activity-value">{recentViews}</span>
                                    <span className="activity-label">Views</span>
                                </div>
                                <div className="activity-stat">
                                    <span className="activity-value">{recentRegistrations}</span>
                                    <span className="activity-label">Registrations</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </HeaderContainer>
            </div>

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
                                <span className="form-metric-value">{formatNumber(platform.registrationFormOpens)}</span>
                                <span className="form-metric-label">Form Opens</span>
                            </div>
                            <div className="form-metric">
                                <span className="form-metric-value">
                                    {platform.registrationFormOpens > 0
                                        ? ((totalRegistrations / platform.registrationFormOpens) * 100).toFixed(1)
                                        : 0}%
                                </span>
                                <span className="form-metric-label">Form Conversion</span>
                            </div>
                            <div className="form-metric form-metric-bounces">
                                <span className="form-metric-value">{formatNumber(platform.registrationFormBounces || 0)}</span>
                                <span className="form-metric-label">Opened but did not register</span>
                            </div>
                        </div>
                    </div>
                </HeaderContainer>
            )}

            {tabEntries.length > 0 && (
                <HeaderContainer
                    icon="mdi:tab"
                    header="Workspace Tab Engagement"
                    classN="analytics-card tab-breakdown-section"
                    size="1rem"
                >
                    <div className="card-content">
                        <div className="tab-breakdown-list">
                            {tabEntries.map(([tab, count]) => (
                                <div key={tab} className="tab-breakdown-item">
                                    <span className="tab-name">{tab}</span>
                                    <span className="tab-count">{formatNumber(count)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </HeaderContainer>
            )}

            {loggedInViews.length > 0 && (
                <HeaderContainer
                    icon="mingcute:eye-fill"
                    header="Logged-in Views"
                    classN="logged-in-views-section"
                    size="1.25rem"
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
