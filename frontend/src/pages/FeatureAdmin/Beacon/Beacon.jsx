import React, { useEffect } from 'react';
import './Beacon.scss';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { analytics } from '../../../services/analytics/analytics';
import Home from './Home/Home';
import BeaconLogo from '../../../assets/Brand Image/SolutionLogos/Beacon.svg';
import { useNavigate } from 'react-router-dom';
import ManageFlow from '../../RootDash/ManageFlow/ManageFlow';
import RSSManagement from '../../RootDash/RSSManagement/RSSManagement';
import EventSystemConfig from './EventSystemConfig/EventSystemConfig';
import { useGradient } from '../../../hooks/useGradient';
import EventsAnalytics from '../../../components/EventsAnalytics/EventsAnalytics';

const Beacon = () => {
    const navigate = useNavigate();

    useEffect(() => {
        analytics.screen('Event System Config (Beacon)');
    }, []);

    const menuItems = [

        {
            label: 'Home',
            icon: 'fluent:flow-16-filled',
            element: <ManageFlow />
        },
        {
            label: 'System Configuration',
            icon: 'mdi:cog',
            element: <EventSystemConfig />
        },
        {
            label: 'RSS Management',
            icon: 'mdi:rss',
            element: <RSSManagement />
        },
        {
            label: 'Events Analytics',
            icon: 'material-symbols:event',
            element: <EventsAnalytics />
        }
    ];
    return (
        <Dashboard 
        menuItems={menuItems} 
        additionalClass='root-dash' 
        logo={BeaconLogo} 
        onBack={()=>navigate('/root-dashboard')}
        primaryColor='#998DF2'
        secondaryColor='rgba(153, 141, 242, 0.1)'
        >
        </Dashboard>
    );
};

export default Beacon;