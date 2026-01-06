import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './OIEFullEvent.scss';
import {Icon} from '@iconify-icon/react';  
import StarGradient from '../../../../assets/OIE-Gradient2.png';
import MockPoster from '../../../../assets/MockPoster.png';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import axios from 'axios';
import defaultAvatar from '../../../../assets/defaultAvatar.svg';
import EventTimeline from './ApprovalTimeline/ApprovalTimeline';
import CommentsSection from '../../../../components/CommentsSection.jsx/CommentsSection';
import postRequest from '../../../../utils/postRequest';
const acknowledgements = {
    'pspeak' : 'This event is asking the President to speak',
    'people' : 'This event has over 100 people expected to attend',
    'alumni' : 'This event is planning to have an alumni speaker',
    'catering' : 'This event requires catering',
}

const sample = {
    name: 'Sample Event',
    createdAt: '2025-03-12T16:00:00Z',
    start_time: '2025-03-19T18:00:00Z',
    approvalReference: {
      currentStepIndex: 1,
      approvals: [
        {
          role: 'Heffner Alumni House',
          status: 'approved',
          approvedByUserId: '123abc',
          approvedAt: '2025-03-12T18:00:00Z'
        },
        {
          role: 'OIE',
          status: 'pending'
        }
      ]
    },
    // ...
  }
  

function OIEFullEvent({ event, eventId = null, setEdited, viewingRole }){
    const { addNotification } = useNotification();

    const { data, loading, error } = useFetch('/config');
    const fullEvent = useFetch(`/get-event/${eventId ? eventId :event._id}?type=approval`);
    const fullEventRef = useRef(null);
    const date = new Date(event.start_time);
    const dateEnd = new Date(event.end_time);

    const [tab, setTab] = useState("info");
    const [checked, setChecked] = useState({});
    const [newComment, setNewComment] = useState('');

    const [height, setHeight] = useState(0);
    const [initialHeight, setInitialHeight] = useState(0);

    useEffect(() => {
        if(initialHeight === 0){
            setInitialHeight(fullEventRef.current.clientHeight);
            setHeight(fullEventRef.current.clientHeight);
        }
    }, [fullEventRef]);

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
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`}>
                    {level}
                </div>
            </div>
        );
    }



    useEffect(() => {
        if(fullEvent.data){
            // const check = {};
            // fullEvent.data.event.OIE.checkListItems.forEach((item)=>{
            //     //find index of item in config, then set checked to true
            //     const index = data.config.checklist.findIndex((configItem) => configItem.title.toLowerCase() === item.toLowerCase());
            //     if(index === -1){
            //         return;
            //     }
            //     check[index] = true;

            // });
            // setChecked(check);
            console.log(fullEvent.data.event.approvalReference);
        }
    }, [fullEvent.data]);
    if(!event){
        return "";
    }

    return(
        <div className="full-event oie" ref={fullEventRef} style={{height: `${height}px`}}>
            <div className="tabs">
                <div className={`tab ${tab === "info" && "selected"}`} onClick={()=>{setTab('info');setHeight(initialHeight)}}>
                    <div className="tab-content">
                        <Icon icon="akar-icons:info-fill" />
                        <p>info</p>
                    </div>
                </div>
                <div className={`tab ${tab === "check" && "selected"}`} onClick={()=>{ setTab('check');setHeight(700)}}>
                    <div className="tab-content">
                        <Icon icon="icon-park-solid:check-one" />
                        <p>check</p>
                    </div>
                </div>
            </div>
            <div className={`event-info `}>
                <div className={`info ${tab === "info" && "visible"}`}>
                    <div className="image">
                        <img src={event.image ? event.image : MockPoster } alt="" />
                    </div>
                    <div className="content">
                        <h1>{event.name}</h1>
                        <div className="row">
                            {renderHostingStatus()}
                        </div>
                        <div className="row">
                            <Icon icon="heroicons:calendar-16-solid" />
                            <div className="col">
                                <p>{date.toLocaleString('default', {weekday: 'long'})}, {date.toLocaleString('default', {month: 'long'})} {date.getDate()}</p>
                                <p>{date.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})} -  {dateEnd.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})}</p>
                            </div>
                        </div>
                        <div className="row">
                            <Icon icon="fluent:location-28-filled" />
                            <p>{event.location}</p>
                        </div>
                    </div>  
                    <img src={StarGradient} alt="" className="gradient" />
                </div>
                <div className={`check ${tab === "check" && "visible"}`}>
                    <h1>Approval Status</h1>
                    <div className="status"> 
                        {!fullEvent.loading && fullEvent.data && 
                            <>
                                <EventTimeline event={fullEvent.data.event} viewingRole={viewingRole} showApproval={viewingRole !== null}/>
                            </>
                        }
                    </div>
                    
                    {!fullEvent.loading && fullEvent.data && (
                        <CommentsSection
                            comments={fullEvent.data.event.approvalReference?.comments || []}
                            eventId={event._id}

                        />
                    )}
                </div>
            </div>
        </div>
    );

}

export default OIEFullEvent;