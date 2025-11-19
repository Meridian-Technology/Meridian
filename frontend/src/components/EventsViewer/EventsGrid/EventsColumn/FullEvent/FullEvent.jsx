import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './FullEvent.scss';
import {Icon} from '@iconify-icon/react';  
import StarGradient from '../../../../../assets/StarGradient.png'
import MockPoster from '../../../../../assets/MockPoster.png'
import defaultAvatar from '../../../../../assets/defaultAvatar.svg'
import useAuth from '../../../../../hooks/useAuth';
import { useNotification } from '../../../../../NotificationContext';
import postRequest from '../../../../../utils/postRequest';
import { useFetch } from '../../../../../hooks/useFetch';
import RSVPSection from '../../../../RSVPSection/RSVPSection';

function FullEvent({ event }){
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    
    // RSVP functionality now handled by RSVPSection component

    console.log(event);

    // RSVP functionality now handled by RSVPSection component

    const handleEventClick = () => {
        navigate(`/create-event`);
    }
    const date = new Date(event.start_time);
    const dateEnd = new Date(event.end_time);
    
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
        // onClick={()=>{level === "Organization" && navigate(`/org/${hostingName}`)}}
        return (
            <div className={`row hosting ${level.toLowerCase()}`}>
                <p>Hosted by</p>
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`}>
                    {level}
                </div>
            </div>
        );
    }

    // RSVP section now handled by RSVPSection component

    return(
        <div className="full-event">
                { event.image &&
                    <div className="image-container">
                        <img src={event.image ? event.image : ""} alt="" className=""/>
                    </div>
                }
            <div className="event-content">
                <h1>{event.name}</h1>
                <div className="col">
                    <div className="row event-detail date">
                        <p>{date.toLocaleString('default', {weekday: 'long'})}, {date.toLocaleString('default', {month: 'long'})} {date.getDate()}</p>
                    </div>
                    <div className="row event-detail time">
                        <p>{date.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})} -  {dateEnd.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})}</p>
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
                {
                        event.externalLink &&
                        <div className="row external-link">
                            <a href={event.externalLink} target="_blank" rel="noopener noreferrer">
                                <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                                <p>View Event External Link</p>
                            </a>
                        </div>
                    }
                <RSVPSection event={event} />
                <a href={`/event/${event._id}`} target="_blank" rel="noopener noreferrer"> <p>Full Event Page</p></a>      
            </div>
            <img src={StarGradient} alt="" className="gradient" />
        </div>
    );

}

export default FullEvent;