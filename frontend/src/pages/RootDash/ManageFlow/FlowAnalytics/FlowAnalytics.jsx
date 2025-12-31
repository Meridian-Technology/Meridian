import React, { useState, useEffect } from 'react';
import './FlowAnalytics.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';

function FlowAnalytics({ approvalGroups, approvalFlow }) {
    const [timeRange, setTimeRange] = useState('7d');
    const [selectedGroup, setSelectedGroup] = useState(null);

    // Mock data - replace with real API calls
    const mockAnalytics = {
        totalApprovals: 156,
        approvedCount: 142,
        rejectedCount: 8,
        pendingCount: 6,
        averageProcessingTime: 2.3, // hours
        approvalRate: 94.7,
        groupStats: approvalGroups.map(group => ({
            id: group._id,
            name: group.org_name,
            approvals: Math.floor(Math.random() * 50) + 10,
            approved: Math.floor(Math.random() * 45) + 8,
            rejected: Math.floor(Math.random() * 5) + 1,
            pending: Math.floor(Math.random() * 3),
            avgTime: (Math.random() * 5 + 1).toFixed(1)
        }))
    };

    const getTimeRangeLabel = (range) => {
        switch (range) {
            case '24h': return 'Last 24 hours';
            case '7d': return 'Last 7 days';
            case '30d': return 'Last 30 days';
            case '90d': return 'Last 90 days';
            default: return 'Last 7 days';
        }
    };

    return (
        <div className="flow-analytics">
            <div className="analytics-header">
                <h2>Approval Flow Analytics</h2>
                <div className="time-range-selector">
                    <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                        <option value="24h">Last 24 hours</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                    </select>
                </div>
            </div>

            <div className="analytics-grid">
                <div className="overview-cards">
                    <KpiCard
                        value={mockAnalytics.totalApprovals}
                        title="Total Approvals"
                        subtitle={getTimeRangeLabel(timeRange)}
                        icon="mdi:check-circle"
                    />

                    <KpiCard
                        value={mockAnalytics.approvedCount}
                        title="Approved"
                        subtitle={`${mockAnalytics.approvalRate}% approval rate`}
                        icon="mdi:check"
                        iconVariant="approved"
                    />

                    <KpiCard
                        value={mockAnalytics.rejectedCount}
                        title="Rejected"
                        subtitle={`${(100 - mockAnalytics.approvalRate).toFixed(1)}% rejection rate`}
                        icon="mdi:close"
                        iconVariant="rejected"
                    />

                    <KpiCard
                        value={mockAnalytics.pendingCount}
                        title="Pending"
                        subtitle="Awaiting review"
                        icon="mdi:clock"
                        iconVariant="pending"
                    />
                </div>

                <div className="charts-section">
                    <div className="chart-card">
                        <h3>Approval Trends</h3>
                        <div className="chart-placeholder">
                            <Icon icon="mdi:chart-line" />
                            <p>Chart visualization would go here</p>
                        </div>
                    </div>

                    <div className="chart-card">
                        <h3>Processing Time</h3>
                        <div className="processing-time">
                            <div className="time-metric">
                                <div className="time-number">{mockAnalytics.averageProcessingTime}h</div>
                                <div className="time-label">Average Processing Time</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="group-performance">
                    <h3>Group Performance</h3>
                    <div className="group-stats-table">
                        <div className="table-header">
                            <div className="col">Group</div>
                            <div className="col">Total</div>
                            <div className="col">Approved</div>
                            <div className="col">Rejected</div>
                            <div className="col">Pending</div>
                            <div className="col">Avg Time</div>
                        </div>
                        {mockAnalytics.groupStats.map((group) => (
                            <div key={group.id} className="table-row">
                                <div className="col group-name">{group.name}</div>
                                <div className="col">{group.approvals}</div>
                                <div className="col approved">{group.approved}</div>
                                <div className="col rejected">{group.rejected}</div>
                                <div className="col pending">{group.pending}</div>
                                <div className="col">{group.avgTime}h</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FlowAnalytics;
