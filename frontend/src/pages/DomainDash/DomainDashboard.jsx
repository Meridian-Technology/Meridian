import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import Dashboard from '../../components/Dashboard/Dashboard';
import DomainOverview from './components/DomainOverview';
import DomainStakeholders from './components/DomainStakeholders';
import DomainApprovalRules from './components/DomainApprovalRules';
import DomainSettings from './components/DomainSettings';
import eventsLogo from '../../assets/Brand Image/EventsLogo.svg';

function DomainDashboard() {
    const { domainId } = useParams();
    const navigate = useNavigate();
    const domainData = useFetch(`/api/domain/${domainId}`);

    const domain = domainData.data?.data;

    // Create menu items for the dashboard
    const menuItems = [
        { 
            label: 'Overview', 
            icon: 'mdi:view-dashboard',
            element: <DomainOverview />
        },
        { 
            label: 'Stakeholder Roles', 
            icon: 'mdi:account-group',
            element: <DomainStakeholders />
        },
        { 
            label: 'Approval Rules', 
            icon: 'mdi:cog',
            element: <DomainApprovalRules />
        },
        { 
            label: 'Domain Settings', 
            icon: 'mdi:settings',
            element: <DomainSettings />
        },
    ];

    // Show loading state
    if (domainData.loading) {
        return (
            <div className="domain-dashboard-loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <span>Loading domain dashboard...</span>
                </div>
            </div>
        );
    }

    // Show error state
    if (domainData.error || !domain) {
        return (
            <div className="domain-dashboard-error">
                <div className="error-state">
                    <h3>Domain Not Found</h3>
                    <p>The requested domain could not be found or you don't have permission to access it.</p>
                    <button 
                        className="back-button"
                        onClick={() => navigate('/root-dashboard')}
                    >
                        Back to Root Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Dashboard 
            menuItems={menuItems} 
            additionalClass='domain-dash' 
            logo={eventsLogo} 
            onBack={() => navigate('/root-dashboard')}
        />
    );
}

export default DomainDashboard;
