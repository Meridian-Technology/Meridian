import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreateButton.scss';
import {Icon} from '@iconify-icon/react';  
import GradientButtonCover from '../../assets/GradientButtonCover.png';
import AltGradientButtonCover from '../../assets/AltGradButtonCover.png'

function CreateButton({ row=false, color = 'pink', handleEventClick, text}){
    return(
        <div className={`event-component create ${row && "row"} ${color}`} onClick={handleEventClick} >
            <div className="info">
                <Icon icon="ph:plus-bold" className="create-icon"/>
                <h1>{text}</h1>
            </div>
            <div className="gradient-cover">
                <img src={color === "pink" ? GradientButtonCover : AltGradientButtonCover} alt="" />
            </div>
        </div>
    );

}

export default CreateButton;