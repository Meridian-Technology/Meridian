import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import useAuth from '../../hooks/useAuth';
import { analytics } from '../../services/analytics/analytics';
import RSVPSection from '../../components/RSVPSection/RSVPSection';
import EventCheckInButton from '../../components/EventCheckInButton/EventCheckInButton';
import Popup from '../../components/Popup/Popup';
import EmptyState from '../../components/EmptyState/EmptyState';
import AgendaDailyCalendar from '../ClubDash/EventsManagement/components/EventDashboard/EventAgendaBuilder/AgendaDailyCalendar/AgendaDailyCalendar';
import EventAnalytics from '../../components/EventAnalytics/EventAnalytics';
import { getStoredMinuteHeightPx } from '../../utils/agendaViewPreferences';
import { parseMarkdownDescription } from '../../utils/markdownUtils';

/**
 * EventPageContent - Shared event layout and UI components.
 *
 * Used by EventPage.jsx (full page) and EventOverview (scaled preview).
 * Any changes here affect both the main event page and the dashboard preview.
 */
function EventPageContent({ event, onRefetch, previewMode = false, showAnalytics = false, variant = 'desktop' }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [showAgendaModal, setShowAgendaModal] = useState(false);
    const [activeTab, setActiveTab] = useState('details');
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const [descriptionOverflows, setDescriptionOverflows] = useState(false);
    const descriptionRef = useRef(null);

    useEffect(() => {
        if (!descriptionRef.current || descriptionExpanded || !event?.description) return;
        const checkOverflow = () => {
            if (descriptionRef.current && descriptionRef.current.scrollHeight > descriptionRef.current.clientHeight) {
                setDescriptionOverflows(true);
            }
        };
        checkOverflow();
        const timeout = setTimeout(checkOverflow, 100);
        return () => clearTimeout(timeout);
    }, [event?.description, descriptionExpanded]);

    if (!event) return null;

    const date = new Date(event.start_time);
    const dateEnd = new Date(event.end_time || event.start_time);
    const now = new Date();
    const isLive = now >= date && now <= dateEnd;

    const renderHostingStatus = () => {
        if (!event?.hostingType) return null;
        let hostingImage = '';
        let hostingName = '';
        let level = '';
        if (event.hostingType === 'User') {
            hostingImage = event.hostingId?.image || defaultAvatar;
            hostingName = event.hostingId?.name || 'Unknown';
            if (event.hostingId?.roles?.includes('developer')) level = 'Developer';
            else if (event.hostingId?.roles?.includes('oie')) level = 'Faculty';
            else level = 'Student';
        } else {
            hostingImage = event.hostingId?.org_profile_image || defaultAvatar;
            hostingName = event.hostingId?.org_name || 'Unknown Organization';
            level = 'Organization';
        }
        const handleHostingClick = () => {
            if (!previewMode && level === 'Organization') navigate(`/org/${hostingName}`);
        };
        return (
            <div className={`row hosting ${level.toLowerCase()}`} onClick={handleHostingClick}>
                <p>Hosted by</p>
                <div className="host-info">
                    <img src={hostingImage} alt="" />
                    <p className="user-name">{hostingName}</p>
                </div>
            </div>
        );
    };

    const isMobileVariant = variant === 'mobile';

    return (
        <div className={`event-content ${isMobileVariant ? 'event-content--mobile' : ''}`}>
            {!previewMode && (
                <div className="back" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/events-dashboard?page=1')}>
                    <Icon icon="mdi:arrow-left" />
                    <p>Back to Events</p>
                </div>
            )}
            <div className="event-layout">
                <div className={`event-sidebar ${isMobileVariant ? 'event-sidebar--mobile' : ''}`}>
                    {event.image && (
                        <div className="image-container">
                            <img src={event.image} alt={`Event image for ${event.name}`} className="event-image" />
                        </div>
                    )}
                    {!isMobileVariant && renderHostingStatus()}
                    {event.tags && event.tags.length > 0 && !isMobileVariant && (
                        <div className="event-tags">
                            {event.tags.map((tag, index) => (
                                <span key={index} className="tag">#{tag}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="event-details">
                    {isLive && (
                        <div className="event-live-badge" role="status">
                            <Icon icon="mdi:circle" className="event-live-dot" />
                            <span>Happening now</span>
                        </div>
                    )}
                    <h1>{event.name}</h1>
                    <div className={`hosting-mobile ${isMobileVariant ? 'hosting-mobile--visible' : ''}`}>
                        {renderHostingStatus()}
                    </div>
                    <div className="col">
                        <div className="row event-detail date">
                            <p>{date.toLocaleString('default', { weekday: 'long' })}, {date.toLocaleString('default', { month: 'long' })} {date.getDate()}</p>
                        </div>
                        <div className="row event-detail time">
                            <p>{date.toLocaleString('default', { hour: 'numeric', minute: 'numeric', hour12: true })} - {dateEnd.toLocaleString('default', { hour: 'numeric', minute: 'numeric', hour12: true })}</p>
                        </div>
                        <div className="row event-detail location">
                            <Icon icon="fluent:location-28-filled" />
                            <p>{event.location || 'Location TBD'}</p>
                        </div>
                    </div>

                    {event.description && (
                        <div className="row event-description">
                            <div
                                ref={descriptionRef}
                                className={`event-description-content ${!descriptionExpanded ? 'event-description-clamped' : ''}`}
                                dangerouslySetInnerHTML={{ __html: parseMarkdownDescription(event.description) }}
                            />
                            {(descriptionOverflows || descriptionExpanded) && (
                                <button
                                    type="button"
                                    className="event-description-expand-btn"
                                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                                >
                                    {descriptionExpanded ? 'Show less' : 'Expand'}
                                </button>
                            )}
                        </div>
                    )}
                    {event.externalLink && (
                        <div className="row external-link">
                            <a href={event.externalLink} target="_blank" rel="noopener noreferrer">
                                <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                                <p>View Event External Link</p>
                            </a>
                        </div>
                    )}
                    {event.eventAgenda?.isPublished && (event.eventAgenda?.items?.length ?? 0) > 0 && (
                        <div className="row view-agenda">
                            <button
                                onClick={() => {
                                    analytics.track('event_agenda_view', { event_id: event._id });
                                    setShowAgendaModal(true);
                                }}
                                className="btn view-agenda-btn"
                            >
                                <Icon icon="mdi:calendar-clock" />
                                <span>View Agenda</span>
                            </button>
                        </div>
                    )}
                    {isLive ? (
                        <div className="event-checkin-and-registration">
                            <EventCheckInButton event={previewMode ? { ...event, currentUserCheckedIn: false } : event} onCheckedIn={onRefetch} />
                            <RSVPSection event={event} compact previewAsUnregistered={previewMode} />
                        </div>
                    ) : (
                        <>
                            <RSVPSection event={event} previewAsUnregistered={previewMode} />
                            <EventCheckInButton event={previewMode ? { ...event, currentUserCheckedIn: false } : event} onCheckedIn={onRefetch} />
                        </>
                    )}

                    {showAnalytics && user?.roles?.includes('admin') && (
                        <div className="analytics-tab">
                            <div className="tab-buttons">
                                <button
                                    className={activeTab === 'details' ? 'active' : ''}
                                    onClick={() => setActiveTab('details')}
                                >
                                    Event Details
                                </button>
                                <button
                                    className={activeTab === 'analytics' ? 'active' : ''}
                                    onClick={() => setActiveTab('analytics')}
                                >
                                    <Icon icon="mingcute:chart-fill" />
                                    Analytics
                                </button>
                            </div>
                            {activeTab === 'analytics' && (
                                <div className="analytics-content">
                                    <EventAnalytics />
                                </div>
                            )}
                        </div>
                    )}

                    <Popup
                        isOpen={showAgendaModal}
                        onClose={() => setShowAgendaModal(false)}
                        defaultStyling={true}
                        customClassName="event-agenda-modal-popup"
                    >
                        <div className="event-agenda-modal">
                            <div className="event-agenda-modal-header">
                                <h3>
                                    <Icon icon="mdi:calendar-clock" />
                                    Event Agenda
                                </h3>
                            </div>
                            <div className="event-agenda-modal-content">
                                {(event.eventAgenda?.items || []).length === 0 ? (
                                    <EmptyState
                                        icon="mdi:calendar-blank"
                                        title="No agenda items yet"
                                        description="The host hasn't added a schedule for this event."
                                        actions={[
                                            { label: 'Close', onClick: () => setShowAgendaModal(false) }
                                        ]}
                                    />
                                ) : (
                                    <AgendaDailyCalendar
                                        agendaItems={(event.eventAgenda?.items || []).map((item) => ({
                                            ...item,
                                            startTime: item.startTime ? (typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime) : null,
                                            endTime: item.endTime ? (typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime) : null
                                        }))}
                                        event={event}
                                        minuteHeight={getStoredMinuteHeightPx()}
                                    />
                                )}
                            </div>
                        </div>
                    </Popup>
                </div>
            </div>
        </div>
    );
}

export default EventPageContent;
