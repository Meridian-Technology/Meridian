import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import './EventJobs.scss';

function EventJobs({ org, canManageRoles = false }) {
    const { addNotification } = useNotification();
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });

    const { data: rolesData, loading: rolesLoading, refetch } = useFetch(
        org?._id ? `/org-event-management/${org._id}/event-roles` : null
    );

    useEffect(() => {
        if (rolesData?.success) {
            setRoles(rolesData.data.roles || []);
        }
    }, [rolesData]);

    useEffect(() => {
        if (!selectedRole && roles.length > 0) {
            handleRoleSelect(roles[0]);
        }
    }, [roles]);

    const handleRoleSelect = (role) => {
        setSelectedRole(role);
        setFormData({
            name: role.name || '',
            description: role.description || ''
        });
    };

    const handleNewRole = () => {
        if (!canManageRoles) {
            return;
        }
        setSelectedRole({ isNew: true });
        setFormData({ name: '', description: '' });
    };

    const handleSaveRole = async () => {
        if (!org?._id || !canManageRoles) return;

        try {
            const isEditing = Boolean(selectedRole?._id);
            const endpoint = isEditing
                ? `/org-event-management/${org._id}/event-roles/${selectedRole._id}`
                : `/org-event-management/${org._id}/event-roles`;
            const method = isEditing ? 'PUT' : 'POST';

            const response = await apiRequest(
                endpoint,
                {
                    name: formData.name,
                    description: formData.description
                },
                { method }
            );

            if (!response.success) {
                throw new Error(response.message || 'Failed to save job');
            }

            setSelectedRole(null);
            if (refetch) {
                refetch();
            }
            addNotification({
                title: 'Success',
                message: `Event job ${isEditing ? 'updated' : 'created'} successfully`,
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save job',
                type: 'error'
            });
        }
    };

    const handleDeleteRole = async (roleId) => {
        if (!org?._id || !canManageRoles) return;
        if (!window.confirm('Delete this job? Existing event assignments will keep their role names.')) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${org._id}/event-roles/${roleId}`,
                {},
                { method: 'DELETE' }
            );

            if (!response.success) {
                throw new Error(response.message || 'Failed to delete job');
            }

            if (refetch) {
                refetch();
            }
            setSelectedRole(null);
            addNotification({
                title: 'Success',
                message: 'Event job deleted successfully',
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete job',
                type: 'error'
            });
        }
    };

    if (rolesLoading) {
        return (
            <div className="event-jobs loading">
                <div className="loader">Loading event jobs...</div>
            </div>
        );
    }

    return (
        <div className="event-jobs role-manager">
            <div className="role-manager-layout">
                <div className="role-list-column">
                    <div className="role-list-header">
                        {canManageRoles && (
                            <button className="add-role-btn" onClick={handleNewRole}>
                                <Icon icon="mdi:plus" />
                                Add Template
                            </button>
                        )}
                    </div>
                    <div className="role-list">
                        {roles.length === 0 ? (
                            <div className="no-roles">
                                <Icon icon="mdi:briefcase-outline" />
                                <p>No job templates yet</p>
                            </div>
                        ) : (
                            roles.map(role => {
                                const isSelected = selectedRole?._id === role._id;
                                return (
                                    <div
                                        key={role._id}
                                        className={`role-list-item ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleRoleSelect(role)}
                                    >
                                        <div className="role-list-item-content">
                                            <div className="role-list-item-info">
                                                <span className="role-list-item-name">{role.name}</span>
                                                {role.description && (
                                                    <span className="role-list-item-description">{role.description}</span>
                                                )}
                                            </div>
                                        </div>
                                        {canManageRoles && (
                                            <div className="role-list-item-actions" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="delete-btn"
                                                    onClick={() => handleDeleteRole(role._id)}
                                                    title="Delete job"
                                                >
                                                    <Icon icon="mdi:delete" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="role-editor-column">
                    {selectedRole ? (
                        <div className="role-editor">
                            <div className="role-editor-header">
                                <h3>{selectedRole.isNew ? 'Create Job Template' : `Edit Template — ${selectedRole.name}`}</h3>
                            </div>

                            <div className="role-editor-content">
                                <div className="form-group">
                                    <label htmlFor="jobName">Template Name *</label>
                                    <input
                                        type="text"
                                        id="jobName"
                                        className="text-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g., Ticketing, Registration"
                                        disabled={!canManageRoles}
                                    />
                                    <small>This name will be used when assigning jobs to events.</small>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="jobDescription">Description</label>
                                    <textarea
                                        id="jobDescription"
                                        className="text-input"
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Describe the job responsibilities"
                                        rows={3}
                                        disabled={!canManageRoles}
                                    />
                                </div>
                            </div>

                            {canManageRoles && (
                                <div className="role-editor-create-action">
                                    <button
                                        className="create-btn"
                                        onClick={handleSaveRole}
                                        disabled={!formData.name.trim()}
                                    >
                                        {selectedRole.isNew ? 'Create Template' : 'Save Template'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-role-selected">
                            <Icon icon="mdi:briefcase-outline" />
                            <h3>Select a template to edit</h3>
                            <p>Choose a job template from the list on the left to view or edit details.</p>
                            {canManageRoles && (
                                <button className="add-first-role-btn" onClick={handleNewRole}>
                                    Create Your First Template
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default EventJobs;
