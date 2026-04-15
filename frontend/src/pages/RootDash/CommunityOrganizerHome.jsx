import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import { useGradient } from '../../hooks/useGradient';
import KpiCard from '../../components/Analytics/Dashboard/KpiCard';
import AdminTenantEventsListPanel from './AdminTenantEventsListPanel';
import './CommunityOrganizerHome.scss';

function CommunityOrganizerHome() {
    const { user } = useAuth();
    const { AdminGrad } = useGradient();
    const { data, loading, error } = useFetch('/org-management/admin-tenant-summary');
    const summary = data?.data;

    const displayName = user?.name || user?.email || 'there';
    const tenantLabel = useMemo(() => {
        const host = window?.location?.hostname || '';
        const first = host.split('.')[0] || '';
        if (!first || first === 'www' || first === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(first)) {
            const devTenant = localStorage.getItem('devTenantOverride') || localStorage.getItem('lastTenant') || '';
            return devTenant ? String(devTenant).toUpperCase() : 'Community';
        }
        return first.toUpperCase();
    }, []);

    return (
        <div className="community-organizer-home dash">
            <header className="header">
                <img src={AdminGrad} alt="" />
                <h1>{tenantLabel} management center</h1>
                <p className="subtitle">
                    Good to see you, {displayName}.
                </p>
            </header>

            <div className="content">

                {loading && <div className="community-organizer-home__loading">Loading snapshot…</div>}
                {error && (
                    <div className="community-organizer-home__error" role="alert">
                        Could not load snapshot. You can still use Groups and Events management from the sidebar.
                    </div>
                )}
                {!loading && !error && summary && (
                    <section className="community-organizer-home__kpis" aria-label="Community snapshot">
                        <KpiCard
                            title="Community groups"
                            value={summary.communityGroupCount}
                            subtitle="Organizations in your community"
                            icon="mdi:account-group"
                        />
                        <KpiCard
                            title="Upcoming events"
                            value={summary.upcomingEventsCount}
                            subtitle="Starting today or later"
                            icon="mdi:calendar-clock"
                        />
                        <KpiCard
                            title="Users"
                            value={summary.userCount}
                            subtitle="Registered accounts"
                            icon="mdi:account-multiple-outline"
                        />
                    </section>
                )}

                <AdminTenantEventsListPanel
                    paginationMode="local"
                    pageSize={5}
                    feedHeading="Events preview"
                    customSubline="A quick look at the next 5 upcoming or live events. Open Events management for the full list, search, and past-event toggle."
                    showFilters={false}
                    showPagination={false}
                    showFullPageLink
                    fullPageLinkLabel="View all"
                    className="community-organizer-home__events-preview"
                />

            </div>

        </div>
    );
}

export default CommunityOrganizerHome;
