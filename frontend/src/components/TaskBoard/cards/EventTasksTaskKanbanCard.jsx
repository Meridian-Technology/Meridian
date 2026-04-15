import React from 'react';
import TaskCardAssigneePicker from '../../TaskWorkspace/TaskCardAssigneePicker';
import { descriptionToPreviewPlain } from '../../TaskWorkspace/taskWorkspaceUtils';
import { EventTasksPriorityPill } from './EventTasksTaskPills';
import './EventTasksTaskCardShared.scss';
import './EventTasksTaskKanbanCard.scss';

function formatKanbanDue(dueAt) {
    if (!dueAt) return 'none';
    return new Date(dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function EventTasksTaskKanbanCard({
    task,
    isDragging,
    isMoved,
    onOpenDetail,
    members,
    assigningTaskId,
    onAssigneeChange
}) {
    return (
        <div
            className={`event-tasks-task-kanban-card ${isDragging ? 'event-tasks-task-kanban-card--dragging' : ''} ${isMoved ? 'event-tasks-task-kanban-card--moved' : ''}`}
            role="presentation"
            onClick={() => onOpenDetail(task)}
        >
            <div className="event-tasks-task-kanban-card__title-row">
                <h5>{task.title}</h5>
                <div className="event-tasks-task-card__badges">
                    <EventTasksPriorityPill priority={task.priority} />
                    {task.isCritical && <span className="event-tasks-task-card__badge--critical">critical</span>}
                </div>
            </div>
            {task.description && (
                <p className="event-tasks-task-card__description event-tasks-task-card__description--lines-2">
                    {descriptionToPreviewPlain(task.description)}
                </p>
            )}
            <div className="event-tasks-task-kanban-card__footer-meta">
                <span className="event-tasks-task-kanban-card__meta-text">Due {formatKanbanDue(task.dueAt)}</span>
                <TaskCardAssigneePicker
                    task={task}
                    members={members}
                    disabled={assigningTaskId === String(task._id)}
                    onAssigneeChange={(id) => onAssigneeChange(task, id)}
                />
            </div>
        </div>
    );
}
