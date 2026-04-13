import React, { useMemo, useState } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import KpiCard from '../../../../components/Analytics/Dashboard/KpiCard';
import OrgOverviewCharts from './OrgOverviewCharts';
import './OrgOverview.scss';

function OrgOverview() {
    const [timeRange, setTimeRange] = useState('30d');
    const { data: analytics, loading, error } = useFetch(`/org-management/analytics/platform-overview?timeRange=${timeRange}`);
    const { data: config } = useFetch('/org-management/config');
    const { AtlasMain } = useGradient();
    const data = analytics?.data || {};
    const sourceData = useMemo(() => {
        const sources = data?.viewSources || {};
        return [
            { source: 'Direct', value: sources.direct || 0 },
            { source: 'Explore', value: sources.explore || 0 },
            { source: 'Org page', value: sources.org_page || 0 },
            { source: 'Email', value: sources.email || 0 },
            { source: 'QR', value: sources.qr || 0 }
        ];
    }, [data?.viewSources]);

    const rangeLabel = timeRange === '7d' ? 'Last 7 days' : timeRange === '90d' ? 'Last 90 days' : timeRange === '1y' ? 'Last year' : 'Last 30 days';

    if (loading) {
        return (
            <div className="org-overview">
                <div className="loading">Loading overview...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="org-overview">
                <div className="error">Error loading overview: {error}</div>
            </div>
        );
    }

    return (
        <div className="org-overview dash">
            <header className="header">
                <h1>Organization Management Overview</h1>
                <p>
                    Platform health for orgs and event engagement from canonical analytics events.
                </p>
                <img src={AtlasMain} alt="Org Management Grad" />
            </header>

            <div className="content">
                <div className="overview-toolbar">
                    <div className="range-tabs">
                        {['7d', '30d', '90d', '1y'].map((range) => (
                            <button
                                key={range}
                                type="button"
                                className={timeRange === range ? 'active' : ''}
                                onClick={() => setTimeRange(range)}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                    <p>{rangeLabel}</p>
                </div>

                <div className="analytics-overview">
                    <KpiCard
                        icon="mdi:account-group"
                        title="Total Organizations"
                        value={data?.overview?.totalOrgs ?? 0}
                        subtitle="All registered orgs"
                        color="var(--primary-color)"
                        size="small"
                    />

                    <KpiCard
                        icon="mdi:shield-check"
                        title="Verified Organizations"
                        value={data?.overview?.verifiedOrgs ?? 0}
                        subtitle="Verified and active"
                        color="var(--primary-color)"
                        size="small"
                    />

                    <KpiCard
                        icon="mdi:eye-outline"
                        title="Event Views"
                        value={data?.engagement?.totalViews ?? 0}
                        subtitle="From analytics_events"
                        color="var(--primary-color)"
                        size="small"
                    />

                    <KpiCard
                        icon="mdi:account-check-outline"
                        title="Registrations"
                        value={data?.engagement?.totalRegistrations ?? 0}
                        subtitle={`${data?.engagement?.registrationRate ?? 0}% view-to-registration`}
                        color="var(--primary-color)"
                        size="small"
                    />
                </div>

                <div className="section-container">
                    <div className="section chart-section">
                        <h2>Engagement trend</h2>
                        <OrgOverviewCharts variant="trend" data={data?.trends || []} />
                    </div>
                    <div className="section chart-section">
                        <h2>View source mix</h2>
                        <OrgOverviewCharts variant="sources" data={sourceData} />
                    </div>
                </div>

                <div className="section-container">
                    <div className="section">
                        <h2>Top organizations by engagement</h2>
                        <div className="top-orgs">
                            {(data?.topOrganizations || []).map((org, index) => (
                                <div key={org.orgId} className="org-item">
                                    <div className="org-rank">#{index + 1}</div>
                                    <div className="org-info">
                                        <h4>{org.orgName}</h4>
                                        <p>{org.views} views · {org.registrations} registrations</p>
                                    </div>
                                </div>
                            ))}
                            {!data?.topOrganizations?.length && (
                                <p className="empty-copy">No event engagement found for this range.</p>
                            )}
                        </div>
                    </div>
                    <div className="section">
                        <h2>System Status</h2>
                        <div className="system-status">
                            <div className="status-item">
                                <div className="status-indicator online"></div>
                                <span>Verification System</span>
                                <span className="status-text">Online</span>
                            </div>
                            <div className="status-item">
                                <div className="status-indicator online"></div>
                                <span>Auto-Approval</span>
                                <span className="status-text">
                                    {config?.data?.orgApproval?.mode === 'none' ? 'Disabled' : 'Enabled'}
                                </span>
                            </div>
                            <div className="status-item">
                                <div className="status-indicator online"></div>
                                <span>Pending verification queue</span>
                                <span className="status-text">{data?.overview?.pendingVerificationRequests ?? 0}</span>
                            </div>
                            <div className="status-item">
                                <div className="status-indicator online"></div>
                                <span>New organizations ({rangeLabel})</span>
                                <span className="status-text">{data?.overview?.newOrgs ?? 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OrgOverview;
