import React, { useEffect, useState } from 'react';
import Header from '../../components/Header/Header';
import AccountSettings from '../../components/AcccountSettings/AccountSettings.jsx';
import Profile from '../../pages/Profile/Profile.jsx';
import StudyPreferences from '../../components/StudyPreferences/StudyPreferences.jsx';
import './Settings.scss';
import pfp from '../../assets/defaultAvatar.svg';
import preferences from '../../assets/Icons/Preferences.svg';
import rightarrow from '../../assets/Icons/RightArrow.svg';
import useAuth from '../../hooks/useAuth.js';
import { useNavigate } from 'react-router-dom';

import Dashboard from '../../components/Dashboard/Dashboard';
import logo from '../../assets/Brand Image/COMPASS.svg';
import { Icon } from '@iconify-icon/react';

function Settings() {
    const [userInfo, setUserInfo] = useState(null);
    const [isDeveloper, setIsDeveloper] = useState(null);
    const { isAuthenticating, isAuthenticated, user, getDeveloper } = useAuth();
    const navigate = useNavigate();

    // Authentication and user data logic (unchanged)
    useEffect(() => {
        if (isAuthenticating) return;
        if (!isAuthenticated) navigate("/login");
        if (!user) return;
        
        setUserInfo(user);
    }, [isAuthenticating, isAuthenticated, user]);

    // Developer status logic (unchanged)
    useEffect(() => {
        const getDeveloperStatus = async () => {
            const response = await getDeveloper();
            setIsDeveloper(response.developer);
        };
        
        if (userInfo && userInfo.developer !== 0) {
            getDeveloperStatus();
        }
    }, [userInfo]);

    if (!userInfo) {
        return <div className="settings"><Header /></div>;
    }

    const menuItems = [
        {
            label: 'Profile',
            icon: 'mdi:person',
            element: <Profile userInfo={userInfo} />
        },
        {
            label: 'Account Settings',
            icon: 'mdi:account-cog',
            element: <AccountSettings userInfo={userInfo} />
        },
        {
            label: 'Study Preferences',
            icon: 'mdi:school', 
            element: <StudyPreferences userInfo={userInfo} />
        }
    ];

    // Developer account activation button as middle item
    const middleItem = isDeveloper !== null && !isDeveloper ? (
        <button 
            className='developer-activation-btn'
            onClick={() => navigate('/developer-onboarding')}
        >
            <Icon icon="mdi:code-braces" />
            Activate Developer Account
        </button>
    ) : null;

    return (
        <Dashboard
            menuItems={menuItems}
            additionalClass="settings-dash"
            logo={logo}
            onBack={()=>navigate('/events-dashboard')}
            enableSubSidebar={true}
            
        />
    );
}

export default Settings;

