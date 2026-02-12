import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import apiRequest from '../../../../../utils/postRequest';
import './EventDashboard.scss';

function EventAnalyticsDetail({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Fetch detailed analytics using the correct route
    const { data: analyticsData, refetch } = useFetch(
        event?._id ? `/event-analytics/event/${event._id}?timeRange=30d` : null
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
        // Refresh analytics every 30 seconds for real-time updates
        const interval = setInterval(() => {
            refetch();
        }, 30000);

        return () => clearInterval(interval);
    }, [refetch]);

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

    if (loading) {
        return (
            <div className="event-analytics-detail loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading analytics...</p>
            </div>
        );
    }

    if (!analytics) {
        return (
            <div className="event-analytics-detail error">
                <Icon icon="mdi:alert-circle" />
                <p>Failed to load analytics</p>
            </div>
        );
    }

    const registrationHistory = analytics.registrationHistory || [];
    const totalRegistrations = analytics.registrations || registrationHistory.length || 0;

    // Get view data - viewHistory is filtered by timeRange on backend
    const viewHistory = analytics.viewHistory || [];
    const loggedInViews = viewHistory.filter(v => !v.isAnonymous && v.userId);
    
    // Count filtered views (these are already filtered by timeRange)
    const filteredLoggedInViews = loggedInViews.length;
    const filteredAnonymousViews = viewHistory.filter(v => v.isAnonymous).length;
    const filteredTotalViews = filteredLoggedInViews + filteredAnonymousViews;
    
    // Use API's total counts for display (these are unfiltered totals)
    const loggedInViewsCount = analytics.views || 0;
    const anonymousViewsCount = analytics.anonymousViews || 0;
    const totalViews = loggedInViewsCount + anonymousViewsCount;

    const engagementRate = filteredTotalViews > 0
        ? ((totalRegistrations / filteredTotalViews) * 100)
        : (analytics.engagementRate || 0);

    const uniqueViewsTotal = analytics.uniqueViews || 0;
    const uniqueRegistrationsTotal = analytics.uniqueRegistrations || 0;
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

    return (
        <div className="event-analytics-detail">
            <div className="analytics-header">
                <h3>
                    <Icon icon="mingcute:chart-fill" />
                    Event Analytics
                </h3>
                <div className="live-indicator">
                    <span className="live-dot"></span>
                    <span>Live</span>
                </div>
            </div>

            <div className="analytics-grid">
                <div className="analytics-card">
                    <div className="card-header">
                        <Icon icon="mdi:eye" />
                        <h4>Views</h4>
                    </div>
                    <div className="card-content">
                        <div className="views-grid">
                            <div className="views-squares-wrapper">
                                <div className="view-square-wrapper">
                                    <div className="view-square">
                                        <div className="view-square-content">
                                            <span className="view-value">{formatNumber(loggedInViewsCount)}</span>
                                            <span className="view-label">Logged-in</span>
                                            <span className="view-subtitle">{formatNumber(analytics.uniqueViews || 0)} unique</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="view-square-wrapper">
                                    <div className="view-square">
                                        <div className="view-square-content">
                                            <span className="view-value">{formatNumber(anonymousViewsCount)}</span>
                                            <span className="view-label">Anonymous</span>
                                            <span className="view-subtitle">{formatNumber(analytics.uniqueAnonymousViews || 0)} unique</span>
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
                </div>

                <div className="analytics-card">
                    <div className="card-header">
                        <Icon icon="mingcute:trending-up-fill" />
                        <h4>Engagement</h4>
                    </div>
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
                </div>

                <div className="analytics-card">
                    <div className="card-header">
                        <Icon icon="mingcute:chart-line-fill" />
                        <h4>Conversion & Activity</h4>
                    </div>
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
                </div>
            </div>

            {loggedInViews.length > 0 && (
                <div className="logged-in-views-section">
                    <h3>
                        <Icon icon="mingcute:eye-fill" />
                        Logged-in Views
                    </h3>
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
                </div>
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
