import React, { useState, useEffect } from 'react';
import { useOrgPermissions, useOrgDelete } from './settingsHelpers';

const DangerZone = ({ org, expandedClass }) => {
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);

    const { checkUserPermissions } = useOrgPermissions(org);
    const { deleteOrganization } = useOrgDelete();

    useEffect(() => {
        if (org && !permissionsChecked) {
            initializePermissions();
        }
    }, [org, permissionsChecked]);

    const initializePermissions = async () => {
        const permissions = await checkUserPermissions();
        setCanManageSettings(permissions.canManageSettings);
        setHasAccess(permissions.hasAccess);
        setPermissionsChecked(true);
    };

    const handleDeleteOrg = async () => {
        if (!canManageSettings || !org) {
            return;
        }
        
        await deleteOrganization(org._id);
    };

    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="settings-section">
                    <h2>Danger Zone</h2>
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
            <h2>Danger Zone</h2>
            <p>Irreversible and destructive actions</p>

            <div className="danger-zone">
                <div className="danger-item">
                    <div className="danger-content">
                        <h3>Delete Organization</h3>
                        <p>Permanently delete this organization and all its data. This action cannot be undone.</p>
                    </div>
                    <button 
                        className="delete-button"
                        onClick={handleDeleteOrg}
                        disabled={!canManageSettings}
                    >
                        Delete Organization
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DangerZone; 