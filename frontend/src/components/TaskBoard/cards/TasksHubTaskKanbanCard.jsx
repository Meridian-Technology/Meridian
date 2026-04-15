import React from 'react';
import TaskCardAssigneePicker from '../../TaskWorkspace/TaskCardAssigneePicker';
import { descriptionToPreviewPlain } from '../../TaskWorkspace/taskWorkspaceUtils';
import './TasksHubTaskKanbanCard.scss';

export default function TasksHubTaskKanbanCard({
    task,
    isDragging,
    isMoved,
    formatDate,
    onOpenDetail,
    members,
    assigningTaskId,
    onAssigneeChange,
    activeStatusKey,
    doneStatusKey,
    activeQuickLabel,
    doneQuickLabel,
    getTaskStatus,
    onTaskStatusChange
}) {
    const st = getTaskStatus(task);
    return (
        <article
            className={`tasks-hub-task-kanban-card ${isDragging ? 'tasks-hub-task-kanban-card--dragging' : ''} ${isMoved ? 'tasks-hub-task-kanban-card--moved' : ''}`}
            role="presentation"
            onClick={() => onOpenDetail(task)}
        >
            <div className="tasks-hub-task-kanban-card__title-row">
                <h3>{task.title}</h3>
                <span className={`tasks-hub-task-kanban-card__priority tasks-hub-task-kanban-card__priority--${task.priority}`}>
                    {task.priority}
                </span>
                {task.isCritical && <span className="tasks-hub-task-kanban-card__critical">critical</span>}
            </div>
            {task.description && (
                <p className="tasks-hub-task-kanban-card__description">
                    {descriptionToPreviewPlain(task.description)}
                </p>
            )}
            <div className="tasks-hub-task-kanban-card__meta">
                <span className="tasks-hub-task-kanban-card__meta-text">Due {formatDate(task.dueAt)}</span>
                <TaskCardAssigneePicker
                    task={task}
                    members={members}
                    disabled={assigningTaskId === String(task._id)}
                    onAssigneeChange={(id) => onAssigneeChange(task, id)}
                />
            </div>
            
        </article>
    );
}
