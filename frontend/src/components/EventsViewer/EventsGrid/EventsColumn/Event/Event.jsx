import React, { useState, useEffect } from 'react';
import './Event.scss';
import { useNavigate } from 'react-router-dom';
import Popup from '../../../../Popup/Popup';
import FullEvent from '../FullEvent/FullEvent';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import defaultAvatar from '../../../../../assets/defaultAvatar.svg'
import useAuth from '../../../../../hooks/useAuth';
import RSVPButton from '../../../../RSVPButton/RSVPButton';
import { useFetch } from '../../../../../hooks/useFetch';

function Event({event, hasFriendsFilter = false, rsvpStatus, onRSVPStatusUpdate}){
    const [optimisticEvent, setOptimisticEvent] = useState(event);
    const { user } = useAuth();
    
    // Use pre-computed friends data from backend
    const friendsGoing = event.friendsGoing || 0;

    // Debug logging to see what's happening with friendsGoing  

    const renderHostingStatus = () => {
        let hostingImage = '';
        let hostingName = '';
        let level = '';
        if(!event.hostingType){
            return;
        }
        if(event.hostingType === "User"){
            hostingImage = event.hostingId.image ? event.hostingId.image : defaultAvatar;
            hostingName = event.hostingId.name;
            if(event.hostingId.roles.includes("developer")){
                level = "Developer";
            } else if(event.hostingId.roles.includes("oie")){
                level = "Faculty";
            } else {
                level = "Student";
            }
        } else {
            hostingImage = event.hostingId.org_profile_image;
            hostingName = event.hostingId.org_name;
            level = "Organization";
        }
        return (
            <div className={`row hosting ${level.toLowerCase()}`}>
                <img src={hostingImage} alt={`${hostingName} profile picture`} />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`} aria-label={`Hosted by ${level}`}>
                    {level}
                </div>
            </div>
        );
    }
    const [popupOpen, setPopupOpen] = useState(false);
    const navigate = useNavigate();

    const handleEventClick = (event) => {
        // Don't navigate if popup is open
        if (popupOpen) return;
        navigate(`/event/${event._id}`);
    }

    const handleQuickLook = (event) => {
        event.stopPropagation();
        setPopupOpen(true);
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            // Don't navigate if popup is open
            if (popupOpen) return;
            handleEventClick(event);
        }
    }

    const handleRSVPUpdate = (status) => {
        setOptimisticEvent(prevEvent => ({
            ...prevEvent,
            rsvpStats: {
                ...prevEvent.rsvpStats,
                [status]: prevEvent.rsvpStats[status] + 1
            }
        }));
        console.log(optimisticEvent);
    }

    const onPopupClose = () => {
        setPopupOpen(false);
    }

    const date = new Date(event.start_time);

    const isOngoing = () => {
        const now = new Date();
        return date.getTime() < now.getTime() && date.getTime() + event.duration * 60000 > now.getTime();
    }

    const isInactive = () => {
        const now = new Date();
        return date.getTime() + event.duration * 60000 < now.getTime();
    }

    const getEventStatus = () => {
        if (isOngoing()) return 'ongoing';
        if (isInactive()) return 'inactive';
        return 'upcoming';
    }

    const formatTime = (date) => {
        return date.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true});
    }

    const formatDate = (date) => {
        return `${date.toLocaleString('default', {weekday: 'long'})}, ${date.toLocaleString('default', {month: 'long'})} ${date.getDate()}`;
    }

    const eventStatus = getEventStatus();
    const statusText = {
        'ongoing': 'Event is currently happening',
        'inactive': 'Event has ended',
        'upcoming': 'Event is upcoming'
    };

    return(
        <article 
            className={`event-component ${eventStatus}`} 
            onClick={() => handleEventClick(event)}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`${event.name} event. ${statusText[eventStatus]}. ${formatTime(date)} on ${formatDate(date)} at ${event.location}`}
            aria-describedby={`event-description-${event._id}`}
        >
            <Popup isOpen={popupOpen} onClose={onPopupClose} customClassName={"wide-content no-styling no-padding"}>
                <div onClick={(e) => e.stopPropagation()}>
                    <FullEvent event={event}/>
                </div>  
            </Popup>
            {event.image && <img src={event.image} alt={`Event image for ${event.name}`} />}
            <div className="info">
                <div className="row event-header">
                    <div className="col">
                        <div className="row">
                            <Icon icon="heroicons:calendar-16-solid" aria-hidden="true" />
                            <time dateTime={date.toISOString()}>
                                <strong>{formatTime(date)}</strong> {formatDate(date)}
                            </time>
                        </div>
                        <h2>{event.name}</h2>
                        {renderHostingStatus()}
                    </div>
                    <div className="col">
                        <button 
                            className="quick-look-btn"
                            onClick={handleQuickLook}
                            aria-label="Quick look at event details"
                        >
                            <Icon icon="mdi:eye" />
                            Quick Look
                        </button>
                    </div>
                </div>

                <div className="row event-description" id={`event-description-${event._id}`}>
                    <p>{event.description}</p>
                </div>
                <div className="row">
                    <Icon icon="fluent:location-28-filled" aria-hidden="true" />
                    <address>{event.location}</address>
                </div>
                
                {/* Friends going indicator */}
                {friendsGoing > 0 && (
                    <div className="friends-indicator">
                        <div className="friends-indicator-pictures">
                        {event.friendsGoingProfilePictures.map(picture => <img src={picture} alt="Friend profile picture" />)}
                        </div>
                        <span>{friendsGoing} friend{friendsGoing !== 1 ? 's' : ''} going</span>
                    </div>
                )}
                
                {/* Show login prompt if user is not authenticated and hasFriendsFilter is true */}
                {!user && hasFriendsFilter && (
                    <div className="friends-indicator login-prompt">
                        <Icon icon="mdi:account-group" />
                        <span>Login to see friends going</span>
                    </div>
                )}
                
                {/* Show message when user is authenticated but no friends are going */}
                {user && hasFriendsFilter && friendsGoing === 0 && event.rsvpStats && event.rsvpStats.going > 0 && (
                    <div className="friends-indicator no-friends">
                        <Icon icon="mdi:account-group" />
                        <span>No friends going yet</span>
                    </div>
                )}
                
                
                {/* RSVP Button */}
                <RSVPButton 
                    event={optimisticEvent} 
                    onRSVPUpdate={handleRSVPUpdate} 
                    rsvpStatus={rsvpStatus}
                    onRSVPStatusUpdate={onRSVPStatusUpdate}
                />
                
                {/* Quick Look Button */}

            </div>
        </article>
    );

}

export default Event;