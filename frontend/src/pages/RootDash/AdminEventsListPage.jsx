import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../hooks/useGradient';
import { useFetch } from '../../hooks/useFetch';
import AdminTenantEventsListPanel from './AdminTenantEventsListPanel';
import './AdminEventsListPage.scss';

/**
 * Standalone full-page list of upcoming/live events for community staff (URL-based pagination).
 */
function AdminEventsListPage() {
    const { AdminGrad } = useGradient();
    const { data: orgConfig, loading } = useFetch('/org-management/config');
    const mode = orgConfig?.data?.operatorDashboardMode;
    const isClassicHub = !loading && mode && mode !== 'engagement_hub';
    const backHref = isClassicHub ? '/feature-admin/beacon' : '/root-dashboard';
    const backLabel = isClassicHub ? 'Back to Beacon' : 'Back to dashboard';

    return (
        <div className="admin-events-list-page dash">
            <header className="header">
                <Link to={backHref} className="admin-events-list-page__back">
                    <Icon icon="mdi:arrow-left" />
                    {backLabel}
                </Link>
                <h1>Upcoming &amp; live events</h1>
                <p>
                    All upcoming and live events in one place, with views and registrations. View opens event details
                    (or the full page when overlays are not available). Public opens the page attendees see.
                </p>
                <img src={AdminGrad} alt="" />
            </header>

            <AdminTenantEventsListPanel paginationMode="url" feedHeading="All matching events" />

            <p className="admin-events-list-page__secondary">
                Looking for the public calendar?{' '}
                <Link to="/events-dashboard">Open events hub</Link>.
            </p>
        </div>
    );
}

export default AdminEventsListPage;
