import React, { useState, useEffect } from 'react';
import { useOrgPermissions, useOrgDelete } from './settingsHelpers';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../hooks/useGradient';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import './DangerZone.scss';

const DangerZone = ({ org, expandedClass, adminBypass = false }) => {
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [canManageSettings, setCanManageSettings] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showTransferConfirm, setShowTransferConfirm] = useState(false);
    const [transferCandidates, setTransferCandidates] = useState([]);
    const [loadingTransferCandidates, setLoadingTransferCandidates] = useState(false);
    const [selectedNewOwnerId, setSelectedNewOwnerId] = useState('');
    const [transferringOwnership, setTransferringOwnership] = useState(false);

    const { checkUserPermissions } = useOrgPermissions(org, { adminBypass });
    const { deleteOrganization } = useOrgDelete();
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();

    useEffect(() => {
        if (org && !permissionsChecked) {
            initializePermissions();
        }
    }, [org, permissionsChecked]);

    const initializePermissions = async () => {
        const permissions = await checkUserPermissions();
        setCanManageSettings(permissions.canManageSettings);
        setIsOwner(permissions.isOwner ?? false);
        setHasAccess(permissions.hasAccess);
        setPermissionsChecked(true);
    };

    const handleDeleteOrg = () => {
        if (!isOwner || !org) {
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

    const handleOpenTransferOwnership = async () => {
        if (!isOwner || !org?._id || loadingTransferCandidates) return;

        setShowTransferConfirm(true);
        setSelectedNewOwnerId('');
        setLoadingTransferCandidates(true);
        try {
            const response = await apiRequest(`/org-roles/${org._id}/members`, {}, { method: 'GET' });
            if (response?.success) {
                const currentOwnerId = String(org.owner?._id ?? org.owner ?? '');
                const candidates = (response.members || []).filter((member) => {
                    const userId = String(member?.user_id?._id || '');
                    return userId && userId !== currentOwnerId;
                });
                setTransferCandidates(candidates);
            } else {
                setTransferCandidates([]);
                addNotification({
                    title: 'Unable to load members',
                    message: response?.message || 'Could not load ownership transfer candidates.',
                    type: 'error'
                });
            }
        } catch (error) {
            setTransferCandidates([]);
            addNotification({
                title: 'Unable to load members',
                message: error?.message || 'Could not load ownership transfer candidates.',
                type: 'error'
            });
        } finally {
            setLoadingTransferCandidates(false);
        }
    };

    const handleCloseTransferConfirm = () => {
        if (transferringOwnership) return;
        setShowTransferConfirm(false);
        setSelectedNewOwnerId('');
    };

    const handleTransferOwnership = async () => {
        if (!org?._id || !selectedNewOwnerId || transferringOwnership) return;
        setTransferringOwnership(true);
        try {
            const response = await apiRequest(
                `/org-roles/${org._id}/transfer-ownership/${selectedNewOwnerId}`,
                {},
                { method: 'POST' }
            );
            if (response?.success) {
                addNotification({
                    title: 'Ownership transferred',
                    message: 'Organization ownership was transferred successfully.',
                    type: 'success'
                });
                setShowTransferConfirm(false);
                setSelectedNewOwnerId('');
                setIsOwner(false);
            } else {
                addNotification({
                    title: 'Transfer failed',
                    message: response?.message || response?.error || 'Unable to transfer ownership.',
                    type: 'error'
                });
            }
        } catch (error) {
            addNotification({
                title: 'Transfer failed',
                message: error?.message || 'Unable to transfer ownership.',
                type: 'error'
            });
        } finally {
            setTransferringOwnership(false);
        }
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
                            <h3>
                                <Icon icon="mdi:account-switch" className="danger-item-icon" />
                                Transfer Ownership
                            </h3>
                            <p>Transfer organization ownership to another member. This moves the immutable <code>owner</code> role to the selected member.</p>
                        </div>
                        <button
                            className="transfer-button"
                            onClick={handleOpenTransferOwnership}
                            disabled={!isOwner}
                        >
                            Transfer Ownership
                        </button>
                    </div>
                    <div className="danger-item">
                        <div className="danger-content">
                            <h3>
                                <Icon icon="mdi:delete-alert-outline" className="danger-item-icon" />
                                Delete Organization
                            </h3>
                            <p>Permanently delete this organization and all its data. This action cannot be undone. Only the organization owner can delete the organization.</p>
                        </div>
                        <button 
                            className="delete-button"
                            onClick={handleDeleteOrg}
                            disabled={!isOwner}
                        >
                            Delete Organization
                        </button>
                    </div>
                </div>
            </div>

            <Popup
                isOpen={showTransferConfirm}
                onClose={handleCloseTransferConfirm}
                customClassName="transfer-owner-confirm-popup"
            >
                <div className="transfer-owner-confirm-content">
                    <div className="transfer-owner-header">
                        <Icon icon="mdi:account-switch" className="warning-icon" />
                        <h2>Transfer Ownership</h2>
                    </div>

                    <div className="transfer-owner-warning">
                        <p><strong>Heads up:</strong> this action changes who controls this organization.</p>
                        <p>The selected member becomes the new owner and receives full owner permissions.</p>
                    </div>

                    <div className="transfer-owner-form">
                        <label htmlFor="transferOwnerSelect">Select a new owner</label>
                        <select
                            id="transferOwnerSelect"
                            className="owner-select-input"
                            value={selectedNewOwnerId}
                            onChange={(e) => setSelectedNewOwnerId(e.target.value)}
                            disabled={loadingTransferCandidates || transferringOwnership}
                        >
                            <option value="">Choose a member...</option>
                            {transferCandidates.map((member) => (
                                <option key={member?._id || member?.user_id?._id} value={member?.user_id?._id}>
                                    {member?.user_id?.name || member?.user_id?.username || member?.user_id?.email || 'Unknown user'}
                                    {member?.user_id?.email ? ` (${member.user_id.email})` : ''}
                                </option>
                            ))}
                        </select>
                        {loadingTransferCandidates ? <p className="transfer-owner-loading">Loading members...</p> : null}
                    </div>

                    <div className="transfer-owner-actions">
                        <button
                            className="cancel-btn"
                            onClick={handleCloseTransferConfirm}
                            disabled={transferringOwnership}
                        >
                            Cancel
                        </button>
                        <button
                            className="confirm-btn"
                            onClick={handleTransferOwnership}
                            disabled={transferringOwnership || !selectedNewOwnerId}
                        >
                            {transferringOwnership ? 'Transferring...' : 'Transfer Ownership'}
                        </button>
                    </div>
                </div>
            </Popup>

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