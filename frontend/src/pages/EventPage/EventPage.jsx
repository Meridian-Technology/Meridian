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
import EventsByCreator from '../../components/EventsByCreator/EventsByCreator';
import Logo from '../../assets/Brand Image/BEACON.svg';
import EventAnalytics from '../../components/EventAnalytics/EventAnalytics';
import AgendaEditor from '../../components/AgendaEditor/AgendaEditor';

function EventPage() {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('details');
    
    // Fetch event data
    const { data: eventData, loading: eventLoading, error: eventError, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

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
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`}>
                    {level}
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
    const dateEnd = new Date(event.end_time);

    return (
        <div className="event-page">
            <div className="header">
                <img src={Logo} alt="Logo" className="logo" />
            </div>
            <div className="event-content">
                {event.image && (
                    <div className="image-container">
                        <img src={event.image} alt={`Event image for ${event.name}`} className="event-image" />
                    </div>
                )}
                <div className="event-details">
                    <div className="back" onClick={() => navigate(-1)}>
                        <Icon icon="mdi:arrow-left" />
                        <p>Back to Events</p>
                    </div>
                    <h1>{event.name}</h1>
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
                    {renderHostingStatus()}

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
                    <RSVPSection event={eventData.event} />
                    
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
                    
                    {/* More Events by This Creator Section */}
                </div>
                    {eventData.event && activeTab === 'details' && (
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
                    )}
            </div>
        </div>
    );
}

export default EventPage;
