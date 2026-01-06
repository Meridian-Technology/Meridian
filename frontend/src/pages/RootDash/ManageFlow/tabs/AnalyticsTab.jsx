import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import './AnalyticsTab.scss';

function AnalyticsTab() {
    const [timeRange, setTimeRange] = useState('30d');
    const [selectedMetric, setSelectedMetric] = useState('overview');

    // Mock data for demo purposes
    const mockEventAnalytics = {
        totalEvents: 342,
        activeEvents: 28,
        completedEvents: 314,
        totalParticipants: 2847,
        averageAttendance: 78.4,
        engagementRate: 85.2,
        discoveryRate: 12.3,
        domainPerformance: [
            {
                id: 1,
                name: 'Academic Affairs',
                events: 89,
                participants: 1123,
                engagement: 87.3,
                satisfaction: 4.6,
                growth: 12.5
            },
            {
                id: 2,
                name: 'Student Life',
                events: 78,
                participants: 1024,
                engagement: 82.1,
                satisfaction: 4.4,
                growth: 8.7
            },
            {
                id: 3,
                name: 'Research & Innovation',
                events: 45,
                participants: 567,
                engagement: 91.2,
                satisfaction: 4.8,
                growth: 15.3
            },
            {
                id: 4,
                name: 'Community Outreach',
                events: 52,
                participants: 634,
                engagement: 79.8,
                satisfaction: 3.3,
                growth: -3.2
            },
            {
                id: 5,
                name: 'Career Services',
                events: 38,
                participants: 489,
                engagement: 88.7,
                satisfaction: 4.7,
                growth: 18.9
            },
            {
                id: 6,
                name: 'Cultural Events',
                events: 40,
                participants: 512,
                engagement: 76.4,
                satisfaction: 4.2,
                growth: 4.1
            }
        ],
        topPerformingEvents: [
            {
                id: 1,
                name: 'Annual Research Symposium',
                domain: 'Research & Innovation',
                participants: 156,
                engagement: 94.2,
                satisfaction: 4.9,
                attendance: 98.7
            },
            {
                id: 2,
                name: 'Career Fair 2024',
                domain: 'Career Services',
                participants: 324,
                engagement: 89.5,
                satisfaction: 4.6,
                attendance: 95.2
            },
            {
                id: 3,
                name: 'Cultural Diversity Week',
                domain: 'Cultural Events',
                participants: 189,
                engagement: 87.8,
                satisfaction: 4.5,
                attendance: 92.1
            },
            {
                id: 4,
                name: 'Student Leadership Summit',
                domain: 'Student Life',
                participants: 134,
                engagement: 92.1,
                satisfaction: 4.8,
                attendance: 96.8
            }
        ],
        engagementTrends: [
            { month: 'Jan', engagement: 78.2, events: 24 },
            { month: 'Feb', engagement: 82.1, events: 28 },
            { month: 'Mar', engagement: 85.7, events: 32 },
            { month: 'Apr', engagement: 87.3, events: 38 },
            { month: 'May', engagement: 84.9, events: 26 },
            { month: 'Jun', engagement: 88.1, events: 42 }
        ],
        discoveryMetrics: {
            organicDiscovery: 68.4,
            socialMedia: 18.7,
            emailMarketing: 8.9,
            wordOfMouth: 4.0
        }
    };

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
                            value={mockEventAnalytics.totalEvents.toLocaleString()}
                            subtitle={getTimeRangeLabel(timeRange)}
                        />

                        <KpiCard
                            icon="mdi:account-group"
                            title="Total Participants"
                            value={mockEventAnalytics.totalParticipants.toLocaleString()}
                            subtitle={`${mockEventAnalytics.averageAttendance}% avg attendance`}
                            iconVariant="approved"
                        />

                        <KpiCard
                            icon="mdi:heart"
                            title="Engagement Rate"
                            value={`${mockEventAnalytics.engagementRate}%`}
                            subtitle="Overall event engagement"
                            iconVariant="rejected"
                        />

                        <KpiCard
                            icon="mdi:compass"
                            title="Discovery Rate"
                            value={`${mockEventAnalytics.discoveryRate}%`}
                            subtitle="New participant acquisition"
                            iconVariant="pending"
                        />
                    </div>
                </div>

                {/* Domain Performance */}
                <div className="domain-performance-section">
                    <h3>Domain Performance</h3>
                    <div className="domain-stats-grid">
                        {mockEventAnalytics.domainPerformance.map((domain) => (
                            <div key={domain.id} className="domain-stat-card">
                                <div className="domain-header">
                                    <div className="domain-info">
                                        <h4>{domain.name}</h4>
                                        <div className="domain-meta">
                                            <span className="event-count">{domain.events} events</span>
                                            <span className="participant-count">{domain.participants.toLocaleString()} participants</span>
                                        </div>
                                    </div>
                                    <div className="domain-growth">
                                        <span className={`growth-indicator ${getGrowthColor(domain.growth)}`}>
                                            <Icon icon={domain.growth > 0 ? "mdi:trending-up" : "mdi:trending-down"} />
                                            {domain.growth > 0 ? '+' : ''}{domain.growth}%
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="domain-metrics">
                                    <div className="metric">
                                        <div className="metric-label">Engagement</div>
                                        <div className="metric-value">
                                            <span className={`engagement-score ${getEngagementColor(domain.engagement)}`}>
                                                {domain.engagement}%
                                            </span>
                                        </div>
                                    </div>
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
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performing Events */}
                <div className="top-events-section">
                    <h3>Top Performing Events</h3>
                    <div className="top-events-list">
                        {mockEventAnalytics.topPerformingEvents.map((event, index) => (
                            <div key={event.id} className="top-event-card">
                                <div className="event-rank">
                                    <span className="rank-number">#{index + 1}</span>
                                </div>
                                <div className="event-info">
                                    <h4>{event.name}</h4>
                                    <div className="event-domain">{event.domain}</div>
                                </div>
                                <div className="event-metrics">
                                    <div className="metric">
                                        <Icon icon="mdi:account-group" />
                                        <span>{event.participants}</span>
                                    </div>
                                    <div className="metric">
                                        <Icon icon="mdi:heart" />
                                        <span>{event.engagement}%</span>
                                    </div>
                                    <div className="metric">
                                        <Icon icon="mdi:star" />
                                        <span>{event.satisfaction}</span>
                                    </div>
                                    <div className="metric">
                                        <Icon icon="mdi:chart-line" />
                                        <span>{event.attendance}%</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Engagement Trends */}
                <div className="trends-section">
                    <h3>Engagement Trends</h3>
                    <div className="trends-chart">
                        <div className="chart-header">
                            <div className="chart-title">Monthly Engagement & Event Count</div>
                            <div className="chart-legend">
                                <div className="legend-item">
                                    <div className="legend-color engagement"></div>
                                    <span>Engagement %</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color events"></div>
                                    <span>Event Count</span>
                                </div>
                            </div>
                        </div>
                        <div className="chart-placeholder">
                            <Icon icon="mdi:chart-line" />
                            <p>Interactive chart showing engagement trends over time</p>
                        </div>
                    </div>
                </div>

                {/* Discovery Metrics */}
                <div className="discovery-section">
                    <h3>Event Discovery Channels</h3>
                    <div className="discovery-metrics">
                        <div className="discovery-chart">
                            <div className="chart-placeholder">
                                <Icon icon="mdi:chart-pie" />
                                <p>Discovery channel breakdown</p>
                            </div>
                        </div>
                        <div className="discovery-breakdown">
                            <div className="discovery-item">
                                <div className="discovery-label">
                                    <Icon icon="mdi:search" />
                                    <span>Organic Discovery</span>
                                </div>
                                <div className="discovery-value">{mockEventAnalytics.discoveryMetrics.organicDiscovery}%</div>
                            </div>
                            <div className="discovery-item">
                                <div className="discovery-label">
                                    <Icon icon="mdi:share-variant" />
                                    <span>Social Media</span>
                                </div>
                                <div className="discovery-value">{mockEventAnalytics.discoveryMetrics.socialMedia}%</div>
                            </div>
                            <div className="discovery-item">
                                <div className="discovery-label">
                                    <Icon icon="mdi:email" />
                                    <span>Email Marketing</span>
                                </div>
                                <div className="discovery-value">{mockEventAnalytics.discoveryMetrics.emailMarketing}%</div>
                            </div>
                            <div className="discovery-item">
                                <div className="discovery-label">
                                    <Icon icon="mdi:account-voice" />
                                    <span>Word of Mouth</span>
                                </div>
                                <div className="discovery-value">{mockEventAnalytics.discoveryMetrics.wordOfMouth}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AnalyticsTab;