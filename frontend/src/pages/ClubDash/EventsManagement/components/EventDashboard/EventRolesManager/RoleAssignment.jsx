import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import './RolesManager.scss';

function RoleAssignment({ role, event, orgId, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const [selectedMember, setSelectedMember] = useState('');
    const [status, setStatus] = useState('assigned');
    const [notes, setNotes] = useState('');
    const [assigning, setAssigning] = useState(false);

    // Fetch org members
    const { data: membersData } = useFetch(
        orgId ? `/org-roles/${orgId}/members` : null
    );

    const members = membersData?.members || [];

    const handleAssign = async () => {
        if (!selectedMember) {
            addNotification({
                title: 'Error',
                message: 'Please select a member',
                type: 'error'
            });
            return;
        }

        if (!event?._id || !orgId || !role?._id) return;

        setAssigning(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/assignments`,
                {
                    roleId: role._id,
                    memberId: selectedMember,
                    status,
                    notes
                },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Member assigned successfully',
                    type: 'success'
                });
                if (onSuccess) onSuccess();
                onClose();
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
            setAssigning(false);
        }
    };

    return (
        <Popup
            isOpen={true}
            onClose={onClose}
            customClassName="role-assignment-popup"
        >
            <div className="role-assignment">
                <div className="assignment-header">
                    <h3>
                        <Icon icon="mdi:account-plus" />
                        Assign Member to Job: {role?.name}
                    </h3>
                    <button className="close-btn" onClick={onClose}>
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <div className="assignment-form">
                    <div className="form-group">
                        <label>
                            Member <span className="required">*</span>
                        </label>
                        <select
                            value={selectedMember}
                            onChange={(e) => setSelectedMember(e.target.value)}
                            required
                        >
                            <option value="">Select a member</option>
                            {members.map(member => (
                                <option key={member.user_id._id} value={member.user_id._id}>
                                    {member.user_id.name} ({member.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                        >
                            <option value="assigned">Assigned</option>
                            <option value="confirmed">Confirmed</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Optional notes about this assignment"
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="button" 
                            className="btn-save"
                            onClick={handleAssign}
                            disabled={!selectedMember || assigning}
                        >
                            {assigning ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinner" />
                                    <span>Assigning...</span>
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:check" />
                                    <span>Assign</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Popup>
    );
}

export default RoleAssignment;
