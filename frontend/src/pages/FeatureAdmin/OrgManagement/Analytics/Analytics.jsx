import React, { useState } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import './Analytics.scss';

import { useGradient } from '../../../../hooks/useGradient';

function Analytics() {
    const [timeRange, setTimeRange] = useState('30d');
    const { data: analytics, loading, error } = useFetch(`/org-management/analytics?timeRange=${timeRange}`);
    const {AtlasMain} = useGradient();
    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num);
    };

    const getTimeRangeLabel = (range) => {
        const labels = {
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            '90d': 'Last 90 Days'
        };
        return labels[range] || range;
    };

    if (loading) {
        return (
            <div className="analytics">
                <div className="loading">Loading analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="analytics">
                <div className="error">Error loading analytics: {error}</div>
            </div>
        );
    }

    const data = analytics?.data;

    return (
        <div className="analytics dash">
            <header className="header">
                <h1>Analytics</h1>
                <p>Comprehensive insights into organization management</p>
                <img src={AtlasMain} alt="Org Grad" />
            </header>

            <div className="content">
                <div className="statistics">
                <div className="time-selector">
                        <label>Time Range:</label>
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                        </select>
                    </div>

                    {/* Overview Metrics */}
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">
                                <Icon icon="mdi:account-group" />
                            </div>
                            <div className="metric-content">
                                <p>Total Organizations</p>
                                <h3>{formatNumber(data?.overview?.totalOrgs || 0)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon verified">
                                <Icon icon="mdi:shield-check" />
                            </div>
                            <div className="metric-content">
                                <p>Verified Organizations</p>
                                <h3>{formatNumber(data?.overview?.verifiedOrgs || 0)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon members">
                                <Icon icon="mdi:account-multiple" />
                            </div>
                            <div className="metric-content">
                                <p>Total Members</p>
                                <h3>{formatNumber(data?.overview?.totalMembers || 0)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon events">
                                <Icon icon="mdi:calendar" />
                            </div>
                            <div className="metric-content">
                                <p>Events This Period</p>
                                <h3>{formatNumber(data?.overview?.totalEvents || 0)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon new">
                                <Icon icon="mdi:plus-circle" />
                            </div>
                            <div className="metric-content">
                                <p>New Organizations</p>
                                <h3>{formatNumber(data?.overview?.newOrgs || 0)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon active">
                                <Icon icon="mdi:chart-line" />
                            </div>
                            <div className="metric-content">
                                <p>Active Organizations</p>
                                <h3>{formatNumber(data?.overview?.activeOrgs || 0)}</h3>
                            </div>
                        </div>
                    </div>

                </div>
                <div className="container-wrapper">
                    <div className="content-container">
                        {/* Time Range Selector */}
                        {/* Verification Requests Chart */}
                        <div className="chart-section">
                            <h2>Verification Requests</h2>
                            <div className="requests-chart">
                                {data?.verificationRequests && Object.entries(data.verificationRequests).map(([status, count]) => (
                                    <div key={status} className="request-bar">
                                        <div className="bar-label">
                                            <span className="status-dot" style={{ 
                                                backgroundColor: status === 'pending' ? '#ff9800' : 
                                                            status === 'approved' ? '#4caf50' : '#f44336' 
                                            }}></span>
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </div>
                                        <div className="bar-container">
                                            <div 
                                                className="bar-fill"
                                                style={{ 
                                                    width: `${(count / Math.max(...Object.values(data.verificationRequests))) * 100}%`,
                                                    backgroundColor: status === 'pending' ? '#ff9800' : 
                                                                status === 'approved' ? '#4caf50' : '#f44336'
                                                }}
                                            ></div>
                                        </div>
                                        <div className="bar-value">{count}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top Organizations */}
                        <div className="chart-section">
                            <h2>Top Organizations by Members</h2>
                            <div className="top-orgs-list">
                                {data?.topOrganizations?.slice(0, 10).map((org, index) => (
                                    <div key={org._id} className="org-ranking">
                                        <div className="rank">#{index + 1}</div>
                                        <div className="org-name">{org.orgName}</div>
                                        <div className="member-count">{org.memberCount} members</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="content-container">
                        {/* Activity Summary */}
                        <div className="summary-section">
                            <h2>Activity Summary</h2>
                            <div className="summary-grid">
                                <div className="summary-card">
                                    <h3>Growth Rate</h3>
                                    <div className="summary-value">
                                        {data?.overview?.newOrgs > 0 ? 
                                            `${((data.overview.newOrgs / data.overview.totalOrgs) * 100).toFixed(1)}%` : 
                                            '0%'
                                        }
                                    </div>
                                    <p>New organizations this period</p>
                                </div>

                                <div className="summary-card">
                                    <h3>Verification Rate</h3>
                                    <div className="summary-value">
                                        {data?.overview?.totalOrgs > 0 ? 
                                            `${((data.overview.verifiedOrgs / data.overview.totalOrgs) * 100).toFixed(1)}%` : 
                                            '0%'
                                        }
                                    </div>
                                    <p>Organizations verified</p>
                                </div>

                                <div className="summary-card">
                                    <h3>Activity Rate</h3>
                                    <div className="summary-value">
                                        {data?.overview?.totalOrgs > 0 ? 
                                            `${((data.overview.activeOrgs / data.overview.totalOrgs) * 100).toFixed(1)}%` : 
                                            '0%'
                                        }
                                    </div>
                                    <p>Organizations with events</p>
                                </div>

                                <div className="summary-card">
                                    <h3>Average Members</h3>
                                    <div className="summary-value">
                                        {data?.overview?.totalOrgs > 0 ? 
                                            Math.round(data.overview.totalMembers / data.overview.totalOrgs) : 
                                            0
                                        }
                                    </div>
                                    <p>Members per organization</p>
                                </div>
                            </div>
                        </div>

                        {/* Export Options */}
                        <div className="export-section">
                            <h2>Export Data</h2>
                            <div className="export-options">
                                <button className="export-btn">
                                    <Icon icon="mdi:download" />
                                    Export Analytics Report
                                </button>
                                <button className="export-btn">
                                    <Icon icon="mdi:chart-box" />
                                    Generate Insights Report
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Analytics;
