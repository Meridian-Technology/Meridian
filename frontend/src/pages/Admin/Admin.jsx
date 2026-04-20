import React from 'react';
import Header from '../../components/Header/Header';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import General from './General/General';
import OperatorHubMode from './OperatorHubMode/OperatorHubMode';
import WebSocketConnectionsPage from './WebSocketConnectionsPage/WebSocketConnectionsPage';
import PlatformAdminsPage from './PlatformAdminsPage/PlatformAdminsPage';
import BadgeManager from './BadgeManager/BadgeManager';
import ManageUsers from './ManageUsers/ManageUsers';
import QRManager from './QRManager/QRManager';
import AnalyticsDashboard from '../FeatureAdmin/AnalyticsDashboard/AnalyticsDashboard';
import MobileAnalyticsDashboard from '../FeatureAdmin/MobileAnalyticsDashboard/MobileAnalyticsDashboard';
import UserJourneyAnalytics from '../FeatureAdmin/UserJourneyAnalytics/UserJourneyAnalytics';
import IndividualUserJourney from '../FeatureAdmin/IndividualUserJourney/IndividualUserJourney';
import OrgBetaFeatures from '../FeatureAdmin/OrgManagement/OrgBetaFeatures/OrgBetaFeatures';

import AdminLogo from '../../assets/Brand Image/ADMIN.svg';


import './Admin.scss';

function Admin(){
    const { user } = useAuth();
    const navigate = useNavigate();

    if(!user){
        return(
            <div className="admin">
                <Header />
            </div>
        );
    }

    const menuItems = [
        { 
            label: 'General', 
            icon: 'ic:round-dashboard',
            element: <General/>
        },
        {
            label: 'Community organizer',
            icon: 'mdi:view-dashboard-variant',
            element: <OperatorHubMode />,
        },
        {
            label: 'Beta features',
            icon: 'mdi:flask-outline',
            element: <OrgBetaFeatures />,
        },
        { 
            label: 'Analytics', 
            icon: 'bx:stats',
            subItems: [
                {
                    label: 'Web Analytics',
                    icon: 'mdi:chart-line',
                    element: <AnalyticsDashboard/>
                },
                {
                    label: 'Mobile Analytics',
                    icon: 'mdi:cellphone',
                    element: <MobileAnalyticsDashboard/>
                },
                {
                    label: 'User Journey Analytics',
                    icon: 'mdi:graph',
                    element: <UserJourneyAnalytics/>
                },
                {
                    label: 'Individual Journey',
                    icon: 'mdi:map-marker-path',
                    element: <IndividualUserJourney/>
                },
                {
                    label: 'QR Codes',
                    icon: 'mingcute:qrcode-fill',
                    element: <QRManager/>
                }
            ]
        },
        { 
            label: 'WebSocket Connections', 
            icon: 'mdi:connection',
            element: <WebSocketConnectionsPage/>
        },
        { 
            label: 'Platform Admins', 
            icon: 'mdi:shield-account',
            element: <PlatformAdminsPage/>
        },
        { 
            label: 'Manage Users', 
            icon: 'ic:round-dashboard',
            element: <ManageUsers/>
        },
        { 
            label: 'Badge Grants', 
            icon: 'bx:stats',
            element: <BadgeManager/>
        }
    ]

    return(
        <Dashboard 
            menuItems={menuItems} 
            additionalClass='admin' 
            logo={AdminLogo} 
            onBack={()=>navigate('/events-dashboard')}
            enableSubSidebar={true}
        >
        </Dashboard>
    );
}

export default Admin