import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import { useGradient } from '../../../../../hooks/useGradient';
import TabbedContainer from '../../../../../components/TabbedContainer';
import EventDashboardHeader from './EventDashboardHeader';
import EventOverview from './EventOverview';
import EventEditorTab from './EventEditorTab/EventEditorTab';
import AgendaBuilder from './EventAgendaBuilder/AgendaBuilder';
import JobsManager from './EventJobsManager/JobsManager';
import EventAnalyticsDetail from './EventAnalyticsDetail';
import EventCheckInTab from './EventCheckInTab/EventCheckInTab';
import ComingSoon from './ComingSoon';
// Temporarily disabled - EquipmentManager functionality commented out
// import EquipmentManager from './EventEquipment/EquipmentManager';
import './EventDashboard.scss';

function EventDashboard({ event, orgId, onClose, className = '' }) {
    const { addNotification } = useNotification();
    const { AtlasMain } = useGradient();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch dashboard data
    const { data, loading: dataLoading, error, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/dashboard` : null
    );

    useEffect(() => {
        if (data?.success) {
            setDashboardData(data.data);
            setLoading(false);
        } else if (error || (data && !data.success)) {
            addNotification({
                title: 'Error',
                message: error || data?.message || 'Failed to load event dashboard',
                type: 'error'
            });
            setLoading(false);
        } else if (dataLoading) {
            setLoading(true);
        }
    }, [data, error, dataLoading, addNotification]);

    useEffect(() => {
        if (refreshTrigger > 0) {
            refetch();
        }
    }, [refreshTrigger, refetch]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    if (loading) {
        return (
            <div className={`event-dashboard ${className}`}>
                <div className="loading-container">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading event dashboard...</p>
                </div>
            </div>
        );
    }

    if (!dashboardData) {
        return (
            <div className={`event-dashboard ${className}`}>
                <div className="error-container">
                    <Icon icon="mdi:alert-circle" />
                    <p>Failed to load event dashboard</p>
                    <button onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mingcute:chart-bar-fill',
            description: 'Event statistics and quick actions',
            content: <EventOverview 
                        event={dashboardData.event}
                        stats={dashboardData.stats}
                        agenda={dashboardData.agenda}
                        roles={dashboardData.roles}
                        equipment={dashboardData.equipment}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'agenda',
            label: 'Agenda',
            icon: 'mdi:calendar-clock',
            description: 'Build and manage event agenda',
            content: <AgendaBuilder
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'jobs',
            label: 'Jobs',
            icon: 'mdi:briefcase',
            description: 'Manage event jobs and assignments',
            content: <JobsManager
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: 'mingcute:chart-line-fill',
            description: 'Detailed event analytics and insights',
            content: <EventAnalyticsDetail
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'edit',
            label: 'Edit',
            icon: 'mdi:pencil',
            description: 'Edit event details and settings',
            content: <EventEditorTab
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'checkin',
            label: 'Check-In',
            icon: 'mdi:qrcode-scan',
            description: 'Manage event check-in and attendance',
            content: <EventCheckInTab
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'equipment',
            label: 'Equipment',
            icon: 'mdi:package-variant',
            description: 'Manage equipment checkout and tracking',
            comingSoon: true,
            content: <ComingSoon feature="Equipment" />
            // Temporarily disabled - EquipmentManager functionality commented out
            // content: (
            //     <div className="equipment-coming-soon-wrapper">
            //         <div className="equipment-disabled-overlay">
            //             <ComingSoon feature="Equipment" />
            //         </div>
            //         <div className="equipment-manager-disabled">
            //             <EquipmentManager
            //                 event={dashboardData.event}
            //                 orgId={orgId}
            //                 onRefresh={handleRefresh}
            //             />
            //         </div>
            //     </div>
            // )
        },
        {
            id: 'communications',
            label: 'Communications',
            icon: 'mdi:message-text',
            description: 'Message volunteers and attendees',
            comingSoon: true,
            content: <ComingSoon feature="Communications" />
        }
    ];

    return (
        <div className={`event-dashboard ${className}`}>
            <EventDashboardHeader
                event={dashboardData.event}
                stats={dashboardData.stats}
                onClose={onClose}
                onRefresh={handleRefresh}
                orgId={orgId}
            />
            <div className="event-dashboard-content">
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
                    className="event-dashboard-tabs"
                />
            </div>
        </div>
    );
}

export default EventDashboard;
