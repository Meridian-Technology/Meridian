import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { analytics } from '../../../services/analytics/analytics';
import { useNotification } from '../../../NotificationContext';
import { useDashboardOverlay } from '../../../hooks/useDashboardOverlay';
import apiRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import './EventsManagement.scss';
import { useGradient } from '../../../hooks/useGradient';
import StatsHeader from './components/StatsHeader';
import EventsList from './components/EventsManagementList';

function formatInviteEventDateTime(event) {
    if (!event?.start_time) return 'TBD';
    const start = new Date(event.start_time);
    const end = event.end_time ? new Date(event.end_time) : start;
    const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    const sameDay =
        start.getDate() === end.getDate() &&
        start.getMonth() === end.getMonth() &&
        start.getFullYear() === end.getFullYear();
    const datePart = sameDay
        ? start.toLocaleString(undefined, dateOpts)
        : `${start.toLocaleString(undefined, dateOpts)} – ${end.toLocaleString(undefined, dateOpts)}`;
    const timePart = `${start.toLocaleString(undefined, timeOpts)} – ${end.toLocaleString(undefined, timeOpts)}`;
    return { datePart, timePart };
}

function truncatePreviewDescription(text, max = 450) {
    if (!text) return '';
    const plain = String(text).replace(/\s+/g, ' ').trim();
    if (plain.length <= max) return plain;
    return `${plain.slice(0, max)}…`;
}

