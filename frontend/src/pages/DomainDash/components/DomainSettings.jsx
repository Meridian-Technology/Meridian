import React from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import '../DomainDashboard.scss';

function DomainSettings() {
    const { domainId } = useParams();
    const { addNotification } = useNotification();
    const domainData = useFetch(`/api/domain/${domainId}`);

    const domain = domainData.data?.data;

    if (domainData.loading) {
        return (
            <div className="domain-settings loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading domain settings...</span>
                </div>
            </div>
        );
    }

    if (domainData.error || !domain) {
        return (
            <div className="domain-settings error">
                <div className="error-state">
                    <Icon icon="mdi:alert-circle" />
                    <h3>Domain Not Found</h3>
                    <p>The requested domain could not be found or you don't have permission to access it.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="domain-settings">
            <div className="settings-header">
                <h2>Domain Settings</h2>
                <button 
                    className="edit-settings-btn"
                    onClick={() => {
                        addNotification({
                            title: 'Feature Coming Soon',
                            message: 'Domain settings editing will be available soon',
                            type: 'info'
                        });
                    }}
                >
                    <Icon icon="mdi:pencil" />
                    Edit Settings
                </button>
            </div>

            <div className="settings-sections">
                <div className="settings-section">
                    <h3>Basic Information</h3>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <label>Domain Name</label>
                            <span>{domain.name}</span>
                        </div>
                        <div className="setting-item">
                            <label>Domain Type</label>
                            <span>{domain.type}</span>
                        </div>
                        <div className="setting-item">
                            <label>Description</label>
                            <span>{domain.description || 'No description'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Status</label>
                            <span className={`status ${domain.isActive ? 'active' : 'inactive'}`}>
                                {domain.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Capacity & Booking</h3>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <label>Maximum Capacity</label>
                            <span>{domain.domainSettings?.maxCapacity || 'No limit'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Max Advance Booking</label>
                            <span>{domain.domainSettings?.bookingRules?.maxAdvanceBooking || 30} days</span>
                        </div>
                        <div className="setting-item">
                            <label>Min Advance Booking</label>
                            <span>{domain.domainSettings?.bookingRules?.minAdvanceBooking || 1} hours</span>
                        </div>
                        <div className="setting-item">
                            <label>Max Duration</label>
                            <span>{domain.domainSettings?.bookingRules?.maxDuration || 8} hours</span>
                        </div>
                        <div className="setting-item">
                            <label>Min Duration</label>
                            <span>{domain.domainSettings?.bookingRules?.minDuration || 0.5} hours</span>
                        </div>
                        <div className="setting-item">
                            <label>Allow Recurring</label>
                            <span>{domain.domainSettings?.bookingRules?.allowRecurring ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Approval Workflow</h3>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <label>Approval Required</label>
                            <span>{domain.domainSettings?.approvalWorkflow?.enabled ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Auto Approve</label>
                            <span>{domain.domainSettings?.approvalWorkflow?.autoApprove ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Require All Approvers</label>
                            <span>{domain.domainSettings?.approvalWorkflow?.requireAllApprovers ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Escalation Timeout</label>
                            <span>{domain.domainSettings?.approvalWorkflow?.escalationTimeout || 72} hours</span>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Operating Hours</h3>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <label>Monday</label>
                            <span>{domain.domainSettings?.operatingHours?.monday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Tuesday</label>
                            <span>{domain.domainSettings?.operatingHours?.tuesday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Wednesday</label>
                            <span>{domain.domainSettings?.operatingHours?.wednesday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Thursday</label>
                            <span>{domain.domainSettings?.operatingHours?.thursday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Friday</label>
                            <span>{domain.domainSettings?.operatingHours?.friday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Saturday</label>
                            <span>{domain.domainSettings?.operatingHours?.saturday || 'Not set'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Sunday</label>
                            <span>{domain.domainSettings?.operatingHours?.sunday || 'Not set'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DomainSettings;
