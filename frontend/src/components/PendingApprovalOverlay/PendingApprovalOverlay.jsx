import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './PendingApprovalOverlay.scss';

function PendingApprovalOverlay({ org, orgName, config, memberCount = 0 }) {
    const navigate = useNavigate();
    const mode = config?.orgApproval?.mode || 'none';
    const threshold = config?.orgApproval?.autoApproveMemberThreshold ?? 5;
    const showAutoProgress = mode === 'auto' || mode === 'both';

    return (
        <div className="pending-approval-overlay">
            <div className="pending-approval-overlay__backdrop" />
            <div className="pending-approval-overlay__modal" onClick={(e) => e.stopPropagation()}>
                <div className="pending-approval-overlay__card">
                    <div className="pending-approval-overlay__icon-wrap">
                        <Icon icon="mdi:clock-outline" />
                    </div>
                    <h1>Your organization is pending approval</h1>
                    <p className="pending-approval-overlay__subtitle">
                        Your organization <strong>{org?.org_name}</strong> has limited access until it's approved.
                    </p>

                    {showAutoProgress && (
                        <div className="pending-approval-overlay__progress">
                            <div className="pending-approval-overlay__progress-label">
                                <span>Members: {memberCount} / {threshold}</span>
                                {memberCount >= threshold ? (
                                    <span className="success">Auto-approval threshold reached; approval may be processing.</span>
                                ) : (
                                    <span>Add {threshold - memberCount} more member{threshold - memberCount !== 1 ? 's' : ''} to be auto-approved.</span>
                                )}
                            </div>
                            <div className="pending-approval-overlay__progress-bar">
                                <div
                                    className="pending-approval-overlay__progress-fill"
                                    style={{ width: `${Math.min(100, (memberCount / threshold) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <p className="pending-approval-overlay__limits">
                        While pending, your organization may have limited discoverability and restricted actions until an admin approves or auto-approval criteria are met.
                    </p>

                    <div className="pending-approval-overlay__actions">
                        <button
                            className="pending-approval-overlay__btn primary"
                            onClick={() => navigate(`/club-dashboard/${orgName}?page=3`)}
                        >
                            <Icon icon="mdi:account-plus" />
                            Add members
                        </button>
                        <button
                            className="pending-approval-overlay__btn secondary"
                            onClick={() => navigate(`/club-dashboard/${orgName}?page=0`)}
                        >
                            Back to dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PendingApprovalOverlay;
