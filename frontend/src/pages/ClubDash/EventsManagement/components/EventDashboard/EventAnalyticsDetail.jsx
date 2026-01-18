import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import './EventDashboard.scss';

function EventAnalyticsDetail({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

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
    const rsvpRate = analytics.stats?.rsvps?.total > 0 
        ? ((analytics.stats.rsvps.going / analytics.stats.rsvps.total) * 100).toFixed(1)
        : 0;

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
                        <div className="stat-small">
                            <span className="stat-value">{analytics.analytics?.uniqueViews || 0}</span>
                            <span className="stat-label">Unique Views</span>
                        </div>
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
                        <div className="stat-row">
                            <div className="stat-item">
                                <span className="stat-value">{analytics.stats?.rsvps?.maybe || 0}</span>
                                <span className="stat-label">Maybe</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{analytics.stats?.rsvps?.notGoing || 0}</span>
                                <span className="stat-label">Not Going</span>
                            </div>
                        </div>
                        <div className="stat-meta">
                            <span>RSVP Rate: {rsvpRate}%</span>
                        </div>
                    </div>
                </div>

                <div className="analytics-card">
                    <div className="card-header">
                        <Icon icon="mdi:account-check" />
                        <h4>Volunteers</h4>
                    </div>
                    <div className="card-content">
                        <div className="stat-large">
                            <span className="stat-value">{analytics.stats?.volunteers?.confirmed || 0}</span>
                            <span className="stat-label">Confirmed</span>
                        </div>
                        <div className="stat-row">
                            <div className="stat-item">
                                <span className="stat-value">{analytics.stats?.volunteers?.checkedIn || 0}</span>
                                <span className="stat-label">Checked In</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{analytics.roles?.total || 0}</span>
                                <span className="stat-label">Total Roles</span>
                            </div>
                        </div>
                        <div className="stat-meta">
                            <span>Coverage: {analytics.roles?.confirmed || 0} / {analytics.roles?.assignments || 0}</span>
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
                <button className="btn-export">
                    <Icon icon="mdi:download" />
                    <span>Export Report</span>
                </button>
            </div>
        </div>
    );
}

export default EventAnalyticsDetail;
