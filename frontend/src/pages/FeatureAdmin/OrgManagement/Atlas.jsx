import React, { useState, useEffect } from 'react';
import './Atlas.scss';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { analytics } from '../../../services/analytics/analytics';
import OrgOverview from './OrgOverview/OrgOverview';
import VerificationRequests from './VerificationRequests/VerificationRequests';
import ApprovalQueue from './ApprovalQueue/ApprovalQueue';
import OrgList from './OrgList/OrgList';
import Configuration from './Configuration/Configuration';
import Analytics from './Analytics/Analytics';
import AtlasLogo from '../../../assets/Brand Image/SolutionLogos/Atlas.svg';
import { useNavigate } from 'react-router-dom';
function Atlas() {
    const navigate = useNavigate();

    useEffect(() => {
        analytics.screen('Org Management');
    }, []);

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
            label: 'Approval Queue',
            icon: 'mdi:clipboard-check-outline',
            element: <ApprovalQueue />
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
                },
                {
                    label: 'Messaging Configuration',
                    icon: 'mdi:message-text',
                    element: <Configuration section="messaging" />
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
