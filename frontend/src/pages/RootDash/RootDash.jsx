import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import RootManagement from './RootManagement/RootManagement';
import ManageFlow from './ManageFlow/ManageFlow';
import RSSManagement from './RSSManagement/RSSManagement';
import RoomManager from './RoomManager/RoomManager';
import ResourcesManagement from './ResourcesManagement/ResourcesManagement';
import NoticeManagement from './NoticeManagement/NoticeManagement';
import eventsLogo from '../../assets/Brand Image/EventsLogo.svg';
import { useFetch } from '../../hooks/useFetch';
import CommunityOrganizerShell from './CommunityOrganizerShell';
import RootDashUserManagement from './RootDashUserManagement';
import UserOnboardingConfig from './UserOnboardingConfig';

function RootDash() {
    const navigate = useNavigate();
    const { data: orgConfigResponse, loading } = useFetch('/org-management/config');
    const operatorMode = orgConfigResponse?.data?.operatorDashboardMode;
    const isEngagementHub = !loading && operatorMode === 'engagement_hub';

    if (isEngagementHub) {
        return <CommunityOrganizerShell />;
    }

    const menuItems = [
        { 
            label: 'Dashboard', 
            icon: 'ic:round-dashboard',
            element: <RootManagement/>
        },
        {
            label: 'People',
            icon: 'mdi:account-supervisor-circle-outline',
            element: <RootDashUserManagement />,
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
        { 
            label: 'Resources', 
            icon: 'mdi:book-open-variant',
            element: <ResourcesManagement/>
        },
        { 
            label: 'Notice', 
            icon: 'mdi:bullhorn',
            element: <NoticeManagement/>
        },
        {
            label: 'Settings',
            icon: 'mdi:cog-outline',
            subItems: [
                {
                    label: 'User onboarding',
                    icon: 'mdi:account-school-outline',
                    element: <UserOnboardingConfig />,
                },
            ],
        },
    ];

    return (
        <Dashboard menuItems={menuItems} additionalClass='root-dash' logo={eventsLogo} onBack={()=>navigate('/events-dashboard')}>
        </Dashboard>
    )
}

export default RootDash;