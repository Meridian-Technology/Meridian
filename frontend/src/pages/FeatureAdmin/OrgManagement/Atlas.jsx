import React, { useState } from 'react';
import './Atlas.scss';
import Dashboard from '../../../components/Dashboard/Dashboard';
import OrgOverview from './OrgOverview/OrgOverview';
import VerificationRequests from './VerificationRequests/VerificationRequests';
import OrgList from './OrgList/OrgList';
import Configuration from './Configuration/Configuration';
import Analytics from './Analytics/Analytics';
import AtlasLogo from '../../../assets/Brand Image/SolutionLogos/Atlas.svg';
import { useNavigate } from 'react-router-dom';
function Atlas() {
    const navigate = useNavigate();
    const menuItems = [
        {
            label: 'Overview',
            icon: 'ic:round-dashboard',
            element: <OrgOverview />
        },
        {
            label: 'Verification Requests',
            icon: 'mdi:shield-check',
            element: <VerificationRequests />
        },
        {
            label: 'Organizations',
            icon: 'mdi:account-group',
            element: <OrgList />
        },
        {
            label: 'Analytics',
            icon: 'mdi:chart-line',
            element: <Analytics />
        },
        {
            label: 'Settings',
            icon: 'mdi:cog',
            subItems: [
                {
                    label: 'General Configuration',
                    icon: 'mdi:cog',
                    element: <Configuration section="general" />
                },
                {
                    label: 'Verification Types',
                    icon: 'mdi:shield-check',
                    element: <Configuration section="verification-types" />
                },
                {
                    label: 'Review Workflow',
                    icon: 'mdi:clipboard-check',
                    element: <Configuration section="review-workflow" />
                },
                {
                    label: 'Organization Policies',
                    icon: 'mdi:policy',
                    element: <Configuration section="policies" />
                }
            ]
        }
    ];

    return (
        <Dashboard 
            menuItems={menuItems} 
            additionalClass='org-management-dash' 
            logo={AtlasLogo}
            enableSubSidebar={true}
            primaryColor='#4DAA57'
            secondaryColor='#EDF6EE'
            onBack={()=>navigate('/root-dashboard')}
        />
    );
}

export default Atlas;
