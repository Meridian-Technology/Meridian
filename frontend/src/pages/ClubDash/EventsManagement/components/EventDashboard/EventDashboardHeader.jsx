import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../../hooks/useGradient';
import { useNotification } from '../../../../../NotificationContext';
import { useDashboardOverlay } from '../../../../../hooks/useDashboardOverlay';
import apiRequest from '../../../../../utils/postRequest';
import './EventDashboard.scss';

function EventDashboardHeader({ event, stats, onClose, onRefresh, orgId }) {
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const { showOverlay, hideOverlay } = useDashboardOverlay();
    const [editing, setEditing] = useState(false);

    const getEventStatus = () => {
        if (!event?.start_time) return null;
        const now = new Date();
        const start = new Date(event.start_time);
        return start > now ? 'upcoming' : 'passed';
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
        const diff = start - now;

        if (diff < 0) {
            return 'Event has started';
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

    const handleEdit = () => {
        setEditing(true);
        // Dynamically import EventEditor to avoid circular dependencies
        import('../../../../../components/EventEditor/EventEditor').then(({ default: EventEditor }) => {
            showOverlay(
                <div className="event-editor-overlay">
                    <EventEditor
                        event={event}
                        onUpdate={(updatedEvent) => {
                            addNotification({
                                title: 'Success',
                                message: 'Event updated successfully',
                                type: 'success'
                            });
                            if (onRefresh) onRefresh();
                            hideOverlay();
                            setEditing(false);
                        }}
                    />
                </div>
            );
        }).catch(() => {
            setEditing(false);
        });
    };

    const handlePreview = () => {
        if (!event?._id) return;
        const eventUrl = `${window.location.origin}/event/${event._id}`;
        window.open(eventUrl, '_blank', 'noopener,noreferrer');
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
        } catch (err) {
            // Fallback for older browsers
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
            } catch (err) {
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

    return (
        <div className="event-dashboard-header">
            <div className="header-background">
                <img src={AtlasMain} alt="" />
            </div>
            <div className="header-content">
                <div className="header-top">
                    <button className="close-btn" onClick={onClose}>
                        <Icon icon="mdi:close" />
                    </button>
                    <div className="header-actions">
                        <button className="action-btn refresh" onClick={onRefresh} title="Refresh">
                            <Icon icon="mdi:refresh" />
                        </button>
                        <button 
                            className="action-btn refresh" 
                            title="Edit Event"
                            onClick={handleEdit}
                            disabled={editing}
                        >
                            <Icon icon={editing ? "mdi:loading" : "mdi:pencil"} className={editing ? "spinner" : ""} />
                        </button>
                        <button 
                            className="action-btn share" 
                            onClick={handleShare}
                            title="Copy Event Link"
                            disabled={!event?._id}
                        >
                            <Icon icon="mdi:share-variant" />
                        </button>
                        <button 
                            className="action-btn preview" 
                            onClick={handlePreview}
                            title="Preview Event"
                            disabled={!event?._id}
                        >
                            <Icon icon="mdi:open-in-new" />
                            <span>Preview</span>
                        </button>
                    </div>
                </div>
                <div className="header-main">
                    <div className="event-title-section">
                        <h1>{event?.name || 'Event'}</h1>
                        <div className="event-meta">
                            {eventStatus && (
                                <span className={`event-status-bubble ${eventStatus}`}>
                                    {eventStatus === 'upcoming' ? 'Upcoming' : 'Passed'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="quick-stats">
                        <div className="stat-item">
                            <Icon icon="mingcute:user-group-fill" className="stat-icon" />
                            <div className="stat-content">
                                <span className="stat-value">{stats?.rsvps?.going || 0}</span>
                                <span className="stat-label">RSVPs</span>
                            </div>
                        </div>
                        <div className="stat-item">
                            <Icon icon="mdi:calendar-clock" className="stat-icon" />
                            <div className="stat-content">
                                <span className="stat-value">{getTimeUntilEvent() || 'N/A'}</span>
                                <span className="stat-label">Time Until</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="header-details">
                    <div className="detail-item">
                        <Icon icon="mdi:calendar" />
                        <span>{formatDate(event?.start_time)}</span>
                    </div>
                    <div className="detail-item">
                        <Icon icon="mdi:clock-outline" />
                        <span>{formatTime(event?.start_time)} - {formatTime(event?.end_time)}</span>
                    </div>
                    <div className="detail-item">
                        <Icon icon="fluent:location-28-filled" />
                        <span>{event?.location || 'TBD'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventDashboardHeader;
