import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { analytics } from '../../../../../services/analytics/analytics';
import { useNotification } from '../../../../../NotificationContext';
import useAuth from '../../../../../hooks/useAuth';
import apiRequest from '../../../../../utils/postRequest';
import EventAnnouncementCompose from './EventAnnouncementCompose';
import EventDashboardOnboarding from './EventDashboardOnboarding/EventDashboardOnboarding';
import EventOverview from './EventOverview';
import EventPlanningOverviewSnapshot from './EventPlanningOverviewSnapshot';
import EventEditorTab from './EventEditorTab/EventEditorTab';
import AgendaBuilder from './EventAgendaBuilder/AgendaBuilder';
import JobsManager from './EventJobsManager/JobsManager';
import EventAnalyticsDetail from './EventAnalyticsDetail';
import EventCheckInTab from './EventCheckInTab/EventCheckInTab';
import EventQRTab from './EventQRTab/EventQRTab';
import RegistrationsTab from './RegistrationsTab/RegistrationsTab';
import CommunicationsTab from './CommunicationsTab/CommunicationsTab';
import ComingSoon from './ComingSoon';
import EventTasksTab from './EventTasksTab';
import Popup from '../../../../../components/Popup/Popup';
import EventDashboardFocusedHeader from './EventDashboardFocusedHeader';
import EventDashboardFocusedPostMortem from './EventDashboardFocusedPostMortem';
import './EventDashboardFocused.scss';

const FORCE_EVENT_DASHBOARD_ONBOARDING = false;
const COLLAB_ACCEPT_BANNER_KEY = 'meridian_event_dash_collab_accept_v1';
/** Scroll past this (px) in the main content area to animate the header into condensed mode */
const HEADER_CONDENSE_SCROLL_THRESHOLD = 56;
const DEBUG_PHASE_OVERRIDE_STORAGE_KEY = 'eventDashFocused:debugPhaseOverrideByEvent:v1';
const EVENT_WORKFLOW_PHASES = {
    DRAFTING: 'drafting',
    PLANNING: 'planning',
    RUN_OF_SHOW: 'runOfShow',
    POST_MORTEM: 'postMortem'
};
const EVENT_WORKFLOW_PHASE_LABELS = {
    [EVENT_WORKFLOW_PHASES.DRAFTING]: 'Drafting',
    [EVENT_WORKFLOW_PHASES.PLANNING]: 'Planning',
    [EVENT_WORKFLOW_PHASES.RUN_OF_SHOW]: 'Run of Show',
    [EVENT_WORKFLOW_PHASES.POST_MORTEM]: 'Post Mortem'
};

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

function inferWorkflowPhase(eventData, stats) {
    const status = eventData?.status;
    const operationalStatus = stats?.operationalStatus;
    if (operationalStatus === 'completed') return EVENT_WORKFLOW_PHASES.POST_MORTEM;
    if (status === 'draft' || status === 'pending' || status === 'rejected') return EVENT_WORKFLOW_PHASES.DRAFTING;

    const now = new Date();
    const start = eventData?.start_time ? new Date(eventData.start_time) : null;
    const end = eventData?.end_time ? new Date(eventData.end_time) : start;
    if (start && end && now >= start && now <= end) return EVENT_WORKFLOW_PHASES.RUN_OF_SHOW;
    if (end && now > end) return EVENT_WORKFLOW_PHASES.POST_MORTEM;

    return EVENT_WORKFLOW_PHASES.PLANNING;
}

