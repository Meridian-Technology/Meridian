import React, { useState, useEffect } from 'react';
import './MemberManagement.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../NotificationContext';
import { useFetch } from '../../../../hooks/useFetch';
import { UserSearch, SelectedUsers } from '../../../../components/UserSearch';
import postRequest from '../../../../utils/postRequest';
import TabbedContainer, { CommonTabConfigs } from '../TabbedContainer';

function MemberManagementExample({ group, onBack, onSave }) {
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [newOwner, setNewOwner] = useState(null);
    const [saving, setSaving] = useState(false);
    const { addNotification } = useNotification();

    // Fetch members data
    const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useFetch(
        group ? `/org-roles/${group._id}/members` : null
    );

    const members = membersData?.members || [];
    const applications = membersData?.applications || [];
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
            onSave();
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
                onSave();
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
            onSave();
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

    // Define tab configurations using the new TabbedContainer
    const tabs = [
        CommonTabConfigs.withBadge(
            'members',
            'Current Members',
            'mdi:account-group',
            <div className="members-tab">
                <div className="members-list">
                    <h3>Current Members ({members.length})</h3>
                    {membersLoading ? (
                        <div className="loading">Loading members...</div>
                    ) : members.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:account-group" />
                            <p>No members found</p>
                        </div>
                    ) : (
                        <div className="members-grid">
                            {members.map((member) => (
                                <div key={member._id} className="member-card">
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
            </div>,
            members.length.toString(),
            'info'
        ),

        CommonTabConfigs.basic(
            'add',
            'Add Members',
            'mdi:account-plus',
            <div className="add-members-tab">
                <div className="form-section">
                    <h3>Add New Members</h3>
                    <div className="user-search">
                        <UserSearch
                            onUserSelect={handleUserSelect}
                            placeholder="Search for users to add as members"
                            excludeIds={members.map(m => m.user_id._id)}
                        />
                    </div>
                    
                    {selectedUsers.length > 0 && (
                        <div className="selected-users">
                            <h4>Selected Users ({selectedUsers.length})</h4>
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
            </div>
        ),

        CommonTabConfigs.basic(
            'owner',
            'Designate Owner',
            'mdi:crown',
            <div className="designate-owner-tab">
                <div className="form-section">
                    <h3>Designate New Owner</h3>
                    <div className="current-owner">
                        <h4>Current Owner</h4>
                        <div className="owner-info">
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
                    </div>
                    
                    <div className="new-owner-selection">
                        <h4>Select New Owner</h4>
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
            </div>
        )
    ];

    // Custom header component
    const header = (
        <div className="management-header">
            <button className="back-btn" onClick={onBack}>
                <Icon icon="mdi:arrow-left" />
                Back to Overview
            </button>
            <div className="header-content">
                <h1>{group?.org_name} - Member Management</h1>
                <p>Manage members and designate owners for this approval group</p>
            </div>
        </div>
    );

    return (
        <div className="member-management">
            <TabbedContainer
                tabs={tabs}
                defaultTab="members"
                tabStyle="default"
                size="medium"
                animated={true}
                showTabIcons={true}
                showTabLabels={true}
                scrollable={true}
                fullWidth={false}
                className="member-management-tabs"
                header={header}
                onTabChange={(tabId) => {
                    console.log('Member management tab changed to:', tabId);
                }}
            />
        </div>
    );
}

export default MemberManagementExample;





