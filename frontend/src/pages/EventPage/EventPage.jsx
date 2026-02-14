import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './EventPage.scss';
import { Icon } from '@iconify-icon/react';
import StarGradient from '../../assets/StarGradient.png';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { useFetch } from '../../hooks/useFetch';
import Loader from '../../components/Loader/Loader';
import Header from '../../components/Header/Header';
import RSVPSection from '../../components/RSVPSection/RSVPSection';
import EventCheckInButton from '../../components/EventCheckInButton/EventCheckInButton';
import EventsByCreator from '../../components/EventsByCreator/EventsByCreator';
import Logo from '../../assets/Brand Image/BEACON.svg';
import EventAnalytics from '../../components/EventAnalytics/EventAnalytics';
import AgendaEditor from '../../components/AgendaEditor/AgendaEditor';
import { useEventRoom } from '../../WebSocketContext';
import Popup from '../../components/Popup/Popup';
import EmptyState from '../../components/EmptyState/EmptyState';
import AgendaDailyCalendar from '../ClubDash/EventsManagement/components/EventDashboard/EventAgendaBuilder/AgendaDailyCalendar/AgendaDailyCalendar';
import { getStoredMinuteHeightPx } from '../../utils/agendaViewPreferences';

function EventPage() {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('details');
    const [showAgendaModal, setShowAgendaModal] = useState(false);
    
    // Fetch event data
    const { data: eventData, loading: eventLoading, error: eventError, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    // Live updates: only connect when on this event page; refetch when someone checks in
    useEventRoom(eventId || null, () => {
        refetchEvent?.();
    });

    // RSVP functionality now handled by RSVPSection component

    const renderHostingStatus = () => {
        if (!eventData?.event?.hostingType) return null;

        let hostingImage = '';
        let hostingName = '';
        let level = '';

        if (eventData.event.hostingType === "User") {
            hostingImage = eventData.event.hostingId.image ? eventData.event.hostingId.image : defaultAvatar;
            hostingName = eventData.event.hostingId.name;
            if (eventData.event.hostingId.roles.includes("developer")) {
                level = "Developer";
            } else if (eventData.event.hostingId.roles.includes("oie")) {
                level = "Faculty";
            } else {
                level = "Student";
            }
        } else {
            hostingImage = eventData.event.hostingId?.org_profile_image;
            hostingName = eventData.event.hostingId?.org_name || 'Unknown Organization';
            level = "Organization";
        }

        

        return (
            <div className={`row hosting ${level.toLowerCase()}`} onClick={() => {if (level === "Organization") {navigate(`/org/${hostingName}`);}}}>
                <p>Hosted by</p>
                <div className="host-info">
                    <img src={hostingImage} alt="" />
                    <p className="user-name">{hostingName}</p>
                    {/* <div className={`level ${level.toLowerCase()}`}>
                        {level}
                    </div> */}
                </div>
            </div>
        );
    };

    useEffect(()=>{
        if(eventError){
            console.log(eventError);
        }
    },[eventError]);

    // RSVP section now handled by RSVPSection component

    if (eventLoading || !eventData) {
        return (
            <div className="event-page">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="loading-container">

                </div>
            </div>
        );
    }

    // if (eventError) {
    //     console.log(eventError);
    //     return (
    //         <div className="event-page">
    //                         <div className="header">
    //             <img src={Logo} alt="Logo" className="logo" />
    //         </div>
    //             <div className="error-container">
    //                 <Icon icon="mdi:alert-circle" className="error-icon" />
    //                 <h2>Event Not Found</h2>
    //                 <p>The event you're looking for doesn't exist or has been removed.</p>
    //                 <button onClick={() => navigate('/events-dashboard')} className="back-button">
    //                     <Icon icon="mdi:arrow-left" />
    //                     Back to Events
    //                 </button>
    //             </div>
    //         </div>
    //     );
    // }

    const event = eventData.event;
    const date = new Date(event.start_time);
    const dateEnd = new Date(event.end_time || event.start_time);
    const now = new Date();
    const isLive = now >= date && now <= dateEnd;

    return (
        <div className="event-page">
            <div className="header">
                <img src={Logo} alt="Logo" className="logo" />
            </div>
            <div className="event-content">
                <div className="back" onClick={() => navigate(-1)}>
                    <Icon icon="mdi:arrow-left" />
                    <p>Back to Events</p>
                </div>
                <div className="event-layout">
                    {/* Left Column - Image and Metadata */}
                    <div className="event-sidebar">
                        {event.image && (
                            <div className="image-container">
                                <img src={event.image} alt={`Event image for ${event.name}`} className="event-image" />
                            </div>
                        )}
                        {renderHostingStatus()}
                        {event.tags && event.tags.length > 0 && (
                            <div className="event-tags">
                                {event.tags.map((tag, index) => (
                                    <span key={index} className="tag">#{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Column - Main Content */}
                    <div className="event-details">
                        {isLive && (
                            <div className="event-live-badge" role="status">
                                <Icon icon="mdi:circle" className="event-live-dot" />
                                <span>Happening now</span>
                            </div>
                        )}
                        <h1>{event.name}</h1>
                        {/* Mobile-only hosting section */}
                        <div className="hosting-mobile">
                            {renderHostingStatus()}
                        </div>
                        <div className="col">
                            <div className="row event-detail date">
                                <p>{date.toLocaleString('default', {weekday: 'long'})}, {date.toLocaleString('default', {month: 'long'})} {date.getDate()}</p>
                            </div>
                            <div className="row event-detail time">
                                <p>{date.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})} - {dateEnd.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})}</p>
                            </div>
                            <div className="row event-detail location">
                                <Icon icon="fluent:location-28-filled" />
                                <p>{event.location}</p>
                            </div>
                        </div>

                        <div className="row event-description">
                            <p>{event.description}</p>
                        </div>
                        {event.externalLink && (
                            <div className="row external-link">
                                <a href={event.externalLink} target="_blank" rel="noopener noreferrer">
                                    <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                                    <p>View Event External Link</p>
                                </a>
                            </div>
                        )}
                        {event.eventAgenda?.isPublished && event.eventAgenda?.items?.length > 0 && (
                            <div className="row view-agenda">
                                <button
                                    onClick={() => setShowAgendaModal(true)}
                                    className="btn view-agenda-btn"
                                >
                                    <Icon icon="mdi:calendar-clock" />
                                    <span>View Agenda</span>
                                </button>
                            </div>
                        )}
                        {isLive ? (
                            <div className="event-checkin-and-registration">
                                <EventCheckInButton event={eventData.event} onCheckedIn={refetchEvent} />
                                <RSVPSection event={eventData.event} compact />
                            </div>
                        ) : (
                            <>
                                <RSVPSection event={eventData.event} />
                                <EventCheckInButton event={eventData.event} onCheckedIn={refetchEvent} />
                            </>
                        )}
                        
                        {/* Agenda Editor
                        <AgendaEditor event={eventData.event} onUpdate={(updatedEvent) => {
                            // Refetch event data to show updated agenda
                            refetchEvent();
                        }} /> */}
                        
                        {/* Analytics Tab for Admin Users */}
                        {user && user.roles && user.roles.includes('admin') && (
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
                        
                        {/* Agenda Modal */}
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

                        {/* More Events by This Creator Section */}
                        {/* {eventData.event && activeTab === 'details' && (
                            <EventsByCreator 
                                eventId={eventId}
                                creatorName={eventData.event.hostingType === "User" 
                                    ? eventData.event.hostingId.name 
                                    : eventData.event.hostingId.org_name
                                }
                                creatorType={eventData.event.hostingType === "User" 
                                    ? (eventData.event.hostingId.roles.includes("developer") 
                                        ? "Developer" 
                                        : eventData.event.hostingId.roles.includes("oie") 
                                            ? "Faculty" 
                                            : "Student")
                                    : "Organization"
                                }
                            />
                        )} */}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventPage;
