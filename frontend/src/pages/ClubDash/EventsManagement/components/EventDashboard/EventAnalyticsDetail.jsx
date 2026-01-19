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

    // Fetch detailed analytics
    const { data: analyticsData, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/analytics` : null
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

    const handleExport = async () => {
        if (!event?._id || !orgId) return;

        setExporting(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/export`,
                { format: 'json' },
                { method: 'POST' }
            );

            if (response.success && response.data?.report) {
                // Create and download JSON file
                const blob = new Blob([JSON.stringify(response.data.report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `event-report-${event.name?.replace(/[^a-z0-9]/gi, '-') || event._id}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                addNotification({
                    title: 'Success',
                    message: 'Report exported successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to export report');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to export report',
                type: 'error'
            });
        } finally {
            setExporting(false);
        }
    };

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

    const engagementRate = analytics.analytics?.engagementRate || 0;
    const totalRsvps = (analytics.stats?.rsvps?.going || 0) + (analytics.stats?.rsvps?.maybe || 0) + (analytics.stats?.rsvps?.notGoing || 0);
    const rsvpRate = totalRsvps > 0 
        ? ((analytics.stats?.rsvps?.going / totalRsvps) * 100).toFixed(1)
        : 0;

    // Calculate percentages for RSVP breakdown chart
    const rsvpBreakdown = totalRsvps > 0 ? {
        going: ((analytics.stats?.rsvps?.going || 0) / totalRsvps * 100),
        maybe: ((analytics.stats?.rsvps?.maybe || 0) / totalRsvps * 100),
        notGoing: ((analytics.stats?.rsvps?.notGoing || 0) / totalRsvps * 100)
    } : { going: 0, maybe: 0, notGoing: 0 };

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
                        <div className="stat-large">
                            <span className="stat-value">{analytics.analytics?.views || 0}</span>
                            <span className="stat-label">Total Views</span>
                        </div>
                        <div className="stat-row">
                            <div className="stat-item">
                                <span className="stat-value">{analytics.analytics?.uniqueViews || 0}</span>
                                <span className="stat-label">Unique Views</span>
                            </div>
                        </div>
                        {analytics.analytics?.views > 0 && analytics.analytics?.uniqueViews > 0 && (
                            <div className="stat-meta">
                                <span>Avg {(analytics.analytics.views / analytics.analytics.uniqueViews).toFixed(1)} views per visitor</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="analytics-card">
                    <div className="card-header">
                        <Icon icon="mingcute:user-group-fill" />
                        <h4>RSVPs</h4>
                    </div>
                    <div className="card-content">
                        <div className="stat-large">
                            <span className="stat-value">{analytics.stats?.rsvps?.going || 0}</span>
                            <span className="stat-label">Going</span>
                        </div>
                        {totalRsvps > 0 && (
                            <div className="rsvp-chart">
                                <div className="rsvp-bar">
                                    <div 
                                        className="rsvp-segment going" 
                                        style={{ width: `${rsvpBreakdown.going}%` }}
                                        title={`Going: ${analytics.stats?.rsvps?.going || 0}`}
                                    />
                                    <div 
                                        className="rsvp-segment maybe" 
                                        style={{ width: `${rsvpBreakdown.maybe}%` }}
                                        title={`Maybe: ${analytics.stats?.rsvps?.maybe || 0}`}
                                    />
                                    <div 
                                        className="rsvp-segment not-going" 
                                        style={{ width: `${rsvpBreakdown.notGoing}%` }}
                                        title={`Not Going: ${analytics.stats?.rsvps?.notGoing || 0}`}
                                    />
                                </div>
                                <div className="rsvp-legend">
                                    <span className="legend-item going">
                                        <span className="dot"></span>
                                        Going ({analytics.stats?.rsvps?.going || 0})
                                    </span>
                                    <span className="legend-item maybe">
                                        <span className="dot"></span>
                                        Maybe ({analytics.stats?.rsvps?.maybe || 0})
                                    </span>
                                    <span className="legend-item not-going">
                                        <span className="dot"></span>
                                        Not Going ({analytics.stats?.rsvps?.notGoing || 0})
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="stat-meta">
                            <span>Positive RSVP Rate: {rsvpRate}%</span>
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
                        <div className="stat-row">
                            <div className="stat-item">
                                <span className="stat-value">{analytics.analytics?.rsvps || 0}</span>
                                <span className="stat-label">Total RSVPs</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{analytics.analytics?.uniqueRsvps || 0}</span>
                                <span className="stat-label">Unique RSVPs</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="analytics-actions">
                <button 
                    className="btn-export" 
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <Icon icon={exporting ? "mdi:loading" : "mdi:download"} className={exporting ? "spinner" : ""} />
                    <span>{exporting ? 'Exporting...' : 'Export Report'}</span>
                </button>
            </div>
        </div>
    );
}

export default EventAnalyticsDetail;
