import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import { useOrgApprovalRoom } from '../../../WebSocketContext';
import './PendingApprovalScreen.scss';

const APPROVED_DELAY_MS = 1800;

function PendingApprovalScreen() {
    const { id: orgName } = useParams();
    const navigate = useNavigate();
    const orgData = useFetch(`/get-org-by-name/${orgName}?exhaustive=true`);
    const { data: configData } = useFetch('/org-management/config');
    const [justApproved, setJustApproved] = useState(false);
    const navigatedRef = useRef(false);

    const org = orgData.data?.org?.overview;

    // Only unapproved orgs subscribe; when admin approves, show notice then navigate
    useOrgApprovalRoom(org?.approvalStatus === 'pending' ? org?._id : null, () => {
        if (navigatedRef.current) return;
        setJustApproved(true);
        setTimeout(() => {
            navigatedRef.current = true;
            navigate(`/club-dashboard/${orgName}`, { replace: true });
        }, APPROVED_DELAY_MS);
    });
    const config = configData?.data;
    const memberCount = orgData.data?.org?.members?.length ?? 0;
    const threshold = config?.orgApproval?.autoApproveMemberThreshold ?? 5;
    const mode = config?.orgApproval?.mode || 'none';
    const showAutoProgress = mode === 'auto' || mode === 'both';

    if (orgData.loading) {
        return (
            <div className="pending-approval-screen">
                <div className="pending-approval-screen__loading">Loading...</div>
            </div>
        );
    }

    if (!org || org.approvalStatus !== 'pending') {
        navigate(`/club-dashboard/${orgName}`);
        return null;
    }

    return (
        <div className="pending-approval-screen">
            {justApproved && (
                <div className="pending-approval-screen__approved" role="alert">
                    <div className="pending-approval-screen__approved-icon-wrap">
                        <Icon icon="mdi:check-circle" className="pending-approval-screen__approved-icon" />
                    </div>
                    <h2 className="pending-approval-screen__approved-title">Your organization was approved!</h2>
                    <p className="pending-approval-screen__approved-subtitle">Taking you to your dashboard…</p>
                </div>
            )}
            {!justApproved && (
            <div className="pending-approval-screen__card">
                <div className="pending-approval-screen__icon-wrap">
                    <Icon icon="mdi:clock-outline" />
                </div>
                <h1>Your organization is pending approval</h1>
                <p className="pending-approval-screen__subtitle">
                    Your organization <strong>{org.org_name}</strong> has limited access until it's approved.
                </p>

                {showAutoProgress && (
                    <div className="pending-approval-screen__progress">
                        <div className="pending-approval-screen__progress-label">
                            <span>Members: {memberCount} / {threshold}</span>
                            {memberCount >= threshold ? (
                                <span className="success">Auto-approval threshold reached; approval may be processing.</span>
                            ) : (
                                <span>Add {threshold - memberCount} more member{threshold - memberCount !== 1 ? 's' : ''} to be auto-approved.</span>
                            )}
                        </div>
                        <div className="pending-approval-screen__progress-bar">
                            <div
                                className="pending-approval-screen__progress-fill"
                                style={{ width: `${Math.min(100, (memberCount / threshold) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                <p className="pending-approval-screen__limits">
                    While pending, your organization may have limited discoverability and restricted actions until an admin approves or auto-approval criteria are met.
                </p>

                <div className="pending-approval-screen__actions">
                    <button
                        className="pending-approval-screen__btn primary"
                        onClick={() => navigate(`/club-dashboard/${orgName}?page=3`)}
                    >
                        <Icon icon="mdi:account-plus" />
                        Add members
                    </button>
                    <button
                        className="pending-approval-screen__btn secondary"
                        onClick={() => navigate(`/club-dashboard/${orgName}`)}
                    >
                        Back to dashboard
                    </button>
                </div>
            </div>
            )}
        </div>
    );
}

export default PendingApprovalScreen;
