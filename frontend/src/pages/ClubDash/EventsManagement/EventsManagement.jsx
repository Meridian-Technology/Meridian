import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboardOverlay } from '../../../hooks/useDashboardOverlay';
import EventViewer from '../../../components/EventViewer';
import './EventsManagement.scss';
import { useGradient } from '../../../hooks/useGradient';
import OrgGrad from '../../../assets/Gradients/OrgGrad.png';
import TabbedContainer from '../../../components/TabbedContainer';

// Import sub-components
import EventsOverview from './components/EventsOverview';
import EventsAnalytics from './components/EventsAnalytics';
import EventsList from './components/EventsManagementList';
import EventTemplates from './components/EventTemplates';
import BulkOperations from './components/BulkOperations';

function EventsManagement({ orgId, expandedClass }) {
    const { addNotification } = useNotification();
    const { showEventViewer, hideOverlay } = useDashboardOverlay();
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedEvents, setSelectedEvents] = useState([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const {AtlasMain} = useGradient();
    // Fetch organization data
    const { data: orgData, loading: orgLoading } = useFetch(
        orgId ? `/get-org-by-name/${orgId}?exhaustive=true` : null
    );

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mingcute:chart-bar-fill',
            description: 'Event statistics and quick actions'
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: 'mingcute:department-fill',
            description: 'Detailed analytics and insights'
        },
        {
            id: 'events',
            label: 'Events',
            icon: 'mingcute:calendar-fill',
            description: 'Manage all organization events'
        },
        {
            id: 'templates',
            label: 'Templates',
            icon: 'mingcute:file-line',
            description: 'Create and manage event templates'
        }
    ];

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleViewEvent = (event) => {
        showEventViewer(event, {
            showBackButton: true,
            showAnalytics: true,
            showEventsByCreator: false,
            className: 'full-width-event-viewer'
        });
    };

    const handleBackFromEventViewer = () => {
        hideOverlay();
    };

    const handleEventSelection = (eventIds) => {
        setSelectedEvents(eventIds);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <EventsOverview
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                        onRefresh={handleRefresh}
                    />
                );
            case 'analytics':
                return (
                    <EventsAnalytics
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                    />
                );
            case 'events':
                return (
                    <EventsList
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                        onRefresh={handleRefresh}
                        onEventSelection={handleEventSelection}
                        selectedEvents={selectedEvents}
                        onViewEvent={handleViewEvent}
                    />
                );
            case 'templates':
                return (
                    <EventTemplates
                        orgId={orgData?.org?.overview?._id}
                        orgName={orgData?.org?.overview?.org_name}
                        refreshTrigger={refreshTrigger}
                        onRefresh={handleRefresh}
                    />
                );
            default:
                return null;
        }
    };

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

                {/* Bulk Operations Panel */}
                {selectedEvents.length > 0 && (
                    <BulkOperations
                        orgId={orgData?.org?.overview?._id}
                        selectedEvents={selectedEvents}
                        onClose={() => setSelectedEvents([])}
                        onSuccess={handleRefresh}
                    />
                )}

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
                    className="events-management-tabs"
                />
        </div>
    );
}

export default EventsManagement;
