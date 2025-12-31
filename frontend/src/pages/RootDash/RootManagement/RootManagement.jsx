import React, { useEffect, useState } from 'react';
import './RootManagement.scss';
import AdminGradient from '../../../assets/Gradients/AdminGrad.png';
import useAuth from '../../../hooks/useAuth';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import SiteHealth from '../../Admin/General/SiteHealth/SiteHealth';
import SimpleAnalyticsChart from '../../../components/Analytics/VisitsChart/SimpleAnalyticsChart';
import BeaconLogo from '../../../assets/Brand Image/SolutionLogos/Beacon.svg';
import CompassLogo from '../../../assets/Brand Image/SolutionLogos/Compass.svg';
import AtlasLogo from '../../../assets/Brand Image/SolutionLogos/Atlas.svg';
import { useNavigate } from 'react-router-dom';

function RootManagement(){
    const {user} = useAuth();
    const navigate = useNavigate();
    return (
        <div className="dash root-management">
            <header className="header">
                <img src={AdminGradient} alt="" />
                <h1>Root User Management</h1>
                <p>Good Afternoon, {user.name}</p>
            </header>
            <div className="general-content">
                <div className="solutions-container">
                    <h2>Solutions</h2>
                    <div className="solutions-router row">
                        <div className="solution-card"> 
                            <img src={AtlasLogo} alt="" />
                            <button onClick={()=>navigate('/feature-admin/atlas')}>Manage</button>
                        </div>
                        <div className="solution-card"> 
                            <img src={BeaconLogo} alt="" />
                            <button onClick={()=>navigate('/feature-admin/beacon')}>Manage</button>
                        </div>
                        <div className="solution-card"> 
                            <img src={CompassLogo} alt="" />
                            <button onClick={()=>navigate('/feature-admin/compass')}>Manage</button>
                        </div>
                    </div>
                </div>
                <SiteHealth />
            </div>
        </div>
    )
}

export default RootManagement;