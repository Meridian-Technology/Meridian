import React from 'react';
import TaskCardAssigneePicker from '../../TaskWorkspace/TaskCardAssigneePicker';
import { descriptionToPreviewPlain } from '../../TaskWorkspace/taskWorkspaceUtils';
import './TasksHubTaskListCard.scss';

function statusModifier(status) {
    return String(status || 'todo').replace(/[^a-z0-9_-]/g, '') || 'todo';
}

export default function TasksHubTaskListCard({
    task,
    isDragging,
    isMoved,
    getTaskStatus,
    formatStatusLabel,
    formatDate,
    onOpenDetail,
    members,
    assigningTaskId,
    onAssigneeChange,
    activeStatusKey,
    doneStatusKey,
    activeQuickLabel,
    doneQuickLabel,
    onTaskStatusChange
}) {
    const st = getTaskStatus(task);
    return (
        <div
            className={`tasks-hub-task-list-card tasks-hub-task-list-card--${statusModifier(st)}${
                isDragging ? ' tasks-hub-task-list-card--dragging' : ''
            }${isMoved ? ' tasks-hub-task-list-card--moved' : ''}`}
        >
            <div
                className="tasks-hub-task-list-card__main tasks-hub-task-list-card__main--clickable"
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetail(task)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenDetail(task);
                    }
                }}
            >
                <div className="tasks-hub-task-list-card__title-row">
                    <h3>{task.title}</h3>
                    <span className={`tasks-hub-task-list-card__priority tasks-hub-task-list-card__priority--${task.priority}`}>
                        {task.priority}
                    </span>
                    {task.isCritical && <span className="tasks-hub-task-list-card__critical">critical</span>}
                </div>
                <p className="tasks-hub-task-list-card__description">
                    {task.description ? descriptionToPreviewPlain(task.description) : 'No description provided.'}
                </p>
                <div className="tasks-hub-task-list-card__meta">
                    <span className="tasks-hub-task-list-card__meta-text">{formatStatusLabel(st)}</span>
                    <span className="tasks-hub-task-list-card__meta-text">Due {formatDate(task.dueAt)}</span>
                    <span className="tasks-hub-task-list-card__meta-text">{task.eventId?.name || 'Org operations'}</span>
                    <TaskCardAssigneePicker
                        task={task}
                        members={members}
                        disabled={assigningTaskId === String(task._id)}
                        onAssigneeChange={(id) => onAssigneeChange(task, id)}
                    />
                    <span className="tasks-hub-task-list-card__meta-text">Urgency {Math.round(task.urgencyScore || 0)}</span>
                </div>
            </div>
            {/* <div className="tasks-hub-task-list-card__actions">
                <button
                    type="button"
                    onClick={() => onTaskStatusChange(task, activeStatusKey)}
                    disabled={st === activeStatusKey}
                >
                    {activeQuickLabel}
                </button>
                <button type="button" onClick={() => onTaskStatusChange(task, doneStatusKey)} disabled={st === doneStatusKey}>
                    {doneQuickLabel}
                </button>
            </div> */}
        </div>
    );
}
