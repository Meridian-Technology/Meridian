import React, { useMemo } from 'react';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import './EventTaskAssigneeStack.scss';

function displayName(user) {
    if (!user) return '';
    return user.name || user.username || 'Member';
}

/**
 * Overlapping avatars for people assigned to event tasks (max 3 + "+n").
 * @param {Array<{ _id: string, name?: string, username?: string, picture?: string }>} assignees
 */
export default function EventTaskAssigneeStack({ assignees, maxVisible = 3, className = '' }) {
    const list = Array.isArray(assignees) ? assignees.filter((u) => u && u._id) : [];
    const title = useMemo(() => list.map(displayName).filter(Boolean).join(', '), [list]);

    if (!list.length) return null;

    const visible = list.slice(0, maxVisible);
    const overflow = list.length - visible.length;

    return (
        <div
            className={`event-task-assignee-stack ${className}`.trim()}
            title={title || undefined}
        >
            <div className="event-task-assignee-stack__avatars">
                {visible.map((user, index) => (
                    <img
                        key={String(user._id)}
                        src={user.picture || defaultAvatar}
                        alt=""
                        className="event-task-assignee-stack__avatar"
                        style={{ zIndex: visible.length - index }}
                    />
                ))}
            </div>
            {overflow > 0 && (
                <span className="event-task-assignee-stack__overflow">+{overflow}</span>
            )}
        </div>
    );
}
