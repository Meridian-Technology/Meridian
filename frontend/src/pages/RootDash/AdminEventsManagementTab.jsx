import React from 'react';
import { useGradient } from '../../hooks/useGradient';
import AdminTenantEventsListPanel from './AdminTenantEventsListPanel';
import './AdminEventsManagementTab.scss';

/**
 * Events list for dashboard shells (community root dash, Beacon).
 * Uses the shared `dash` + `header.header` layout so Dashboard.scss applies the hero band.
 *
 * @param {{ useBeaconHeaderImage?: boolean }} props — Beacon uses the Beacon gradient; community shell uses admin gradient.
 */
function AdminEventsManagementTab({ useBeaconHeaderImage = false }) {
    const { AdminGrad, BeaconMain } = useGradient();
    const headerSrc = useBeaconHeaderImage ? BeaconMain : AdminGrad;

    return (
        <div className="admin-events-management-tab dash">
            <header className="header">
                <h1>Events management</h1>
                <p>
                    Upcoming and live events—views, registrations, and event details. Use the public link on each row
                    for the page attendees see.
                </p>
                <img src={headerSrc} alt="" />
            </header>
            <AdminTenantEventsListPanel
                paginationMode="local"
                feedHeading="All matching events"
                className="admin-events-management-tab__panel"
            />
        </div>
    );
}

export default AdminEventsManagementTab;
