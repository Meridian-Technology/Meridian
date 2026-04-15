import React from 'react';
import TaskCardAssigneePicker from '../../TaskWorkspace/TaskCardAssigneePicker';
import { descriptionToPreviewPlain } from '../../TaskWorkspace/taskWorkspaceUtils';
import { EventTasksPriorityPill, EventTasksStatusPill } from './EventTasksTaskPills';
import './EventTasksTaskCardShared.scss';
import './EventTasksTaskListCard.scss';

export default function EventTasksTaskListCard({
    task,
    isDragging,
    isMoved,
    getTaskStatus,
    formatStatusLabel,
    onOpenDetail,
    members,
    assigningTaskId,
    onAssigneeChange,
    boardStatuses,
    doneStatusKey,
    activeStatusKey,
    activeQuickLabel,
    doneQuickLabel,
    onQuickStatusChange,
    onDeleteTask,
    actioningTaskId
}) {
    const st = getTaskStatus(task);
    const statusRow = boardStatuses.find((s) => s.key === st);
    const isDone = statusRow?.category === 'done';
    const isBacklog = statusRow?.category === 'backlog';

    return (
        <article
            className={`event-tasks-task-list-card${isDragging ? ' event-tasks-task-list-card--dragging' : ''}${
                isMoved ? ' event-tasks-task-list-card--moved' : ''
            }`}
        >
            <div
                className="event-tasks-task-list-card__main event-tasks-task-list-card__main--clickable"
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
                <header>
                    <h5>{task.title}</h5>
                    <div className="event-tasks-task-card__badges">
                        <EventTasksStatusPill status={st} label={formatStatusLabel(st)} />
                        <EventTasksPriorityPill priority={task.priority} />
                        {task.isCritical && <span className="event-tasks-task-card__badge--critical">critical</span>}
                        {task.overdue && <span className="event-tasks-task-card__badge--overdue">overdue</span>}
                    </div>
                </header>
                {task.description && (
                    <p className="event-tasks-task-card__description event-tasks-task-card__description--lines-3">
                        {descriptionToPreviewPlain(task.description)}
                    </p>
                )}
                <div className="event-tasks-task-list-card__meta">
                    <span className="event-tasks-task-list-card__meta-text">
                        Due {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'none'}
                    </span>
                    <TaskCardAssigneePicker
                        task={task}
                        members={members}
                        disabled={assigningTaskId === String(task._id)}
                        onAssigneeChange={(id) => onAssigneeChange(task, id)}
                    />
                </div>
            </div>
            <footer>
                <div className="event-tasks-task-card__actions">
                    {!isDone && (
                        <button
                            type="button"
                            onClick={() => onQuickStatusChange(task, doneStatusKey)}
                            disabled={String(actioningTaskId) === String(task._id)}
                        >
                            {doneQuickLabel}
                        </button>
                    )}
                    {isBacklog && (
                        <button
                            type="button"
                            onClick={() => onQuickStatusChange(task, activeStatusKey)}
                            disabled={String(actioningTaskId) === String(task._id)}
                        >
                            {activeQuickLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        className="event-tasks-task-card__btn--danger"
                        onClick={() => onDeleteTask(task._id)}
                        disabled={String(actioningTaskId) === String(task._id)}
                    >
                        Delete
                    </button>
                </div>
            </footer>
        </article>
    );
}
