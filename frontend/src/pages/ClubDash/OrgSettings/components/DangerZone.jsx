import React, { useState, useEffect } from 'react';
import { useOrgPermissions, useOrgDelete } from './settingsHelpers';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../hooks/useGradient';
import './DangerZone.scss';

const DangerZone = ({ org, expandedClass }) => {
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const { checkUserPermissions } = useOrgPermissions(org);
    const { deleteOrganization } = useOrgDelete();
    const { AtlasMain } = useGradient();

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

    const handleDeleteOrg = () => {
        if (!canManageSettings || !org) {
            return;
        }
        
        setShowDeleteConfirm(true);
        setDeleteConfirmText('');
    };

    const handleDeleteConfirm = async () => {
        if (!org) return;

        setDeleting(true);
        try {
            await deleteOrganization(org._id, org.org_name, deleteConfirmText);
            // If successful, deleteOrganization will redirect, so we don't need to close modal here
        } catch (error) {
            console.error('Error deleting organization:', error);
        } finally {
            setDeleting(false);
        }
    };

    const handleCloseDeleteConfirm = () => {
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
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
        // Placeholder styling because danger zone is so bearbones right now, not sure if we even want to keep it as a menu option in the future.
        <div className="danger-zone-wrapper">
            <div className={`dash settings-section ${expandedClass}`}>
                <header className="header">
                    <h1>Danger Zone</h1>
                    <p>Irreversible and destructive actions</p>
                    <img src={AtlasMain} alt="" />
                </header>

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

            {/* Delete Confirmation Popup */}
            <Popup
                isOpen={showDeleteConfirm}
                onClose={handleCloseDeleteConfirm}
                customClassName="delete-org-confirm-popup"
            >
                <div className="delete-org-confirm-content">
                    <div className="delete-org-header">
                        <Icon icon="mdi:alert-circle" className="warning-icon" />
                        <h2>Delete Organization</h2>
                    </div>
                    
                    <div className="delete-org-warning">
                        <p><strong>Warning:</strong> This action cannot be undone.</p>
                        <p>This will permanently delete the organization "<strong>{org?.org_name}</strong>" and all of its data forever. This includes:</p>
                        <ul>
                            <li>All members and their roles</li>
                            <li>All events and meetings</li>
                            <li>All announcements and content</li>
                            <li>All organization settings and configurations</li>
                        </ul>
                        <p><strong>This action is permanent and cannot be reversed.</strong></p>
                    </div>

                    <div className="delete-org-form">
                        <label htmlFor="deleteOrgConfirmInput">
                            To confirm deletion, type the organization name: <strong>{org?.org_name}</strong>
                        </label>
                        <input
                            id="deleteOrgConfirmInput"
                            type="text"
                            className="text-input"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type organization name to confirm"
                            autoFocus
                        />
                    </div>

                    <div className="delete-org-actions">
                        <button
                            className="cancel-btn"
                            onClick={handleCloseDeleteConfirm}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                        <button
                            className="delete-btn"
                            onClick={handleDeleteConfirm}
                            disabled={deleting || deleteConfirmText !== org?.org_name}
                        >
                            {deleting ? 'Deleting...' : 'Delete Organization Forever'}
                        </button>
                    </div>
                </div>
            </Popup>
        </div>
    );
};

export default DangerZone; 