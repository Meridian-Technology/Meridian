import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import TabbedContainer from '../../components/TabbedContainer';
import EventOverview from '../ClubDash/EventsManagement/components/EventDashboard/EventOverview';
import EventAnalyticsDetail from '../ClubDash/EventsManagement/components/EventDashboard/EventAnalyticsDetail';
import RegistrationsTab from '../ClubDash/EventsManagement/components/EventDashboard/RegistrationsTab/RegistrationsTab';
import './AdminEventOperatorPage.scss';

const adminTenantEventBase = (eventId) => `/org-management/admin-tenant-events/${eventId}`;

/**
 * Event detail view for community staff: stats, registrations, and analytics (no org club chrome).
 * @param {{ eventId?: string, onClose?: () => void, className?: string }} props
 */
export function AdminEventOperatorContent({ eventId, onClose, className = '' }) {
    const dashboardUrl = eventId ? `${adminTenantEventBase(eventId)}/dashboard` : null;
    const { data, loading, error, refetch } = useFetch(dashboardUrl);
    const payload = data?.data;
    const event = payload?.event;
    const stats = payload?.stats;
    const agenda = payload?.agenda;
    const analytics = payload?.analytics;
    const effectiveOrgId = payload?.effectiveOrgId ?? null;

    const [activeTab, setActiveTab] = useState('overview');
    const [refreshKey, setRefreshKey] = useState(0);

    const handleRefresh = useCallback(() => {
        refetch?.();
        setRefreshKey((k) => k + 1);
    }, [refetch]);

    const rsvpGrowthUrlOverride = useMemo(() => {
        if (!eventId) return undefined;
        return `${adminTenantEventBase(eventId)}/rsvp-growth`;
    }, [eventId]);

    const registrationResponsesUrl = useMemo(() => {
        if (!eventId) return null;
        return `${adminTenantEventBase(eventId)}/registration-responses`;
    }, [eventId]);

    const backControl = onClose ? (
        <button type="button" className="admin-event-operator__back" onClick={onClose}>
            <Icon icon="mdi:arrow-left" />
            Close
        </button>
    ) : (
        <Link to="/root-dashboard" className="admin-event-operator__back">
            <Icon icon="mdi:arrow-left" />
            Back to dashboard
        </Link>
    );

    if (!eventId) {
        return (
            <div className={`admin-event-operator admin-event-operator--state ${className}`.trim()}>
                <p>Missing event id.</p>
                {onClose ? (
                    <button type="button" className="admin-event-operator__text-btn" onClick={onClose}>
                        Close
                    </button>
                ) : (
                    <Link to="/root-dashboard">Back to home</Link>
                )}
            </div>
        );
    }

    if (loading && !payload) {
        return (
            <div className={`admin-event-operator admin-event-operator--state ${className}`.trim()}>
                <Icon icon="mdi:loading" className="admin-event-operator__spin" />
                <span>Loading event…</span>
            </div>
        );
    }

    if (error || (data && !data.success) || !event) {
        return (
            <div className={`admin-event-operator admin-event-operator--state admin-event-operator--error ${className}`.trim()}>
                <p>{data?.message || error || 'Event not found or you do not have access.'}</p>
                {onClose ? (
                    <button type="button" className="admin-event-operator__text-btn" onClick={onClose}>
                        Close
                    </button>
                ) : (
                    <Link to="/root-dashboard">Back to home</Link>
                )}
            </div>
        );
    }

    const operational = stats?.operationalStatus || 'upcoming';
    const views = analytics?.views ?? 0;
    const uniqueViews = analytics?.uniqueViews ?? 0;
    const regCount = stats?.registrationCount ?? event?.registrationCount ?? 0;

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mdi:view-dashboard-outline',
            description: 'Schedule, RSVP trend, and quick links',
            content: (
                <EventOverview
                    key={refreshKey}
                    event={event}
                    stats={stats}
                    agenda={agenda}
                    orgId={effectiveOrgId || undefined}
                    onRefresh={handleRefresh}
                    onTabChange={setActiveTab}
                    operatorOrganizerMode
                    rsvpGrowthUrlOverride={rsvpGrowthUrlOverride}
                />
            ),
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: 'mingcute:chart-line-fill',
            description: 'Views, funnel, and engagement',
            content: (
                <EventAnalyticsDetail
                    key={`${refreshKey}-analytics`}
                    event={event}
                    stats={stats}
                    orgId={effectiveOrgId || undefined}
                    onRefresh={handleRefresh}
                />
            ),
        },
        {
            id: 'registrations',
            label: 'Registrations',
            icon: 'mdi:clipboard-list-outline',
            description: 'Read-only list and export',
            content: (
                <RegistrationsTab
                    key={`${refreshKey}-reg`}
                    event={event}
                    orgId={effectiveOrgId || undefined}
                    onRefresh={handleRefresh}
                    color="var(--primary-color)"
                    readOnly
                    registrationResponsesUrl={registrationResponsesUrl}
                />
            ),
        },
    ];

    return (
        <div className={`admin-event-operator ${className}`.trim()}>
            <header className="admin-event-operator__header">
                <div className="admin-event-operator__header-top">
                    {backControl}
                    <a
                        href={`${window.location.origin}/event/${event._id}`}
                        className="admin-event-operator__public"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Public event page
                        <Icon icon="mdi:open-in-new" />
                    </a>
                </div>
                <div className="admin-event-operator__title-row">
                    <h1>{event.name || 'Event'}</h1>
                    <span className={`admin-event-operator__pill admin-event-operator__pill--${operational}`}>{operational}</span>
                </div>
                <dl className="admin-event-operator__kpis">
                    <div>
                        <dt>Views</dt>
                        <dd>{views.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>Unique views</dt>
                        <dd>{uniqueViews.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>Registrations</dt>
                        <dd>{regCount.toLocaleString()}</dd>
                    </div>
                </dl>
            </header>

            <div className="admin-event-operator__body">
                <TabbedContainer
                    tabs={tabs}
                    defaultTab="overview"
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabStyle="default"
                    size="medium"
                    animated
                    showTabIcons
                    showTabLabels
                    fullWidth={false}
                    scrollable
                    lazyLoad
                    keepAlive
                    className="admin-event-operator__tabs"
                    stickyTabs
                />
            </div>
        </div>
    );
}

function AdminEventOperatorPage() {
    const { eventId } = useParams();
    return <AdminEventOperatorContent eventId={eventId} />;
}

export default AdminEventOperatorPage;
