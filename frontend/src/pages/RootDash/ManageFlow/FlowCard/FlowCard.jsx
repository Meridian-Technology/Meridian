import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../../../NotificationContext';
import { useFetch } from '../../../../hooks/useFetch';
import { UserSearch, SelectedUsers } from '../../../../components/UserSearch';
import postRequest from '../../../../utils/postRequest';
import './FlowCard.scss';

function FlowCard({ step, group, index, onDelete, onRefresh }) {
    const [expanded, setExpanded] = useState(false);
    const [activeSection, setActiveSection] = useState('overview');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [newOwner, setNewOwner] = useState(null);
    const [saving, setSaving] = useState(false);
    const navigate = useNavigate();
    const { addNotification } = useNotification();

    // Fetch members data
    const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useFetch(
        group ? `/org-roles/${group._id}/members` : null
    );

    const members = membersData?.members || [];

    const handleUserSelect = (user) => {
        if (!selectedUsers.find(u => u._id === user._id)) {
            setSelectedUsers(prev => [...prev, user]);
        }
    };

    const handleRemoveUser = (userId) => {
        setSelectedUsers(prev => prev.filter(u => u._id !== userId));
    };

    const handleOwnerSelect = (user) => {
        setNewOwner(user);
    };

    const handleRemoveOwner = () => {
        setNewOwner(null);
    };

    const handleAddMembers = async () => {
        if (selectedUsers.length === 0) {
            addNotification({
                title: 'No users selected',
                message: 'Please select at least one user to add',
                type: 'warning'
            });
            return;
        }

        setSaving(true);
        try {
            const promises = selectedUsers.map(user => 
                postRequest(`/org-roles/${group._id}/members`, {
                    userId: user._id,
                    role: 'member'
                })
            );

            await Promise.all(promises);
            
            addNotification({
                title: 'Success',
                message: `${selectedUsers.length} member(s) added successfully`,
                type: 'success'
            });

            setSelectedUsers([]);
            refetchMembers();
            onRefresh();
        } catch (error) {
            console.error('Error adding members:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to add members',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!window.confirm('Are you sure you want to remove this member?')) {
            return;
        }

        try {
            const response = await postRequest(`/org-roles/${group._id}/members/${memberId}`, {}, {
                method: 'DELETE'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Member removed successfully',
                    type: 'success'
                });
                refetchMembers();
                onRefresh();
            } else {
                throw new Error(response.message || 'Failed to remove member');
            }
        } catch (error) {
            console.error('Error removing member:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to remove member',
                type: 'error'
            });
        }
    };

    const handleDesignateOwner = async () => {
        if (!newOwner) {
            addNotification({
                title: 'No owner selected',
                message: 'Please select a user to designate as owner',
                type: 'warning'
            });
            return;
        }

        if (!window.confirm(`Are you sure you want to designate ${newOwner.name || newOwner.username} as the owner of this approval group?`)) {
            return;
        }

        setSaving(true);
        try {
            // First, add the user as a member if they're not already
            const isAlreadyMember = members.find(member => member.user_id._id === newOwner._id);
            if (!isAlreadyMember) {
                await postRequest(`/org-roles/${group._id}/members`, {
                    userId: newOwner._id,
                    role: 'owner'
                });
            } else {
                // Update existing member to owner role
                await postRequest(`/org-roles/${group._id}/members/${isAlreadyMember._id}`, {
                    role: 'owner'
                }, {
                    method: 'PUT'
                });
            }

            // Update the org owner
            await postRequest(`/orgs/${group._id}/transfer-ownership`, {
                newOwnerId: newOwner._id
            });

            addNotification({
                title: 'Success',
                message: `${newOwner.name || newOwner.username} is now the owner of this approval group`,
                type: 'success'
            });

            setNewOwner(null);
            refetchMembers();
            onRefresh();
        } catch (error) {
            console.error('Error designating owner:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to designate owner',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDashboardClick = () => {
        navigate(`/approval-dashboard/${group.org_name}`);
    };

    const handleManageClick = () => {
        navigate(`/approval-dashboard/${group.org_name}`);
    };

    const sections = [
        { id: 'overview', label: 'Overview', icon: 'mdi:view-dashboard' },
        { id: 'members', label: 'Members', icon: 'mdi:account-group' },
        { id: 'settings', label: 'Settings', icon: 'mdi:cog' },
        { id: 'configuration', label: 'Configuration', icon: 'mdi:workflow' },
        { id: 'analytics', label: 'Analytics', icon: 'mdi:chart-line' }
    ];

    return (
        <div className={`flow-card ${expanded ? 'expanded' : ''}`}>
            <div className="card-header" onClick={() => setExpanded(!expanded)}>
                <div className="step-info">
                    <div className="step-number">{index + 1}</div>
                    <div className="step-details">
                        <h3>{group?.org_name || step.role}</h3>
                        <p>{group?.org_description || `Approval step for ${step.role}`}</p>
                        <div className="step-meta">
                            <div className="meta-item">
                                <Icon icon="mdi:account-group" />
                                <span>{members.length} members</span>
                            </div>
                            {step.conditionGroups?.length > 0 && (
                                <div className="meta-item">
                                    <Icon icon="mdi:filter" />
                                    <span>{step.conditionGroups.length} rules</span>
                                </div>
                            )}
                            {group?.owner && (
                                <div className="meta-item">
                                    <Icon icon="mdi:crown" />
                                    <span>Owner: {group.owner.name || group.owner.username}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="card-actions">
                    <button className="dashboard-btn" onClick={(e) => { e.stopPropagation(); handleDashboardClick(); }}>
                        <Icon icon="material-symbols:arrow-outward-rounded"/>
                        Dashboard
                    </button>
                    <button className="manage-btn" onClick={(e) => { e.stopPropagation(); handleManageClick(); }}>
                        <Icon icon="mdi:cog" />
                        Manage
                    </button>
                    <button className="delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <Icon icon="mdi:delete" />
                        Delete
                    </button>
                    <button className="expand-btn">
                        <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="card-content">
                    <div className="content-tabs">
                        {sections.map(section => (
                            <button
                                key={section.id}
                                className={`tab ${activeSection === section.id ? 'active' : ''}`}
                                onClick={() => setActiveSection(section.id)}
                            >
                                <Icon icon={section.icon} />
                                {section.label}
                            </button>
                        ))}
                    </div>

                    <div className="tab-content">
                        {activeSection === 'overview' && (
                            <div className="overview-section">
                                <div className="overview-grid">
                                    <div className="overview-card">
                                        <h4>Group Information</h4>
                                        <div className="info-item">
                                            <label>Name:</label>
                                            <span>{group?.org_name}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Description:</label>
                                            <span>{group?.org_description}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Owner:</label>
                                            <span>{group?.owner ? `${group.owner.name || group.owner.username}` : 'No owner'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Created:</label>
                                            <span>{group?.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'Unknown'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Status:</label>
                                            <span className="status-badge active">Active</span>
                                        </div>
                                    </div>
                                    
                                    <div className="overview-card">
                                        <h4>Flow Information</h4>
                                        <div className="info-item">
                                            <label>Step Position:</label>
                                            <span>{index + 1}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Role:</label>
                                            <span>{step.role}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Rules:</label>
                                            <span>{step.conditionGroups?.length || 0} condition groups</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Form:</label>
                                            <span>{step.formDefinition ? 'Custom Form' : 'Default Form'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Escalation:</label>
                                            <span>{step.settings?.escalationTimeout || 72} hours</span>
                                        </div>
                                    </div>

                                    <div className="overview-card">
                                        <h4>Performance Metrics</h4>
                                        <div className="metrics-grid">
                                            <div className="metric">
                                                <div className="metric-value">0</div>
                                                <div className="metric-label">Pending</div>
                                            </div>
                                            <div className="metric">
                                                <div className="metric-value">0</div>
                                                <div className="metric-label">Approved</div>
                                            </div>
                                            <div className="metric">
                                                <div className="metric-value">0</div>
                                                <div className="metric-label">Rejected</div>
                                            </div>
                                            <div className="metric">
                                                <div className="metric-value">0h</div>
                                                <div className="metric-label">Avg. Time</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overview-card">
                                        <h4>Quick Actions</h4>
                                        <div className="quick-actions">
                                            <button className="quick-action-btn" onClick={handleDashboardClick}>
                                                <Icon icon="mdi:view-dashboard" />
                                                View Dashboard
                                            </button>
                                            <button className="quick-action-btn" onClick={handleManageClick}>
                                                <Icon icon="mdi:cog" />
                                                Manage Group
                                            </button>
                                            <button className="quick-action-btn" onClick={() => setActiveSection('members')}>
                                                <Icon icon="mdi:account-group" />
                                                Manage Members
                                            </button>
                                            <button className="quick-action-btn" onClick={() => setActiveSection('settings')}>
                                                <Icon icon="mdi:settings" />
                                                Configure Settings
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'members' && (
                            <div className="members-section">
                                <div className="members-tabs">
                                    <button 
                                        className={`sub-tab ${activeSection === 'members' ? 'active' : ''}`}
                                        onClick={() => setActiveSection('members')}
                                    >
                                        Current Members
                                    </button>
                                    <button 
                                        className="sub-tab"
                                        onClick={() => setActiveSection('add-members')}
                                    >
                                        Add Members
                                    </button>
                                    <button 
                                        className="sub-tab"
                                        onClick={() => setActiveSection('designate-owner')}
                                    >
                                        Designate Owner
                                    </button>
                                </div>

                                <div className="members-content">
                                    {activeSection === 'members' && (
                                        <div className="current-members">
                                            <h4>Current Members ({members.length})</h4>
                                            {membersLoading ? (
                                                <div className="loading">Loading members...</div>
                                            ) : members.length === 0 ? (
                                                <div className="empty-state">
                                                    <Icon icon="mdi:account-group" />
                                                    <p>No members found</p>
                                                </div>
                                            ) : (
                                                <div className="members-list">
                                                    {members.map((member) => (
                                                        <div key={member._id} className="member-item">
                                                            <div className="member-info">
                                                                <div className="member-avatar">
                                                                    {member.user_id.name ? member.user_id.name[0].toUpperCase() : member.user_id.username[0].toUpperCase()}
                                                                </div>
                                                                <div className="member-details">
                                                                    <div className="member-name">
                                                                        {member.user_id.name || member.user_id.username}
                                                                    </div>
                                                                    <div className="member-email">{member.user_id.email}</div>
                                                                    <div className={`member-role ${member.role}`}>
                                                                        <Icon icon={member.role === 'owner' ? 'mdi:crown' : 'mdi:account'} />
                                                                        {member.role}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="member-actions">
                                                                {member.role !== 'owner' && (
                                                                    <button 
                                                                        className="remove-btn"
                                                                        onClick={() => handleRemoveMember(member._id)}
                                                                    >
                                                                        <Icon icon="mdi:delete" />
                                                                        Remove
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeSection === 'add-members' && (
                                        <div className="add-members">
                                            <h4>Add New Members</h4>
                                            <div className="user-search">
                                                <UserSearch
                                                    onUserSelect={handleUserSelect}
                                                    placeholder="Search for users to add as members"
                                                    excludeIds={members.map(m => m.user_id._id)}
                                                />
                                            </div>
                                            
                                            {selectedUsers.length > 0 && (
                                                <div className="selected-users">
                                                    <h5>Selected Users ({selectedUsers.length})</h5>
                                                    <SelectedUsers
                                                        users={selectedUsers}
                                                        onRemove={handleRemoveUser}
                                                    />
                                                    <button 
                                                        className="add-members-btn"
                                                        onClick={handleAddMembers}
                                                        disabled={saving}
                                                    >
                                                        {saving ? (
                                                            <>
                                                                <Icon icon="mdi:loading" className="spinning" />
                                                                Adding...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Icon icon="mdi:account-plus" />
                                                                Add {selectedUsers.length} Member(s)
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeSection === 'designate-owner' && (
                                        <div className="designate-owner">
                                            <h4>Designate New Owner</h4>
                                            <div className="current-owner">
                                                <h5>Current Owner</h5>
                                                {group.owner ? (
                                                    <div className="current-owner-card">
                                                        <Icon icon="mdi:crown" />
                                                        <span>{group.owner.name || group.owner.username}</span>
                                                    </div>
                                                ) : (
                                                    <div className="no-owner">
                                                        <Icon icon="mdi:alert-circle" />
                                                        <span>No owner assigned</span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="new-owner-selection">
                                                <h5>Select New Owner</h5>
                                                <div className="user-search">
                                                    <UserSearch
                                                        onUserSelect={handleOwnerSelect}
                                                        placeholder="Search for the new owner"
                                                        excludeIds={newOwner ? [newOwner._id] : []}
                                                    />
                                                </div>
                                                
                                                {newOwner && (
                                                    <div className="selected-owner">
                                                        <div className="owner-card">
                                                            <div className="owner-avatar">
                                                                {newOwner.name ? newOwner.name[0].toUpperCase() : newOwner.username[0].toUpperCase()}
                                                            </div>
                                                            <div className="owner-details">
                                                                <div className="owner-name">
                                                                    {newOwner.name || newOwner.username}
                                                                </div>
                                                                <div className="owner-email">{newOwner.email}</div>
                                                            </div>
                                                            <button
                                                                className="remove-owner"
                                                                onClick={handleRemoveOwner}
                                                            >
                                                                <Icon icon="mdi:close" />
                                                            </button>
                                                        </div>
                                                        <button 
                                                            className="designate-owner-btn"
                                                            onClick={handleDesignateOwner}
                                                            disabled={saving}
                                                        >
                                                            {saving ? (
                                                                <>
                                                                    <Icon icon="mdi:loading" className="spinning" />
                                                                    Designating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Icon icon="mdi:crown" />
                                                                    Designate as Owner
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeSection === 'settings' && (
                            <div className="settings-section">
                                <h4>Approval Group Settings</h4>
                                
                                <div className="setting-group">
                                    <h5>Group Status</h5>
                                    <div className="setting-item">
                                        <label>Enable Group</label>
                                        <div className="setting-control">
                                            <input 
                                                type="checkbox" 
                                                defaultChecked={true}
                                                className="toggle-switch"
                                            />
                                            <span className="setting-description">
                                                Enable or disable this approval group
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="setting-group">
                                    <h5>Approval Limits</h5>
                                    <div className="setting-item">
                                        <label>Max Pending Approvals</label>
                                        <div className="setting-control">
                                            <input 
                                                type="number" 
                                                placeholder="No limit"
                                                className="number-input"
                                            />
                                            <span className="setting-description">
                                                Maximum number of pending approvals for this group
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="setting-group">
                                    <h5>Escalation Settings</h5>
                                    <div className="setting-item">
                                        <label>Escalation Timeout (hours)</label>
                                        <div className="setting-control">
                                            <input 
                                                type="number" 
                                                defaultValue={72}
                                                className="number-input"
                                            />
                                            <span className="setting-description">
                                                Automatically escalate after this many hours
                                            </span>
                                        </div>
                                    </div>
                                    <div className="setting-item">
                                        <label>Auto-Escalate</label>
                                        <div className="setting-control">
                                            <input 
                                                type="checkbox" 
                                                defaultChecked={false}
                                                className="toggle-switch"
                                            />
                                            <span className="setting-description">
                                                Automatically escalate pending approvals
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'configuration' && (
                            <div className="configuration-section">
                                <h4>Flow Configuration</h4>
                                
                                <div className="config-overview">
                                    <div className="config-summary">
                                        <h5>Current Configuration</h5>
                                        <div className="config-stats">
                                            <div className="stat-item">
                                                <Icon icon="mdi:filter" />
                                                <span>{step.conditionGroups?.length || 0} rule groups</span>
                                            </div>
                                            <div className="stat-item">
                                                <Icon icon="mdi:file-document" />
                                                <span>{step.formDefinition ? 'Custom form' : 'Default form'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="config-actions">
                                        <button className="edit-rules-btn">
                                            <Icon icon="mdi:pencil" />
                                            Edit Rules
                                        </button>
                                        <button className="configure-form-btn">
                                            <Icon icon="mdi:file-document-edit" />
                                            Configure Form
                                        </button>
                                    </div>
                                </div>

                                <div className="config-settings">
                                    <h5>Step Settings</h5>
                                    <div className="setting-item">
                                        <label>Require All Members</label>
                                        <div className="setting-control">
                                            <input 
                                                type="checkbox" 
                                                defaultChecked={step.settings?.requireAllMembers || false}
                                                className="toggle-switch"
                                            />
                                            <span className="setting-description">
                                                All members must approve
                                            </span>
                                        </div>
                                    </div>
                                    <div className="setting-item">
                                        <label>Require Any Member</label>
                                        <div className="setting-control">
                                            <input 
                                                type="checkbox" 
                                                defaultChecked={step.settings?.requireAnyMember || true}
                                                className="toggle-switch"
                                            />
                                            <span className="setting-description">
                                                Any member can approve
                                            </span>
                                        </div>
                                    </div>
                                    <div className="setting-item">
                                        <label>Max Approvers</label>
                                        <div className="setting-control">
                                            <input 
                                                type="number" 
                                                placeholder="No limit"
                                                defaultValue={step.settings?.maxApprovers || ''}
                                                className="number-input"
                                            />
                                            <span className="setting-description">
                                                Maximum number of approvers needed
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'analytics' && (
                            <div className="analytics-section">
                                <div className="analytics-header">
                                    <h4>Performance Analytics</h4>
                                    <div className="time-range-selector">
                                        <button className="time-btn active">7D</button>
                                        <button className="time-btn">30D</button>
                                        <button className="time-btn">90D</button>
                                    </div>
                                </div>

                                <div className="analytics-grid">
                                    <div className="analytics-card">
                                        <h5>Approval Statistics</h5>
                                        <div className="stats-grid">
                                            <div className="stat-item">
                                                <div className="stat-value">0</div>
                                                <div className="stat-label">Total Approvals</div>
                                            </div>
                                            <div className="stat-item">
                                                <div className="stat-value">0%</div>
                                                <div className="stat-label">Approval Rate</div>
                                            </div>
                                            <div className="stat-item">
                                                <div className="stat-value">0h</div>
                                                <div className="stat-label">Avg. Time</div>
                                            </div>
                                            <div className="stat-item">
                                                <div className="stat-value">0</div>
                                                <div className="stat-label">Escalations</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="analytics-card">
                                        <h5>Member Performance</h5>
                                        <div className="member-stats">
                                            <div className="member-stat">
                                                <div className="member-name">No data available</div>
                                                <div className="member-metrics">
                                                    <span>0 approvals</span>
                                                    <span>0h avg</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="analytics-card">
                                        <h5>Trend Analysis</h5>
                                        <div className="trend-chart">
                                            <div className="chart-placeholder">
                                                <Icon icon="mdi:chart-line" />
                                                <p>Chart will be displayed here</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="analytics-card">
                                        <h5>Bottleneck Analysis</h5>
                                        <div className="bottleneck-info">
                                            <div className="bottleneck-item">
                                                <Icon icon="mdi:clock-outline" />
                                                <span>No bottlenecks detected</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}

export default FlowCard;
