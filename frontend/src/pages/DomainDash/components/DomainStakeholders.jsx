import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import postRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import NewStakeholderRole from '../../RootDash/ManageFlow/NewStakeholderRole/NewStakeholderRole';
import '../DomainDashboard.scss';

function DomainStakeholders() {
    const { domainId } = useParams();
    const { addNotification } = useNotification();
    
    const stakeholderRolesData = useFetch(`/api/stakeholder-roles/domain/${domainId}`);
    const [popupOpen, setPopupOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const stakeholderRoles = stakeholderRolesData.data?.data || [];

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
                    domainId={domainId}
                />
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
                                    className="edit-btn"
                                    onClick={() => {
                                        addNotification({
                                            title: 'Feature Coming Soon',
                                            message: 'Stakeholder role editing will be available soon',
                                            type: 'info'
                                        });
                                    }}
                                >
                                    <Icon icon="mdi:pencil" />
                                    Edit Role
                                </button>
                                <button 
                                    className="assign-btn"
                                    onClick={() => {
                                        addNotification({
                                            title: 'Feature Coming Soon',
                                            message: 'User assignment will be available soon',
                                            type: 'info'
                                        });
                                    }}
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