function readDebugPhaseOverrideStore() {
    try {
        const raw = localStorage.getItem(DEBUG_PHASE_OVERRIDE_STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function writeDebugPhaseOverrideStore(nextStore) {
    try {
        localStorage.setItem(DEBUG_PHASE_OVERRIDE_STORAGE_KEY, JSON.stringify(nextStore));
    } catch {
        // Ignore debug override persistence failures.
    }
}

function EventDashboardFocused({
    event,
    orgId,
    onClose,
    className = '',
    readOnly = false,
    demoMode = false,
    demoCredentialId = '',
    workflowPhaseOverride = '',
    dashboardFetchUrl = null,
    hideCloseButton = false,
}) {
    const isDevEnv = process.env.NODE_ENV === 'development';
    const isWorkspaceReadOnly = readOnly || demoMode;
    const demoPhaseParam = encodeURIComponent(workflowPhaseOverride || 'planning');
    const demoTasksFetchUrl = demoMode && event?._id
        ? `/events-demo/tasks?phase=${demoPhaseParam}`
        : null;
    const demoAgendaFetchUrl = demoMode && event?._id
        ? `/events-demo/agenda?phase=${demoPhaseParam}`
        : null;
    const { addNotification } = useNotification();
    const { user } = useAuth();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const hasNotifiedErrorRef = useRef(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showAnnouncementSpotlight, setShowAnnouncementSpotlight] = useState(false);
    const [openRegistrationSettingsFromAnnouncement, setOpenRegistrationSettingsFromAnnouncement] = useState(false);
    const [collabAcceptBannerTick, setCollabAcceptBannerTick] = useState(0);
    const [showCancelEventConfirm, setShowCancelEventConfirm] = useState(false);
    const [cancelEventConfirmText, setCancelEventConfirmText] = useState('');
    const [cancelingEvent, setCancelingEvent] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
    const [isClosing, setIsClosing] = useState(false);
    const [headerCondensed, setHeaderCondensed] = useState(false);
    const [forcePostMortemView, setForcePostMortemView] = useState(false);
    const [debugPanelOpen, setDebugPanelOpen] = useState(false);
    const [debugPhaseOverride, setDebugPhaseOverride] = useState('');
    const closeTimerRef = useRef(null);

    const { data, loading: dataLoading, error, refetch } = useFetch(
        dashboardFetchUrl || (event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/dashboard` : null)
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
        if (refreshTrigger > 0) refetch();
    }, [refreshTrigger, refetch]);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= 768;
            setIsMobileView(mobile);
            if (!mobile) setShowMobileMenu(false);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    }, []);

    useEffect(() => {
        if (!isDevEnv || !event?._id) return;
        const eventId = String(event._id);
        const store = readDebugPhaseOverrideStore();
        const storedOverride = store[eventId];
        setDebugPhaseOverride(
            Object.values(EVENT_WORKFLOW_PHASES).includes(storedOverride)
                ? storedOverride
                : ''
        );
    }, [event?._id, isDevEnv]);

    const handleDashboardClose = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        closeTimerRef.current = setTimeout(() => {
            onClose?.();
        }, 220);
    }, [isClosing, onClose]);

    const handleMainContentScroll = useCallback((e) => {
        if (activeTab !== 'overview') return;
        const y = e.currentTarget.scrollTop;
        const condensed = y > HEADER_CONDENSE_SCROLL_THRESHOLD;
        setHeaderCondensed((prev) => (prev === condensed ? prev : condensed));
    }, [activeTab]);

    const handleRefresh = () => setRefreshTrigger((prev) => prev + 1);

    const handleTabChange = useCallback((tabId) => {
        setActiveTab(tabId);
        if (isMobileView) setShowMobileMenu(false);
        if (demoMode) {
            analytics.track('demo_tab_view', {
                tab: tabId,
                phase: workflowPhaseOverride || 'planning',
                credentialId: demoCredentialId || undefined,
            });
            return;
        }
        if (event?._id && orgId) {
            analytics.track('event_workspace_tab_view', {
                event_id: event._id,
                org_id: orgId,
                tab: tabId
            });
        }
    }, [demoCredentialId, demoMode, event?._id, isMobileView, orgId, workflowPhaseOverride]);

    useEffect(() => {
        if (demoMode || !event?._id || !orgId || !dashboardData || loading) return;
        analytics.screen('Event Workspace Focused', { event_id: event._id, org_id: orgId });
        analytics.track('event_workspace_view', { event_id: event._id, org_id: orgId, variant: 'focused' });
        analytics.track('event_workspace_tab_view', {
            event_id: event._id,
            org_id: orgId,
            tab: activeTab
        });
    }, [activeTab, dashboardData, demoMode, event?._id, loading, orgId]);

    useEffect(() => {
        if (loading || !dashboardData || demoMode) return;
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

    const handleOpenRegistrationSettings = useCallback(() => {
        setActiveTab('registrations');
        setOpenRegistrationSettingsFromAnnouncement(true);
    }, []);

    const handleAnnouncementSent = useCallback(() => {
        addNotification({
            title: 'Announcement sent',
            message: 'Event attendees have been notified.',
            type: 'success'
        });
        handleRefresh();
    }, [addNotification]);

    const eventForPhase = dashboardData?.event || event;
    const workspaceEvent = dashboardData?.event || event;
    const workspaceStats = dashboardData?.stats || {};
    const workspaceAgenda = dashboardData?.agenda || [];
    const isEventCompleted = dashboardData?.stats?.operationalStatus === 'completed';
    const approvalStatus = dashboardData?.event?.status || '';
    const inferredWorkflowPhase = inferWorkflowPhase(eventForPhase, dashboardData?.stats);
    const activeWorkflowPhase = workflowPhaseOverride || (!demoMode && debugPhaseOverride) || inferredWorkflowPhase;
    const isPostMortemMode = forcePostMortemView || activeWorkflowPhase === EVENT_WORKFLOW_PHASES.POST_MORTEM;

    const approvalStatusConfig = useMemo(() => {
        if (approvalStatus === 'pending') {
            return { tone: 'pending', title: 'Pending review', message: 'This event is currently in an approval or acknowledgement workflow.' };
        }
        if (approvalStatus === 'rejected') {
            return { tone: 'rejected', title: 'Needs changes', message: 'This event was rejected. Update details and re-submit for review.' };
        }
        if (approvalStatus === 'approved') {
            return { tone: 'approved', title: 'Approved for publishing', message: 'This event is clear to publish and appear in public experiences.' };
        }
        return null;
    }, [approvalStatus]);

    const collaborationAcceptBanner = useMemo(() => {
        if (!dashboardData?.event || !orgId) return null;
        const ev = dashboardData.event;
        if (ev.hostingType !== 'Org') return null;
        const hostId = String(ev.hostingId?._id || ev.hostingId);
        if (String(orgId) !== hostId) return null;

        const eventKey = String(ev._id);
        const dismissed = getDismissedCollabOrgIdsForEvent(eventKey);
        const unseen = (ev.collaboratorOrgs || []).filter((entry) => {
            const cid = String(entry.orgId?._id || entry.orgId);
            return entry.status === 'active' && entry.acceptedAt && !dismissed.includes(cid);
        });
        if (unseen.length === 0) return null;
        return {
            names: unseen.map((entry) => entry.orgId?.org_name || 'An organization'),
            collabIds: unseen.map((entry) => String(entry.orgId?._id || entry.orgId)),
            eventKey
        };
    }, [dashboardData, orgId, collabAcceptBannerTick]);

    const handlePostMortem = useCallback(() => {
        setForcePostMortemView(true);
    }, []);

    const handleDebugPhaseChange = useCallback((nextPhase) => {
        if (!isDevEnv || !event?._id) return;
        const eventId = String(event._id);
        const normalized =
            nextPhase && Object.values(EVENT_WORKFLOW_PHASES).includes(nextPhase)
                ? nextPhase
                : '';
        setDebugPhaseOverride(normalized);
        setForcePostMortemView(false);

        const store = readDebugPhaseOverrideStore();
        if (normalized) {
            store[eventId] = normalized;
        } else {
            delete store[eventId];
        }
        writeDebugPhaseOverrideStore(store);
    }, [event?._id, isDevEnv]);

    const handleCancelEvent = useCallback(async () => {
        if (!dashboardData?.event?._id || !orgId || cancelingEvent) return;
        if (cancelEventConfirmText.trim().toLowerCase() !== 'cancel event') return;

        setCancelingEvent(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${dashboardData.event._id}`,
                {},
                { method: 'DELETE' }
            );
            if (response?.success) {
                addNotification({
                    title: 'Event cancelled',
                    message: 'The event has been permanently deleted.',
                    type: 'success'
                });
                setShowCancelEventConfirm(false);
                setCancelEventConfirmText('');
                onClose?.();
                return;
            }
            addNotification({
                title: 'Cancel failed',
                message: response?.message || response?.error || 'Unable to cancel this event.',
                type: 'error'
            });
        } catch (err) {
            addNotification({
                title: 'Cancel failed',
                message: err?.message || 'Unable to cancel this event.',
                type: 'error'
            });
        } finally {
            setCancelingEvent(false);
        }
    }, [addNotification, cancelEventConfirmText, cancelingEvent, dashboardData?.event?._id, onClose, orgId, dashboardData?.event?._id]);

    if (loading && !isPostMortemMode) {
        return (
            <div className={`event-dashboard-focused ${className}${isClosing ? ' event-dashboard-focused--closing' : ''}`}>
                <div className="loading-container">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading focused dashboard...</p>
                </div>
            </div>
        );
    }

    if (!dashboardData && !isPostMortemMode) {
        return (
            <div className={`event-dashboard-focused ${className}${isClosing ? ' event-dashboard-focused--closing' : ''}`}>
                <div className="error-container">
                    <Icon icon="mdi:alert-circle" />
                    <p>Failed to load focused dashboard</p>
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
            phases: [
                EVENT_WORKFLOW_PHASES.DRAFTING,
                EVENT_WORKFLOW_PHASES.PLANNING,
                EVENT_WORKFLOW_PHASES.RUN_OF_SHOW
            ],
            content: (
                <div className="event-dashboard">
                    {activeWorkflowPhase === EVENT_WORKFLOW_PHASES.PLANNING && (
                        <EventPlanningOverviewSnapshot
                            event={workspaceEvent}
                            orgId={orgId}
                            userId={user?._id || user?.id}
                            onOpenTasks={() => handleTabChange('tasks')}
                            tasksFetchUrl={demoTasksFetchUrl}
                        />
                    )}
                    <EventOverview
                        event={workspaceEvent}
                        stats={workspaceStats}
                        agenda={workspaceAgenda}
                        orgId={orgId}
                        onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                        onTabChange={handleTabChange}
                    />
                </div>
            )
        },
        {
            id: 'agenda',
            label: 'Agenda',
            icon: 'mdi:calendar-clock',
            phases: [
                EVENT_WORKFLOW_PHASES.DRAFTING,
                EVENT_WORKFLOW_PHASES.PLANNING,
                EVENT_WORKFLOW_PHASES.RUN_OF_SHOW
            ],
            content: (
                <AgendaBuilder
                    event={workspaceEvent}
                    orgId={orgId}
                    onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                    isTabActive={activeTab === 'agenda'}
                    readOnly={isWorkspaceReadOnly}
                    agendaFetchUrl={demoAgendaFetchUrl}
                />
            )
        },
        {
            id: 'jobs',
            label: 'Jobs',
            icon: 'mdi:briefcase',
            phases: [
                EVENT_WORKFLOW_PHASES.DRAFTING,
                EVENT_WORKFLOW_PHASES.PLANNING,
                EVENT_WORKFLOW_PHASES.RUN_OF_SHOW
            ],
            content: <JobsManager event={workspaceEvent} orgId={orgId} onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh} />
        },
        {
            id: 'tasks',
            label: 'Tasks',
            icon: 'mdi:check-circle-outline',
            phases: [
                EVENT_WORKFLOW_PHASES.DRAFTING,
                EVENT_WORKFLOW_PHASES.PLANNING,
                EVENT_WORKFLOW_PHASES.RUN_OF_SHOW
            ],
            content: (
                <EventTasksTab
                    event={workspaceEvent}
                    orgId={orgId}
                    onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                    readOnly={isWorkspaceReadOnly}
                    tasksFetchUrl={demoTasksFetchUrl}
                />
            )
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: 'mingcute:chart-line-fill',
            phases: [
                EVENT_WORKFLOW_PHASES.PLANNING,
                EVENT_WORKFLOW_PHASES.RUN_OF_SHOW,
                EVENT_WORKFLOW_PHASES.POST_MORTEM
            ],
            content: (
                <EventAnalyticsDetail
                    event={workspaceEvent}
                    stats={workspaceStats}
                    orgId={orgId}
                    onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                />
            )
        },
        {
            id: 'edit',
            label: 'Details',
            icon: 'mdi:pencil',
            phases: [EVENT_WORKFLOW_PHASES.DRAFTING, EVENT_WORKFLOW_PHASES.PLANNING],
            content: (
                <div className="event-details-tab-content">
                    <EventEditorTab
                        event={workspaceEvent}
                        agenda={workspaceAgenda}
                        orgId={orgId}
                        onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                        readOnly={isWorkspaceReadOnly}
                    />
                    <div className="event-details-danger-zone">
                        <div className="event-details-danger-zone__content">
                            <Icon icon="mdi:alert-octagon" className="event-details-danger-zone__icon" />
                            <div className="event-details-danger-zone__text">
                                <strong>Cancel event</strong>
                                <span>Permanently deletes this event and associated workspace data. This cannot be undone.</span>
                            </div>
                        </div>
                        {!isWorkspaceReadOnly ? (
                        <button
                            type="button"
                            className="event-details-danger-zone__btn"
                            onClick={() => {
                                setShowCancelEventConfirm(true);
                                setCancelEventConfirmText('');
                            }}
                        >
                            Cancel Event
                        </button>
                        ) : null}
                    </div>
                </div>
            )
        },
        {
            id: 'registrations',
            label: 'Registrations',
            icon: 'mdi:clipboard-list-outline',
            phases: [EVENT_WORKFLOW_PHASES.PLANNING, EVENT_WORKFLOW_PHASES.RUN_OF_SHOW],
            content: (
                <RegistrationsTab
                    event={workspaceEvent}
                    orgId={orgId}
                    onRefresh={handleRefresh}
                    color="var(--primary-color)"
                    openRegistrationSettingsFromAnnouncement={openRegistrationSettingsFromAnnouncement}
                    onConsumeOpenRegistrationSettings={() => setOpenRegistrationSettingsFromAnnouncement(false)}
                    readOnly={isWorkspaceReadOnly}
                />
            )
        },
        {
            id: 'communications',
            label: 'Communications',
            icon: 'mdi:message-text',
            phases: [EVENT_WORKFLOW_PHASES.PLANNING, EVENT_WORKFLOW_PHASES.RUN_OF_SHOW],
            content: (
                <CommunicationsTab
                    event={workspaceEvent}
                    orgId={orgId}
                    onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                    onSendAnnouncement={isWorkspaceReadOnly ? undefined : () => setShowAnnouncementSpotlight(true)}
                    onOpenRegistrationSettings={handleOpenRegistrationSettings}
                    onNavigateToAnalytics={() => handleTabChange('analytics')}
                />
            )
        },
        {
            id: 'checkin',
            label: 'Check-In',
            icon: 'uil:qrcode-scan',
            phases: [EVENT_WORKFLOW_PHASES.RUN_OF_SHOW],
            content: (
                <EventCheckInTab
                    event={workspaceEvent}
                    orgId={orgId}
                    onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                    isTabActive={activeTab === 'checkin'}
                    color="var(--primary-color)"
                    readOnly={isWorkspaceReadOnly}
                />
            )
        },
        {
            id: 'qr',
            label: 'QR Codes',
            icon: 'mdi:qrcode',
            phases: [EVENT_WORKFLOW_PHASES.PLANNING, EVENT_WORKFLOW_PHASES.RUN_OF_SHOW],
            content: <EventQRTab event={workspaceEvent} orgId={orgId} onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh} />
        },
        {
            id: 'equipment',
            label: 'Equipment',
            icon: 'mdi:package-variant',
            phases: [EVENT_WORKFLOW_PHASES.PLANNING, EVENT_WORKFLOW_PHASES.RUN_OF_SHOW],
            content: <ComingSoon feature="Equipment" />
        }
    ];

    const workspaceReadOnlyClass = demoMode ? ' event-dashboard-focused--demo-readonly' : '';

    const sidebarSectionsByPhase = {
        [EVENT_WORKFLOW_PHASES.DRAFTING]: [
            {
                id: 'drafting-core',
                label: 'Drafting',
                tabIds: ['overview', 'edit', 'agenda']
            },
            {
                id: 'drafting-alignment',
                label: 'Alignment',
                tabIds: ['jobs', 'tasks']
            }
        ],
        [EVENT_WORKFLOW_PHASES.PLANNING]: [
            {
                id: 'planning',
                label: 'Planning',
                tabIds: ['overview', 'agenda', 'jobs', 'tasks', 'edit']
            },
            {
                id: 'audience',
                label: 'Audience',
                tabIds: ['registrations', 'communications', 'qr']
            },
            {
                id: 'insights',
                label: 'Insights',
                tabIds: ['analytics']
            },
            {
                id: 'resources',
                label: 'Resources',
                tabIds: ['equipment']
            }
        ],
        [EVENT_WORKFLOW_PHASES.RUN_OF_SHOW]: [
            {
                id: 'live-operations',
                label: 'Live Operations',
                tabIds: ['overview', 'checkin', 'communications', 'tasks', 'jobs']
            },
            {
                id: 'attendees',
                label: 'Attendees',
                tabIds: ['registrations', 'qr']
            },
            {
                id: 'monitoring',
                label: 'Monitoring',
                tabIds: ['analytics', 'agenda']
            }
        ],
        [EVENT_WORKFLOW_PHASES.POST_MORTEM]: [
            {
                id: 'retrospective',
                label: 'Retrospective',
                tabIds: ['analytics', 'overview']
            },
            {
                id: 'records',
                label: 'Records',
                tabIds: ['communications', 'registrations']
            }
        ]
    };

    const tabsById = {};
    tabs.forEach((tab) => {
        tabsById[tab.id] = tab;
    });

    const visibleTabs = tabs.filter((tab) => !tab.phases || tab.phases.includes(activeWorkflowPhase));
    const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));
    const phaseSidebarSections = sidebarSectionsByPhase[activeWorkflowPhase] || [];

    const resolvedSidebarSections = phaseSidebarSections
        .map((section) => ({
            ...section,
            tabs: section.tabIds.map((tabId) => tabsById[tabId]).filter((tab) => tab && visibleTabIds.has(tab.id))
        }))
        .filter((section) => section.tabs.length > 0);

    const activeTabConfig = visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0] || tabs[0];
    const effectiveActiveTab = activeTabConfig?.id || activeTab;

    return (
        <>
            <div className={`event-dashboard-focused ${className}${isClosing ? ' event-dashboard-focused--closing' : ''}${workspaceReadOnlyClass}`}>
                {isPostMortemMode ? (
                    <EventDashboardFocusedPostMortem
                        dashboardData={dashboardData}
                        fallbackEvent={event}
                        orgId={orgId}
                        onClose={hideCloseButton ? undefined : handleDashboardClose}
                        onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                        isDashboardLoading={loading}
                        dashboardLoadError={!loading && !dashboardData}
                    />
                ) : (
                    <>
                        <EventDashboardFocusedHeader
                            condensed={effectiveActiveTab !== 'overview' || headerCondensed}
                            event={workspaceEvent}
                            stats={workspaceStats}
                            onClose={hideCloseButton ? undefined : handleDashboardClose}
                            onRefresh={isWorkspaceReadOnly ? undefined : handleRefresh}
                            orgId={orgId}
                            onSendAnnouncement={isWorkspaceReadOnly ? undefined : () => setShowAnnouncementSpotlight(true)}
                            onPostMortem={handlePostMortem}
                            showPostMortem={isEventCompleted}
                            readOnly={isWorkspaceReadOnly}
                        />

                        <div className="event-dashboard-focused__body">
                            <aside className="event-dashboard-focused__sidebar">
                                <nav className="event-dashboard-focused__nav" aria-label="Event workspace sections">
                                    {resolvedSidebarSections.map((section) => (
                                        <div key={section.id} className="event-dashboard-focused__nav-section">
                                            <p className="event-dashboard-focused__nav-section-title">{section.label}</p>
                                            <div className="event-dashboard-focused__nav-section-items">
                                                {section.tabs.map((tab) => (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        className={`event-dashboard-focused__nav-item${effectiveActiveTab === tab.id ? ' is-active' : ''}`}
                                                        onClick={() => handleTabChange(tab.id)}
                                                    >
                                                        <Icon icon={tab.icon} />
                                                        <span>{tab.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </nav>
                            </aside>

                            <section className="event-dashboard-focused__main">
                                <div className="event-dashboard-focused__main-content">
                                    {isMobileView && (
                                        <div className="event-dashboard-focused__mobile-nav-bar">
                                            <button
                                                type="button"
                                                className="event-dashboard-focused__mobile-menu-trigger"
                                                onClick={() => setShowMobileMenu((prev) => !prev)}
                                                aria-expanded={showMobileMenu}
                                                aria-label={showMobileMenu ? 'Close section menu' : 'Open section menu'}
                                            >
                                                <span>{activeTabConfig?.label || 'Overview'}</span>
                                                <Icon icon={showMobileMenu ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
                                            </button>
                                        </div>
                                    )}

                                    {!demoMode && collaborationAcceptBanner && (
                                        <div className="event-dashboard-focused__banner" role="status">
                                            <p>
                                                <strong>{formatCollaboratorNames(collaborationAcceptBanner.names)}</strong> accepted your collaboration invite.
                                            </p>
                                            <div className="event-dashboard-focused__banner-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        dismissCollabAcceptsForEvent(collaborationAcceptBanner.eventKey, collaborationAcceptBanner.collabIds);
                                                        setCollabAcceptBannerTick((tick) => tick + 1);
                                                        handleTabChange('edit');
                                                    }}
                                                >
                                                    View Details
                                                </button>
                                                <button
                                                    type="button"
                                                    className="dismiss"
                                                    onClick={() => {
                                                        dismissCollabAcceptsForEvent(collaborationAcceptBanner.eventKey, collaborationAcceptBanner.collabIds);
                                                        setCollabAcceptBannerTick((tick) => tick + 1);
                                                    }}
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {approvalStatusConfig && (
                                        <div className={`event-dashboard-focused__approval-banner ${approvalStatusConfig.tone}`}>
                                            <strong>{approvalStatusConfig.title}</strong>
                                            <span>{approvalStatusConfig.message}</span>
                                        </div>
                                    )}

                                    <div className="event-dashboard-focused__content" onScroll={handleMainContentScroll}>
                                        {visibleTabs.map((tab) => (
                                            <div
                                                key={tab.id}
                                                className={`event-dashboard-focused__tab-panel${effectiveActiveTab === tab.id ? ' is-active' : ''}`}
                                                style={{ display: effectiveActiveTab === tab.id ? 'block' : 'none' }}
                                            >
                                                {tab.content}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </>
                )}

                {isDevEnv && !demoMode && event?._id && (
                    <div className="event-dashboard-focused__debug-panel" role="complementary" aria-label="Dashboard state debugger">
                        <button
                            type="button"
                            className="event-dashboard-focused__debug-panel-trigger"
                            onClick={() => setDebugPanelOpen((open) => !open)}
                            aria-expanded={debugPanelOpen}
                        >
                            <Icon icon="mdi:bug-outline" />
                            Debug state
                        </button>
                        {debugPanelOpen && (
                            <div className="event-dashboard-focused__debug-panel-body">
                                <p className="event-dashboard-focused__debug-panel-title">Dashboard State Debugger</p>
                                <label htmlFor="eventDashboardFocusedDebugPhaseSelect">Phase override</label>
                                <select
                                    id="eventDashboardFocusedDebugPhaseSelect"
                                    value={debugPhaseOverride}
                                    onChange={(e) => handleDebugPhaseChange(e.target.value)}
                                >
                                    <option value="">Auto (inferred)</option>
                                    <option value={EVENT_WORKFLOW_PHASES.DRAFTING}>Drafting</option>
                                    <option value={EVENT_WORKFLOW_PHASES.PLANNING}>Planning</option>
                                    <option value={EVENT_WORKFLOW_PHASES.RUN_OF_SHOW}>Run of Show</option>
                                    <option value={EVENT_WORKFLOW_PHASES.POST_MORTEM}>Post Mortem</option>
                                </select>
                                <div className="event-dashboard-focused__debug-panel-meta">
                                    <span>Active: {EVENT_WORKFLOW_PHASE_LABELS[activeWorkflowPhase]}</span>
                                    <span>Inferred: {EVENT_WORKFLOW_PHASE_LABELS[inferredWorkflowPhase]}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!isPostMortemMode && isMobileView && showMobileMenu && (
                    <div
                        className="event-dashboard-focused__mobile-menu-overlay"
                        onClick={() => setShowMobileMenu(false)}
                        role="presentation"
                    >
                        <div
                            className="event-dashboard-focused__mobile-menu-sheet"
                            role="dialog"
                            aria-label="Event sections menu"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {resolvedSidebarSections.map((section) => (
                                <div key={section.id} className="event-dashboard-focused__mobile-menu-section">
                                    <p className="event-dashboard-focused__mobile-menu-section-title">{section.label}</p>
                                    <div className="event-dashboard-focused__mobile-menu-items">
                                        {section.tabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                className={`event-dashboard-focused__mobile-menu-item${effectiveActiveTab === tab.id ? ' is-active' : ''}`}
                                                onClick={() => handleTabChange(tab.id)}
                                            >
                                                <Icon icon={tab.icon} />
                                                <span>{tab.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <Popup isOpen={!demoMode && showOnboarding} onClose={handleOnboardingClose} customClassName="event-dashboard-onboarding-popup">
                <EventDashboardOnboarding onClose={handleOnboardingClose} />
            </Popup>

            {!isWorkspaceReadOnly ? (
            <EventAnnouncementCompose
                isOpen={showAnnouncementSpotlight}
                onClose={() => setShowAnnouncementSpotlight(false)}
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
            ) : null}

            {!isWorkspaceReadOnly ? (
            <Popup
                isOpen={showCancelEventConfirm}
                onClose={() => {
                    if (cancelingEvent) return;
                    setShowCancelEventConfirm(false);
                    setCancelEventConfirmText('');
                }}
                customClassName="event-cancel-confirm-popup"
            >
                <div className="event-cancel-confirm-popup__content">
                    <div className="event-cancel-confirm-popup__header">
                        <Icon icon="mdi:alert-circle" className="event-cancel-confirm-popup__icon" />
                        <h2>Cancel Event</h2>
                    </div>
                    <div className="event-cancel-confirm-popup__warning">
                        <p><strong>Warning:</strong> this action is destructive and cannot be undone.</p>
                        <p>This will permanently delete <strong>{dashboardData?.event?.name || 'this event'}</strong>.</p>
                    </div>
                    <div className="event-cancel-confirm-popup__field">
                        <label htmlFor="eventCancelConfirmInputFocused">
                            Type <strong>cancel event</strong> to confirm:
                        </label>
                        <input
                            id="eventCancelConfirmInputFocused"
                            type="text"
                            value={cancelEventConfirmText}
                            onChange={(e) => setCancelEventConfirmText(e.target.value)}
                            placeholder="cancel event"
                            autoFocus
                        />
                    </div>
                    <div className="event-cancel-confirm-popup__actions">
                        <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => {
                                setShowCancelEventConfirm(false);
                                setCancelEventConfirmText('');
                            }}
                            disabled={cancelingEvent}
                        >
                            Keep Event
                        </button>
                        <button
                            type="button"
                            className="btn-delete"
                            onClick={handleCancelEvent}
                            disabled={cancelingEvent || cancelEventConfirmText.trim().toLowerCase() !== 'cancel event'}
                        >
                            {cancelingEvent ? 'Cancelling...' : 'Cancel Event Permanently'}
                        </button>
                    </div>
                </div>
            </Popup>
            ) : null}
        </>
    );
}

export default EventDashboardFocused;
