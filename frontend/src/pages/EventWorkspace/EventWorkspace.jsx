import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { analytics } from '../../services/analytics/analytics';
import { useFetch } from '../../hooks/useFetch';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import apiRequest from '../../utils/postRequest';
import AgendaEditor from '../../components/AgendaEditor/AgendaEditor';
import EventEditor from '../../components/EventEditor/EventEditor';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import './EventWorkspace.scss';

function EventWorkspace({ eventId: propEventId, onClose }) {
    const { eventId: paramEventId } = useParams();
    const eventId = propEventId || paramEventId;
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('overview');
    
    // Fetch event data - try with approval details first, fallback to regular if needed
    const { data: eventData, loading: eventLoading, error: eventError, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    const event = eventData?.event;

    useEffect(() => {
        if (event?._id) {
            analytics.screen('Event Workspace', { event_id: event._id });
        }
    }, [event?._id]);
    
    // Check if user can edit this event
    const canEdit = user && event && (
        (event.hostingType === 'User' && (
            event.hostingId?._id?.toString() === user._id?.toString() ||
            event.hostingId?.toString() === user._id?.toString() ||
            (typeof event.hostingId === 'string' && event.hostingId === user._id?.toString())
        )) ||
        (event.hostingType === 'Org' && user.roles?.includes('admin'))
    );

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    if (eventLoading || !eventData) {
        return (
            <div className="event-workspace">
                <div className="event-workspace__loading">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading event workspace...</p>
                </div>
            </div>
        );
    }

    if (eventError || !event) {
        return (
            <div className="event-workspace">
                <div className="event-workspace__error">
                    <Icon icon="mdi:alert-circle" />
                    <h2>Event Not Found</h2>
                    <p>The event you're looking for doesn't exist or has been removed.</p>
                    <button 
                        onClick={() => onClose ? onClose() : navigate('/events-dashboard')} 
                        className="btn btn--primary"
                    >
                        <Icon icon="mdi:arrow-left" />
                        {onClose ? 'Close' : 'Back to Events'}
                    </button>
                </div>
            </div>
        );
    }

    const getStatusBadge = (status) => {
        const badges = {
            'approved': { text: 'Approved', class: 'approved' },
            'pending': { text: 'Pending', class: 'pending' },
            'rejected': { text: 'Rejected', class: 'rejected' },
            'not-applicable': { text: 'Draft', class: 'draft' }
        };
        return badges[status] || badges['not-applicable'];
    };

    const statusBadge = getStatusBadge(event.status);

    return (
        <div className="event-workspace event-workspace--overlay">
            {onClose && (
                <div className="event-workspace__close-button" onClick={onClose}>
                    <Icon icon="mdi:close" />
                </div>
            )}
            <div className="feature-mockup feature-mockup--workspace">
                <div className="feature-mockup__workspace-container">
                    <div className="feature-mockup__workspace-header full">
                        <h3>{event.name}</h3>
                        <div className="feature-mockup__workspace-meta">
                            <span className="feature-mockup__workspace-meta-item">
                                Last edited by {event.hostingType === 'User' 
                                    ? event.hostingId?.name || 'Unknown' 
                                    : event.hostingId?.org_name || 'Unknown'} • {formatDate(event.start_time)}
                            </span>
                            <span className={`feature-mockup__badge feature-mockup__badge--${statusBadge.class}`} style={{marginLeft: '10px'}}>
                                {statusBadge.text}
                            </span>
                        </div>
                    </div>
                    <div className="feature-mockup__workspace__full__item">
                        <div className="feature-mockup__workspace-header">
                            <div>
                                <div className="feature-mockup__workspace-title">{event.name}</div>
                                <div className="feature-mockup__workspace-meta">
                                    {formatDate(event.start_time)} {formatTime(event.start_time)} • {event.location || 'Location TBD'} • {event.rsvpStats?.going || 0} RSVPs
                                </div>
                            </div>
                        </div>
                        <div className="feature-mockup__workspace-tabs">
                            <span 
                                className={`feature-mockup__tab ${activeTab === 'overview' ? 'feature-mockup__tab--active' : ''}`}
                                onClick={() => setActiveTab('overview')}
                            >
                                Overview
                            </span>
                            <span 
                                className={`feature-mockup__tab ${activeTab === 'attendees' ? 'feature-mockup__tab--active' : ''}`}
                                onClick={() => setActiveTab('attendees')}
                            >
                                Attendees
                            </span>
                            <span 
                                className={`feature-mockup__tab ${activeTab === 'resources' ? 'feature-mockup__tab--active' : ''}`}
                                onClick={() => setActiveTab('resources')}
                            >
                                Resources
                            </span>
                        </div>
                        <div className="feature-mockup__workspace-content">
                            {activeTab === 'overview' && (
                                <>
                                    {canEdit && (
                                        <div className="feature-mockup__workspace-section">
                                            <EventEditor 
                                                event={event} 
                                                onUpdate={(updatedEvent) => {
                                                    refetchEvent();
                                                }} 
                                            />
                                        </div>
                                    )}
                                    <div className="feature-mockup__workspace-section">
                                        <div className="feature-mockup__section-header">
                                            <Icon icon="mdi:check-circle-outline" />
                                            <span>Approvals</span>
                                        </div>
                                        {event.approvalReference ? (
                                            <div className="feature-mockup__approval-list">
                                                {event.approvalReference?.approvals?.map((approval, index) => {
                                                    const approvalUser = typeof approval.approvedByUserId === 'object' 
                                                        ? approval.approvedByUserId 
                                                        : null;
                                                    return (
                                                        <div 
                                                            key={index}
                                                            className={`feature-mockup__approval-item feature-mockup__approval-item--${approval.status || 'pending'}`}
                                                        >
                                                            <Icon 
                                                                icon={approval.status === 'approved' ? 'mdi:check-circle' : 'mdi:clock-outline'} 
                                                            />
                                                            <div>
                                                                <div className="feature-mockup__approval-name">{approval.role || 'Approval'}</div>
                                                                <div className="feature-mockup__approval-meta">
                                                                    {approval.status === 'approved' 
                                                                        ? `${approvalUser?.name || approval.approvedByUserId?.name || 'Approved'} • Approved ${approval.approvedAt ? formatDate(approval.approvedAt) : ''}`
                                                                        : approval.status === 'rejected'
                                                                        ? `${approvalUser?.name || approval.approvedByUserId?.name || 'Rejected'} • Rejected ${approval.approvedAt ? formatDate(approval.approvedAt) : ''}`
                                                                        : 'Pending'
                                                                    }
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="feature-mockup__approval-list">
                                                <div className="feature-mockup__approval-item feature-mockup__approval-item--approved">
                                                    <Icon icon="mdi:check-circle" />
                                                    <div>
                                                        <div className="feature-mockup__approval-name">No Approvals Required</div>
                                                        <div className="feature-mockup__approval-meta">Event is ready to publish</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="feature-mockup__workspace-section">
                                        <div className="feature-mockup__section-header">
                                            <Icon icon="mdi:account-group" />
                                            <span>Attendees</span>
                                            <span className="feature-mockup__section-badge">{event.rsvpStats?.going || 0}</span>
                                        </div>
                                        <div className="feature-mockup__attendee-preview">
                                            {event.attendees && event.attendees.filter(a => a.status === 'going').length > 0 ? (
                                                <>
                                                    <div className="feature-mockup__attendee-avatars">
                                                        {event.attendees.filter(a => a.status === 'going').slice(0, 3).map((attendee, index) => {
                                                            const attendeeUser = typeof attendee.userId === 'object' ? attendee.userId : null;
                                                            return (
                                                                <div 
                                                                    key={index} 
                                                                    className="feature-mockup__avatar"
                                                                    style={{
                                                                        backgroundImage: attendeeUser?.picture ? `url(${attendeeUser.picture})` : `url(${defaultAvatar})`,
                                                                        backgroundSize: 'cover',
                                                                        backgroundPosition: 'center'
                                                                    }}
                                                                    title={attendeeUser?.name || attendeeUser?.username || 'Unknown User'}
                                                                ></div>
                                                            );
                                                        })}
                                                        {event.attendees.filter(a => a.status === 'going').length > 3 && (
                                                            <div className="feature-mockup__avatar feature-mockup__avatar--more">
                                                                +{event.attendees.filter(a => a.status === 'going').length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="feature-mockup__attendee-stats">
                                                        <span>{event.rsvpStats?.going || 0} confirmed</span>
                                                        <span>•</span>
                                                        <span>{event.rsvpStats?.maybe || 0} maybe</span>
                                                        {event.rsvpStats?.notGoing > 0 && (
                                                            <>
                                                                <span>•</span>
                                                                <span>{event.rsvpStats.notGoing} not going</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="feature-mockup__empty-state">
                                                    <Icon icon="mdi:account-group-outline" />
                                                    <p>No confirmed attendees yet</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <div className="feature-mockup__workspace-section">
                                            <div className="feature-mockup__section-header">
                                                <Icon icon="mdi:calendar-clock" />
                                                <span>Agenda</span>
                                            </div>
                                            <AgendaEditor 
                                                event={event} 
                                                onUpdate={(updatedEvent) => {
                                                    refetchEvent();
                                                }} 
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            {activeTab === 'attendees' && (
                                <div className="feature-mockup__workspace-section">
                                    <div className="feature-mockup__section-header">
                                        <Icon icon="mdi:account-group" />
                                        <span>Attendees</span>
                                        <span className="feature-mockup__section-badge">{event.rsvpStats?.going || 0}</span>
                                    </div>
                                    {event.attendees && event.attendees.length > 0 ? (
                                        <div className="feature-mockup__attendee-list">
                                            {event.attendees.map((attendee, index) => {
                                                const attendeeUser = typeof attendee.userId === 'object' ? attendee.userId : null;
                                                const attendeeName = attendeeUser?.name || attendeeUser?.username || 'Unknown User';
                                                const attendeePicture = attendeeUser?.picture || defaultAvatar;
                                                return (
                                                    <div key={index} className="feature-mockup__attendee-item">
                                                        <div 
                                                            className="feature-mockup__avatar"
                                                            style={{
                                                                backgroundImage: `url(${attendeePicture})`,
                                                                backgroundSize: 'cover',
                                                                backgroundPosition: 'center'
                                                            }}
                                                        ></div>
                                                        <div className="feature-mockup__attendee-info">
                                                            <div className="feature-mockup__attendee-name">
                                                                {attendeeName}
                                                            </div>
                                                            <div className="feature-mockup__attendee-status">
                                                                {attendee.status === 'going' ? 'Confirmed' : attendee.status === 'maybe' ? 'Maybe' : 'Not Going'}
                                                                {attendee.guestCount > 1 && ` (+${attendee.guestCount - 1} guests)`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="feature-mockup__empty-state">
                                            <Icon icon="mdi:account-group-outline" />
                                            <p>No attendees yet</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'resources' && (
                                <div className="feature-mockup__workspace-section">
                                    <div className="feature-mockup__section-header">
                                        <Icon icon="mdi:folder-outline" />
                                        <span>Resources</span>
                                    </div>
                                    <div className="feature-mockup__empty-state">
                                        <Icon icon="mdi:folder-outline" />
                                        <p>No resources added yet</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventWorkspace;

