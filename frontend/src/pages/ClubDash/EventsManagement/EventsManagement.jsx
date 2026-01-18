import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboardOverlay } from '../../../hooks/useDashboardOverlay';
import EventViewer from '../../../components/EventViewer';
import './EventsManagement.scss';
import { useGradient } from '../../../hooks/useGradient';
import TabbedContainer from '../../../components/TabbedContainer';

// Import sub-components
import EventsOverview from './components/EventsOverview';
import EventsAnalytics from './components/EventsAnalytics';
import EventsList from './components/EventsManagementList';
import EventTemplates from './components/EventTemplates';

function EventsManagement({ orgId, expandedClass }) {
    const { addNotification } = useNotification();
    const { showEventDashboard, hideOverlay } = useDashboardOverlay();
    const [activeTab, setActiveTab] = useState('overview');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const {AtlasMain} = useGradient();
    // Fetch organization data
    const { data: orgData, loading: orgLoading } = useFetch(
        orgId ? `/get-org-by-name/${orgId}?exhaustive=true` : null
    );


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

    const handleBackFromEventViewer = () => {
        hideOverlay();
    };


    const tabs = [
        // {
        //     id: 'overview',
        //     label: 'Overview',
        //     icon: 'mingcute:chart-bar-fill',
        //     description: 'Event statistics and quick actions',
        //     content: <EventsOverview
        //                 orgId={orgData?.org?.overview?._id}
        //                 orgName={orgData?.org?.overview?.org_name}
        //                 refreshTrigger={refreshTrigger}
        //                 onRefresh={handleRefresh}
        //             />
        // },
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mingcute:department-fill',
            description: 'Detailed analytics and insights',
            content: <EventsAnalytics
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                    />
        },
        {
            id: 'events',
            label: 'Events',
            icon: 'mingcute:calendar-fill',
            description: 'Manage all organization events',
            content: <EventsList
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                        onRefresh={handleRefresh}
                        onViewEvent={handleViewEvent}
                    />
        },
        {
            id: 'templates',
            label: 'Templates',
            icon: 'mingcute:file-line',
            description: 'Create and manage event templates',
            content: <EventTemplates
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                        onRefresh={handleRefresh}
                    />
        }
    ];

    if (orgLoading) {
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

            <container className="content">
            <div className="actions row">
                <button 
                    className="refresh-btn action"
                    onClick={handleRefresh}
                    title="Refresh data"
                >
                    <Icon icon="mdi:refresh" />
                    <p>Refresh</p>
                </button>
            </div>

                {/* <div className="events-management-tabs">
                    <div className="tab-navigation">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon icon={tab.icon} />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div> */}

                {/* <div className="events-management-content">
                    {renderTabContent()}
                </div> */}


            </container>
            <TabbedContainer
                    tabs={tabs}
                    defaultTab="overview"
                    tabStyle="default"
                    size="medium"
                    animated={true}
                    showTabIcons={true}
                    showTabLabels={true}
                    fullWidth={false}
                    scrollable={false}
                    lazyLoad={true}
                    keepAlive={true}
                    className="events-management-tabs"

                />
        </div>
    );
}

export default EventsManagement;
