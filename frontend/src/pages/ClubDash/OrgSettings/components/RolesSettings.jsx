import React, { useState, useEffect } from 'react';
import RoleManager from '../../../../components/RoleManager';
import { Icon } from '@iconify-icon/react';
import apiRequest from '../../../../utils/postRequest';
import { useOrgPermissions, useOrgSave } from './settingsHelpers';

const RolesSettings = ({ org, expandedClass, adminBypass = false }) => {
    const [formData, setFormData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        weekly_meeting: '',
        positions: []
    });
    const [originalData, setOriginalData] = useState({
        org_name: '',
        org_description: '',
        org_profile_image: '',
        weekly_meeting: '',
        positions: []
    });
    const [saving, setSaving] = useState(false);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [members, setMembers] = useState([]);

    const { checkUserPermissions } = useOrgPermissions(org, { adminBypass });
    const { saveOrgSettings } = useOrgSave(org);

    useEffect(() => {
        if (org && !permissionsChecked) {
            initializePermissions();
            initializeFormData();
        }
    }, [org, permissionsChecked]);

    useEffect(() => {
        if (!org?._id || !hasAccess) return;
        const fetchMembers = async () => {
            try {
                const response = await apiRequest(`/org-roles/${org._id}/members`, {}, { method: 'GET' });
                if (response?.success) {
                    setMembers(response.members || []);
                }
            } catch (error) {
                console.error('Error fetching role members:', error);
                setMembers([]);
            }
        };
        fetchMembers();
    }, [org?._id, hasAccess]);

    const initializePermissions = async () => {
        const permissions = await checkUserPermissions();
        setCanManageSettings(permissions.canManageSettings);
        setHasAccess(permissions.hasAccess);
        setPermissionsChecked(true);
    };

    const initializeFormData = () => {
        if (org) {
            const initialData = {
                org_name: org.org_name || '',
                org_description: org.org_description || '',
                org_profile_image: org.org_profile_image || '',
                weekly_meeting: org.weekly_meeting || '',
                positions: org.positions || []
            };
            setFormData(initialData);
            setOriginalData(initialData);
        }
    };

    const handleRolesChange = (newRoles) => {
        setFormData(prev => ({
            ...prev,
            positions: newRoles
        }));
    };

    const handleSave = async () => {
        if (!canManageSettings) {
            return;
        }

        setSaving(true);
        try {
            const success = await saveOrgSettings(formData);
            if (success) {
                // Update originalData to match the saved formData
                setOriginalData({ ...formData });
            }
        } finally {
            setSaving(false);
        }
    };

    const handleEnterEditMode = () => {
        if (!canManageSettings) return;
        setIsEditMode(true);
    };

    const handleCancelEdit = () => {
        setFormData(prev => ({
            ...prev,
            positions: originalData.positions
        }));
        setIsEditMode(false);
    };

    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="settings-section">
                    <h2>Roles & Permissions</h2>
                    <div className="permission-warning">
                        <p>You don't have access to this organization's settings.</p>
                        <p>You must be a member with appropriate permissions to view settings.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-section">
            <h2>Roles & Permissions</h2>
            <p>Manage roles and permissions for organization members</p>

            {!canManageSettings && (
                <div className="permission-warning">
                    <p>You don't have permission to manage roles in this organization.</p>
                    <p>Only organization owners and users with role management permissions can modify roles.</p>
                </div>
            )}

            <div className="role-manager-container">
                <RoleManager 
                    roles={formData.positions}
                    onRolesChange={handleRolesChange}
                    isEditable={canManageSettings && isEditMode}
                    members={members}
                />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {canManageSettings && !isEditMode && (
                    <button className="save-button" onClick={handleEnterEditMode}>
                        <Icon icon="mdi:pencil-outline" /> Edit Roles
                    </button>
                )}
                {canManageSettings && isEditMode && (
                    <>
                        <button className="save-button" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button className="save-button" onClick={handleCancelEdit} disabled={saving}>
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default RolesSettings; 