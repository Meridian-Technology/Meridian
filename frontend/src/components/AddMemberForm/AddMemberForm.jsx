import React, { useState, useEffect } from 'react';
import './AddMemberForm.scss';
import { Icon } from '@iconify-icon/react';
import apiRequest from '../../utils/postRequest';
import UserSearch from '../UserSearch/UserSearch';

function AddMemberForm({ 
    orgId,
    roles = [],
    existingMembers = [],
    onMemberAdded,
    onClose,
    addNotification
}) {
    const [form, setForm] = useState({
        email: '',
        role: 'member',
        message: ''
    });
    const [selectedUser, setSelectedUser] = useState(null);

    const handleUserSelect = (user) => {
        setSelectedUser(user);
        setForm(prev => ({ ...prev, email: user.email }));
    };

    const handleAddMember = async () => {
        if (!selectedUser) {
            addNotification({
                title: 'Error',
                message: 'Please select a user to add',
                type: 'error'
            });
            return;
        }

        try {
            const response = await apiRequest(`/org-roles/${orgId}/members/${selectedUser._id}/role`, {
                role: form.role,
                reason: form.message || 'Added by organization admin'
            }, {
                method: 'POST'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Member added successfully',
                    type: 'success'
                });
                
                // Call the callback to refresh the member list
                if (onMemberAdded) {
                    onMemberAdded();
                }
                
                handleClose();
            }
        } catch (error) {
            console.error('Error adding member:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to add member',
                type: 'error'
            });
        }
    };

    const handleClose = () => {
        setForm({
            email: '',
            role: 'member',
            message: ''
        });
        setSelectedUser(null);
        if (onClose) {
            onClose();
        }
    };

    const getRoleDisplayName = (roleName) => {
        const role = roles.find(r => r.name === roleName);
        return role ? role.displayName : roleName;
    };

    // Get existing member IDs for exclusion
    const existingMemberIds = existingMembers.map(member => {
        return member.user_id?._id || member.user_id;
    }).filter(Boolean);

    return (
        <div className="add-member-form">
            <div className="form-header">
                <h3>Add New Member</h3>
                <p>Invite a user to join your organization</p>
            </div>

            <div className="form-content">
                <div className="form-group">
                    <label htmlFor="user-search">Search Users</label>
                    <UserSearch
                        onUserSelect={handleUserSelect}
                        placeholder="Search by name or email..."
                        excludeIds={existingMemberIds}
                        limit={10}
                        className="user-search-field"
                    />
                    <small>Search for users to add to your organization</small>
                </div>

                {selectedUser && (
                    <>
                        <div className="selected-user-summary">
                            <h4>Selected User:</h4>
                            <div className="selected-user">
                                <div className="user-avatar">
                                    {selectedUser.picture ? (
                                        <img src={selectedUser.picture} alt={selectedUser.name} />
                                    ) : (
                                        <div className="avatar-placeholder">
                                            {selectedUser.name?.charAt(0) || 'U'}
                                        </div>
                                    )}
                                </div>
                                <div className="user-info">
                                    <h5>{selectedUser.name}</h5>
                                    <p>@{selectedUser.username}</p>
                                    <p className="email">{selectedUser.email}</p>
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="role">Assign Role</label>
                            <select
                                id="role"
                                value={form.role}
                                onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                            >
                                {roles.map(role => (
                                    <option key={role.name} value={role.name}>
                                        {role.displayName}
                                    </option>
                                ))}
                            </select>
                            <small>Choose the role for this member</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="message">Welcome Message (Optional)</label>
                            <textarea
                                id="message"
                                placeholder="Add a personal message for the new member..."
                                value={form.message}
                                onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
                                rows="3"
                            />
                            <small>This message will be included in the role assignment</small>
                        </div>
                    </>
                )}
            </div>

            <div className="form-actions">
                <button className="cancel-btn" onClick={handleClose}>
                    Cancel
                </button>
                <button 
                    className="add-btn" 
                    onClick={handleAddMember}
                    disabled={!selectedUser}
                >
                    Add Member
                </button>
            </div>
        </div>
    );
}

export default AddMemberForm;