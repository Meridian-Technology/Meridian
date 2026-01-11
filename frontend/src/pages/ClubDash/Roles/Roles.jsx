import React, { useState, useEffect } from 'react';
import './Roles.scss';
import RoleManager from '../../../components/RoleManager';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import axios from 'axios';
import apiRequest from '../../../utils/postRequest';
import { useGradient } from '../../../hooks/useGradient';
import UnsavedChangesBanner from '../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import Popup from '../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';

function Roles({ expandedClass, org, refetch }) {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [roles, setRoles] = useState([]);
    const [originalRoles, setOriginalRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [canManageRoles, setCanManageRoles] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const {AtlasMain} = useGradient();

    useEffect(() => {
        if (org && !permissionsChecked) {
            const orgRoles = org.positions || [];
            setRoles(orgRoles);
            setOriginalRoles(JSON.parse(JSON.stringify(orgRoles))); // Deep copy
            checkUserPermissions();
        }
    }, [org, user, permissionsChecked]);

    const checkUserPermissions = async () => {
        if (!org || !user || permissionsChecked) return;

        try {
            // Check if user is the owner
            const isOwner = org.owner === user._id;
            
            if (isOwner) {
                setUserRole('owner');
                setCanManageRoles(true);
                setHasAccess(true);
                setPermissionsChecked(true);
                setLoading(false);
                return;
            }

            // Get user's role in this organization
            const response = await apiRequest(`/org-roles/${org._id}/members`, {}, {
                method: 'GET'
            });

            if (response.success) {
                const userMember = response.members.find(member => 
                    member.user_id._id === user._id
                );

                if (userMember) {
                    setUserRole(userMember.role);
                    
                    // Check if user's role has permission to manage roles
                    const userRoleData = org.positions.find(role => role.name === userMember.role);
                    
                    if (userRoleData) {
                        const canManage = userRoleData.canManageRoles || userRoleData.permissions.includes('manage_roles') || userRoleData.permissions.includes('all');
                        setCanManageRoles(canManage);
                        setHasAccess(true);
                    } else {
                        setCanManageRoles(false);
                        setHasAccess(true);
                    }
                } else {
                    // User is not a member of this organization
                    setHasAccess(false);
                    setCanManageRoles(false);
                }
            } else {
                console.error('Failed to fetch user membership:', response.message);
                setHasAccess(false);
                setCanManageRoles(false);
            }
        } catch (error) {
            console.error('Error checking user permissions:', error);
            setHasAccess(false);
            setCanManageRoles(false);
        } finally {
            setPermissionsChecked(true);
            setLoading(false);
        }
    };

    const handleRolesChange = (newRoles) => {
        // Just update local state, don't save yet
        setRoles(newRoles);
    };

    const handleSave = async () => {
        if (!canManageRoles) {
            addNotification({
                title: 'Error',
                message: 'You don\'t have permission to manage roles',
                type: 'error'
            });
            return false;
        }

        setSaving(true);
        try {
            // Update roles on the backend
            const response = await apiRequest(`/org-roles/${org._id}/roles`, {
                positions: roles
            }, {
                method: 'PUT'
            });

            if (response.success) {
                setOriginalRoles(JSON.parse(JSON.stringify(roles))); // Deep copy
                addNotification({
                    title: 'Success',
                    message: 'Roles updated successfully',
                    type: 'success'
                });
                refetch();
                return true;
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to update roles',
                    type: 'error'
                });
                return false;
            }
        } catch (error) {
            console.error('Error updating roles:', error);
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update roles',
                type: 'error'
            });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setRoles(JSON.parse(JSON.stringify(originalRoles))); // Deep copy
        setShowDeleteConfirm(false);
        setRoleToDelete(null);
        setDeleteConfirmText('');
    };

    const handleDeleteRequest = (roleName) => {
        if (roleName === 'owner' || roleName === 'member') {
            addNotification({
                title: 'Error',
                message: 'Cannot delete default roles',
                type: 'error'
            });
            return;
        }
        setRoleToDelete(roleName);
        setShowDeleteConfirm(true);
        setDeleteConfirmText('');
    };

    const handleDeleteConfirm = async () => {
        if (!roleToDelete) return;

        const role = roles.find(r => r.name === roleToDelete);
        if (!role) return;

        // Check if user typed the correct role name
        if (deleteConfirmText !== roleToDelete && deleteConfirmText !== role.displayName) {
            addNotification({
                title: 'Error',
                message: 'Role name does not match. Please type the exact role name to confirm deletion.',
                type: 'error'
            });
            return;
        }

        setSaving(true);
        try {
            // Delete role from backend - encode role name for URL safety
            const encodedRoleName = encodeURIComponent(roleToDelete);
            const response = await apiRequest(`/org-roles/${org._id}/roles/${encodedRoleName}`, {}, {
                method: 'DELETE'
            });

            // Check for error response format
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error || 'Failed to delete role',
                    type: 'error'
                });
                return;
            }

            if (response.success) {
                // Remove role from local state
                const updatedRoles = roles.filter(r => r.name !== roleToDelete);
                // Reorder remaining roles (excluding owner and member)
                let orderCounter = 0;
                updatedRoles.forEach((r) => {
                    if (r.name !== 'owner' && r.name !== 'member') {
                        r.order = orderCounter++;
                    }
                });
                setRoles(updatedRoles);
                setOriginalRoles(JSON.parse(JSON.stringify(updatedRoles))); // Deep copy
                
                addNotification({
                    title: 'Success',
                    message: `Role "${role.displayName || role.name}" deleted successfully. All members with this role have been reassigned to the member role.`,
                    type: 'success'
                });
                
                setShowDeleteConfirm(false);
                setRoleToDelete(null);
                setDeleteConfirmText('');
                refetch();
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to delete role',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            addNotification({
                title: 'Error',
                message: error.message || error.error || 'Failed to delete role',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    // Check if there are unsaved changes
    const hasChanges = JSON.stringify(roles) !== JSON.stringify(originalRoles);

    // Prevent navigation when there are unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    if (loading) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="roles loading">
                    <div className="loader">Loading roles...</div>
                </div>
            </div>
        );
    }

    // If user doesn't have access to this organization
    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="roles">
                    <header className="header">
                        <h1>Role Management</h1>
                        <p>Manage roles and permissions for {org.org_name}</p>
                        <img src={AtlasMain} alt="" />
                    </header>

                    <div className="permission-warning">
                        <p>You don't have access to this organization's role management.</p>
                        <p>You must be a member of this organization to view role information.</p>
                    </div>
                </div>
            </div>
        );
    }

    const roleToDeleteData = roleToDelete ? roles.find(r => r.name === roleToDelete) : null;

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="roles">
                <UnsavedChangesBanner
                    hasChanges={hasChanges}
                    onSave={handleSave}
                    onDiscard={handleDiscard}
                    saving={saving}
                />
                
                <header className="header">
                    <h1>Role Management</h1>
                    <p>Manage roles and permissions for {org.org_name}</p>
                    <img src={AtlasMain} alt="" />
                </header>

                {!canManageRoles && (
                    <div className="permission-warning">
                        <p>You don't have permission to manage roles in this organization.</p>
                        <p>Only organization owners and users with role management permissions can modify roles.</p>
                    </div>
                )}

                <div className="role-manager-container">
                    <RoleManager 
                        roles={roles}
                        onRolesChange={handleRolesChange}
                        onDeleteRequest={handleDeleteRequest}
                        isEditable={canManageRoles}
                        saveImmediately={false}
                    />
                </div>
            </div>

            {/* Delete Confirmation Popup */}
            <Popup
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false);
                    setRoleToDelete(null);
                    setDeleteConfirmText('');
                }}
                customClassName="delete-role-confirm-popup"
            >
                <div className="delete-role-confirm-content">
                    <div className="delete-role-header">
                        <Icon icon="mdi:alert-circle" className="warning-icon" />
                        <h2>Delete Role</h2>
                    </div>
                    
                    <div className="delete-role-warning">
                        <p><strong>Warning:</strong> This action cannot be undone.</p>
                        <p>All members with the role "<strong>{roleToDeleteData?.displayName || roleToDelete}</strong>" will be reassigned to the "Member" role.</p>
                    </div>

                    <div className="delete-role-form">
                        <label htmlFor="deleteConfirmInput">
                            To confirm deletion, type the role name: <strong>{roleToDeleteData?.displayName || roleToDelete}</strong>
                        </label>
                        <input
                            id="deleteConfirmInput"
                            type="text"
                            className="text-input"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type role name to confirm"
                            autoFocus
                        />
                    </div>

                    <div className="delete-role-actions">
                        <button
                            className="cancel-btn"
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setRoleToDelete(null);
                                setDeleteConfirmText('');
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            className="delete-btn"
                            onClick={handleDeleteConfirm}
                            disabled={saving || (deleteConfirmText !== roleToDelete && deleteConfirmText !== roleToDeleteData?.displayName)}
                        >
                            {saving ? 'Deleting...' : 'Delete Role'}
                        </button>
                    </div>
                </div>
            </Popup>
        </div>
    );
}

export default Roles;
