import React, { useState, useEffect } from 'react';
import '../CreateComponents.scss';
import './Review.scss';
import Event from '../../EventsViewer/EventsGrid/EventsColumn/Event/Event';
import {Icon} from '@iconify-icon/react';
import GradientButtonCover from '../../../assets/GradientButtonCover.png';
import FullEvent from '../../EventsViewer/EventsGrid/EventsColumn/FullEvent/FullEvent';

function Review({info, visible, setInfo, onSubmit}){

    const [checked, setChecked] = useState([]);

    const [pspeak, setPspeak]  = useState(false);
    const [catering, setCatering] = useState(false);
    const [alumni, setAlumni] = useState(false);
    const [none, setNone] = useState(false);
    
    //criteria to be able to create event
    const [selected, setSelected] = useState(false);
    const [contact, setContact] = useState("");

    const [complete, setComplete] = useState(false);

    const handleChange = (e) => {
        const {name} = e.target;
        console.log(name);
        switch(name){
            case "catering":
                setCatering(!catering);
                if(none){
                    setNone(false);
                }
                break;
            case "pspeak":
                setPspeak(!pspeak);
                if(none){
                    setNone(false);
                }
                break;
            case "alumni":
                setAlumni(!alumni);
                if(none){
                    setNone(false);
                }
                break;
            case "none":
                setCatering(false);
                setPspeak(false);
                setAlumni(false);
                setNone(!none);
            default:
                break;
        }
    }

    useEffect(()=>{
        if(pspeak || catering || alumni || none){
            setSelected(true);
        } else {
            setSelected(false);
        }
        setInfo(prev => ({
            ...prev,
            OIEAcknowledgementItems: pspeak ? catering ? ["pspeak", "catering"] : ["pspeak"] : catering ? ["catering"] : [],
            contact: contact
        }));
    },[pspeak, catering, contact, alumni, none, contact]);

    useEffect(()=>{
        if(selected && contact !== ""){
            setComplete(true);
        } else {
            setComplete(false);
        }
        console.log(contact);
    },[selected, contact]);

    return(
        <div className={`create-component review ${visible && "visible"}`}>
            <h1>review</h1>
            <div className="review-content">
                <div className="preview">
                    {info.name && info.start_time && info.description ?
                        <div className="event-preview">
                            <FullEvent event={info}/>
                        </div>
                        :
                        <div className="no-preview">
                            <p>please complete other steps to see the event preview</p>
                        </div>
                    }
                </div>
                <div className="col">
                    <div className="contact">
                        <h4>email address for contact:</h4>
                        <input type="email" value={contact} onChange={(e)=>setContact(e.target.value)}/>
                    </div>
                    <div className="oie-acknowledgement">
                        <h4>before you submit, select at least one below:</h4>
                        <div className="acknowledgement">
                            <label className="check">
                                <input type="checkbox" id="pspeak" name="pspeak" checked={pspeak} onChange={handleChange}/>
                                <span className="checkmark">
                                    <Icon icon="icon-park-solid:check-one" />
                                </span>
                            </label>
                            <label htmlFor="pspeak">We would like to have the president speak at this event</label>
                        </div>
                        <div className="acknowledgement">
                            <label className="check">
                                <input type="checkbox" id="catering" name="catering" checked={catering} onChange={handleChange}/>
                                <span className="checkmark">
                                    <Icon icon="icon-park-solid:check-one" />
                                </span>
                            </label>
                            <label htmlFor="catering">This even requires catering</label>
                        </div>
                        <div className="acknowledgement">
                            <label className="check">
                                <input type="checkbox" id="alumni" name="alumni" checked={alumni} onChange={handleChange}/>
                                <span className="checkmark">
                                    <Icon icon="icon-park-solid:check-one" />
                                </span>
                            </label>
                            <label htmlFor="alumni">This event includes alumni speakers</label>
                        </div>
                        <div className="acknowledgement">
                            <label className="check">
                                <input type="checkbox" id="none" name="none" checked={none} onChange={handleChange}/>
                                <span className="checkmark">
                                    <Icon icon="icon-park-solid:check-one" />
                                </span>
                            </label>
                            <label htmlFor="none">None of the above</label>
                        </div>
                    </div>

                    {/* RSVP Configuration Review */}
                    {info.rsvpEnabled && (
                        <div className="rsvp-review">
                            <h4>RSVP Configuration:</h4>
                            <div className="rsvp-settings-review">
                                <div className="rsvp-setting">
                                    <span className="label">RSVP Required:</span>
                                    <span className="value">{info.rsvpRequired ? 'Yes' : 'No'}</span>
                                </div>
                                {info.rsvpDeadline && (
                                    <div className="rsvp-setting">
                                        <span className="label">RSVP Deadline:</span>
                                        <span className="value">{new Date(info.rsvpDeadline).toLocaleString()}</span>
                                    </div>
                                )}
                                {info.maxAttendees && (
                                    <div className="rsvp-setting">
                                        <span className="label">Maximum Attendees:</span>
                                        <span className="value">{info.maxAttendees}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

            </div>
            <div className="publish-container">
                {visible && 
                    <div className={`publish ${complete && 'active'}`} onClick={complete ? onSubmit : ()=>{}}>
                        <div className="info">
                            <h1>{pspeak || catering || info.expectedAttendance > 99 || alumni ? "request approval" : "publish event"}</h1>
                        </div>
                        <div className="gradient-cover">
                            <img src={GradientButtonCover} alt="" />
                        </div>
                    </div>
                }
            </div>
        </div>
    );
}

export default Review;

