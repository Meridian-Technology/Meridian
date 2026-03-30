import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import apiRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import './TasksHub.scss';

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

    const tasks = useMemo(() => data?.data?.tasks || [], [data]);
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
            setForm(DEFAULT_FORM);
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
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/tasks/hub/${task._id}`,
                { status: nextStatus },
                { method: 'PUT' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Failed to update task');
            }
            refetch();
        } catch (updateError) {
            addNotification({
                title: 'Task update failed',
                message: updateError.message || 'Unable to update task status.',
                type: 'error'
            });
        }
    };

    return (
        <div className={`tasks-hub ${expandedClass || ''}`}>
            <header className="tasks-hub__header">
                <div>
                    <h1>Task Hub</h1>
                    <p>Cross-event coordination for your organization.</p>
                </div>
                <button type="button" className="tasks-hub__refresh" onClick={() => refetch()}>
                    <Icon icon="mdi:refresh" />
                    Refresh
                </button>
            </header>

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
                <article className="tasks-hub__panel tasks-hub__panel--create">
                    <h2>Create org task</h2>
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
                        <button type="submit" disabled={saving}>
                            <Icon icon={saving ? 'mdi:loading' : 'mdi:plus'} />
                            {saving ? 'Creating...' : 'Create task'}
                        </button>
                    </form>
                </article>

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
                    {!loading && !error && tasks.length > 0 && (
                        <ul className="tasks-hub__task-list">
                            {tasks.map((task) => (
                                <li key={task._id} className={`tasks-hub__task-item tasks-hub__task-item--${task.effectiveStatus || task.status}`}>
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
                                            <span>{formatStatusLabel(task.effectiveStatus || task.status)}</span>
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
                                            disabled={(task.status === 'in_progress')}
                                        >
                                            In progress
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onTaskStatusChange(task, 'done')}
                                            disabled={task.status === 'done'}
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onTaskStatusChange(task, 'blocked')}
                                            disabled={task.status === 'blocked'}
                                        >
                                            Block
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>
            </section>
        </div>
    );
}

export default TasksHub;
