import React from 'react';
import './Compass.scss';
import Dashboard from '../../../components/Dashboard/Dashboard';
import Home from './Pages/Home/Home';
import SpaceAnalytics from './Pages/SpaceAnalytics/SpaceAnalytics';
import CompassLogo from '../../../assets/Brand Image/SolutionLogos/Compass.svg';
import { useNavigate } from 'react-router-dom';
import RoomManager from '../../RootDash/RoomManager/RoomManager';

const Compass = () => {
    const navigate = useNavigate();
    const menuItems = [
        {
            label: 'Overview',
            icon: 'mdi:chart-box',
            element: <SpaceAnalytics />
        },
        {
            label: 'Room Manager',
            icon: 'mdi:home-city',
            element: <RoomManager />
        }
    ];
    return (
        <Dashboard menuItems={menuItems} additionalClass='root-dash' logo={CompassLogo} onBack={()=>navigate('/root-dashboard')}>
        </Dashboard>
    );
};

export default Compass;