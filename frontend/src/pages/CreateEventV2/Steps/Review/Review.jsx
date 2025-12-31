import React, { useState, useEffect } from 'react';
import './Review.scss';
import Event from '../../../../components/EventsViewer/EventsGrid/EventsColumn/Event/Event';
import {Icon} from '@iconify-icon/react';

import GradientButtonCover from '../../../../assets/GradientButtonCover.png';
import FullEvent from '../../../../components/EventsViewer/EventsGrid/EventsColumn/FullEvent/FullEvent';
import ApprovalPreview from '../../../../components/ApprovalPreview/ApprovalPreview';
function Review({ formData, setFormData, onComplete }){

    const [checked, setChecked] = useState([]);

    const [pspeak, setPspeak]  = useState(false);
    const [catering, setCatering] = useState(false);
    const [alumni, setAlumni] = useState(false);
    const [none, setNone] = useState(false);
    
    //criteria to be able to create event
    const [selected, setSelected] = useState(false);
    const [contact, setContact] = useState("");

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
        setFormData(prev => ({
            ...prev,
            OIEAcknowledgementItems: pspeak ? catering ? ["pspeak", "catering"] : ["pspeak"] : catering ? ["catering"] : [],
            contact: contact
        }));
    },[pspeak, catering, contact, alumni, none, setFormData]);

    useEffect(()=>{
        if(selected && contact !== ""){
            onComplete(true);
        } else {
            onComplete(false);
        }
        console.log('Review component validation:', selected && contact !== "");
    },[selected, contact, onComplete]);

    // Check if step is already completed on mount
    useEffect(() => {
        if (formData.contact && formData.OIEAcknowledgementItems && formData.OIEAcknowledgementItems.length > 0) {
            console.log('Review component validation: true (already completed)');
            onComplete(true);
        }
    }, [formData.contact, formData.OIEAcknowledgementItems, onComplete]);

    return(
        <div className="create-component review">
            <h1>review</h1>
            <div className="review-content">
                <div className="preview">
                    {formData.name && formData.start_time && formData.description ?
                        <div className="event-preview">
                            <FullEvent event={formData}/>
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
                </div>

                <div className="approval-preview-section">
                    <ApprovalPreview formData={formData} />
                </div>

            </div>
        </div>
    );
}

export default Review;

