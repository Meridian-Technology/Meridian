import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import Popup from '../../../../../../components/Popup/Popup';
import './RolesManager.scss';

function VolunteerSignup({ event, orgId, roles, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const [selectedRole, setSelectedRole] = useState('');
    const [shiftStart, setShiftStart] = useState('');
    const [shiftEnd, setShiftEnd] = useState('');
    const [signingUp, setSigningUp] = useState(false);

    const availableRoles = roles?.filter(role => {
        const assignedCount = role.assignments?.filter(a => a.status === 'confirmed').length || 0;
        return assignedCount < role.requiredCount;
    }) || [];

    const handleSignup = async () => {
        if (!selectedRole) {
            addNotification({
                title: 'Error',
                message: 'Please select a job',
                type: 'error'
            });
            return;
        }

        if (!event?._id || !orgId) return;

        setSigningUp(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/volunteer-signups`,
                {
                    roleId: selectedRole,
                    shiftStart: shiftStart || null,
                    shiftEnd: shiftEnd || null
                },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                message: 'You have successfully signed up for this job',
                    type: 'success'
                });
                if (onSuccess) onSuccess();
                onClose();
            } else {
                throw new Error(response.message || 'Failed to sign up');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to sign up for job',
                type: 'error'
            });
        } finally {
            setSigningUp(false);
        }
    };

    if (availableRoles.length === 0) {
        return (
            <Popup isOpen={true} onClose={onClose} customClassName="volunteer-signup-popup">
                <div className="volunteer-signup">
                    <div className="signup-header">
                        <h3>
                            <Icon icon="mdi:account-plus" />
                            Volunteer Signup
                        </h3>
                        <button className="close-btn" onClick={onClose}>
                            <Icon icon="mdi:close" />
                        </button>
                    </div>
                    <div className="no-roles-available">
                        <Icon icon="mdi:information" />
                        <p>No jobs available for signup. All jobs are fully staffed.</p>
                    </div>
                </div>
            </Popup>
        );
    }

    return (
        <Popup isOpen={true} onClose={onClose} customClassName="volunteer-signup-popup">
            <div className="volunteer-signup">
                <div className="signup-header">
                    <h3>
                        <Icon icon="mdi:account-plus" />
                        Volunteer Signup
                    </h3>
                    <button className="close-btn" onClick={onClose}>
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <div className="signup-form">
                    <div className="form-group">
                        <label>
                            Select Job <span className="required">*</span>
                        </label>
                        <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            required
                        >
                            <option value="">Choose a job</option>
                            {availableRoles.map(role => {
                                const assignedCount = role.assignments?.filter(a => a.status === 'confirmed').length || 0;
                                const remaining = role.requiredCount - assignedCount;
                                return (
                                    <option key={role._id} value={role._id}>
                                        {role.name} ({remaining} spot{remaining !== 1 ? 's' : ''} available)
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {selectedRole && (() => {
                        const role = availableRoles.find(r => r._id === selectedRole);
                        if (role && (!role.shiftStart || !role.shiftEnd)) {
                            return (
                                <>
                                    <div className="form-group">
                                        <label>Shift Start (Optional)</label>
                                        <input
                                            type="datetime-local"
                                            value={shiftStart}
                                            onChange={(e) => setShiftStart(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Shift End (Optional)</label>
                                        <input
                                            type="datetime-local"
                                            value={shiftEnd}
                                            onChange={(e) => setShiftEnd(e.target.value)}
                                        />
                                    </div>
                                </>
                            );
                        }
                        return null;
                    })()}

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button 
                            type="button" 
                            className="btn-save"
                            onClick={handleSignup}
                            disabled={!selectedRole || signingUp}
                        >
                            {signingUp ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinner" />
                                    <span>Signing Up...</span>
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:check" />
                                    <span>Sign Up</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Popup>
    );
}

export default VolunteerSignup;
