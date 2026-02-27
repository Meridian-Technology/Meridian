import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import MetricCard from '../../../../components/MetricCard';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import './EventsAnalytics.scss';

function EventsAnalytics({ orgId, orgName, refreshTrigger }) {
    const { addNotification } = useNotification();
    const [timeRange, setTimeRange] = useState('30d');
    const [selectedChart, setSelectedChart] = useState('overview');
    
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

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
            <div className="events-analytics loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="events-analytics error">
                <Icon icon="mdi:alert-circle" />
                <p>Error loading analytics: {error}</p>
            </div>
        );
    }

    const data = analyticsData?.data;
    const overview = data?.overview || {};
    const eventsByType = data?.eventsByType || [];
    const eventsByStatus = data?.eventsByStatus || [];
    const topEvents = data?.topEvents || [];
    const monthlyTrend = data?.monthlyTrend || [];
    const memberEngagement = data?.memberEngagement || {};

    return (
        <div className="events-analytics">
            <div className="analytics-header">
                <div className="header-content">
                    <h2>Events Analytics</h2>
                    <p>Detailed insights and performance metrics for {orgName}</p>
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
                    <div className="chart-selector">
                        <select 
                            value={selectedChart} 
                            onChange={(e) => setSelectedChart(e.target.value)}
                            className="chart-select"
                        >
                            <option value="overview">Overview</option>
                            <option value="performance">Performance</option>
                            <option value="engagement">Engagement</option>
                            <option value="trends">Trends</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Key Performance Indicators */}
            <div className="kpi-section">
                <h3>Key Performance Indicators</h3>
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
                        title="Total Registrations"
                        value={overview.totalRsvps}
                        subtitle={`${formatNumber(overview.totalUniqueRsvps)} unique`}
                    />

                    <KpiCard
                        icon="mingcute:trending-up-fill"
                        title="Engagement Rate"
                        value={`${overview.avgEngagementRate || 0}%`}
                        subtitle="Average across events"
                        color="#ffc107"
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
                            <div className="header-cell">Registrations</div>
                            <div className="header-cell">Engagement</div>
                        </div>
                        {topEvents.map((event, index) => (
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
                                    {formatDate(event.startTime)}
                                </div>
                                <div className="table-cell views">
                                    <Icon icon="mingcute:eye-fill" />
                                    <span>{formatNumber(event.views)}</span>
                                </div>
                                <div className="table-cell registrations">
                                    <Icon icon="mingcute:user-add-fill" />
                                    <span>{formatNumber(event.registrations ?? event.rsvps)}</span>
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

            {/* Monthly Trend */}
            {monthlyTrend.length > 0 && (
                <div className="analytics-section">
                    <h3>Monthly Event Creation Trend</h3>
                    <div className="trend-chart">
                        <div className="trend-bars">
                            {monthlyTrend.map((trend, index) => (
                                <div key={index} className="trend-bar">
                                    <div className="bar-container">
                                        <div 
                                            className="bar"
                                            style={{ 
                                                height: `${Math.max(20, (trend.count / Math.max(...monthlyTrend.map(t => t.count))) * 100)}%` 
                                            }}
                                        ></div>
                                    </div>
                                    <div className="bar-label">
                                        <span className="month">
                                            {new Date(trend._id.year, trend._id.month - 1).toLocaleDateString('en-US', { 
                                                month: 'short', 
                                                year: '2-digit' 
                                            })}
                                        </span>
                                        <span className="count">{trend.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Member Engagement Analysis */}
            <div className="analytics-section">
                <h3>Member Engagement Analysis</h3>
                <div className="engagement-analysis">
                    <MetricCard
                        icon="mingcute:user-group-fill"
                        title="Total Active Members"
                        value={memberEngagement.totalMembers}
                        label="Organization members"
                        color="#17a2b8"
                    />

                    <MetricCard
                        icon="mingcute:calendar-fill"
                        title="Average Events per Member"
                        value={memberEngagement.avgEventsPerMember?.toFixed(1) || 0}
                        label="Events attended per member"
                        color="#4DAA57"
                    />

                    <MetricCard
                        icon="mingcute:user-check-fill"
                        title="Members with Event Activity"
                        value={memberEngagement.membersWithEvents}
                        label={
                            memberEngagement.totalMembers > 0 
                                ? `${Math.round((memberEngagement.membersWithEvents / memberEngagement.totalMembers) * 100)}% of total members`
                                : '0% of total members'
                        }
                        color="#28a745"
                    />
                </div>
            </div>

            {/* Export and Actions */}
            <div className="analytics-actions">
                <button className="action-btn primary">
                    <Icon icon="mingcute:download-fill" />
                    <span>Export Analytics</span>
                </button>
                <button className="action-btn secondary">
                    <Icon icon="mingcute:share-fill" />
                    <span>Share Report</span>
                </button>
                <button className="action-btn tertiary">
                    <Icon icon="mingcute:settings-fill" />
                    <span>Analytics Settings</span>
                </button>
            </div>
        </div>
    );
}

export default EventsAnalytics;
