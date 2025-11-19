import React, { useState, useEffect, useRef } from 'react';
import './OIEEvent.scss';
import { useNavigate } from 'react-router-dom';
import Popup from '../../../../components/Popup/Popup';
import OIEFullEvent from '../FullEvent/OIEFullEvent';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import FullEvent from '../../../../components/EventsViewer/EventsGrid/EventsColumn/FullEvent/FullEvent';
import { useNotification } from '../../../../NotificationContext';
import defaultAvatar from '../../../../assets/defaultAvatar.svg';
import deleteRequest from '../../../../utils/deleteRequest';
import apiRequest from '../../../../utils/postRequest';

function OIEEvent({event, showStatus=false, refetch, showOIE=false, index, showExpand=true, manage=false, viewingRole, showHosting=true, extraInfo, showHostingType=true}){
    const [popupOpen, setPopupOpen] = useState(false);
    const [edited, setEdited] = useState(false);
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [managePopupOpen, setManagePopupOpen] = useState(false);
    const managePopupRef = useRef(null);
    const [archived, setArchived] = useState(false);

    const handleEventClick = (event) => {
        setPopupOpen(true);
    }

    const onPopupClose = () => {
        setPopupOpen(false);
        if(edited){
            refetch();
            setEdited(false);
        }
    }

    const date = new Date(event.start_time);

    const statusMessages = {
        'Not Applicable' : ["Doesnt meet approval criteria","not-applicable"],
        "Approved" : ["OIE Approved", "approved"],
        "Pending" : ["Pending OIE Approval", "pending"],
    }

    const renderHostingStatus = (showHostingType) => {
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
            <div className={`row ${level.toLowerCase()}`}>
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                {showHostingType && <div className={`level ${level.toLowerCase()}`}>
                    {level}
                </div>}
            </div>
        );
    }

    const onArchiveEvent = async () => {
        const response = await apiRequest(`/delete-event/${event._id}`, {}, {method: 'DELETE'});
        console.log(response);
        if(response.success){
            setArchived(true);
            //wait for animation
            setTimeout(() => {
                refetch?.();
            }, 500);
        } else {
            addNotification({
                title: "Error",
                message: response.message,
                type: "error"
            });
        }
    }

    const onOpenManagePopup = () => {
        setManagePopupOpen(!managePopupOpen);
    }

    const onCloseManagePopup = () => {
        setManagePopupOpen(false);
    }

    return(
        <div className={`oie-event-component ${managePopupOpen ? "manage" : ""} ${archived && "archived"}`} style={index ? {animationDelay: `${index * 0.1}s`}:{}}>
            <Popup isOpen={popupOpen} onClose={onPopupClose} customClassName={"wide-content no-padding no-styling oie"} waitForLoad={true} >
                {showOIE && !(event.OIEStatus === "Not Applicable") ?
                    <OIEFullEvent event={event} refetch={refetch} setEdited={setEdited} viewingRole={viewingRole}/>
                :
                    <FullEvent event={event}/>
                }
            </Popup>
            <div className="info">
                {
                    // showStatus && <div className={`oie-status ${statusMessages[event.OIEStatus][1]}`}><p>{statusMessages[event.OIEStatus][0]}</p></div>
                }
                {extraInfo && extraInfo}
                <h2>{event.name}</h2>
                {showHosting && renderHostingStatus(showHostingType)}
                {/* display date in day of the week, month/day */}
                <div className="row">
                    <Icon icon="heroicons:calendar-16-solid" />
                    <p>{date.toLocaleString('default', {weekday: 'long'})} {date.toLocaleString('default', {month: 'numeric'})}/{date.getDate()}</p>
                </div>
                <div className="row">
                    <Icon icon="fluent:location-28-filled" />
                    <p className="location">{event.location}</p>
                </div>
            </div>
            <div className="event-button-container">
                {
                    showExpand && 
                    <button className="button" onClick={() => handleEventClick(event)}>
                        <Icon icon="material-symbols:expand-content-rounded" />
                        <p>details</p>
                    </button>
                    
                }
                {
                <button className="button" >
                    <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                    <a href={`/event/${event._id}`} target="_blank" rel="noopener noreferrer"><p>go</p></a>      
                </button>
                }
                {
                    manage &&
                    <button className="button" onClick={onOpenManagePopup} ref={managePopupRef}>
                        <Icon icon="fluent:edit-48-filled" />
                        <p>manage</p>
                    </button>
                }
            </div>
            {
                manage && managePopupOpen &&
                <div className="manage-actions" >
                    <button>edit</button>
                    <button onClick={onArchiveEvent}>archive</button>
                    <button onClick={onCloseManagePopup}>cancel</button>
                </div>
            }


        </div>
    );

}

export default OIEEvent;