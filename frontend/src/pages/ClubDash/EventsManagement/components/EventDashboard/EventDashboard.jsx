import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import RegistrationsTab from './RegistrationsTab/RegistrationsTab';
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
    const [activeTab, setActiveTab] = useState('overview');

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

    const dashboardRef = useRef(null);
    const stickyTabsRef = useRef({ spacer: null, tabsWrapper: null });

    const updateStickyTabs = useCallback(() => {
        const dashboard = dashboardRef.current;
        if (!dashboard) return;

        const scrollContainer = dashboard.closest('.dashboard-overlay') || dashboard.parentElement;
        const tabsWrapper = dashboard.querySelector('.tabbed-container__tabs-wrapper');
        if (!scrollContainer || !tabsWrapper) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const spacer = stickyTabsRef.current.spacer;
        const isStuck = tabsWrapper.style.position === 'fixed';

        if (isStuck && spacer && spacer.style.display !== 'none') {
            const spacerRect = spacer.getBoundingClientRect();
            if (spacerRect.top > containerRect.top) {
                tabsWrapper.style.position = '';
                tabsWrapper.style.top = '';
                tabsWrapper.style.left = '';
                tabsWrapper.style.width = '';
                tabsWrapper.style.zIndex = '';
                tabsWrapper.style.background = '';
                tabsWrapper.style.borderBottom = '';
                spacer.style.display = 'none';
                spacer.style.height = '0';
            }
        } else {
            const rect = tabsWrapper.getBoundingClientRect();
            if (rect.top <= containerRect.top) {
                let spacerEl = stickyTabsRef.current.spacer;
                if (!spacerEl) {
                    spacerEl = document.createElement('div');
                    spacerEl.className = 'event-dashboard-tabs-sticky-spacer';
                    tabsWrapper.parentNode.insertBefore(spacerEl, tabsWrapper);
                    stickyTabsRef.current.spacer = spacerEl;
                }
                spacerEl.style.height = `${rect.height}px`;
                spacerEl.style.display = 'block';

                tabsWrapper.style.position = 'fixed';
                tabsWrapper.style.top = `${containerRect.top}px`;
                tabsWrapper.style.left = `calc(${containerRect.left}px + 1.5rem)`;
                tabsWrapper.style.width = `${containerRect.width}px`;
                tabsWrapper.style.zIndex = '100';
                tabsWrapper.style.background = 'var(--background)';
                tabsWrapper.style.borderBottom = '1px solid var(--lighterborder)';
            }
        }
    }, []);

    useEffect(() => {
        if (loading || !dashboardData) return;

        const dashboard = dashboardRef.current;
        if (!dashboard) return;

        const scrollContainer = dashboard.closest('.dashboard-overlay') || dashboard.parentElement;
        const tabsWrapper = dashboard.querySelector('.tabbed-container__tabs-wrapper');
        if (!scrollContainer || !tabsWrapper) return;

        const runUpdate = () => {
            requestAnimationFrame(updateStickyTabs);
        };

        updateStickyTabs();
        scrollContainer.addEventListener('scroll', runUpdate, { passive: true });
        window.addEventListener('resize', runUpdate);

        return () => {
            scrollContainer.removeEventListener('scroll', runUpdate);
            window.removeEventListener('resize', runUpdate);
            const { spacer } = stickyTabsRef.current;
            if (spacer && spacer.parentNode) {
                spacer.parentNode.removeChild(spacer);
            }
            if (tabsWrapper) {
                tabsWrapper.style.position = '';
                tabsWrapper.style.top = '';
                tabsWrapper.style.left = '';
                tabsWrapper.style.width = '';
                tabsWrapper.style.zIndex = '';
                tabsWrapper.style.background = '';
                tabsWrapper.style.borderBottom = '';
            }
        };
    }, [loading, dashboardData, updateStickyTabs]);

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
            id: 'registrations',
            label: 'Registrations',
            icon: 'mdi:clipboard-list-outline',
            description: 'View registrations and form responses',
            content: <RegistrationsTab
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
                        isTabActive={activeTab === 'checkin'}
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
        <div ref={dashboardRef} className={`event-dashboard ${className}`}>
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
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
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
                />
            </div>
        </div>
    );
}

export default EventDashboard;
