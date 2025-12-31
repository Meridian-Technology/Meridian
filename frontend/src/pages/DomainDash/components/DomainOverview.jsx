import React from 'react';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useParams } from 'react-router-dom';
import '../DomainDashboard.scss';

function DomainOverview() {
    const { domainId } = useParams();
    const domainData = useFetch(`/api/domain/${domainId}`);
    const stakeholderRolesData = useFetch(`/api/stakeholder-roles/domain/${domainId}`);

    const domain = domainData.data?.data;
    const stakeholderRoles = stakeholderRolesData.data?.data || [];

    if (domainData.loading) {
        return (
            <div className="domain-overview loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading domain overview...</span>
                </div>
            </div>
        );
    }

    if (domainData.error || !domain) {
        return (
            <div className="domain-overview error">
                <div className="error-state">
                    <Icon icon="mdi:alert-circle" />
                    <h3>Domain Not Found</h3>
                    <p>The requested domain could not be found or you don't have permission to access it.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="domain-overview">
            <div className="overview-header">
                <div className="domain-info">
                    <h1>{domain.name}</h1>
                    <p className="domain-type">{domain.type}</p>
                    <p className="domain-description">{domain.description || 'No description provided'}</p>
                </div>
                <div className="domain-status">
                    <div className={`status-indicator ${domain.isActive ? 'active' : 'inactive'}`}></div>
                    <span>{domain.isActive ? 'Active' : 'Inactive'}</span>
                </div>
            </div>

            <div className="overview-stats">
                <div className="stat-card">
                    <div className="stat-icon">
                        <Icon icon="mdi:account-group" />
                    </div>
                    <div className="stat-content">
                        <h3>{stakeholderRoles.length}</h3>
                        <p>Stakeholder Roles</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">
                        <Icon icon="mdi:calendar" />
                    </div>
                    <div className="stat-content">
                        <h3>0</h3>
                        <p>Events This Month</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">
                        <Icon icon="mdi:shield-check" />
                    </div>
                    <div className="stat-content">
                        <h3>{domain.domainSettings?.approvalWorkflow?.enabled ? 'Yes' : 'No'}</h3>
                        <p>Approval Required</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">
                        <Icon icon="mdi:clock-outline" />
                    </div>
                    <div className="stat-content">
                        <h3>{domain.domainSettings?.approvalWorkflow?.escalationTimeout || 72}h</h3>
                        <p>Escalation Timeout</p>
                    </div>
                </div>
            </div>

            <div className="domain-settings-preview">
                <h3>Domain Configuration</h3>
                <div className="settings-grid">
                    <div className="setting-item">
                        <Icon icon="mdi:account-group" />
                        <span>Max Capacity: {domain.domainSettings?.maxCapacity || 'No limit'}</span>
                    </div>
                    <div className="setting-item">
                        <Icon icon="mdi:calendar-clock" />
                        <span>Max Advance Booking: {domain.domainSettings?.bookingRules?.maxAdvanceBooking || 30} days</span>
                    </div>
                    <div className="setting-item">
                        <Icon icon="mdi:repeat" />
                        <span>Recurring Events: {domain.domainSettings?.bookingRules?.allowRecurring ? 'Allowed' : 'Not allowed'}</span>
                    </div>
                    <div className="setting-item">
                        <Icon icon="mdi:clock" />
                        <span>Min Duration: {domain.domainSettings?.bookingRules?.minDuration || 0.5} hours</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DomainOverview;
