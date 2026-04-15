import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import RoomManager from './RoomManager/RoomManager';
import OrgList from '../FeatureAdmin/OrgManagement/OrgList/OrgList';
import EventsAnalytics from '../../components/EventsAnalytics/EventsAnalytics';
import EventSystemConfig from '../FeatureAdmin/Beacon/EventSystemConfig/EventSystemConfig';
import Configuration from '../FeatureAdmin/OrgManagement/Configuration/Configuration';
import BuildingManager from '../FeatureAdmin/Compass/Pages/BuildingManager/BuildingManager';
import CommunityOrganizerHome from './CommunityOrganizerHome';
import AdminEventsManagementTab from './AdminEventsManagementTab';
import RootDashUserManagement from './RootDashUserManagement';
import UserOnboardingConfig from './UserOnboardingConfig';
import eventsLogo from '../../assets/Brand Image/ADMIN.svg';

/**
 * Community organizer mode: first-class shell for community staff (not a reskinned Atlas flow).
 * IA: Home → Events management → People → Groups → Insights → Spaces → Settings (event + org).
 */
function CommunityOrganizerShell() {
    const navigate = useNavigate();

    const menuItems = [
        {
            label: 'Home',
            icon: 'mdi:home-outline',
            element: <CommunityOrganizerHome />,
        },
        {
            label: 'Events management',
            icon: 'mdi:calendar-multiselect',
            element: <AdminEventsManagementTab />,
        },
        {
            label: 'People',
            icon: 'mdi:user',
            element: <RootDashUserManagement />,
        },
        {
            label: 'Groups',
            icon: 'mdi:users',
            element: <OrgList useAdminHeaderGradient />,
        },
        // {
        //     label: 'Insights',
        //     icon: 'mdi:chart-line',
        //     element: <EventsAnalytics useAdminHeaderGradient />,
        // },
        {
            label: 'Spaces',
            icon: 'mdi:map-marker-radius',
            subItems: [
                {
                    label: 'Buildings',
                    icon: 'mdi:office-building',
                    element: <BuildingManager />,
                },
                {
                    label: 'Rooms',
                    icon: 'mdi:home-city',
                    element: <RoomManager />,
                },
            ],
        },
        {
            label: 'Settings',
            icon: 'mdi:cog-outline',
            subItems: [
                {
                    label: 'Event settings',
                    icon: 'fluent:calendar-settings-20-filled',
                    element: <EventSystemConfig mode="engagement" />,
                },
                {
                    label: 'Organization settings',
                    icon: 'fluent:people-settings-20-filled',
                    element: <Configuration communityEssentials />,
                },
                {
                    label: 'User onboarding',
                    icon: 'mdi:user',
                    element: <UserOnboardingConfig />,
                },
            ],
        },
    ];

    return (
        <Dashboard
            menuItems={menuItems}
            additionalClass="root-dash community-organizer-root-dash"
            logo={eventsLogo}
            onBack={() => navigate('/events-dashboard')}
            enableSubSidebar={true}
        />
    );
}

export default CommunityOrganizerShell;
