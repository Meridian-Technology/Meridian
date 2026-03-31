import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import apiRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import './TasksHub.scss';

const KANBAN_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

const DEFAULT_FORM = {
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    isCritical: false,
    dueAt: '',
    ownerUserId: ''
};

const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
];

function formatDate(dateLike) {
    if (!dateLike) return 'No due date';
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return date.toLocaleString();
}

function formatStatusLabel(status) {
    return String(status || '')
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function ownerLabel(task) {
    return task.ownerUserId?.name || task.ownerUserId?.username || 'Unassigned';
}

function TasksHub({ orgId, expandedClass }) {
    const { addNotification } = useNotification();
    const [filters, setFilters] = useState({
        status: 'all',
        priority: 'all',
        eventId: 'all',
        ownerUserId: 'all',
        onlyBlocked: false,
        onlyOverdue: false,
        sortBy: 'urgency',
        search: ''
    });
    const [form, setForm] = useState(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [viewMode, setViewMode] = useState('list');
    const [draggingTaskId, setDraggingTaskId] = useState(null);
    const [dropTargetStatus, setDropTargetStatus] = useState(null);
    const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState({});

    const query = useMemo(() => {
        const params = new URLSearchParams();
        params.set('status', filters.status);
        params.set('priority', filters.priority);
        params.set('sortBy', filters.sortBy);
        if (filters.eventId !== 'all') params.set('eventId', filters.eventId);
        if (filters.ownerUserId !== 'all') params.set('ownerUserId', filters.ownerUserId);
        if (filters.onlyBlocked) params.set('onlyBlocked', 'true');
        if (filters.onlyOverdue) params.set('onlyOverdue', 'true');
        if (filters.search.trim()) params.set('search', filters.search.trim());
        return params.toString();
    }, [filters]);

    const hubEndpoint = orgId ? `/org-event-management/${orgId}/tasks/hub?${query}` : null;
    const { data, loading, error, refetch } = useFetch(hubEndpoint);

    const tasks = useMemo(() => {
        const rawTasks = data?.data?.tasks || [];
        const byId = new Map();
        rawTasks.forEach((task) => {
            const taskId = String(task?._id || '');
            if (!taskId) return;
            const existing = byId.get(taskId);
            if (!existing) {
                byId.set(taskId, task);
                return;
            }
            const existingUpdatedAt = new Date(existing.updatedAt || 0).getTime();
            const nextUpdatedAt = new Date(task.updatedAt || 0).getTime();
            if (nextUpdatedAt >= existingUpdatedAt) {
                byId.set(taskId, task);
            }
        });
        return Array.from(byId.values());
    }, [data]);
    const summary = data?.data?.summary || {
        total: 0,
        overdue: 0,
        blocked: 0,
        highPriority: 0
    };

    const eventsById = useMemo(() => {
        const map = new Map();
        tasks.forEach((task) => {
            if (task.eventId?._id) {
                map.set(String(task.eventId._id), task.eventId.name || 'Untitled event');
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [tasks]);

    const ownersById = useMemo(() => {
        const map = new Map();
        tasks.forEach((task) => {
            if (task.ownerUserId?._id) {
                const label = ownerLabel(task);
                map.set(String(task.ownerUserId._id), label);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [tasks]);

    const getTaskStatus = useCallback((task) => {
        if (!task?._id) return task?.effectiveStatus || task?.status || 'todo';
        return optimisticStatusByTaskId[String(task._id)] || task.effectiveStatus || task.status || 'todo';
    }, [optimisticStatusByTaskId]);

    const groupedByStatus = useMemo(() => {
        const groups = KANBAN_STATUSES.reduce((acc, status) => {
            acc[status] = [];
            return acc;
        }, {});
        tasks.forEach((task) => {
            const key = getTaskStatus(task);
            if (!groups[key]) groups[key] = [];
            groups[key].push(task);
        });
        return groups;
    }, [tasks, getTaskStatus]);

    useEffect(() => {
        setOptimisticStatusByTaskId((previous) => {
            if (!Object.keys(previous).length) return previous;
            const next = { ...previous };
            let changed = false;
            const taskMap = new Map(tasks.map((task) => [String(task._id), task]));
            Object.entries(previous).forEach(([taskId, optimisticStatus]) => {
                const task = taskMap.get(taskId);
                if (!task) {
                    delete next[taskId];
                    changed = true;
                    return;
                }
                const actualStatus = task.effectiveStatus || task.status || 'todo';
                if (actualStatus === optimisticStatus) {
                    delete next[taskId];
                    changed = true;
                }
            });
            return changed ? next : previous;
        });
    }, [tasks]);

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setForm(DEFAULT_FORM);
    };

    const onCreateTask = async (event) => {
        event.preventDefault();
        if (!orgId) return;
        if (!form.title.trim()) {
            addNotification({
                title: 'Missing title',
                message: 'Task title is required.',
                type: 'error'
            });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority,
                status: form.status,
                isCritical: Boolean(form.isCritical),
                dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                ownerUserId: form.ownerUserId || null
            };
            const response = await apiRequest(`/org-event-management/${orgId}/tasks/hub`, payload, { method: 'POST' });
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Failed to create task');
            }
            addNotification({
                title: 'Task created',
                message: 'Operational task added to your organization task hub.',
                type: 'success'
            });
            closeCreateModal();
            refetch();
        } catch (createError) {
            addNotification({
                title: 'Task creation failed',
                message: createError.message || 'Unable to create task.',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const onTaskStatusChange = async (task, nextStatus) => {
        if (!orgId || !task?._id) return;
        const taskId = String(task._id);
        const currentStatus = getTaskStatus(task);
        if (currentStatus === nextStatus) return;
        setOptimisticStatusByTaskId((prev) => ({ ...prev, [taskId]: nextStatus }));
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/tasks/hub/${taskId}`,
                { status: nextStatus },
                { method: 'PUT' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Failed to update task');
            }
            refetch();
        } catch (updateError) {
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                if (currentStatus) {
                    next[taskId] = currentStatus;
                } else {
                    delete next[taskId];
                }
                return next;
            });
            addNotification({
                title: 'Task update failed',
                message: updateError.message || 'Unable to update task status.',
                type: 'error'
            });
        }
    };

    const onKanbanDragStart = (event, task) => {
        setDraggingTaskId(task._id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(task._id));
    };

    const onKanbanDragEnd = () => {
        setDraggingTaskId(null);
        setDropTargetStatus(null);
    };

    const onKanbanDragOverColumn = (event, status) => {
        event.preventDefault();
        if (dropTargetStatus !== status) {
            setDropTargetStatus(status);
        }
        event.dataTransfer.dropEffect = 'move';
    };

    const onKanbanDropToColumn = async (event, status) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
        setDropTargetStatus(null);
        setDraggingTaskId(null);
        if (!taskId) return;
        const task = tasks.find((item) => String(item._id) === String(taskId));
        if (!task || getTaskStatus(task) === status) return;
        await onTaskStatusChange(task, status);
    };

    return (
        <div className={`tasks-hub ${expandedClass || ''}`}>
            <header className="tasks-hub__header">
                <div>
                    <h1>Task Hub</h1>
                    <p>Cross-event coordination for your organization.</p>
                </div>
                <div className="tasks-hub__header-actions">
                    <button type="button" className="tasks-hub__refresh" onClick={() => refetch()}>
                        <Icon icon="mdi:refresh" />
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="tasks-hub__create-trigger"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Icon icon="mdi:plus" />
                        Create
                    </button>
                    <div className="tasks-hub__view-toggle">
                        <button
                            type="button"
                            className={viewMode === 'list' ? 'active' : ''}
                            onClick={() => setViewMode('list')}
                        >
                            List
                        </button>
                        <button
                            type="button"
                            className={viewMode === 'kanban' ? 'active' : ''}
                            onClick={() => setViewMode('kanban')}
                        >
                            Kanban
                        </button>
                    </div>
                </div>
            </header>

            <Popup
                isOpen={showCreateModal}
                onClose={closeCreateModal}
                customClassName="tasks-hub__create-popup narrow-content"
            >
                <article className="tasks-hub__create-modal">
                    <h2>Create org task</h2>
                    <p>Add an operational task to your organization hub.</p>
                    <form onSubmit={onCreateTask} className="tasks-hub__form">
                        <input
                            value={form.title}
                            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                            placeholder="Task title"
                            maxLength={180}
                        />
                        <textarea
                            value={form.description}
                            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="Description (optional)"
                            rows={3}
                        />
                        <div className="tasks-hub__form-grid">
                            <label>
                                Priority
                                <select
                                    value={form.priority}
                                    onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                                >
                                    {PRIORITY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Status
                                <select
                                    value={form.status}
                                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                                >
                                    <option value="todo">To do</option>
                                    <option value="in_progress">In progress</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                            </label>
                            <label>
                                Due at
                                <input
                                    type="datetime-local"
                                    value={form.dueAt}
                                    onChange={(event) => setForm((prev) => ({ ...prev, dueAt: event.target.value }))}
                                />
                            </label>
                            <label>
                                Owner user id
                                <input
                                    value={form.ownerUserId}
                                    onChange={(event) => setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
                                    placeholder="Optional ObjectId"
                                />
                            </label>
                        </div>
                        <label className="tasks-hub__critical-toggle">
                            <input
                                type="checkbox"
                                checked={form.isCritical}
                                onChange={(event) => setForm((prev) => ({ ...prev, isCritical: event.target.checked }))}
                            />
                            Mark as critical
                        </label>
                        <div className="tasks-hub__modal-actions">
                            <button
                                type="button"
                                className="tasks-hub__modal-cancel"
                                onClick={closeCreateModal}
                            >
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}>
                                <Icon icon={saving ? 'mdi:loading' : 'mdi:plus'} />
                                {saving ? 'Creating...' : 'Create task'}
                            </button>
                        </div>
                    </form>
                </article>
            </Popup>

            <section className="tasks-hub__summary">
                <article className="tasks-hub__summary-card">
                    <span>Total tasks</span>
                    <strong>{summary.total || 0}</strong>
                </article>
                <article className="tasks-hub__summary-card tasks-hub__summary-card--alert">
                    <span>Overdue</span>
                    <strong>{summary.overdue || 0}</strong>
                </article>
                <article className="tasks-hub__summary-card">
                    <span>Blocked</span>
                    <strong>{summary.blocked || 0}</strong>
                </article>
                <article className="tasks-hub__summary-card">
                    <span>High priority</span>
                    <strong>{summary.highPriority || 0}</strong>
                </article>
            </section>

            <section className="tasks-hub__panels">
                <article className="tasks-hub__panel tasks-hub__panel--list">
                    <div className="tasks-hub__toolbar">
                        <input
                            value={filters.search}
                            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                            placeholder="Search tasks"
                        />
                        <select
                            value={filters.status}
                            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="all">All statuses</option>
                            <option value="todo">To do</option>
                            <option value="in_progress">In progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                        </select>
                        <select
                            value={filters.priority}
                            onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
                        >
                            <option value="all">All priorities</option>
                            {PRIORITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select
                            value={filters.eventId}
                            onChange={(event) => setFilters((prev) => ({ ...prev, eventId: event.target.value }))}
                        >
                            <option value="all">All events</option>
                            <option value="null">Org operations only</option>
                            {eventsById.map(([id, name]) => (
                                <option key={id} value={id}>{name}</option>
                            ))}
                        </select>
                        <select
                            value={filters.ownerUserId}
                            onChange={(event) => setFilters((prev) => ({ ...prev, ownerUserId: event.target.value }))}
                        >
                            <option value="all">All members</option>
                            <option value="unassigned">Unassigned</option>
                            {ownersById.map(([id, name]) => (
                                <option key={id} value={id}>{name}</option>
                            ))}
                        </select>
                        <select
                            value={filters.sortBy}
                            onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
                        >
                            <option value="urgency">Sort by urgency</option>
                            <option value="dueAt">Sort by due date</option>
                            <option value="priority">Sort by priority</option>
                        </select>
                        <label>
                            <input
                                type="checkbox"
                                checked={filters.onlyBlocked}
                                onChange={(event) => setFilters((prev) => ({ ...prev, onlyBlocked: event.target.checked }))}
                            />
                            Blocked only
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={filters.onlyOverdue}
                                onChange={(event) => setFilters((prev) => ({ ...prev, onlyOverdue: event.target.checked }))}
                            />
                            Overdue only
                        </label>
                    </div>

                    {loading && <p className="tasks-hub__state">Loading task hub...</p>}
                    {!loading && error && <p className="tasks-hub__state">Error: {error}</p>}
                    {!loading && !error && tasks.length === 0 && (
                        <p className="tasks-hub__state">No tasks match current filters.</p>
                    )}

                    {!loading && !error && tasks.length > 0 && viewMode === 'list' && (
                        <ul className="tasks-hub__task-list">
                            {tasks.map((task) => (
                                <li key={task._id} className={`tasks-hub__task-item tasks-hub__task-item--${getTaskStatus(task)}`}>
                                    <div className="tasks-hub__task-main">
                                        <div className="tasks-hub__task-title-row">
                                            <h3>{task.title}</h3>
                                            <span className={`tasks-hub__priority tasks-hub__priority--${task.priority}`}>
                                                {task.priority}
                                            </span>
                                            {task.isCritical && (
                                                <span className="tasks-hub__critical">critical</span>
                                            )}
                                        </div>
                                        <p>{task.description || 'No description provided.'}</p>
                                        <div className="tasks-hub__meta">
                                            <span>{formatStatusLabel(getTaskStatus(task))}</span>
                                            <span>Due: {formatDate(task.dueAt)}</span>
                                            <span>
                                                Event: {task.eventId?.name || 'Org operations'}
                                            </span>
                                            <span>
                                                Owner: {ownerLabel(task)}
                                            </span>
                                            <span>
                                                Urgency: {Math.round(task.urgencyScore || 0)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="tasks-hub__actions">
                                        <button
                                            type="button"
                                            onClick={() => onTaskStatusChange(task, 'in_progress')}
                                            disabled={(getTaskStatus(task) === 'in_progress')}
                                        >
                                            In progress
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onTaskStatusChange(task, 'done')}
                                            disabled={getTaskStatus(task) === 'done'}
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onTaskStatusChange(task, 'blocked')}
                                            disabled={getTaskStatus(task) === 'blocked'}
                                        >
                                            Block
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!loading && !error && tasks.length > 0 && viewMode === 'kanban' && (
                        <div className="tasks-hub__kanban">
                            {KANBAN_STATUSES.map((status) => {
                                const statusTasks = groupedByStatus[status] || [];
                                return (
                                <section
                                    key={status}
                                    className={`tasks-hub__kanban-column ${dropTargetStatus === status ? 'tasks-hub__kanban-column--drop-target' : ''}`}
                                    onDragOver={(event) => onKanbanDragOverColumn(event, status)}
                                    onDrop={(event) => onKanbanDropToColumn(event, status)}
                                    onDragLeave={() => setDropTargetStatus((current) => (current === status ? null : current))}
                                >
                                    <header>
                                        <h4>{formatStatusLabel(status)}</h4>
                                        <span>{statusTasks.length}</span>
                                    </header>
                                    <div className="tasks-hub__kanban-cards">
                                        {statusTasks.length === 0 && <p className="tasks-hub__kanban-empty">No tasks</p>}
                                        {statusTasks.map((task) => (
                                            <article
                                                key={task._id}
                                                className={`tasks-hub__kanban-card ${draggingTaskId === task._id ? 'tasks-hub__kanban-card--dragging' : ''}`}
                                                draggable
                                                onDragStart={(event) => onKanbanDragStart(event, task)}
                                                onDragEnd={onKanbanDragEnd}
                                            >
                                                <h3>{task.title}</h3>
                                                <div className="tasks-hub__task-title-row">
                                                    <span className={`tasks-hub__priority tasks-hub__priority--${task.priority}`}>
                                                        {task.priority}
                                                    </span>
                                                    {task.isCritical && <span className="tasks-hub__critical">critical</span>}
                                                </div>
                                                {task.description && <p>{task.description}</p>}
                                                <div className="tasks-hub__meta">
                                                    <span>Due: {formatDate(task.dueAt)}</span>
                                                    <span>Owner: {ownerLabel(task)}</span>
                                                </div>
                                                <div className="tasks-hub__actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => onTaskStatusChange(task, 'in_progress')}
                                                        disabled={getTaskStatus(task) === 'in_progress'}
                                                    >
                                                        In progress
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onTaskStatusChange(task, 'done')}
                                                        disabled={getTaskStatus(task) === 'done'}
                                                    >
                                                        Done
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onTaskStatusChange(task, 'blocked')}
                                                        disabled={getTaskStatus(task) === 'blocked'}
                                                    >
                                                        Block
                                                    </button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                                );
                            })}
                        </div>
                    )}
                </article>
            </section>
        </div>
    );
}

export default TasksHub;
