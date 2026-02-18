import React, { useState } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import './ApprovalQueue.scss';

function ApprovalQueue() {
    const { data: pendingData, loading, error, refetch } = useFetch('/org-management/pending-approvals');
    const { AtlasMain } = useGradient();
    const [approvingId, setApprovingId] = useState(null);

    const pendingOrgs = pendingData?.data || [];

    const handleApprove = async (orgId) => {
        setApprovingId(orgId);
        try {
            const response = await apiRequest(
                `/org-management/organizations/${orgId}/approve`,
                {},
                { method: 'PUT' }
            );
            if (response.success) {
                refetch();
            }
        } catch (err) {
            console.error('Error approving org:', err);
        } finally {
            setApprovingId(null);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="approval-queue">
                <div className="loading">Loading pending approvals...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="approval-queue">
                <div className="error">Error loading pending approvals: {error}</div>
            </div>
        );
    }

    return (
        <div className="approval-queue dash">
            <header className="header">
                <h1>Approval Queue</h1>
                <p>Review and approve organizations awaiting approval</p>
                <img src={AtlasMain} alt="" />
            </header>

            <div className="content">
                {pendingOrgs.length === 0 ? (
                    <div className="empty-state">
                        <Icon icon="mdi:clipboard-check-outline" />
                        <h3>No pending approvals</h3>
                        <p>All organizations are approved. New orgs will appear here when approval is required.</p>
                    </div>
                ) : (
                    <div className="queue-table">
                        <div className="table-header">
                            <span className="col-org">Organization</span>
                            <span className="col-members">Members</span>
                            <span className="col-created">Created</span>
                            <span className="col-owner">Owner</span>
                            <span className="col-actions">Actions</span>
                        </div>
                        {pendingOrgs.map((org) => (
                            <div key={org._id} className="table-row">
                                <div className="col-org">
                                    <img
                                        src={org.org_profile_image || '/Logo.svg'}
                                        alt=""
                                        className="org-avatar"
                                    />
                                    <div className="org-info">
                                        <span className="org-name">{org.org_name}</span>
                                        <span className="org-desc">{org.org_description ? (org.org_description.length > 60 ? `${org.org_description.slice(0, 60)}...` : org.org_description) : '—'}</span>
                                    </div>
                                </div>
                                <span className="col-members">{org.memberCount ?? 0}</span>
                                <span className="col-created">{formatDate(org.createdAt)}</span>
                                <span className="col-owner">
                                    {org.owner?.name || org.owner?.username || '—'}
                                </span>
                                <div className="col-actions">
                                    <button
                                        className="btn-approve"
                                        onClick={() => handleApprove(org._id)}
                                        disabled={approvingId === org._id}
                                    >
                                        {approvingId === org._id ? (
                                            <>Approving...</>
                                        ) : (
                                            <>
                                                <Icon icon="mdi:check" />
                                                Approve
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ApprovalQueue;
