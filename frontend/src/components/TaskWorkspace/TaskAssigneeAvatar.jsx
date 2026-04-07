import React from 'react';
import { Icon } from '@iconify-icon/react';
import { memberUserInitials, userDisplayName } from './taskWorkspaceUtils';
import './TaskWorkspace.scss';

/** Read-only assignee chip for list/kanban rows (Linear-style). */
export default function TaskAssigneeAvatar({ ownerUserId, className = '' }) {
    const user = ownerUserId && typeof ownerUserId === 'object' ? ownerUserId : null;
    const label = user ? userDisplayName(user) : 'Unassigned';

    return (
        <span className={`task-assignee-avatar ${className}`.trim()} title={label}>
            {user?.picture ? (
                <img src={user.picture} alt="" className="task-workspace-assignee__avatar" />
            ) : (
                <span className="task-workspace-assignee__avatar-fallback">
                    {user ? memberUserInitials(user) : <Icon icon="mdi:account-outline" />}
                </span>
            )}
            <span className="task-assignee-avatar__name">{label}</span>
        </span>
    );
}
