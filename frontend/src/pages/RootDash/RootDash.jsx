import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import RootManagement from './RootManagement/RootManagement';
import ManageFlow from './ManageFlow/ManageFlow';
import RSSManagement from './RSSManagement/RSSManagement';
import RoomManager from './RoomManager/RoomManager';
// import BadgeManager from './BadgeManager/BadgeManager';
import eventsLogo from '../../assets/Brand Image/EventsLogo.svg';

function RootDash(){
    const navigate = useNavigate();
    const menuItems = [
        { 
            label: 'Dashboard', 
            icon: 'ic:round-dashboard',
            element: <RootManagement/>
        },
        { 
            label: 'Manage Flow', 
            icon: 'fluent:flow-16-filled',
            element: <ManageFlow/>
        },
        { 
            label: 'RSS Management', 
            icon: 'mdi:rss',
            element: <RSSManagement/>
        },
        { 
            label: 'Room Manager', 
            icon: 'mdi:home-city',
            element: <RoomManager/>
        },
    ];

    return (
        <Dashboard menuItems={menuItems} additionalClass='root-dash' logo={eventsLogo} onBack={()=>navigate('/events-dashboard')}>
        </Dashboard>
    )
}

export default RootDash;