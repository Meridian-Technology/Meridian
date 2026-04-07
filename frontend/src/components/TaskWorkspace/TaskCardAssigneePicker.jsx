import React from 'react';
import TaskAssigneePicker from './TaskAssigneePicker';
import { taskOwnerUserIdString } from './taskWorkspaceUtils';

/**
 * Inline assignee control for task list/kanban cards (compact picker, stops card click via TaskAssigneePicker).
 */
export default function TaskCardAssigneePicker({ task, members, onAssigneeChange, disabled = false, className = '' }) {
    return (
        <TaskAssigneePicker
            members={members}
            value={taskOwnerUserIdString(task)}
            onChange={onAssigneeChange}
            disabled={disabled}
            compact
            className={`task-card-assignee-picker ${className}`.trim()}
        />
    );
}
