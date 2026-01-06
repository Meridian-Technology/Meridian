import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import MetricCard from '../../../../components/MetricCard';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import './EventsOverview.scss';

function EventsOverview({ orgId, orgName, refreshTrigger, onRefresh }) {
    const { addNotification } = useNotification();
    const [timeRange, setTimeRange] = useState('30d');
    
    // Fetch analytics data
    const { data: analyticsData, loading, error, refetch } = useFetch(
        orgId ? `/org-event-management/${orgId}/analytics?timeRange=${timeRange}` : null
    );

    // Refetch when refreshTrigger changes
    useEffect(() => {
        if (refreshTrigger > 0) {
            refetch();
        }
    }, [refreshTrigger, refetch]);

    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num || 0);
    };

    const getTimeRangeLabel = (range) => {
        const labels = {
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            '90d': 'Last 90 Days',
            '1y': 'Last Year'
        };
        return labels[range] || range;
    };

    const getStatusColor = (status) => {
        const colors = {
            'approved': '#28a745',
            'pending': '#ffc107',
            'rejected': '#dc3545',
            'not-applicable': '#6c757d'
        };
        return colors[status] || '#6c757d';
    };

    const getTypeColor = (type) => {
        const colors = {
            'meeting': '#6D8EFA',
            'campus': '#6D8EFA',
            'study': '#6EB25F',
            'sports': '#6EB25F',
            'alumni': '#5C5C5C',
            'arts': '#FBEBBB'
        };
        return colors[type] || '#6c757d';
    };

    if (loading) {
        return (
            <div className="events-overview loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading overview...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="events-overview error">
                <Icon icon="mdi:alert-circle" />
                <p>Error loading overview: {error}</p>
            </div>
        );
    }

    const data = analyticsData?.data;
    const overview = data?.overview || {};
    const eventsByType = data?.eventsByType || [];
    const eventsByStatus = data?.eventsByStatus || [];
    const topEvents = data?.topEvents || [];
    const memberEngagement = data?.memberEngagement || {};

    return (
        <div className="events-overview">
            <div className="overview-header">
                <div className="header-content">
                    <h2>Events Overview</h2>
                    <p>Key metrics and insights for {orgName}</p>
                </div>
                <div className="controls">
                    <div className="time-range-selector">
                        <select 
                            value={timeRange} 
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="time-range-select"
                        >
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                            <option value="1y">Last Year</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Key Performance Indicators */}
            <div className="kpi-section">
                <div className="kpi-grid">
                    <KpiCard
                        icon="mingcute:calendar-fill"
                        title="Total Events"
                        value={overview.totalEvents}
                        subtitle={getTimeRangeLabel(timeRange)}
                    />

                    <KpiCard
                        icon="mingcute:eye-fill"
                        title="Total Views"
                        value={overview.totalViews}
                        subtitle={`${formatNumber(overview.totalUniqueViews)} unique`}
                    />

                    <KpiCard
                        icon="mingcute:user-add-fill"
                        title="Total RSVPs"
                        value={overview.totalRsvps}
                        subtitle={`${formatNumber(overview.totalUniqueRsvps)} unique`}
                    />

                    <KpiCard
                        icon="mingcute:trending-up-fill"
                        title="Engagement Rate"
                        value={`${overview.avgEngagementRate || 0}%`}
                        subtitle="Average across events"
                    />

                    <KpiCard
                        icon="mingcute:group-fill"
                        title="Expected Attendance"
                        value={overview.totalExpectedAttendance}
                        subtitle="Total expected"
                    />

                    <KpiCard
                        icon="mingcute:user-group-fill"
                        title="Member Engagement"
                        value={memberEngagement.avgEventsPerMember?.toFixed(1) || 0}
                        subtitle="Avg events per member"
                    />
                </div>
            </div>

            {/* Events by Type Analysis */}
            <div className="analytics-section">
                <h3>Events by Type Analysis</h3>
                <div className="type-analysis">
                    {eventsByType.map((typeData, index) => (
                        <div key={index} className="type-analysis-item">
                            <div className="type-header">
                                <div 
                                    className="type-color" 
                                    style={{ backgroundColor: getTypeColor(typeData._id) }}
                                ></div>
                                <span className="type-name">{typeData._id}</span>
                                <span className="type-count">{typeData.count} events</span>
                            </div>
                            <div className="type-metrics">
                                <div className="metric">
                                    <span className="metric-label">Total Expected Attendance:</span>
                                    <span className="metric-value">{formatNumber(typeData.totalExpectedAttendance)}</span>
                                </div>
                                <div className="metric">
                                    <span className="metric-label">Average Attendance:</span>
                                    <span className="metric-value">{formatNumber(typeData.avgExpectedAttendance)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Events by Status */}
            <div className="analytics-section">
                <h3>Events by Status</h3>
                <div className="events-by-status">
                    {eventsByStatus.map((statusData, index) => (
                        <div key={index} className="status-item">
                            <div className="status-header">
                                <div 
                                    className="status-color" 
                                    style={{ backgroundColor: getStatusColor(statusData._id) }}
                                ></div>
                                <span className="status-name">{statusData._id}</span>
                                <span className="status-count">{statusData.count}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Performing Events */}
            {topEvents.length > 0 && (
                <div className="analytics-section">
                    <h3>Top Performing Events</h3>
                    <div className="top-events-table">
                        <div className="table-header">
                            <div className="header-cell">Rank</div>
                            <div className="header-cell">Event Name</div>
                            <div className="header-cell">Type</div>
                            <div className="header-cell">Date</div>
                            <div className="header-cell">Views</div>
                            <div className="header-cell">RSVPs</div>
                            <div className="header-cell">Engagement</div>
                        </div>
                        {topEvents.slice(0, 5).map((event, index) => (
                            <div key={index} className="table-row">
                                <div className="table-cell rank">
                                    <div className="rank-badge">#{index + 1}</div>
                                </div>
                                <div className="table-cell event-name">
                                    <h4>{event.eventName}</h4>
                                </div>
                                <div className="table-cell event-type">
                                    <span 
                                        className="type-badge"
                                        style={{ backgroundColor: getTypeColor(event.eventType) }}
                                    >
                                        {event.eventType}
                                    </span>
                                </div>
                                <div className="table-cell event-date">
                                    {new Date(event.startTime).toLocaleDateString()}
                                </div>
                                <div className="table-cell views">
                                    <Icon icon="mingcute:eye-fill" />
                                    <span>{formatNumber(event.views)}</span>
                                </div>
                                <div className="table-cell rsvps">
                                    <Icon icon="mingcute:user-add-fill" />
                                    <span>{formatNumber(event.rsvps)}</span>
                                </div>
                                <div className="table-cell engagement">
                                    <Icon icon="mingcute:trending-up-fill" />
                                    <span>{event.engagementRate || 0}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div className="analytics-section">
                <h3>Quick Actions</h3>
                <div className="quick-actions">
                    <button className="action-btn primary">
                        <Icon icon="mingcute:add-fill" />
                        <span>Create New Event</span>
                    </button>
                    <button className="action-btn secondary">
                        <Icon icon="mingcute:file-template-fill" />
                        <span>Create Template</span>
                    </button>
                    <button className="action-btn tertiary">
                        <Icon icon="mingcute:analytics-fill" />
                        <span>View Analytics</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EventsOverview;
