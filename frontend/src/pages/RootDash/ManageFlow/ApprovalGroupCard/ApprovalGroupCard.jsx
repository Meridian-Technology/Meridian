import React from 'react';
import './ApprovalGroupCard.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function ApprovalGroupCard({ group, step, onSelect, onDelete }) {
    if (!group) return null;

    const memberCount = group.members?.length || 0;
    const pendingApprovals = 0; // TODO: Get from API
    const hasConditions = step?.conditionGroups?.length > 0;

    return (
        <div className="approval-group-card">
            <div className="card-header">
                <div className="group-info">
                    <h3>{group.org_name}</h3>
                    <p className="group-description">{group.org_description}</p>
                </div>
                <div className="card-actions">
                    <button className="delete-btn" onClick={onDelete} title="Delete group">
                        <Icon icon="mdi:delete" />
                    </button>
                </div>
            </div>

            <div className="card-stats">
                <div className="stat">
                    <Icon icon="mdi:account-group" />
                    <span>{memberCount} members</span>
                </div>
                <div className="stat">
                    <Icon icon="mdi:clock-outline" />
                    <span>{pendingApprovals} pending</span>
                </div>
                {hasConditions && (
                    <div className="stat">
                        <Icon icon="mdi:filter" />
                        <span>{step.conditionGroups.length} rules</span>
                    </div>
                )}
            </div>

            <div className="card-footer">
                <button className="configure-btn" onClick={onSelect}>
                    <Icon icon="mdi:cog" />
                    Configure
                </button>
                <button className="dashboard-btn" onClick={() => window.open(`/approval-dashboard/${group.org_name}`, '_blank')}>
                    <Icon icon="mdi:view-dashboard" />
                    Dashboard
                </button>
            </div>
        </div>
    );
}

export default ApprovalGroupCard;
