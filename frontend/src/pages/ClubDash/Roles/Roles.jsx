import React, { useState, useEffect } from 'react';
import './Roles.scss';
import RoleManager from '../../../components/RoleManager';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import axios from 'axios';
import apiRequest from '../../../utils/postRequest';
import { useGradient } from '../../../hooks/useGradient';

function Roles({ expandedClass, org, refetch }) {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [canManageRoles, setCanManageRoles] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const {AtlasMain} = useGradient();

    useEffect(() => {
        if (org && !permissionsChecked) {
            setRoles(org.positions || []);
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

    const handleRolesChange = async (newRoles) => {
        if (!canManageRoles) {
            addNotification({
                title: 'Error',
                message: 'You don\'t have permission to manage roles',
                type: 'error'
            });
            return;
        }

        try {
            // Update roles on the backend
            const response = await apiRequest(`/org-roles/${org._id}/roles`, {
                positions: newRoles
            }, {
                method: 'PUT'
            });

            if (response.success) {
                setRoles(newRoles);
                addNotification({
                    title: 'Success',
                    message: 'Roles updated successfully',
                    type: 'success'
                });
                refetch();
            }
        } catch (error) {
            console.error('Error updating roles:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to update roles',
                type: 'error'
            });
        }
    };

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

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="roles">
                <header className="header">
                    <h1>Role Management</h1>
                    <p>Manage roles and permissions for {org.org_name}</p>
                    <img src={AtlasMain} alt="" />
                </header>

                {/* User Role Information */}
                {/* <div className="user-role-info">
                    <p>Your role: <span className="role-badge">{userRole}</span></p>
                </div> */}

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
                        isEditable={canManageRoles}
                    />
                </div>
            </div>
        </div>
    );
}

export default Roles; 