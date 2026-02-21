import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { analytics } from '../../../../../services/analytics/analytics';
import { useNotification } from '../../../../../NotificationContext';
import { useGradient } from '../../../../../hooks/useGradient';
import TabbedContainer from '../../../../../components/TabbedContainer';
import Popup from '../../../../../components/Popup/Popup';
import EventDashboardHeader from './EventDashboardHeader';
import EventDashboardOnboarding from './EventDashboardOnboarding/EventDashboardOnboarding';
import EventOverview from './EventOverview';
import EventEditorTab from './EventEditorTab/EventEditorTab';
import AgendaBuilder from './EventAgendaBuilder/AgendaBuilder';
import JobsManager from './EventJobsManager/JobsManager';
import EventAnalyticsDetail from './EventAnalyticsDetail';
import EventCheckInTab from './EventCheckInTab/EventCheckInTab';
import EventQRTab from './EventQRTab/EventQRTab';
import RegistrationsTab from './RegistrationsTab/RegistrationsTab';
import ComingSoon from './ComingSoon';
// Temporarily disabled - EquipmentManager functionality commented out
// import EquipmentManager from './EventEquipment/EquipmentManager';
import './EventDashboard.scss';

/** Set to true to always show the onboarding popup (ignores localStorage) */
const FORCE_EVENT_DASHBOARD_ONBOARDING = false;

function EventDashboard({ event, orgId, onClose, className = '' }) {
    const { addNotification } = useNotification();
    const { AtlasMain } = useGradient();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const hasNotifiedErrorRef = useRef(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [showOnboarding, setShowOnboarding] = useState(false);

    // Fetch dashboard data
    const { data, loading: dataLoading, error, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/dashboard` : null
    );

    useEffect(() => {
        if (data?.success) {
            setDashboardData(data.data);
            setLoading(false);
        } else if (error || (data && !data.success)) {
            if (!hasNotifiedErrorRef.current) {
                hasNotifiedErrorRef.current = true;
                addNotification({
                    title: 'Error',
                    message: error || data?.message || 'Failed to load event dashboard',
                    type: 'error'
                });
            }
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

    const handleTabChange = useCallback((tabId) => {
        setActiveTab(tabId);
        if (event?._id && orgId) {
            analytics.track('event_workspace_tab_view', {
                event_id: event._id,
                org_id: orgId,
                tab: tabId
            });
        }
    }, [event?._id, orgId]);

    useEffect(() => {
        if (event?._id && orgId && dashboardData && !loading) {
            analytics.screen('Event Workspace', { event_id: event._id, org_id: orgId });
            analytics.track('event_workspace_view', { event_id: event._id, org_id: orgId });
            analytics.track('event_workspace_tab_view', {
                event_id: event._id,
                org_id: orgId,
                tab: activeTab
            });
        }
    }, [event?._id, orgId, dashboardData, loading]);

    useEffect(() => {
        if (loading || !dashboardData) return;
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test-event-onboarding') === 'true';
        const hasSeen = localStorage.getItem('eventDashboardOnboardingSeen');
        if (FORCE_EVENT_DASHBOARD_ONBOARDING || isTestMode || !hasSeen) {
            setShowOnboarding(true);
        }
    }, [loading, dashboardData]);

    const handleOnboardingClose = useCallback(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test-event-onboarding') === 'true';
        if (!FORCE_EVENT_DASHBOARD_ONBOARDING && !isTestMode) {
            localStorage.setItem('eventDashboardOnboardingSeen', 'true');
        }
        setShowOnboarding(false);
    }, []);

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
                        onTabChange={handleTabChange}
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
                        isTabActive={activeTab === 'agenda'}
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
            label: 'Details',
            icon: 'mdi:pencil',
            description: 'Event details and basic information',
            content: <EventEditorTab
                        event={dashboardData.event}
                        agenda={dashboardData.agenda}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'registrations',
            label: 'Registrations',
            icon: 'mdi:clipboard-list-outline',
            description: 'View registrations and form responses',
            content: <RegistrationsTab
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                        color="var(--primary-color)"
                    />
        },
        {
            id: 'checkin',
            label: 'Check-In',
            icon: 'uil:qrcode-scan',
            description: 'Manage event check-in and attendance',
            content: <EventCheckInTab
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                        isTabActive={activeTab === 'checkin'}
                        color="var(--primary-color)"
                    />
        },
        {
            id: 'qr',
            label: 'QR Codes',
            icon: 'mdi:qrcode',
            description: 'Create and manage QR codes for event promotion',
            content: <EventQRTab
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
        <>
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
                        key={refreshTrigger}
                        tabs={tabs}
                        defaultTab="overview"
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                        tabStyle="default"
                        size="medium"
                        animated={true}
                        showTabIcons={true}
                        showTabLabels={true}
                        fullWidth={false}
                        scrollable={true}
                        lazyLoad={true}
                        keepAlive={true}
                        className="event-dashboard-tabs"
                        stickyTabs={true}
                    />
                </div>
            </div>
            <Popup
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                customClassName="event-dashboard-onboarding-popup"
            >
                <EventDashboardOnboarding onClose={handleOnboardingClose} />
            </Popup>
        </>
    );
}

export default EventDashboard;
