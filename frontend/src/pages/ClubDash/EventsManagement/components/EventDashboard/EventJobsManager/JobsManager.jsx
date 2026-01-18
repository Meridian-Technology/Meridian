import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import JobEditor from './JobEditor';
import Popup from '../../../../../../components/Popup/Popup';
import JobShiftScheduler from './JobShiftScheduler';
import JobAssignment from './JobAssignment';
import JobSignup from './JobSignup';
import './JobsManager.scss';

function JobsManager({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [roles, setRoles] = useState([]);
    const [signups, setSignups] = useState([]);
    const [orgRoles, setOrgRoles] = useState([]);
    const [editingRole, setEditingRole] = useState(null);
    const [assigningRole, setAssigningRole] = useState(null);
    const [showVolunteerSignup, setShowVolunteerSignup] = useState(false);
    const [showJobPicker, setShowJobPicker] = useState(false);
    const [creatingJobTemplate, setCreatingJobTemplate] = useState(false);
    const [newJobTemplate, setNewJobTemplate] = useState({ name: '', description: '' });
    const [loading, setLoading] = useState(true);

    // Fetch roles
    const { data: rolesData, refetch: refetchRoles } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/roles` : null
    );

    // Fetch volunteer signups
    const { data: signupsData, refetch: refetchSignups } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/volunteer-signups` : null
    );

    // Fetch org-level role definitions
    const { data: orgRolesData } = useFetch(
        orgId ? `/org-event-management/${orgId}/event-roles` : null
    );

    useEffect(() => {
        if (rolesData?.success) {
            setRoles(rolesData.data.roles || []);
            setLoading(false);
        }
    }, [rolesData]);

    useEffect(() => {
        if (signupsData?.success) {
            setSignups(signupsData.data.signups || []);
        }
    }, [signupsData]);

    useEffect(() => {
        if (orgRolesData?.success) {
            setOrgRoles(orgRolesData.data.roles || []);
        }
    }, [orgRolesData]);

    const handleAddRole = () => {
        if (orgRoles.length === 0) {
            addNotification({
                title: 'No Job Templates',
                message: 'Create job templates in Settings → Job Templates before assigning jobs to events.',
                type: 'warning'
            });
            return;
        }
        setShowJobPicker(true);
    };

    const handleEditRole = (role) => {
        setEditingRole(role);
    };

    const handleDeleteRole = async (roleId) => {
        if (!window.confirm('Are you sure you want to delete this job? All assignments will be removed.')) return;

        if (!event?._id || !orgId) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/roles/${roleId}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                setRoles(roles.filter(role => role._id !== roleId));
                refetchRoles();
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: 'Job deleted successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to delete job');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete job',
                type: 'error'
            });
        }
    };

    const handleSaveRole = async (roleData) => {
        if (!event?._id || !orgId) return;

        try {
            let response;
            if (roleData._id) {
                // Update existing
                response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles/${roleData._id}`,
                    roleData,
                    { method: 'PUT' }
                );
            } else {
                // Create new
                response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles`,
                    roleData,
                    { method: 'POST' }
                );
            }

            if (response.success) {
                setEditingRole(null);
                refetchRoles();
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: 'Job saved successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to save job');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save job',
                type: 'error'
            });
        }
    };

    const handleIncrementJob = async (orgRole) => {
        if (!event?._id || !orgId) return;

        const existingRole = roles.find(role => {
            const orgRoleId = role.orgRoleId?._id || role.orgRoleId;
            return orgRoleId === orgRole._id;
        });

        try {
            let response;
            if (existingRole) {
                response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles/${existingRole._id}`,
                    { requiredCount: (existingRole.requiredCount || 0) + 1 },
                    { method: 'PUT' }
                );
            } else {
                response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles`,
                    { orgRoleId: orgRole._id, requiredCount: 1 },
                    { method: 'POST' }
                );
            }

            if (response.success) {
                refetchRoles();
                if (onRefresh) onRefresh();
            } else {
                throw new Error(response.message || 'Failed to update job count');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update job count',
                type: 'error'
            });
        }
    };

    const handleDecrementJob = async (orgRole) => {
        if (!event?._id || !orgId) return;

        const existingRole = roles.find(role => {
            const orgRoleId = role.orgRoleId?._id || role.orgRoleId;
            return orgRoleId === orgRole._id;
        });

        if (!existingRole || !existingRole.requiredCount) return;

        try {
            if (existingRole.requiredCount <= 1) {
                const response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles/${existingRole._id}`,
                    {},
                    { method: 'DELETE' }
                );

                if (!response.success) {
                    throw new Error(response.message || 'Failed to remove job');
                }
            } else {
                const response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/roles/${existingRole._id}`,
                    { requiredCount: existingRole.requiredCount - 1 },
                    { method: 'PUT' }
                );

                if (!response.success) {
                    throw new Error(response.message || 'Failed to update job count');
                }
            }

            refetchRoles();
            if (onRefresh) onRefresh();
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update job count',
                type: 'error'
            });
        }
    };

    const handleCreateJobTemplate = async () => {
        if (!orgId) return;
        if (!newJobTemplate.name.trim()) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/event-roles`,
                {
                    name: newJobTemplate.name.trim(),
                    description: newJobTemplate.description.trim()
                },
                { method: 'POST' }
            );

            if (!response.success) {
                throw new Error(response.message || 'Failed to create job template');
            }

            const createdRole = response.data?.role;
            if (createdRole) {
                setOrgRoles(prev => {
                    const updated = [...prev, createdRole];
                    return updated.sort((a, b) => a.name.localeCompare(b.name));
                });
                setNewJobTemplate({ name: '', description: '' });
                setCreatingJobTemplate(false);
                await handleIncrementJob(createdRole);
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to create job template',
                type: 'error'
            });
        }
    };

    const handleAssignRole = (role) => {
        setAssigningRole(role);
    };


    if (loading) {
        return (
            <div className="roles-manager loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading jobs...</p>
            </div>
        );
    }

    return (
        <div className="roles-manager">
            <div className="roles-header">
                <div className="header-left">
                    <h3>
                        <Icon icon="mdi:account-group" />
                        Event Jobs & Assignments
                    </h3>
                    <p>{roles.length} job{roles.length !== 1 ? 's' : ''} defined</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn-secondary"
                        onClick={() => setShowVolunteerSignup(true)}
                    >
                        <Icon icon="mdi:account-plus" />
                        <span>Volunteer Signup</span>
                    </button>
                    <button 
                        className="btn-primary"
                        onClick={handleAddRole}
                        disabled={orgRoles.length === 0}
                    >
                        <Icon icon="mdi:plus" />
                        <span>Add Job Slots</span>
                    </button>
                </div>
            </div>

            {orgRoles.length === 0 && (
                <div className="empty-roles">
                    <Icon icon="mdi:information-outline" />
                    <h4>No job templates available</h4>
                    <p>Create job templates in Settings → Job Templates to assign jobs to this event.</p>
                </div>
            )}

            {roles.length === 0 ? (
                <div className="empty-roles">
                    <Icon icon="mdi:account-group-outline" />
                    <h4>No jobs assigned yet</h4>
                    <p>Add org jobs to create slots for this event</p>
                    <button className="btn-primary" onClick={handleAddRole}>
                        <Icon icon="mdi:plus" />
                        <span>Add First Job</span>
                    </button>
                </div>
            ) : (
                <div className="roles-list">
                    {roles.map(role => (
                        <div key={role._id} className="role-card">
                            <div className="role-header">
                                <div className="role-info">
                                    <h4>{role.name}</h4>
                                    {role.description && (
                                        <p>{role.description}</p>
                                    )}
                                </div>
                                <div className="role-actions">
                                    <button 
                                        className="action-btn assign"
                                        onClick={() => handleAssignRole(role)}
                                        title="Assign Members"
                                    >
                                        <Icon icon="mdi:account-plus" />
                                    </button>
                                    <button 
                                        className="action-btn edit"
                                        onClick={() => handleEditRole(role)}
                                        title="Edit Job"
                                    >
                                        <Icon icon="mdi:pencil" />
                                    </button>
                                    <button 
                                        className="action-btn delete"
                                        onClick={() => handleDeleteRole(role._id)}
                                        title="Delete Job"
                                    >
                                        <Icon icon="mdi:delete" />
                                    </button>
                                </div>
                            </div>
                            <div className="role-stats">
                                <div className="stat-item">
                                    <Icon icon="mdi:account-multiple" />
                                    <span>
                                        {role.assignments?.filter(a => a.status === 'confirmed').length || 0} / {role.requiredCount} assigned
                                    </span>
                                </div>
                                {role.shiftStart && role.shiftEnd && (
                                    <div className="stat-item">
                                        <Icon icon="mdi:clock-outline" />
                                        <span>
                                            {new Date(role.shiftStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - 
                                            {new Date(role.shiftEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {role.assignments && role.assignments.length > 0 && (
                                <div className="role-assignments">
                                    <h5>Assignments:</h5>
                                    <div className="assignments-list">
                                        {role.assignments.map((assignment, index) => (
                                            <div key={index} className="assignment-item">
                                                <span className="member-name">
                                                    {assignment.memberId?.name || 'Unknown'}
                                                </span>
                                                <span className={`status-badge ${assignment.status}`}>
                                                    {assignment.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <JobShiftScheduler roles={roles} event={event} />

            {editingRole && (
                <JobEditor
                    role={editingRole}
                    event={event}
                    orgRoles={orgRoles}
                    onSave={handleSaveRole}
                    onCancel={() => setEditingRole(null)}
                />
            )}

            {showJobPicker && (
                <Popup
                    isOpen={true}
                    onClose={() => setShowJobPicker(false)}
                    customClassName="job-picker-popup"
                >
                    <div className="job-picker">
                        <div className="editor-header">
                            <h3>
                                <Icon icon="mdi:briefcase" />
                                Add Job Slots
                            </h3>
                            <div className="header-actions">
                                <button
                                    className="btn-secondary"
                                    onClick={() => setCreatingJobTemplate(prev => !prev)}
                                >
                                    <Icon icon="mdi:plus" />
                                    {creatingJobTemplate ? 'Cancel' : 'New Template'}
                                </button>
                                <button className="close-btn" onClick={() => setShowJobPicker(false)}>
                                    <Icon icon="mdi:close" />
                                </button>
                            </div>
                        </div>
                        {creatingJobTemplate && (
                            <div className="job-template-form">
                                <div className="form-group">
                                    <label>Template Name *</label>
                                    <input
                                        type="text"
                                        value={newJobTemplate.name}
                                        onChange={(e) => setNewJobTemplate(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g., Registration, Ticketing"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        rows={2}
                                        value={newJobTemplate.description}
                                        onChange={(e) => setNewJobTemplate(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Describe this job template"
                                    />
                                </div>
                                <div className="form-actions">
                                    <button
                                        className="btn-save"
                                        onClick={handleCreateJobTemplate}
                                        disabled={!newJobTemplate.name.trim()}
                                    >
                                        <Icon icon="mdi:check" />
                                        Create & Add Slot
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="job-picker-list">
                            {orgRoles.map(orgRole => {
                                const existingRole = roles.find(role => {
                                    const orgRoleId = role.orgRoleId?._id || role.orgRoleId;
                                    return orgRoleId === orgRole._id;
                                });
                                const count = existingRole?.requiredCount || 0;

                                return (
                                    <div key={orgRole._id} className="job-picker-item">
                                        <div className="job-info">
                                            <strong>{orgRole.name}</strong>
                                            {orgRole.description && <p>{orgRole.description}</p>}
                                        </div>
                                        <div className="job-actions">
                                            <button
                                                className="action-btn remove"
                                                onClick={() => handleDecrementJob(orgRole)}
                                                title="Remove slot"
                                                disabled={count <= 0}
                                            >
                                                <Icon icon="mdi:minus" />
                                            </button>
                                            <span className="job-count">{count}</span>
                                            <button
                                                className="action-btn add"
                                                onClick={() => handleIncrementJob(orgRole)}
                                                title="Add slot"
                                            >
                                                <Icon icon="mdi:plus" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Popup>
            )}

            {assigningRole && (
                <JobAssignment
                    role={assigningRole}
                    event={event}
                    orgId={orgId}
                    onClose={() => setAssigningRole(null)}
                    onSuccess={() => {
                        refetchRoles();
                        if (onRefresh) onRefresh();
                    }}
                />
            )}

            {showVolunteerSignup && (
                <JobSignup
                    event={event}
                    orgId={orgId}
                    roles={roles}
                    onClose={() => setShowVolunteerSignup(false)}
                    onSuccess={() => {
                        refetchSignups();
                        refetchRoles();
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
}

export default JobsManager;