function EventsManagement({ orgId, expandedClass, orgData: orgDataProp }) {
    const { addNotification } = useNotification();
    const { showEventDashboard, hideOverlay } = useDashboardOverlay();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [collaborationInvites, setCollaborationInvites] = useState([]);
    const [loadingInvites, setLoadingInvites] = useState(false);
    const [actingInviteId, setActingInviteId] = useState(null);
    const [previewInvite, setPreviewInvite] = useState(null);
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

    useEffect(() => {
        const orgIdForAnalytics = orgData?.org?.overview?._id;
        if (orgIdForAnalytics) {
            analytics.screen('Events Management', { org_id: orgIdForAnalytics });
        }
    }, [orgId, orgData?.org?.overview?._id]);

    useEffect(() => {
        const orgIdForDashboard = orgData?.org?.overview?._id;
        if (!orgIdForDashboard) return;

        let isMounted = true;
        const fetchCollaborationInvites = async () => {
            setLoadingInvites(true);
            try {
                const response = await apiRequest(`/org-event-management/${orgIdForDashboard}/collaboration-invites/pending`, null, { method: 'GET' });
                if (isMounted) {
                    setCollaborationInvites(response?.data?.invites || []);
                }
            } catch (_error) {
                if (isMounted) {
                    setCollaborationInvites([]);
                }
            } finally {
                if (isMounted) {
                    setLoadingInvites(false);
                }
            }
        };

        fetchCollaborationInvites();
        return () => {
            isMounted = false;
        };
    }, [orgData?.org?.overview?._id, refreshTrigger]);

    const handleViewEvent = (event) => {
        const orgIdForDashboard = orgData?.org?.overview?._id;
        if (orgIdForDashboard) {
            showEventDashboard(event, orgIdForDashboard, {
                className: 'full-width-event-dashboard',
                persistInUrl: true,
            });
        }
    };

    const handleInviteAction = async (inviteId, action) => {
        try {
            setActingInviteId(inviteId);
            const response = await apiRequest(`/event-collaboration-invites/${inviteId}/${action}`, {}, { method: 'POST' });
            if (response?.success) {
                addNotification({
                    title: action === 'accept' ? 'Collaboration Accepted' : 'Collaboration Declined',
                    message: response.message || 'Invite updated.',
                    type: 'success'
                });
                setCollaborationInvites(prev => prev.filter(invite => invite._id !== inviteId));
                setPreviewInvite((current) => (current?._id === inviteId ? null : current));
                handleRefresh();
            } else {
                throw new Error(response?.message || 'Unable to process invite.');
            }
        } catch (error) {
            addNotification({
                title: 'Invite Action Failed',
                message: error.message || 'Unable to process collaboration invite.',
                type: 'error'
            });
        } finally {
            setActingInviteId(null);
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
                {!loadingInvites && collaborationInvites.length > 0 && (
                    <div className="collaboration-banner">
                        <div className="collaboration-banner-header">
                            <Icon icon="mdi:account-group-outline" />
                            <div>
                                <h3>Pending collaboration invites</h3>
                                <p>Accepting gives your org event-management admins full event management access.</p>
                            </div>
                        </div>
                        <div className="collaboration-banner-list">
                            {collaborationInvites.slice(0, 3).map((invite) => (
                                <div key={invite._id} className="collaboration-banner-item">
                                    <div className="invite-summary">
                                        <strong>{invite.eventId?.name || 'Event'}</strong>
                                        <span>from {invite.hostOrgId?.org_name || 'another organization'}</span>
                                    </div>
                                    <div className="invite-actions">
                                        <button
                                            type="button"
                                            className="preview"
                                            disabled={actingInviteId === invite._id}
                                            onClick={() => setPreviewInvite(invite)}
                                        >
                                            Preview
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actingInviteId === invite._id}
                                            onClick={() => handleInviteAction(invite._id, 'accept')}
                                        >
                                            Accept
                                        </button>
                                        <button
                                            type="button"
                                            className="secondary"
                                            disabled={actingInviteId === invite._id}
                                            onClick={() => handleInviteAction(invite._id, 'decline')}
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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

            <Popup
                isOpen={!!previewInvite}
                onClose={() => setPreviewInvite(null)}
                customClassName="collaboration-invite-preview-popup"
            >
                {previewInvite &&
                    (() => {
                        const ev = previewInvite.eventId;
                        const whenParts = ev?.start_time ? formatInviteEventDateTime(ev) : null;
                        return (
                            <div className="collaboration-invite-preview">
                                <div className="collaboration-invite-preview__header">
                                    <h2>{ev?.name || 'Event'}</h2>
                                    <p className="collaboration-invite-preview__host">
                                        Hosted by{' '}
                                        <strong>
                                            {ev?.hostingId?.org_name ||
                                                previewInvite.hostOrgId?.org_name ||
                                                'Host organization'}
                                        </strong>
                                    </p>
                                    {previewInvite.invitedByUserId?.name && (
                                        <p className="collaboration-invite-preview__inviter">
                                            Invitation sent by {previewInvite.invitedByUserId.name}
                                        </p>
                                    )}
                                </div>
                                {ev?.image && (
                                    <div className="collaboration-invite-preview__image-wrap">
                                        <img
                                            src={ev.image}
                                            alt={ev?.name ? `${ev.name} cover` : 'Event cover'}
                                            className="collaboration-invite-preview__image"
                                        />
                                    </div>
                                )}
                                <dl className="collaboration-invite-preview__details">
                                    {whenParts && (
                                        <>
                                            <dt>When</dt>
                                            <dd>
                                                {whenParts.datePart}
                                                <br />
                                                <span className="collaboration-invite-preview__time">
                                                    {whenParts.timePart}
                                                </span>
                                            </dd>
                                        </>
                                    )}
                                    <dt>Where</dt>
                                    <dd>{ev?.location || '—'}</dd>
                                    {ev?.type && (
                                        <>
                                            <dt>Event type</dt>
                                            <dd>{ev.type}</dd>
                                        </>
                                    )}
                                    {ev?.visibility && (
                                        <>
                                            <dt>Visibility</dt>
                                            <dd>{ev.visibility.replace(/_/g, ' ')}</dd>
                                        </>
                                    )}
                                    {ev?.expectedAttendance != null && (
                                        <>
                                            <dt>Expected attendance</dt>
                                            <dd>{ev.expectedAttendance}</dd>
                                        </>
                                    )}
                                </dl>
                                {ev?.description && (
                                    <div className="collaboration-invite-preview__description">
                                        <h3>Description</h3>
                                        <p>{truncatePreviewDescription(ev.description)}</p>
                                    </div>
                                )}
                                <p className="collaboration-invite-preview__notice">
                                    Accepting lets your organization’s event managers co-manage this event with the
                                    host.
                                </p>
                                <div className="collaboration-invite-preview__actions">
                                    <button
                                        type="button"
                                        className="secondary"
                                        disabled={actingInviteId === previewInvite._id}
                                        onClick={() => {
                                            handleInviteAction(previewInvite._id, 'decline');
                                        }}
                                    >
                                        Decline
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actingInviteId === previewInvite._id}
                                        onClick={() => {
                                            handleInviteAction(previewInvite._id, 'accept');
                                        }}
                                    >
                                        Accept collaboration
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
            </Popup>
        </div>
    );
}

export default EventsManagement;
