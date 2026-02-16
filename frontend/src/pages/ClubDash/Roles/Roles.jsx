import React, { useState, useEffect, useRef } from 'react';
import './Roles.scss';
import RoleManager from '../../../components/RoleManager';
import TabbedContainer from '../../../components/TabbedContainer';
import EventJobs from './EventJobs/EventJobs';
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
    const [userRoleData, setUserRoleData] = useState(null);
    const [isOwner, setIsOwner] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [hasDraftRole, setHasDraftRole] = useState(false);
    const {AtlasMain} = useGradient();
    const roleManagerRef = useRef(null);

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
            const isOwner = String(org.owner) === String(user._id);
            
            if (isOwner) {
                setUserRole('owner');
                setIsOwner(true);
                setUserRoleData(org.positions?.find(r => r.name === 'owner') || null);
                setCanManageRoles(true);
                setHasAccess(true);
                setPermissionsChecked(true);
                setLoading(false);
                return;
            }

            // Get user's role in this organization
            const membersResponse = await apiRequest(`/org-roles/${org._id}/members`, {}, {
                method: 'GET'
            });

            if (!membersResponse.success) {
                console.error('Failed to fetch user membership:', membersResponse.message);
                setHasAccess(false);
                setCanManageRoles(false);
                return;
            }

            const userIdStr = String(user._id);
            const userMember = membersResponse.members.find(member => {
                const memberId = member.user_id?._id ?? member.user_id;
                return memberId && String(memberId) === userIdStr;
            });

            if (!userMember) {
                setHasAccess(false);
                setCanManageRoles(false);
                return;
            }

            setUserRole(userMember.role);
            const roleData = org.positions?.find(role => role.name === userMember.role);
            setUserRoleData(roleData || null);
            setHasAccess(true);

            // Use backend as source of truth for role management permission
            const permResponse = await apiRequest(`/org-roles/${org._id}/can-manage-roles`, {}, {
                method: 'GET'
            });
            if (permResponse?.success && permResponse?.canManageRoles === true) {
                setCanManageRoles(true);
            } else if (permResponse?.code === 403) {
                setCanManageRoles(false);
            } else {
                // Network error or other - fallback to local check
                const canManage = roleData && (
                    roleData.canManageRoles ||
                    (roleData.permissions && (roleData.permissions.includes('manage_roles') || roleData.permissions.includes('all')))
                );
                setCanManageRoles(!!canManage);
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
            let rolesToSave = roles;
            if (hasDraftRole) {
                const draftResult = roleManagerRef.current?.createDraftRole?.();
                if (!draftResult?.success) {
                    const message = draftResult?.reason === 'duplicate'
                        ? 'A role with this name already exists'
                        : 'Role name is required';
                    addNotification({
                        title: 'Error',
                        message,
                        type: 'error'
                    });
                    return false;
                }
                rolesToSave = draftResult.roles;
                setRoles(rolesToSave);
                setHasDraftRole(false);
            }

            // Update roles on the backend
            const response = await apiRequest(`/org-roles/${org._id}/roles`, {
                positions: rolesToSave
            }, {
                method: 'PUT'
            });

            if (response.success) {
                setOriginalRoles(JSON.parse(JSON.stringify(rolesToSave))); // Deep copy
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
        setHasDraftRole(false);
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

    // Normalize roles for comparison - only compare relevant fields to avoid false positives from
    // structural differences (key order, _id format, etc.)
    const normalizeRoleForComparison = (role) => ({
        name: role?.name,
        displayName: role?.displayName ?? role?.name,
        permissions: [...(role?.permissions || [])].sort(),
        color: role?.color || null,
        order: role?.order ?? 0,
        canManageMembers: !!role?.canManageMembers,
        canManageRoles: !!role?.canManageRoles,
        canManageEvents: !!role?.canManageEvents,
        canViewAnalytics: !!role?.canViewAnalytics,
        isDefault: !!role?.isDefault
    });
    const rolesEqual = (a, b) => {
        if (a.length !== b.length) return false;
        return a.every((r, i) => {
            const na = normalizeRoleForComparison(r);
            const nb = normalizeRoleForComparison(b[i]);
            return JSON.stringify(na) === JSON.stringify(nb);
        });
    };

    // Check if there are unsaved changes
    const hasChanges = !rolesEqual(roles, originalRoles) || hasDraftRole;

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

    const tabs = [
        {
            id: 'org-roles',
            label: 'Org Roles',
            icon: 'mdi:shield-account',
            content: (
                <>
                    <UnsavedChangesBanner
                        hasChanges={hasChanges}
                        onSave={handleSave}
                        onDiscard={handleDiscard}
                        saving={saving}
                    />

                    {!canManageRoles && (
                        <div className="permission-warning">
                            <p>You don't have permission to manage roles in this organization.</p>
                            <p>Only organization owners and users with role management permissions can modify roles.</p>
                        </div>
                    )}

                    <div className="role-manager-container">
                        <RoleManager
                            ref={roleManagerRef}
                            roles={roles}
                            onRolesChange={handleRolesChange}
                            onDeleteRequest={handleDeleteRequest}
                            isEditable={canManageRoles}
                            saveImmediately={false}
                            onDraftChange={setHasDraftRole}
                            userRoleData={userRoleData}
                            isOwner={isOwner}
                        />
                    </div>
                </>
            )
        },
        {
            id: 'event-jobs',
            label: 'Job Templates',
            icon: 'mdi:briefcase',
            content: (
                <div className="role-manager-container">
                    <EventJobs org={org} canManageRoles={canManageRoles} />
                </div>
            )
        }
    ];

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="roles">
                <header className="header">
                    <h1>Roles & Permissions</h1>
                    <p>Manage roles, permissions, and event jobs for {org.org_name}</p>
                    <img src={AtlasMain} alt="" />
                </header>

                <TabbedContainer
                    tabs={tabs}
                    defaultTab="org-roles"
                    tabStyle="default"
                    size="medium"
                    animated={true}
                    showTabIcons={true}
                    showTabLabels={true}
                    fullWidth={false}
                    scrollable={false}
                    lazyLoad={true}
                    keepAlive={true}
                    className="roles-tabs"
                />
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
