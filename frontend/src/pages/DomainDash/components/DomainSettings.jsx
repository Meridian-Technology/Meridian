import React from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import '../DomainDashboard.scss';

function formatScopeList(values) {
    return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'None';
}

/** API stores each weekday as { open, close, closed }; legacy data may be a string. */
function formatOperatingDay(day) {
    if (day == null || day === '') return 'Not set';
    if (typeof day === 'string') return day;
    if (typeof day === 'object' && day.closed) return 'Closed';
    if (typeof day === 'object' && (day.open != null || day.close != null)) {
        return `${day.open ?? '—'} – ${day.close ?? '—'}`;
    }
    return 'Not set';
}

function DomainSettings() {
    const { domainId } = useParams();
    const { addNotification } = useNotification();
    const domainData = useFetch(domainId ? `/api/domain/${domainId}` : null);

    const domain = domainData.data?.data;
    const governance = domain?.spaceGovernance || {};
    const governingScope = governance.governingScope || {};
    const concernScope = governance.concernScope || {};

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
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.monday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Tuesday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.tuesday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Wednesday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.wednesday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Thursday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.thursday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Friday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.friday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Saturday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.saturday)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Sunday</label>
                            <span>{formatOperatingDay(domain.domainSettings?.operatingHours?.sunday)}</span>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Space Governance</h3>
                    <div className="settings-grid">
                        <div className="setting-item">
                            <label>Governing Scope Kind</label>
                            <span>{governingScope.kind || 'all_spaces'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Concern Scope Kind</label>
                            <span>{concernScope.kind || 'campus_wide'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Scope Mode</label>
                            <span>{governance.scopeMode || 'inclusive'}</span>
                        </div>
                        <div className="setting-item">
                            <label>Governing Buildings</label>
                            <span>{formatScopeList(governingScope.buildingIds)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Concern Buildings</label>
                            <span>{formatScopeList(concernScope.buildingIds)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Governing Spaces</label>
                            <span>{formatScopeList(governingScope.spaceIds)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Concern Spaces</label>
                            <span>{formatScopeList(concernScope.spaceIds)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Governing Space Groups</label>
                            <span>{formatScopeList(governingScope.spaceGroupIds)}</span>
                        </div>
                        <div className="setting-item">
                            <label>Concern Space Groups</label>
                            <span>{formatScopeList(concernScope.spaceGroupIds)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DomainSettings;
