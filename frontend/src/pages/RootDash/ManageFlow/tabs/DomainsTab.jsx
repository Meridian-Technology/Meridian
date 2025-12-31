import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function DomainsTab({ 
    domainsData, 
    openPopup, 
    selectedDomain, 
    setSelectedDomain, 
    handleDomainSelect, 
    loadingStakeholders, 
    stakeholderRoles 
}) {
    const navigate = useNavigate();
    return (
        <div className="domains-section">
            <div className="section-header">
                <h2>Domain Management</h2>
                <div className="domain-actions">
                    <button 
                        className="bulk-action-btn primary"
                        onClick={() => openPopup('domain')}
                    >
                        <Icon icon="ic:round-add-home" />
                        Create Domain
                    </button>
                    <button className="bulk-action-btn">
                        <Icon icon="mdi:export" />
                        Export Domains
                    </button>
                </div>
            </div>

            {domainsData.loading ? (
                <div className="loading-section">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading domains...</span>
                </div>
            ) : domainsData.data?.data?.length > 0 ? (
                <div className="domains-grid">
                    {domainsData.data.data.map((domain) => (
                        <div key={domain._id} className="domain-management-card">
                            <div className="domain-header">
                                <div className="domain-info">
                                    <h3>{domain.name}</h3>
                                    <p className="domain-description">{domain.description || 'No description provided'}</p>
                                    <div className="domain-meta">
                                        <span className={`domain-type-badge ${domain.type}`}>
                                            <Icon icon={`mdi:${domain.type === 'facility' ? 'building' : domain.type === 'department' ? 'office-building' : domain.type === 'organization' ? 'account-group' : 'cog'}`} />
                                            {domain.type}
                                        </span>
                                        <span className="capacity-info">
                                            <Icon icon="mdi:account-group" />
                                            {domain.domainSettings?.maxCapacity ? `Max ${domain.domainSettings.maxCapacity} people` : 'No capacity limit'}
                                        </span>
                                    </div>
                                </div>
                                <div className="domain-status">
                                    <div className={`status-indicator ${domain.isActive ? 'active' : 'inactive'}`}></div>
                                    <span>{domain.isActive ? 'Active' : 'Inactive'}</span>
                                </div>
                            </div>

                            <div className="domain-content">
                                <div className="domain-stats">
                                    <div className="stat">
                                        <Icon icon="mdi:calendar" />
                                        <span>0</span>
                                        <label>Events</label>
                                    </div>
                                    <div className="stat">
                                        <Icon icon="mdi:account-group" />
                                        <span>0</span>
                                        <label>Stakeholder Roles</label>
                                    </div>
                                    <div className="stat">
                                        <Icon icon="mdi:shield-check" />
                                        <span>{domain.domainSettings?.approvalWorkflow?.enabled ? 'Yes' : 'No'}</span>
                                        <label>Approval Required</label>
                                    </div>
                                </div>

                                <div className="domain-settings-preview">
                                    <div className="setting-item">
                                        <Icon icon="mdi:clock-outline" />
                                        <span>Escalation: {domain.domainSettings?.approvalWorkflow?.escalationTimeout || 72}h</span>
                                    </div>
                                    <div className="setting-item">
                                        <Icon icon="mdi:calendar-clock" />
                                        <span>Max Advance: {domain.domainSettings?.bookingRules?.maxAdvanceBooking || 30} days</span>
                                    </div>
                                    <div className="setting-item">
                                        <Icon icon="mdi:repeat" />
                                        <span>Recurring: {domain.domainSettings?.bookingRules?.allowRecurring ? 'Yes' : 'No'}</span>
                                    </div>
                                </div>

                                <div className="domain-actions">
                                    <button 
                                        className="domain-dashboard-btn"
                                        onClick={() => navigate(`/domain-dashboard/${domain._id}`)}
                                    >
                                        <Icon icon="mdi:view-dashboard" />
                                        Domain Dashboard
                                    </button>
                                    <button 
                                        className="manage-domain-btn"
                                        onClick={() => handleDomainSelect(domain._id)}
                                    >
                                        <Icon icon="mdi:account-group" />
                                        Manage Stakeholders
                                    </button>
                                    <button className="edit-domain-btn">
                                        <Icon icon="mdi:pencil" />
                                        Edit Domain
                                    </button>
                                </div>
                            </div>

                            {/* Stakeholder Roles Section */}
                            {selectedDomain === domain._id && (
                                <div className="stakeholder-roles-section">
                                    <div className="section-header">
                                        <h4>Stakeholder Roles for {domain.name}</h4>
                                        <button 
                                            className="add-role-btn"
                                            onClick={() => openPopup('stakeholder')}
                                        >
                                            <Icon icon="mdi:plus" />
                                            Add Stakeholder Role
                                        </button>
                                    </div>
                                    
                                    {loadingStakeholders ? (
                                        <div className="loading-stakeholders">
                                            <Icon icon="mdi:loading" className="spinning" />
                                            <span>Loading stakeholder roles...</span>
                                        </div>
                                    ) : stakeholderRoles.length === 0 ? (
                                        <div className="no-stakeholder-roles">
                                            <Icon icon="mdi:account-group" />
                                            <h5>No Stakeholder Roles</h5>
                                            <p>This domain doesn't have any stakeholder roles configured yet.</p>
                                            <button 
                                                className="create-role-btn"
                                                onClick={() => openPopup('stakeholder')}
                                            >
                                                <Icon icon="mdi:plus" />
                                                Create First Role
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="stakeholder-roles-list">
                                            {stakeholderRoles.map((role) => (
                                                <div key={role._id} className="stakeholder-role-card">
                                                    <div className="role-info">
                                                        <h5>{role.stakeholderName}</h5>
                                                        <p className="role-description">{role.description || 'No description provided'}</p>
                                                        <div className="role-meta">
                                                            <span className={`role-type-badge ${role.stakeholderType}`}>
                                                                <Icon icon={`mdi:${role.stakeholderType === 'approver' ? 'shield-check' : role.stakeholderType === 'acknowledger' ? 'check-circle' : 'bell'}`} />
                                                                {role.stakeholderType}
                                                            </span>
                                                            <span className={`assignee-status ${role.members?.some(m => m.isActive) ? 'assigned' : 'unassigned'}`}>
                                                                <Icon icon={role.members?.some(m => m.isActive) ? 'mdi:account-check' : 'mdi:account-off'} />
                                                                {role.members?.filter(m => m.isActive).length || 0} member(s)
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="role-actions">
                                                        <button className="edit-role-btn" title="Edit Role">
                                                            <Icon icon="mdi:pencil" />
                                                        </button>
                                                        <button className="assign-role-btn" title="Assign User">
                                                            <Icon icon="mdi:account-plus" />
                                                        </button>
                                                        <button className="delete-role-btn" title="Delete Role">
                                                            <Icon icon="mdi:delete" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="no-domains">
                    <div className="empty-state">
                        <Icon icon="mdi:domain-off" />
                        <h3>No Domains Configured</h3>
                        <p>Create domains to manage facility-specific event settings, stakeholder roles, and approval workflows.</p>
                        <button 
                            className="create-domain-btn"
                            onClick={() => openPopup('domain')}
                        >
                            <Icon icon="mdi:domain-plus" />
                            Create Your First Domain
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DomainsTab;
