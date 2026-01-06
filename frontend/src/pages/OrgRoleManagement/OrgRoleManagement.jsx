import React, { useState, useEffect } from 'react';
import './OrgRoleManagement.scss';
import RoleManager from '../../components/RoleManager';
import { useParams } from 'react-router-dom';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import axios from 'axios';

const OrgRoleManagement = () => {
    const { orgId } = useParams();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [org, setOrg] = useState(null);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [canManageRoles, setCanManageRoles] = useState(false);

    useEffect(() => {
        fetchOrgData();
    }, [orgId]);

    const fetchOrgData = async () => {
        try {
            setLoading(true);
            
            // Fetch organization details
            const orgResponse = await axios.get(`/get-org/${orgId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
            });
            
            if (orgResponse.data.success) {
                const orgData = orgResponse.data.org[0]; // Assuming it returns an array
                setOrg(orgData);
                setRoles(orgData.positions || []);
                
                // Check if user can manage roles
                const isOwner = orgData.owner === user._id;
                const hasRoleManagement = orgData.positions?.some(role => 
                    role.name === 'owner' || 
                    (role.canManageRoles && orgData.positions.some(pos => 
                        pos.name === user.roles?.find(r => r === 'admin')
                    ))
                );
                
                setCanManageRoles(isOwner || hasRoleManagement);
            }
        } catch (error) {
            console.error('Error fetching org data:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to load organization data',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRolesChange = async (newRoles) => {
        try {
            // Update roles on the backend
            const response = await axios.put(`/org-roles/${orgId}/roles`, {
                positions: newRoles
            }, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
            });

            if (response.data.success) {
                setRoles(newRoles);
                addNotification({
                    title: 'Success',
                    message: 'Roles updated successfully',
                    type: 'success'
                });
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
            <div className="org-role-management loading">
                <div className="loader">Loading...</div>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="org-role-management error">
                <h2>Organization not found</h2>
                <p>The organization you're looking for doesn't exist or you don't have access to it.</p>
            </div>
        );
    }

    return (
        <div className="org-role-management">
            <div className="header">
                <h1>Role Management</h1>
                <h2>{org.org_name}</h2>
                <p>Manage roles and permissions for your organization members</p>
            </div>

            {!canManageRoles && (
                <div className="permission-warning">
                    <p>You don't have permission to manage roles in this organization.</p>
                </div>
            )}

            <RoleManager 
                roles={roles}
                onRolesChange={handleRolesChange}
                isEditable={canManageRoles}
            />
        </div>
    );
};

export default OrgRoleManagement; 