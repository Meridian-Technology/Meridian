import React, { useState } from 'react';
import Popup from '../Popup/Popup';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import './OrgInviteModal.scss';

function OrgInviteModal({ invites = [], onAccept, onDecline, onClose, addNotification }) {
    const [loading, setLoading] = useState({});
    const [dismissed, setDismissed] = useState(new Set());

    const handleAccept = async (invite) => {
        const key = invite._id;
        setLoading(prev => ({ ...prev, [key]: true }));
        try {
            const response = await apiRequest(`/org-invites/${invite._id}/accept`, {}, { method: 'POST' });
            if (response.success) {
                addNotification?.({ title: 'Success', message: `You've joined ${invite.org?.org_name || 'the organization'}!`, type: 'success' });
                setDismissed(prev => new Set([...prev, key]));
                onAccept?.(invite);
            } else {
                addNotification?.({ title: 'Error', message: response.message || 'Failed to accept', type: 'error' });
            }
        } catch (error) {
            addNotification?.({ title: 'Error', message: error.message || 'Failed to accept invitation', type: 'error' });
        } finally {
            setLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleDecline = async (invite) => {
        const key = invite._id;
        setLoading(prev => ({ ...prev, [key]: true }));
        try {
            const response = await apiRequest(`/org-invites/${invite._id}/decline`, {}, { method: 'POST' });
            if (response.success) {
                setDismissed(prev => new Set([...prev, key]));
                onDecline?.(invite);
            } else {
                addNotification?.({ title: 'Error', message: response.message || 'Failed to decline', type: 'error' });
            }
        } catch (error) {
            addNotification?.({ title: 'Error', message: error.message || 'Failed to decline invitation', type: 'error' });
        } finally {
            setLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    const visibleInvites = invites.filter(inv => !dismissed.has(inv._id));

    if (visibleInvites.length === 0) {
        return null;
    }

    return (
        <Popup isOpen={true} onClose={onClose} customClassName="org-invite-modal wide-content">
            <div className="org-invite-modal-content">
                <h2>Organization Invitations</h2>
                <p className="org-invite-modal-subtitle">You've been invited to join the following organizations:</p>
                <div className="org-invite-list">
                    {visibleInvites.map((invite) => (
                        <div key={invite._id} className="org-invite-item">
                            <div className="org-invite-info">
                                {invite.org?.org_profile_image && (
                                    <img src={invite.org.org_profile_image} alt="" className="org-invite-org-avatar" />
                                )}
                                <div className="org-invite-details">
                                    <span className="org-invite-org-name">{invite.org?.org_name || 'Organization'}</span>
                                    <span className="org-invite-role">as {invite.role}</span>
                                    {invite.invitedBy && (
                                        <span className="org-invite-inviter">
                                            Invited by {invite.invitedBy?.name || invite.invitedBy?.username || 'Someone'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="org-invite-actions">
                                <button
                                    className="org-invite-btn accept"
                                    onClick={() => handleAccept(invite)}
                                    disabled={loading[invite._id]}
                                >
                                    {loading[invite._id] ? '...' : 'Accept'}
                                </button>
                                <button
                                    className="org-invite-btn decline"
                                    onClick={() => handleDecline(invite)}
                                    disabled={loading[invite._id]}
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="org-invite-dismiss" onClick={onClose}>
                    Maybe later
                </button>
            </div>
        </Popup>
    );
}

export default OrgInviteModal;
