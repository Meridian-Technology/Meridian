import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { analytics } from '../../../../../services/analytics/analytics';
import { useNotification } from '../../../../../NotificationContext';
import useAuth from '../../../../../hooks/useAuth';
import { useDashboardOverlay } from '../../../../../hooks/useDashboardOverlay';
import { useGradient } from '../../../../../hooks/useGradient';
import TabbedContainer from '../../../../../components/TabbedContainer';
import Popup from '../../../../../components/Popup/Popup';
import EventAnnouncementCompose from './EventAnnouncementCompose';
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
import CommunicationsTab from './CommunicationsTab/CommunicationsTab';
import ComingSoon from './ComingSoon';
// Temporarily disabled - EquipmentManager functionality commented out
// import EquipmentManager from './EventEquipment/EquipmentManager';
import './EventDashboard.scss';

/** Set to true to always show the onboarding popup (ignores localStorage) */
const FORCE_EVENT_DASHBOARD_ONBOARDING = false;

const COLLAB_ACCEPT_BANNER_KEY = 'meridian_event_dash_collab_accept_v1';

function readCollabAcceptDismissStore() {
    try {
        const raw = localStorage.getItem(COLLAB_ACCEPT_BANNER_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function getDismissedCollabOrgIdsForEvent(eventId) {
    const store = readCollabAcceptDismissStore();
    return store[eventId]?.dismissedCollabOrgIds || [];
}

function dismissCollabAcceptsForEvent(eventId, collabOrgIds) {
    const store = readCollabAcceptDismissStore();
    const prev = new Set(store[eventId]?.dismissedCollabOrgIds || []);
    collabOrgIds.forEach((id) => prev.add(String(id)));
    store[eventId] = { dismissedCollabOrgIds: [...prev] };
    localStorage.setItem(COLLAB_ACCEPT_BANNER_KEY, JSON.stringify(store));
}

function formatCollaboratorNames(names) {
    if (!names || names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function EventDashboard({ event, orgId, onClose, className = '' }) {
    const { addNotification } = useNotification();
    const { user } = useAuth();
    const { AtlasMain } = useGradient();
    const { showEventPostMortem } = useDashboardOverlay();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const hasNotifiedErrorRef = useRef(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showAnnouncementSpotlight, setShowAnnouncementSpotlight] = useState(false);
    const [openRegistrationSettingsFromAnnouncement, setOpenRegistrationSettingsFromAnnouncement] = useState(false);
    const [collabAcceptBannerTick, setCollabAcceptBannerTick] = useState(0);

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

    const handleSendAnnouncementClick = useCallback(() => {
        setShowAnnouncementSpotlight(true);
    }, []);

    const handleAnnouncementSent = useCallback(() => {
        addNotification({
            title: 'Announcement sent',
            message: 'Event attendees have been notified.',
            type: 'success'
        });
        handleRefresh();
    }, [addNotification]);

    const handleAnnouncementClose = useCallback(() => {
        setShowAnnouncementSpotlight(false);
    }, []);

    const handleOpenRegistrationSettings = useCallback(() => {
        setActiveTab('registrations');
        setOpenRegistrationSettingsFromAnnouncement(true);
    }, []);

    const isEventCompleted = dashboardData?.stats?.operationalStatus === 'completed';

    const collaborationAcceptBanner = useMemo(() => {
        if (!dashboardData?.event || !orgId) return null;
        const ev = dashboardData.event;
        if (ev.hostingType !== 'Org') return null;
        const hostId = String(ev.hostingId?._id || ev.hostingId);
        if (String(orgId) !== hostId) return null;

        const eventKey = String(ev._id);
        const dismissed = getDismissedCollabOrgIdsForEvent(eventKey);
        const unseen = (ev.collaboratorOrgs || []).filter((e) => {
            const cid = String(e.orgId?._id || e.orgId);
            return e.status === 'active' && e.acceptedAt && !dismissed.includes(cid);
        });
        if (unseen.length === 0) return null;
        const names = unseen.map((e) => e.orgId?.org_name || 'An organization');
        const collabIds = unseen.map((e) => String(e.orgId?._id || e.orgId));
        return { names, collabIds, eventKey };
    }, [dashboardData, orgId, collabAcceptBannerTick]);

    const handlePostMortem = useCallback(() => {
        const eventToShow = dashboardData?.event || event;
        if (eventToShow?._id && orgId) {
            showEventPostMortem(eventToShow, orgId, { returnToEventDashboard: true });
        }
    }, [dashboardData, event, orgId, showEventPostMortem]);

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
                        stats={dashboardData.stats}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                    />
        },
        {
            id: 'edit',
            label: 'Details',
            icon: 'mdi:pencil',
            description: 'Event details and basic information',
            // Date/time + location match CreateEventV3 (DateTimePicker + LocationAutocomplete; see EventEditorTab)
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
                        openRegistrationSettingsFromAnnouncement={openRegistrationSettingsFromAnnouncement}
                        onConsumeOpenRegistrationSettings={() => setOpenRegistrationSettingsFromAnnouncement(false)}
                    />
        },
        {
            id: 'communications',
            label: 'Communications',
            icon: 'mdi:message-text',
            description: 'Send announcements and manage event communications',
            content: <CommunicationsTab
                        event={dashboardData.event}
                        orgId={orgId}
                        onRefresh={handleRefresh}
                        onSendAnnouncement={handleSendAnnouncementClick}
                        onOpenRegistrationSettings={handleOpenRegistrationSettings}
                        onNavigateToAnalytics={() => handleTabChange('analytics')}
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
                        onSendAnnouncement={handleSendAnnouncementClick}
                        onPostMortem={handlePostMortem}
                        showPostMortem={isEventCompleted}
                />
                {collaborationAcceptBanner && (
                    <div className="event-dashboard-collab-accept-banner" role="status">
                        <Icon icon="mdi:account-group" className="event-dashboard-collab-accept-banner__icon" />
                        <p className="event-dashboard-collab-accept-banner__text">
                            <strong>{formatCollaboratorNames(collaborationAcceptBanner.names)}</strong> accepted your
                            collaboration invite. Open the <strong>Details</strong> tab to manage collaborating
                            organizations.
                        </p>
                        <div className="event-dashboard-collab-accept-banner__actions">
                            <button
                                type="button"
                                className="event-dashboard-collab-accept-banner__btn"
                                onClick={() => {
                                    dismissCollabAcceptsForEvent(
                                        collaborationAcceptBanner.eventKey,
                                        collaborationAcceptBanner.collabIds
                                    );
                                    setCollabAcceptBannerTick((t) => t + 1);
                                    handleTabChange('edit');
                                }}
                            >
                                View Details
                            </button>
                            <button
                                type="button"
                                className="event-dashboard-collab-accept-banner__dismiss"
                                onClick={() => {
                                    dismissCollabAcceptsForEvent(
                                        collaborationAcceptBanner.eventKey,
                                        collaborationAcceptBanner.collabIds
                                    );
                                    setCollabAcceptBannerTick((t) => t + 1);
                                }}
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}
                {isEventCompleted && (
                    <div className="event-dashboard-postmortem-banner">
                        <Icon icon="mdi:chart-box-outline" className="event-dashboard-postmortem-banner__icon" />
                        <p className="event-dashboard-postmortem-banner__text">
                            Review your event performance and collect attendee feedback in the post-mortem report.
                        </p>
                        <button
                            type="button"
                            className="event-dashboard-postmortem-banner__btn"
                            onClick={handlePostMortem}
                        >
                            View post-mortem
                        </button>
                    </div>
                )}
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
            <EventAnnouncementCompose
                isOpen={showAnnouncementSpotlight}
                onClose={handleAnnouncementClose}
                orgId={orgId}
                eventId={event?._id}
                eventName={dashboardData?.event?.name}
                eventStartTime={dashboardData?.event?.start_time}
                orgName={dashboardData?.event?.hostingId?.org_name}
                orgProfileImage={dashboardData?.event?.hostingId?.org_profile_image}
                organizerName={user?.name || user?.username}
                organizerPicture={user?.picture}
                onSent={handleAnnouncementSent}
                onOpenRegistrationSettings={handleOpenRegistrationSettings}
            />
        </>
    );
}

export default EventDashboard;
