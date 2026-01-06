import React, { useState, useEffect } from 'react';
import './Testing.scss';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import apiRequest from '../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';

function Testing({ expandedClass, org }) {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [formData, setFormData] = useState({
        username: '',
        role: 'member'
    });

    useEffect(() => {
        if (org && org.positions) {
            setAvailableRoles(org.positions);
        }
    }, [org]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        
        if (!formData.username.trim()) {
            addNotification({
                title: 'Error',
                message: 'Please enter a username',
                type: 'error'
            });
            return;
        }

        setLoading(true);
        try {
            // First, get the user by username
            const userResponse = await apiRequest('/get-user-by-username', {
                username: formData.username
            }, {
                method: 'POST'
            });

            if (userResponse.error || !userResponse.user) {
                addNotification({
                    title: 'Error',
                    message: userResponse.error || 'User not found',
                    type: 'error'
                });
                return;
            }

            // Add user to organization with the specified role
            const addResponse = await apiRequest(`/org-roles/${org._id}/members/${userResponse.user._id}/role`, {
                role: formData.role,
                reason: 'Development testing - added by admin'
            }, {
                method: 'POST'
            });

            if (addResponse.success) {
                addNotification({
                    title: 'Success',
                    message: `User ${formData.username} added to organization with role: ${formData.role}`,
                    type: 'success'
                });
                setFormData({
                    username: '',
                    role: 'member'
                });
            } else {
                addNotification({
                    title: 'Error',
                    message: addResponse.message || 'Failed to add user to organization',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error adding user:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to add user to organization',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    if (!org) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="testing loading">
                    <div className="loader">Loading testing panel...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="testing">
                <div className="header">
                    <h1>Development Testing Panel</h1>
                    <p>Add users to organization for testing purposes</p>
                    <div className="warning">
                        <Icon icon="mdi:alert" />
                        <span>This panel is for development testing only</span>
                    </div>
                </div>

                <div className="testing-form">
                    <form onSubmit={handleAddUser}>
                        <div className="form-group">
                            <label htmlFor="username">Username</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                value={formData.username}
                                onChange={handleInputChange}
                                placeholder="Enter username to add"
                                required
                            />
                            <small>Enter the username of the user you want to add</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="role">Role</label>
                            <select
                                id="role"
                                name="role"
                                value={formData.role}
                                onChange={handleInputChange}
                                required
                            >
                                {availableRoles.map(role => (
                                    <option key={role.name} value={role.name}>
                                        {role.displayName} ({role.name})
                                    </option>
                                ))}
                            </select>
                            <small>Select the role to assign to the user</small>
                        </div>

                        <button 
                            type="submit" 
                            className="add-user-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinning" />
                                    Adding User...
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:account-plus" />
                                    Add User to Organization
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="testing-info">
                    <h3>How to Test:</h3>
                    <ol>
                        <li>Add a user to the organization using this form</li>
                        <li>Log out and log in as that user</li>
                        <li>Navigate to the organization's ClubDash</li>
                        <li>Test the permissions based on their assigned role</li>
                        <li>Try accessing different panels and features</li>
                    </ol>

                    <div className="role-info">
                        <h4>Available Roles:</h4>
                        <div className="roles-list">
                            {availableRoles.map(role => (
                                <div key={role.name} className="role-item">
                                    <strong>{role.displayName}</strong>
                                    <span className="role-name">({role.name})</span>
                                    <div className="permissions">
                                        {role.permissions.length > 0 ? (
                                            role.permissions.map(permission => (
                                                <span key={permission} className="permission-tag">
                                                    {permission}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="no-permissions">No special permissions</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Testing; 