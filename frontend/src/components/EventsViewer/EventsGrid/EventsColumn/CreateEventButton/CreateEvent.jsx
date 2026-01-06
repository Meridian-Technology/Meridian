import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreateEventButton.scss';
import {Icon} from '@iconify-icon/react';  
import GradientButtonCover from '../../../../../assets/GradientButtonCover.png';
import AltGradientButtonCover from '../../../../../assets/AltGradButtonCover.png'

function CreateEventButton({origin = "", row=false, color = 'pink'}){
    const navigate = useNavigate();

    const handleEventClick = () => {
        if(origin === ""){
            navigate(`/create-event`);
        } else {
            navigate(`/create-event`, {state: {origin}});
        }
    }

    return(
        <div className={`event-component create ${row && "row"} ${color}`} onClick={handleEventClick} >
            <div className="info">
                <Icon icon="ph:plus-bold" className="create-icon"/>
                <h1>create event</h1>
            </div>
            <div className="gradient-cover">
                <img src={color === "pink" ? GradientButtonCover : AltGradientButtonCover} alt="" />
            </div>
        </div>
    );

}

export default CreateEventButton;