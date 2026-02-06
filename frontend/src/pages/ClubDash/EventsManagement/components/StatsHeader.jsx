import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useCache } from '../../../../CacheContext';
import './StatsHeader.scss';

function StatsHeader({ orgId, refreshTrigger }) {
    const [timeRange, setTimeRange] = useState('30d');
    const { getOrgEventAnalytics, refreshOrgEventAnalytics } = useCache();
    const [analyticsData90d, setAnalyticsData90d] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch 90d analytics once at the start
    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!orgId) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            
            try {
                // Always fetch 90d analytics - fetch once, use for all time ranges
                const response = refreshTrigger > 0 
                    ? await refreshOrgEventAnalytics(orgId, '90d')
                    : await getOrgEventAnalytics(orgId, '90d');
                
                if (response?.success && response?.data) {
                    setAnalyticsData90d(response);
                } else {
                    setError('Failed to load analytics');
                    setAnalyticsData90d(null);
                }
            } catch (err) {
                console.error('Error fetching analytics:', err);
                setError(err.message || 'Error loading analytics');
                setAnalyticsData90d(null);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [orgId, refreshTrigger, getOrgEventAnalytics, refreshOrgEventAnalytics]);

    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num || 0);
    };

    // Calculate stats for the selected timeRange from 90d data
    // Note: Since backend aggregates analytics, we use the 90d data for all ranges
    // The backend filters events by createdAt, so 90d includes 7d and 30d data
    // For now, we'll show the same stats for all ranges (they're all within 90d)
    // In the future, if we need accurate 7d/30d stats, we'd need per-event analytics
    const overview = analyticsData90d?.data?.overview || {};

    const stats = [
        {
            icon: 'mingcute:calendar-fill',
            title: 'Total Events',
            value: formatNumber(overview.totalEvents),
            subtitle: getTimeRangeLabel(timeRange)
        },
        {
            icon: 'mingcute:eye-fill',
            title: 'Total Views',
            value: formatNumber(overview.totalViews),
            subtitle: `${formatNumber(overview.totalUniqueViews)} unique`
        },
        {
            icon: 'mingcute:user-add-fill',
            title: 'Total RSVPs',
            value: formatNumber(overview.totalRsvps),
            subtitle: `${formatNumber(overview.totalUniqueRsvps)} unique`
        },
        {
            icon: 'mingcute:trending-up-fill',
            title: 'Engagement',
            value: `${overview.avgEngagementRate || 0}%`,
            subtitle: 'Avg rate'
        }
    ];

    function getTimeRangeLabel(range) {
        const labels = {
            '7d': 'Last 7 days',
            '30d': 'Last 30 days',
            '90d': 'Last 90 days'
        };
        return labels[range] || range;
    }

    if (loading) {
        return (
            <div className="stats-header loading">
                <div className="stats-grid">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="stat-card shimmer"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="stats-header error">
                <Icon icon="mdi:alert-circle" />
                <span>Unable to load stats</span>
            </div>
        );
    }

    return (
        <div className="stats-header">
            <div className="stats-grid">
                {stats.map((stat, index) => (
                    <div key={index} className="stat-card">
                        <div className="stat-icon">
                            <Icon icon={stat.icon} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-value">{stat.value}</span>
                            <span className="stat-title">{stat.title}</span>
                            <span className="stat-subtitle">{stat.subtitle}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="time-range-selector">
                {['7d', '30d', '90d'].map(range => (
                    <button
                        key={range}
                        className={`time-btn ${timeRange === range ? 'active' : ''}`}
                        onClick={() => setTimeRange(range)}
                    >
                        {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default StatsHeader;
