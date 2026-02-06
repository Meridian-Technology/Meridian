import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboardOverlay } from '../../../hooks/useDashboardOverlay';
import './EventsManagement.scss';
import { useGradient } from '../../../hooks/useGradient';

// Import sub-components
import StatsHeader from './components/StatsHeader';
import EventsList from './components/EventsManagementList';

function EventsManagement({ orgId, expandedClass, orgData: orgDataProp }) {
    const { addNotification } = useNotification();
    const { showEventDashboard, hideOverlay } = useDashboardOverlay();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const { AtlasMain } = useGradient();

    // Use orgData from parent if provided, otherwise fetch it
    // This follows the CacheContext pattern - prefer cached/passed data over fetching
    const { data: fetchedOrgData, loading: orgLoading } = useFetch(
        orgDataProp ? null : (orgId ? `/get-org-by-name/${orgId}?exhaustive=true` : null)
    );
    
    // Prefer prop data over fetched data (similar to CacheContext pattern)
    const orgData = orgDataProp || fetchedOrgData;
    // Only show loading if we're fetching and don't have prop data
    const isLoading = !orgDataProp && orgLoading;

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleViewEvent = (event) => {
        const orgIdForDashboard = orgData?.org?.overview?._id;
        if (orgIdForDashboard) {
            showEventDashboard(event, orgIdForDashboard, {
                className: 'full-width-event-dashboard'
            });
        }
    };

    if (isLoading) {
        return (
            <div className="events-management loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading events management...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`events-management ${expandedClass} dash`}>
            <header className="events-management-header header">
                <h1>Events Management</h1>
                <p>Manage and analyze your organization's events</p>
                <img src={AtlasMain} alt="" />
            </header>

            <div className="events-management-content">
                <div className="content-actions">
                    <button
                        className="refresh-btn"
                        onClick={handleRefresh}
                        title="Refresh data"
                    >
                        <Icon icon="mdi:refresh" />
                        <span>Refresh</span>
                    </button>
                </div>

                <StatsHeader
                    orgId={orgData?.org?.overview?._id}
                    refreshTrigger={refreshTrigger}
                />

                <EventsList
                    orgId={orgData?.org?.overview?._id}
                    orgName={orgData?.org?.overview?.org_name}
                    refreshTrigger={refreshTrigger}
                    onRefresh={handleRefresh}
                    onViewEvent={handleViewEvent}
                    onCreateEvent={orgData?.org?.overview?.org_name}
                />
            </div>
        </div>
    );
}

export default EventsManagement;
