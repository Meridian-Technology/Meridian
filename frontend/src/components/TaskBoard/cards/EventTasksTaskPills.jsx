import React from 'react';
import './EventTasksTaskCardShared.scss';

export function EventTasksStatusPill({ status, label }) {
    const safe = String(status || 'unknown').replace(/[^a-z0-9_-]/g, '') || 'unknown';
    const text = label ?? String(status || '').replace(/_/g, ' ');
    return <span className={`event-tasks-task-card__status-pill ${safe}`}>{text}</span>;
}

export function EventTasksPriorityPill({ priority }) {
    return <span className={`event-tasks-task-card__priority-pill ${priority}`}>{priority}</span>;
}
