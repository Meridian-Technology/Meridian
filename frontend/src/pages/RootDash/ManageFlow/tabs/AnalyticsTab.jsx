import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../../hooks/useFetch';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import './AnalyticsTab.scss';

function AnalyticsTab() {
    const [timeRange, setTimeRange] = useState('30d');
    const [selectedMetric, setSelectedMetric] = useState('overview');

    const { data: apiResponse, loading, error } = useFetch(
        `/event-analytics/platform-overview?timeRange=${timeRange}`
    );

    const eventAnalytics = apiResponse?.success ? apiResponse.data : null;

    const getTimeRangeLabel = (range) => {
        switch (range) {
            case '7d': return 'Last 7 days';
            case '30d': return 'Last 30 days';
            case '90d': return 'Last 90 days';
            case '1y': return 'Last year';
            default: return 'Last 30 days';
        }
    };

    const getGrowthColor = (growth) => {
        if (growth > 10) return 'positive';
        if (growth > 0) return 'neutral';
        return 'negative';
    };

    const getEngagementColor = (engagement) => {
        if (engagement >= 90) return 'excellent';
        if (engagement >= 80) return 'good';
        if (engagement >= 70) return 'average';
        return 'poor';
    };

    if (loading && !eventAnalytics) {
        return (
            <div className="analytics-tab">
                <div className="analytics-loading">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error || !eventAnalytics) {
        return (
            <div className="analytics-tab">
                <div className="analytics-error">
                    <Icon icon="mdi:alert-circle" />
                    <p>{error?.message || 'Failed to load analytics'}</p>
                </div>
            </div>
        );
    }

    const domainPerformance = eventAnalytics.domainPerformance || [];
    const topPerformingEvents = eventAnalytics.topPerformingEvents || [];
    const engagementTrends = eventAnalytics.engagementTrends || [];
    const discoveryMetrics = eventAnalytics.discoveryMetrics || {
        organicDiscovery: 0,
        socialMedia: 0,
        emailMarketing: 0,
        wordOfMouth: 0
    };

    return (
        <div className="analytics-tab">
            <div className="analytics-header">
                <div className="header-content">
                    <h2>Event Analytics Dashboard</h2>
                    <p>Comprehensive insights into event performance, engagement, and discovery metrics</p>
                </div>
                <div className="header-controls">
                    <div className="time-range-selector">
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                            <option value="1y">Last year</option>
                        </select>
                    </div>
                    <div className="metric-selector">
                        <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
                            <option value="overview">Overview</option>
                            <option value="engagement">Engagement</option>
                            <option value="discovery">Discovery</option>
                            <option value="performance">Performance</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="analytics-grid">
                {/* Key Performance Indicators */}
                <div className="kpi-section">
                    <div className="kpi-cards">
                        <KpiCard
                            icon="mdi:calendar-multiple"
                            title="Total Events"
                            value={(eventAnalytics.totalEvents ?? 0).toLocaleString()}
                            subtitle={getTimeRangeLabel(timeRange)}
                        />

                        <KpiCard
                            icon="mdi:account-group"
                            title="Total Participants"
                            value={(eventAnalytics.totalParticipants ?? 0).toLocaleString()}
                            subtitle={`${eventAnalytics.averageAttendance ?? 0}% avg attendance`}
                            iconVariant="approved"
                        />

                        <KpiCard
                            icon="mdi:heart"
                            title="Engagement Rate"
                            value={`${eventAnalytics.engagementRate ?? 0}%`}
                            subtitle="Overall event engagement"
                            iconVariant="rejected"
                        />

                        <KpiCard
                            icon="mdi:compass"
                            title="Discovery Rate"
                            value={`${eventAnalytics.discoveryRate ?? 0}%`}
                            subtitle="New participant acquisition"
                            iconVariant="pending"
                        />
                    </div>
                </div>

                {/* Domain Performance */}
                <div className="domain-performance-section">
                    <h3>Event Type Performance</h3>
                    <div className="domain-stats-grid">
                        {domainPerformance.map((domain) => (
                            <div key={domain.id ?? domain.name} className="domain-stat-card">
                                <div className="domain-header">
                                    <div className="domain-info">
                                        <h4>{domain.name}</h4>
                                        <div className="domain-meta">
                                            <span className="event-count">{domain.events ?? 0} events</span>
                                            <span className="participant-count">{(domain.participants ?? 0).toLocaleString()} interactions</span>
                                        </div>
                                    </div>
                                    {(domain.growth !== undefined && domain.growth !== 0) && (
                                        <div className="domain-growth">
                                            <span className={`growth-indicator ${getGrowthColor(domain.growth)}`}>
                                                <Icon icon={domain.growth > 0 ? "mdi:trending-up" : "mdi:trending-down"} />
                                                {domain.growth > 0 ? '+' : ''}{domain.growth}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {(domain.engagement > 0 || domain.satisfaction > 0) && (
                                    <div className="domain-metrics">
                                        {domain.engagement > 0 && (
                                            <div className="metric">
                                                <div className="metric-label">Engagement</div>
                                                <div className="metric-value">
                                                    <span className={`engagement-score ${getEngagementColor(domain.engagement)}`}>
                                                        {domain.engagement}%
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {domain.satisfaction > 0 && (
                                            <div className="metric">
                                                <div className="metric-label">Satisfaction</div>
                                                <div className="metric-value">
                                                    <div className="satisfaction-stars">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Icon 
                                                                key={i} 
                                                                icon={i < Math.floor(domain.satisfaction) ? "mdi:star" : "mdi:star-outline"} 
                                                                className="star"
                                                            />
                                                        ))}
                                                        <span className="rating">{domain.satisfaction}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performing Events */}
                <div className="top-events-section">
                    <h3>Top Performing Events (by views)</h3>
                    <div className="top-events-list">
                        {topPerformingEvents.length > 0 ? (
                            topPerformingEvents.map((evt, index) => (
                                <div key={evt.id ?? index} className="top-event-card">
                                    <div className="event-rank">
                                        <span className="rank-number">#{index + 1}</span>
                                    </div>
                                    <div className="event-info">
                                        <h4>{evt.name}</h4>
                                        <div className="event-domain">{evt.domain}</div>
                                    </div>
                                    <div className="event-metrics">
                                        <div className="metric">
                                            <Icon icon="mdi:eye" />
                                            <span>{evt.views ?? evt.participants ?? 0}</span>
                                        </div>
                                        {(evt.engagement > 0) && (
                                            <div className="metric">
                                                <Icon icon="mdi:heart" />
                                                <span>{evt.engagement}%</span>
                                            </div>
                                        )}
                                        {(evt.satisfaction > 0) && (
                                            <div className="metric">
                                                <Icon icon="mdi:star" />
                                                <span>{evt.satisfaction}</span>
                                            </div>
                                        )}
                                        {(evt.attendance > 0) && (
                                            <div className="metric">
                                                <Icon icon="mdi:chart-line" />
                                                <span>{evt.attendance}%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="empty-state">No event view data in this time range</p>
                        )}
                    </div>
                </div>

                {/* Engagement Trends */}
                <div className="trends-section">
                    <h3>Activity Over Time</h3>
                    <div className="trends-chart">
                        <div className="chart-header">
                            <div className="chart-title">Daily Event Views & Registrations</div>
                            <div className="chart-legend">
                                <div className="legend-item">
                                    <div className="legend-color events"></div>
                                    <span>Event Count</span>
                                </div>
                            </div>
                        </div>
                        {engagementTrends.length > 0 ? (
                            <div className="trends-data-list">
                                {engagementTrends.slice(-14).map((t, i) => (
                                    <div key={t.month ?? i} className="trends-data-item">
                                        <span className="trends-date">{t.month}</span>
                                        <span className="trends-count">{t.events ?? 0} events</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="chart-placeholder">
                                <Icon icon="mdi:chart-line" />
                                <p>No activity data in this time range</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Discovery Metrics */}
                <div className="discovery-section">
                    <h3>Event Discovery Channels</h3>
                    <div className="discovery-metrics">
                        <div className="discovery-chart">
                            <div className="chart-placeholder">
                                <Icon icon="mdi:chart-pie" />
                                <p>Discovery channel data coming soon</p>
                            </div>
                        </div>
                        {(discoveryMetrics.organicDiscovery > 0 || discoveryMetrics.socialMedia > 0 || discoveryMetrics.emailMarketing > 0 || discoveryMetrics.wordOfMouth > 0) ? (
                            <div className="discovery-breakdown">
                                <div className="discovery-item">
                                    <div className="discovery-label">
                                        <Icon icon="mdi:search" />
                                        <span>Organic Discovery</span>
                                    </div>
                                    <div className="discovery-value">{discoveryMetrics.organicDiscovery}%</div>
                                </div>
                                <div className="discovery-item">
                                    <div className="discovery-label">
                                        <Icon icon="mdi:share-variant" />
                                        <span>Social Media</span>
                                    </div>
                                    <div className="discovery-value">{discoveryMetrics.socialMedia}%</div>
                                </div>
                                <div className="discovery-item">
                                    <div className="discovery-label">
                                        <Icon icon="mdi:email" />
                                        <span>Email Marketing</span>
                                    </div>
                                    <div className="discovery-value">{discoveryMetrics.emailMarketing}%</div>
                                </div>
                                <div className="discovery-item">
                                    <div className="discovery-label">
                                        <Icon icon="mdi:account-voice" />
                                        <span>Word of Mouth</span>
                                    </div>
                                    <div className="discovery-value">{discoveryMetrics.wordOfMouth}%</div>
                                </div>
                            </div>
                        ) : (
                            <p className="discovery-placeholder">Referrer and discovery data will be available in a future update</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AnalyticsTab;