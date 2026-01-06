import React, { useState, useEffect } from 'react';
import RoleManager from '../../../../components/RoleManager';
import { useOrgPermissions, useOrgSave } from './settingsHelpers';

const RolesSettings = ({ org, expandedClass }) => {
    const [formData, setFormData] = useState({
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

    const { checkUserPermissions } = useOrgPermissions(org);
    const { saveOrgSettings } = useOrgSave(org);

    useEffect(() => {
        if (org && !permissionsChecked) {
            initializePermissions();
            initializeFormData();
        }
    }, [org, permissionsChecked]);

    const initializePermissions = async () => {
        const permissions = await checkUserPermissions();
        setCanManageSettings(permissions.canManageSettings);
        setHasAccess(permissions.hasAccess);
        setPermissionsChecked(true);
    };

    const initializeFormData = () => {
        if (org) {
            setFormData({
                org_name: org.org_name || '',
                org_description: org.org_description || '',
                org_profile_image: org.org_profile_image || '',
                weekly_meeting: org.weekly_meeting || '',
                positions: org.positions || []
            });
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
                // Optionally refresh the org data or update local state
                initializeFormData();
            }
        } finally {
            setSaving(false);
        }
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
                    isEditable={canManageSettings}
                />
            </div>

            {canManageSettings && (
                <button 
                    className="save-button" 
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            )}
        </div>
    );
};

export default RolesSettings; 