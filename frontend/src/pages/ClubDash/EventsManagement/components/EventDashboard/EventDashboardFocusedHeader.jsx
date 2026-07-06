import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../../hooks/useGradient';
import { useNotification } from '../../../../../NotificationContext';
import apiRequest from '../../../../../utils/postRequest';
import defaultAvatar from '../../../../../assets/defaultAvatar.svg';
import './EventDashboardFocusedHeader.scss';

/**
 * Header used only by EventDashboardFocused — keeps styles isolated so the legacy
 * EventDashboardHeader + EventDashboard.scss stack can revert unchanged.
 */
function EventDashboardFocusedHeader({
    condensed = false,
    event,
    stats,
    onClose,
    onRefresh,
    orgId,
    onSendAnnouncement,
    onPostMortem,
    showPostMortem
}) {
    const [publishing, setPublishing] = useState(false);
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();

    const getEventStatus = () => {
        if (!event?.start_time) return null;
        const now = new Date();
        const start = new Date(event.start_time);
        const end = new Date(event.end_time || event.start_time);
        if (start > now) return 'upcoming';
        if (end < now) return 'passed';
        return 'live';
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTimeUntilEvent = () => {
        if (!event?.start_time) return '';
        const now = new Date();
        const start = new Date(event.start_time);
        const end = new Date(event.end_time || event.start_time);
        const diff = start - now;

        if (diff < 0) {
            if (now <= end) return 'Happening now';
            return 'Event has ended';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} until event`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} until event`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} until event`;
        }
    };

    const handlePreview = () => {
        if (!event?._id) return;
        const eventUrl = `${window.location.origin}/event/${event._id}`;
        window.open(eventUrl, '_blank', 'noopener,noreferrer');
    };

    const handlePublish = async () => {
        if (!event?._id) return;
        setPublishing(true);
        try {
            const res = await apiRequest(`/publish-event/${event._id}`, {}, { method: 'POST' });
            if (res.success) {
                addNotification({
                    title: 'Event Published',
                    message: res.status === 'pending' ? 'Event submitted for approval.' : 'Event published successfully.',
                    type: 'success'
                });
                onRefresh?.();
            } else {
                throw new Error(res.message || res.error);
            }
        } catch (err) {
            addNotification({
                title: 'Publish Failed',
                message: err.message || 'Failed to publish event.',
                type: 'error'
            });
        } finally {
            setPublishing(false);
        }
    };

    const handleShare = async () => {
        if (!event?._id) return;
        const eventUrl = `${window.location.origin}/event/${event._id}`;
        try {
            await navigator.clipboard.writeText(eventUrl);
            addNotification({
                title: 'Success',
                message: 'Event link copied to clipboard',
                type: 'success'
            });
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = eventUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                addNotification({
                    title: 'Success',
                    message: 'Event link copied to clipboard',
                    type: 'success'
                });
            } catch (copyErr) {
                addNotification({
                    title: 'Error',
                    message: 'Failed to copy link to clipboard',
                    type: 'error'
                });
            }
            document.body.removeChild(textArea);
        }
    };

    const eventStatus = getEventStatus();
    const eventImageUrl = event?.image || event?.previewImage;

    const collaborationOrgs = useMemo(() => {
        if (event?.hostingType !== 'Org') return [];

        const currentOrgId = orgId ? String(orgId) : '';
        const map = new Map();
        const hostIdRaw = event.hostingId?._id || event.hostingId;
        const hostId = hostIdRaw ? String(hostIdRaw) : '';

        if (hostId && hostId !== currentOrgId) {
            map.set(hostId, {
                id: hostId,
                name: event.hostingId?.org_name || 'Host organization',
                image: event.hostingId?.org_profile_image || defaultAvatar,
                role: 'host',
                status: 'active'
            });
        }

        (event.collaboratorOrgs || []).forEach((entry) => {
            const collaboratorIdRaw = entry?.orgId?._id || entry?.orgId;
            const collaboratorId = collaboratorIdRaw ? String(collaboratorIdRaw) : '';
            if (!collaboratorId || collaboratorId === currentOrgId || map.has(collaboratorId)) return;
            map.set(collaboratorId, {
                id: collaboratorId,
                name: entry?.orgId?.org_name || 'Organization',
                image: entry?.orgId?.org_profile_image || defaultAvatar,
                role: 'collaborator',
                status: entry?.status === 'active' ? 'active' : 'pending'
            });
        });

        return Array.from(map.values());
    }, [event, orgId]);

    return (
        <div
            className={`event-dashboard-focused-header${condensed ? ' event-dashboard-focused-header--condensed' : ''}`}
        >
            <div className="event-dashboard-focused-header__background">
                <img src={AtlasMain} alt="" />
            </div>
            <div className="event-dashboard-focused-header__content">
                <div className="event-dashboard-focused-header__top">
                    <button type="button" className="event-dashboard-focused-header__close" onClick={onClose}>
                        <Icon icon="mdi:close" />
                    </button>
                    <div className="event-dashboard-focused-header__actions">
                        {event?.status === 'draft' && (
                            <button
                                type="button"
                                className="event-dashboard-focused-header__btn event-dashboard-focused-header__btn--publish"
                                onClick={handlePublish}
                                disabled={publishing}
                                title="Publish Event"
                            >
                                <Icon icon="mdi:publish" />
                                <span>{publishing ? 'Publishing...' : 'Publish'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="event-dashboard-focused-header__btn event-dashboard-focused-header__btn--icon-only"
                            onClick={onRefresh}
                            title="Refresh"
                        >
                            <Icon icon="mdi:refresh" />
                        </button>
                        <button
                            type="button"
                            className="event-dashboard-focused-header__btn event-dashboard-focused-header__btn--icon-only"
                            onClick={handleShare}
                            title="Copy Event Link"
                            disabled={!event?._id}
                        >
                            <Icon icon="mdi:share-variant" />
                        </button>
                        {onSendAnnouncement && event?._id && orgId && (
                            <button
                                type="button"
                                className="event-dashboard-focused-header__btn event-dashboard-focused-header__btn--announcement"
                                onClick={onSendAnnouncement}
                                title="Send announcement to event attendees"
                            >
                                <Icon icon="mdi:bullhorn" />
                                <span>Send announcement</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="event-dashboard-focused-header__btn"
                            onClick={handlePreview}
                            title="Preview Event"
                            disabled={!event?._id}
                        >
                            <Icon icon="mdi:open-in-new" />
                            <span>Preview</span>
                        </button>
                        {showPostMortem && (
                            <button
                                type="button"
                                className="event-dashboard-focused-header__btn event-dashboard-focused-header__btn--post-mortem"
                                onClick={onPostMortem}
                                title="View post-mortem report"
                            >
                                <Icon icon="mdi:chart-box-outline" />
                                <span>Post-Mortem</span>
                            </button>
                        )}
                    </div>
                </div>
                <div className="event-dashboard-focused-header__main">
                    <div className="event-dashboard-focused-header__title-section">
                        <div className="event-dashboard-focused-header__title-row">
                            {eventImageUrl ? (
                                <img
                                    src={eventImageUrl}
                                    alt=""
                                    className="event-dashboard-focused-header__title-thumb"
                                />
                            ) : null}
                            <div className="event-dashboard-focused-header__title-heading">
                                <h1>{event?.name || 'Event'}</h1>
                                <div className="event-dashboard-focused-header__meta">
                                    {event?.status === 'draft' && (
                                        <span className="event-dashboard-focused-header__status event-dashboard-focused-header__status--draft">
                                            Draft
                                        </span>
                                    )}
                                    {event?.status === 'pending' && (
                                        <span className="event-dashboard-focused-header__status event-dashboard-focused-header__status--pending">
                                            Pending Review
                                        </span>
                                    )}
                                    {event?.status === 'rejected' && (
                                        <span className="event-dashboard-focused-header__status event-dashboard-focused-header__status--rejected">
                                            Rejected
                                        </span>
                                    )}
                                    {eventStatus && !['draft', 'pending', 'rejected'].includes(event?.status) && (
                                        <span
                                            className={`event-dashboard-focused-header__status event-dashboard-focused-header__status--${eventStatus}`}
                                        >
                                            {eventStatus === 'upcoming' && 'Upcoming'}
                                            {eventStatus === 'live' && 'Live'}
                                            {eventStatus === 'passed' && 'Passed'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {event?.hostingType === 'Org' && (
                            <div className="event-dashboard-focused-header__collab">
                                {collaborationOrgs.length === 0 ? null : (
                                    <>
                                        <span className="event-dashboard-focused-header__collab-label">with</span>
                                        <ul className="event-dashboard-focused-header__collab-list">
                                            {collaborationOrgs.map((org, index) => {
                                                const lastIndex = collaborationOrgs.length - 1;
                                                const isLast = index === lastIndex;
                                                const needsAnd = collaborationOrgs.length > 1 && isLast;
                                                const needsComma = index > 0 && !isLast;
                                                return (
                                                    <li key={org.id} className="event-dashboard-focused-header__collab-item">
                                                        {needsComma && (
                                                            <span className="event-dashboard-focused-header__collab-sep">,</span>
                                                        )}
                                                        {needsAnd && (
                                                            <span className="event-dashboard-focused-header__collab-sep">and</span>
                                                        )}
                                                        <img
                                                            src={org.image || defaultAvatar}
                                                            alt={org.name ? `${org.name} avatar` : 'Organization avatar'}
                                                            className="event-dashboard-focused-header__collab-avatar"
                                                        />
                                                        <span className="event-dashboard-focused-header__collab-name">{org.name}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="event-dashboard-focused-header__stats">
                        <div className="event-dashboard-focused-header__stat">
                            <Icon icon="mingcute:user-group-fill" className="event-dashboard-focused-header__stat-icon" />
                            <div className="event-dashboard-focused-header__stat-text">
                                <span className="event-dashboard-focused-header__stat-value">{stats?.registrationCount ?? 0}</span>
                                <span className="event-dashboard-focused-header__stat-label">Registrations</span>
                            </div>
                        </div>
                        <div className="event-dashboard-focused-header__stat">
                            <Icon icon="mdi:calendar-clock" className="event-dashboard-focused-header__stat-icon" />
                            <div className="event-dashboard-focused-header__stat-text">
                                <span className="event-dashboard-focused-header__stat-value">{getTimeUntilEvent() || 'N/A'}</span>
                                <span className="event-dashboard-focused-header__stat-label">Time Until</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="event-dashboard-focused-header__details">
                    <div className="event-dashboard-focused-header__detail">
                        <Icon icon="mdi:calendar" />
                        <span>{formatDate(event?.start_time)}</span>
                    </div>
                    <div className="event-dashboard-focused-header__detail">
                        <Icon icon="mdi:clock-outline" />
                        <span>{formatTime(event?.start_time)} - {formatTime(event?.end_time)}</span>
                    </div>
                    <div className="event-dashboard-focused-header__detail">
                        <Icon icon="fluent:location-28-filled" />
                        <span>{event?.location || 'TBD'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventDashboardFocusedHeader;
