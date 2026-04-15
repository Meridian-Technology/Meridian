import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import postRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import UserSearch from '../../../components/UserSearch/UserSearch';
import NewStakeholderRole from '../../RootDash/ManageFlow/NewStakeholderRole/NewStakeholderRole';
import '../DomainDashboard.scss';
import EditStakeholderRole from './EditStakeholderRole/EditStakeholderRole';

const EMPTY_STAKEHOLDER_ROLES = [];

function activeMemberUserIds(role) {
    return (role?.members || [])
        .filter((m) => m.isActive !== false)
        .map((m) => {
            const id = m.userId?._id || m.userId;
            return id != null ? String(id) : null;
        })
        .filter(Boolean);
}

function DomainStakeholders() {
    const { domainId } = useParams();
    const { addNotification } = useNotification();
    
    const stakeholderRolesData = useFetch(domainId ? `/api/stakeholder-roles/domain/${domainId}` : null);
    const [popupOpen, setPopupOpen] = useState(false);
    const [editPopupOpen, setEditPopupOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [assignRole, setAssignRole] = useState(null);
    const [assignSubmitting, setAssignSubmitting] = useState(false);
    const [loading, setLoading] = useState(false);

    const stakeholderRoles = useMemo(() => {
        const raw = stakeholderRolesData.data?.data;
        return Array.isArray(raw) ? raw : EMPTY_STAKEHOLDER_ROLES;
    }, [stakeholderRolesData.data?.data]);

    useEffect(() => {
        if (!editingRole?._id) return;
        const raw = stakeholderRolesData.data?.data;
        if (!Array.isArray(raw)) return;
        const fresh = raw.find((r) => String(r._id) === String(editingRole._id));
        if (fresh) {
            setEditingRole(fresh);
        }
    }, [stakeholderRolesData.data, editingRole?._id]);

    const closeAssignPopup = useCallback(() => {
        if (!assignSubmitting) setAssignRole(null);
    }, [assignSubmitting]);

    const handleAssignUser = async (user) => {
        if (!assignRole?._id || !user?._id) return;
        setAssignSubmitting(true);
        try {
            const response = await postRequest(
                `/api/stakeholder-roles/${assignRole._id}/assign`,
                { userId: user._id },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Assigned',
                    message: response.message || `${user.name || 'User'} was added to this role.`,
                    type: 'success'
                });
                setAssignRole(null);
                stakeholderRolesData.refetch();
            } else {
                addNotification({
                    title: 'Could not assign',
                    message: response.message || 'The server rejected this assignment.',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Assign stakeholder failed:', error);
            addNotification({
                title: 'Error',
                message: error?.message || 'Failed to assign user.',
                type: 'error'
            });
        } finally {
            setAssignSubmitting(false);
        }
    };

    const handleDeleteStakeholderRole = async (roleId) => {
        if (!window.confirm('Are you sure you want to delete this stakeholder role? This action cannot be undone.')) {
            return;
        }

        try {
            setLoading(true);
            const response = await postRequest(`/api/stakeholder-roles/${roleId}/deactivate`, {}, {
                method: 'POST'
            });
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Stakeholder role deleted successfully',
                    type: 'success'
                });
                stakeholderRolesData.refetch();
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to delete stakeholder role',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error deleting stakeholder role:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to delete stakeholder role',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="domain-stakeholders">
            <Popup onClose={() => setPopupOpen(false)} isOpen={popupOpen} defaultStyling={false}>
                <NewStakeholderRole 
                    handleClose={() => setPopupOpen(false)} 
                    refetch={() => {
                        stakeholderRolesData.refetch();
                    }}
                    defaultDomainId={domainId}
                />
            </Popup>

            <Popup
                onClose={() => {
                    setEditPopupOpen(false);
                    setEditingRole(null);
                }}
                isOpen={editPopupOpen}
                defaultStyling={false}
                customClassName="wide-content"
            >
                {editingRole && (
                    <EditStakeholderRole
                        stakeholderRole={editingRole}
                        domainId={domainId}
                        onClose={() => {
                            setEditPopupOpen(false);
                            setEditingRole(null);
                        }}
                        onSaved={() => stakeholderRolesData.refetch()}
                    />
                )}
            </Popup>

            <Popup
                onClose={closeAssignPopup}
                isOpen={Boolean(assignRole)}
                defaultStyling={false}
                customClassName="narrow-content"
                disableOutsideClick={assignSubmitting}
            >
                {assignRole && (
                    <div className="assign-user-modal">
                        <div className="assign-user-modal__head">
                            <h3>Assign user</h3>
                            <button
                                type="button"
                                className="assign-user-modal__close"
                                onClick={closeAssignPopup}
                                disabled={assignSubmitting}
                                aria-label="Close"
                            >
                                <Icon icon="mdi:close" />
                            </button>
                        </div>
                        <p className="assign-user-modal__hint">
                            Search for a user to add as an active member of{' '}
                            <strong>{assignRole.stakeholderName}</strong>. Users who are already active members are
                            hidden.
                        </p>
                        <UserSearch
                            key={assignRole._id}
                            onUserSelect={handleAssignUser}
                            placeholder="Search by name or email…"
                            excludeIds={activeMemberUserIds(assignRole)}
                            debounceTime={350}
                        />
                        {assignSubmitting && (
                            <p className="assign-user-modal__status">
                                <Icon icon="mdi:loading" className="spinning" /> Assigning…
                            </p>
                        )}
                    </div>
                )}
            </Popup>

            <div className="stakeholders-header">
                <h2>Stakeholder Roles</h2>
                <button 
                    className="create-role-btn"
                    onClick={() => setPopupOpen(true)}
                >
                    <Icon icon="mdi:plus" />
                    Create Stakeholder Role
                </button>
            </div>

            {stakeholderRolesData.loading ? (
                <div className="loading-section">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading stakeholder roles...</span>
                </div>
            ) : stakeholderRoles.length > 0 ? (
                <div className="stakeholder-roles-grid">
                    {stakeholderRoles.map((role) => (
                        <div key={role._id} className="stakeholder-role-card">
                            <div className="role-header">
                                <h3>{role.stakeholderName}</h3>
                                <span className={`role-type-badge ${role.stakeholderType}`}>
                                    <Icon icon={`mdi:${role.stakeholderType === 'approver' ? 'shield-check' : role.stakeholderType === 'acknowledger' ? 'check-circle' : 'bell'}`} />
                                    {role.stakeholderType}
                                </span>
                            </div>
                            <div className="role-content">
                                <p className="role-description">{role.description || 'No description provided'}</p>
                                <div className="role-meta">
                                    <div className="assignee-info">
                                        <Icon icon="mdi:account-multiple" />
                                        <span>{role.members?.filter(m => m.isActive).length || 0} member(s)</span>
                                    </div>
                                </div>
                            </div>
                            <div className="role-actions">
                                <button
                                    type="button"
                                    className="edit-btn"
                                    onClick={() => {
                                        setEditingRole(role);
                                        setEditPopupOpen(true);
                                    }}
                                >
                                    <Icon icon="mdi:pencil" />
                                    Edit Role
                                </button>
                                <button 
                                    type="button"
                                    className="assign-btn"
                                    onClick={() => setAssignRole(role)}
                                >
                                    <Icon icon="mdi:account-plus" />
                                    Assign User
                                </button>
                                <button 
                                    className="delete-btn"
                                    onClick={() => handleDeleteStakeholderRole(role._id)}
                                >
                                    <Icon icon="mdi:delete" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="no-stakeholder-roles">
                    <div className="empty-state">
                        <Icon icon="mdi:account-group" />
                        <h3>No Stakeholder Roles</h3>
                        <p>Create stakeholder roles to manage approvals and notifications for this domain.</p>
                        <button 
                            className="create-role-btn"
                            onClick={() => setPopupOpen(true)}
                        >
                            <Icon icon="mdi:plus" />
                            Create Your First Role
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DomainStakeholders;
