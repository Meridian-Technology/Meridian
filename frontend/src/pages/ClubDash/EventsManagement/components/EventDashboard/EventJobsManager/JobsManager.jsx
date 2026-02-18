import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import DeleteConfirmModal from '../../../../../../components/DeleteConfirmModal/DeleteConfirmModal';
import JobShiftScheduler from './JobShiftScheduler';
import JobPicker from './JobPicker';
import JobSignup from './JobSignup';
import MemberDropdown from './MemberDropdown';
import EmptyState from '../../../../../../components/EmptyState/EmptyState';
import './JobsManager.scss';

function JobsManager({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [copiedEmail, setCopiedEmail] = useState(null);

    const handleCopyEmail = async (email) => {
        try {
            await navigator.clipboard.writeText(email);
            setCopiedEmail(email);
            addNotification({
                title: 'Copied',
                message: 'Email copied to clipboard',
                type: 'success'
            });
            setTimeout(() => setCopiedEmail(null), 2000);
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to copy email',
                type: 'error'
            });
        }
    };
    const [roles, setRoles] = useState([]);
    const [signups, setSignups] = useState([]);
    const [orgRoles, setOrgRoles] = useState([]);
    const [showVolunteerSignup, setShowVolunteerSignup] = useState(false);
    const [showJobPicker, setShowJobPicker] = useState(false);
    const [creatingJobTemplate, setCreatingJobTemplate] = useState(false);
    const [newJobTemplate, setNewJobTemplate] = useState({ name: '', description: '' });
    const [loading, setLoading] = useState(true);
    const [assigningMembers, setAssigningMembers] = useState({}); // Track which roles are currently assigning
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState(null);
    const [showRemoveAssignmentModal, setShowRemoveAssignmentModal] = useState(false);
    const [assignmentToRemove, setAssignmentToRemove] = useState(null); // { role, assignmentId, memberName }

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

    // Fetch org members for assignment
    const { data: membersData } = useFetch(
        orgId ? `/org-roles/${orgId}/members` : null
    );

    const members = membersData?.members || [];

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

    const handleCloseJobPicker = () => {
        setShowJobPicker(false);
        setCreatingJobTemplate(false);
        setNewJobTemplate({ name: '', description: '' });
    };

    const handleAddRole = () => {
        setShowJobPicker(true);
    };

    const handleDeleteRole = (roleId) => {
        setRoleToDelete(roleId);
        setShowDeleteModal(true);
    };

    const confirmDeleteRole = async () => {
        if (!roleToDelete || !event?._id || !orgId) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/roles/${roleToDelete}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                setRoles(roles.filter(role => role._id !== roleToDelete));
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
        } finally {
            setShowDeleteModal(false);
            setRoleToDelete(null);
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

    const handleAssignMember = async (role, memberId) => {
        if (!memberId || !event?._id || !orgId || !role?._id) return;

        // Check if member is already assigned to this role
        const alreadyAssigned = role.assignments?.some(
            a => a.memberId?._id?.toString() === memberId || a.memberId?.toString() === memberId
        );

        if (alreadyAssigned) {
            addNotification({
                title: 'Already Assigned',
                message: 'This member is already assigned to this job',
                type: 'warning'
            });
            return;
        }

        setAssigningMembers(prev => ({ ...prev, [role._id]: true }));

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/assignments`,
                {
                    roleId: role._id,
                    memberId: memberId,
                    status: 'confirmed' // Always start as confirmed
                },
                { method: 'POST' }
            );

            if (response.success) {
                refetchRoles();
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: 'Member assigned successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to assign member');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to assign member',
                type: 'error'
            });
        } finally {
            setAssigningMembers(prev => ({ ...prev, [role._id]: false }));
        }
    };

    const handleRemoveAssignment = (role, assignmentId) => {
        const assignment = role.assignments?.find(a => a._id === assignmentId);
        const memberName = assignment?.memberId?.name || 'this member';
        setAssignmentToRemove({ role, assignmentId, memberName });
        setShowRemoveAssignmentModal(true);
    };

    const confirmRemoveAssignment = async () => {
        if (!assignmentToRemove || !event?._id || !orgId || !assignmentToRemove.role?._id || !assignmentToRemove.assignmentId) return;

        const { role, assignmentId } = assignmentToRemove;
        setAssigningMembers(prev => ({ ...prev, [role._id]: true }));

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/assignments/${assignmentId}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                refetchRoles();
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: 'Member removed successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to remove member');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to remove member',
                type: 'error'
            });
        } finally {
            setAssigningMembers(prev => ({ ...prev, [role._id]: false }));
            setShowRemoveAssignmentModal(false);
            setAssignmentToRemove(null);
        }
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
                    >
                        <Icon icon="mdi:plus" />
                        <span>Add Job Slots</span>
                    </button>
                </div>
            </div>

            {roles.length === 0 ? (
                <EmptyState
                    icon="mingcute:group-fill"
                    title="No event jobs assigned yet"
                    description="Add event jobs to keep everyone organized."
                />
            ) : (
                <div className="roles-list">
                    {roles.map(role => {
                        const confirmedCount = role.assignments?.filter(a => a.status === 'confirmed').length || 0;
                        const isFullyStaffed = confirmedCount >= role.requiredCount;
                        
                        return (
                            <div key={role._id} className={`role-card ${isFullyStaffed ? 'fully-staffed' : ''}`}>
                                <div className="role-header">
                                    <div className="role-info">
                                        <h4>{role.name}</h4>
                                        {role.description && (
                                            <p>{role.description}</p>
                                        )}
                                    </div>
                                    <div className="role-actions">
                                        <button 
                                            className="action-btn delete"
                                            onClick={() => handleDeleteRole(role._id)}
                                            title="Delete Job"
                                        >
                                            <Icon icon="mdi:delete" />
                                        </button>
                                    </div>
                                </div>
                            {role.shiftStart && role.shiftEnd && (
                                <div className="role-stats">
                                    <div className="stat-item">
                                        <Icon icon="mdi:clock-outline" />
                                        <span>
                                            {new Date(role.shiftStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - 
                                            {new Date(role.shiftEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            )}
                                <div className="role-assignments">
                                    <div className="assignments-header">
                                        <h5>Assignments ({confirmedCount} / {role.requiredCount})</h5>
                                        {!isFullyStaffed && (
                                            <div className="member-selector">
                                                <MemberDropdown
                                                    members={members.filter(member => {
                                                        // Filter out already assigned members
                                                        const memberId = member.user_id._id.toString();
                                                        return !role.assignments?.some(
                                                            a => (a.memberId?._id?.toString() || a.memberId?.toString()) === memberId
                                                        );
                                                    })}
                                                    onMemberSelect={(memberId) => {
                                                        if (memberId) {
                                                            handleAssignMember(role, memberId);
                                                        }
                                                    }}
                                                    disabled={assigningMembers[role._id]}
                                                    placeholder="Select member"
                                                />
                                            </div>
                                        )}
                                        {isFullyStaffed && (
                                            <span className="fully-staffed-badge">
                                                <Icon icon="mdi:check-circle" />
                                                Fully Staffed
                                            </span>
                                        )}
                                    </div>
                                <div className="assignments-list">
                                    {/* Show confirmed assignments */}
                                    {role.assignments
                                        ?.filter(a => a.status === 'confirmed')
                                        .map((assignment, index) => (
                                            <div key={`assigned-${index}`} className="assignment-item">
                                                <div className="member-info">
                                                    <span className="member-name">
                                                        {assignment.memberId?.name || 'Unknown'}
                                                    </span>
                                                    {assignment.memberId?.email && (
                                                        <span 
                                                            className="member-email clickable"
                                                            onClick={() => handleCopyEmail(assignment.memberId.email)}
                                                            title="Click to copy email"
                                                        >
                                                            {assignment.memberId.email}
                                                            <Icon 
                                                                icon={copiedEmail === assignment.memberId.email ? "mdi:check" : "mdi:content-copy"} 
                                                                className="copy-icon"
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="assignment-actions">
                                                    <span className={`status-badge ${assignment.status || 'confirmed'}`}>
                                                        {assignment.status || 'confirmed'}
                                                    </span>
                                                    <button
                                                        className="remove-assignment-btn"
                                                        onClick={() => handleRemoveAssignment(role, assignment._id)}
                                                        title="Remove member"
                                                        disabled={assigningMembers[role._id]}
                                                    >
                                                        <Icon icon="mdi:close" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    
                                    {/* Show placeholder slots for unfilled positions */}
                                    {Array.from({ length: Math.max(0, role.requiredCount - confirmedCount) }).map((_, index) => (
                                        <div key={`placeholder-${index}`} className="assignment-item placeholder-slot">
                                            <div className="member-info">
                                                <Icon icon="mdi:account-outline" className="placeholder-icon" />
                                                <span className="placeholder-text">Open slot</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                    })}
                </div>
            )}

            <JobShiftScheduler roles={roles} event={event} />


            <Popup
                isOpen={showJobPicker}
                onClose={handleCloseJobPicker}
                customClassName="job-picker-popup medium-content"
                defaultStyling={false}
                hideCloseButton
            >
                <JobPicker 
                    orgRoles={orgRoles}
                    roles={roles}
                    creatingJobTemplate={creatingJobTemplate}
                    setCreatingJobTemplate={setCreatingJobTemplate}
                    newJobTemplate={newJobTemplate}
                    setNewJobTemplate={setNewJobTemplate}
                    onCreateJobTemplate={handleCreateJobTemplate}
                    onIncrementJob={handleIncrementJob}
                    onDecrementJob={handleDecrementJob}
                    onClose={handleCloseJobPicker}
                />
            </Popup>

            <Popup
                isOpen={showVolunteerSignup}
                onClose={() => setShowVolunteerSignup(false)}
                customClassName="volunteer-signup-popup medium-content"
                defaultStyling={false}
                hideCloseButton
            >
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
            </Popup>

            <DeleteConfirmModal
                isOpen={showDeleteModal}
                onConfirm={confirmDeleteRole}
                onCancel={() => {
                    setShowDeleteModal(false);
                    setRoleToDelete(null);
                }}
                title="Delete Job"
                message="Are you sure you want to delete this job? All assignments will be removed."
                warningDetails="All assigned members will be removed from this job."
            />

            <DeleteConfirmModal
                isOpen={showRemoveAssignmentModal}
                onConfirm={confirmRemoveAssignment}
                onCancel={() => {
                    setShowRemoveAssignmentModal(false);
                    setAssignmentToRemove(null);
                }}
                title="Remove Assignment"
                message={`Are you sure you want to remove ${assignmentToRemove?.memberName || 'this member'} from this job?`}
                warningDetails="The member will be unassigned from this job slot."
                confirmLabel="Remove"
            />
        </div>
    );
}

export default JobsManager;
