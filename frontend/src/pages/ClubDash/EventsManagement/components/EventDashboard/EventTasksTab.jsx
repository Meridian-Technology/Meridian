import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import Popup from '../../../../../components/Popup/Popup';
import './EventTasksTab.scss';

const KANBAN_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

const createDefaultTaskForm = () => ({
    title: '',
    description: '',
    priority: 'medium',
    isCritical: false,
    status: 'todo',
    dueMode: 'none',
    dueAt: '',
    dueRule: {
        anchorType: 'event_start',
        offsetValue: 14,
        offsetUnit: 'days',
        direction: 'before'
    }
});

function StatusPill({ status }) {
    return <span className={`event-task-status-pill ${status}`}>{status.replace('_', ' ')}</span>;
}

function PriorityPill({ priority }) {
    return <span className={`event-task-priority-pill ${priority}`}>{priority}</span>;
}

function EventTasksTab({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [newTask, setNewTask] = useState(createDefaultTaskForm);
    const [submitting, setSubmitting] = useState(false);
    const [actioningTaskId, setActioningTaskId] = useState(null);
    const [viewMode, setViewMode] = useState('list');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [dragTaskId, setDragTaskId] = useState(null);
    const [dragOverStatus, setDragOverStatus] = useState(null);
    const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState({});

    const query = useMemo(() => {
        const params = new URLSearchParams();
        params.set('status', statusFilter);
        params.set('priority', priorityFilter);
        if (search.trim()) params.set('search', search.trim());
        return params.toString();
    }, [statusFilter, priorityFilter, search]);

    const { data, loading, error, refetch } = useFetch(
        event?._id && orgId
            ? `/org-event-management/${orgId}/events/${event._id}/tasks?${query}`
            : null
    );
    const readinessRequest = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/readiness` : null
    );

    const tasks = useMemo(() => data?.data?.tasks || [], [data]);
    const readiness = readinessRequest.data?.data || null;

    const groupedByStatus = useMemo(() => {
        const groups = KANBAN_STATUSES.reduce((acc, status) => {
            acc[status] = [];
            return acc;
        }, {});
        tasks.forEach((task) => {
            const effectiveStatus = optimisticStatusByTaskId[String(task._id)] || task.effectiveStatus || task.status || 'todo';
            if (!groups[effectiveStatus]) groups[effectiveStatus] = [];
            groups[effectiveStatus].push(task);
        });
        return groups;
    }, [tasks, optimisticStatusByTaskId]);

    const metrics = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter((task) => task.status === 'done').length;
        const blocked = tasks.filter((task) => task.effectiveStatus === 'blocked').length;
        const overdue = tasks.filter((task) => task.overdue).length;
        return {
            total,
            done,
            blocked,
            overdue,
            completion: total > 0 ? Math.round((done / total) * 100) : 0
        };
    }, [tasks]);

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setNewTask(createDefaultTaskForm());
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!newTask.title.trim()) {
            addNotification({
                title: 'Task title required',
                message: 'Please enter a task title before adding.',
                type: 'error'
            });
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                title: newTask.title.trim(),
                description: newTask.description.trim(),
                priority: newTask.priority,
                status: newTask.status,
                isCritical: newTask.isCritical,
                userConfirmed: true
            };
            if (newTask.dueMode === 'absolute' && newTask.dueAt) {
                payload.dueAt = new Date(newTask.dueAt).toISOString();
            }
            if (newTask.dueMode === 'relative') {
                payload.dueRule = {
                    anchorType: newTask.dueRule.anchorType,
                    offsetValue: Number(newTask.dueRule.offsetValue) || 0,
                    offsetUnit: newTask.dueRule.offsetUnit,
                    direction: newTask.dueRule.direction
                };
            }

            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/tasks`,
                payload,
                { method: 'POST' }
            );

            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to create task');
            }

            addNotification({
                title: 'Task created',
                message: 'Task added to this event execution plan.',
                type: 'success'
            });
            closeCreateModal();
            refetch();
            onRefresh?.();
            readinessRequest.refetch();
        } catch (createError) {
            addNotification({
                title: 'Failed to create task',
                message: createError.message || 'Please try again.',
                type: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleQuickStatusChange = async (taskId, nextStatus) => {
        setActioningTaskId(taskId);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/tasks/${taskId}`,
                { status: nextStatus },
                { method: 'PUT' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to update task');
            }
            refetch();
            onRefresh?.();
        } catch (updateError) {
            addNotification({
                title: 'Task update failed',
                message: updateError.message || 'Please try again.',
                type: 'error'
            });
            throw updateError;
        } finally {
            setActioningTaskId(null);
        }
    };

    const handleRecomputeDueDates = async () => {
        setActioningTaskId('recompute');
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/tasks/recompute-due-dates`,
                {},
                { method: 'POST' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to recompute due dates');
            }
            addNotification({
                title: 'Due dates updated',
                message: `Recomputed ${response?.data?.updatedCount || 0} task deadline(s).`,
                type: 'success'
            });
            refetch();
            readinessRequest.refetch();
        } catch (recomputeError) {
            addNotification({
                title: 'Recompute failed',
                message: recomputeError.message || 'Please try again.',
                type: 'error'
            });
        } finally {
            setActioningTaskId(null);
        }
    };

    const handleDeleteTask = async (taskId) => {
        setActioningTaskId(taskId);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/tasks/${taskId}`,
                null,
                { method: 'DELETE' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to delete task');
            }
            refetch();
            onRefresh?.();
        } catch (deleteError) {
            addNotification({
                title: 'Task deletion failed',
                message: deleteError.message || 'Please try again.',
                type: 'error'
            });
        } finally {
            setActioningTaskId(null);
        }
    };

    const handleTaskDropToStatus = async (task, nextStatus) => {
        if (!task?._id || !nextStatus) return;
        const taskKey = String(task._id);
        const currentStatus = optimisticStatusByTaskId[taskKey] || task.effectiveStatus || task.status;
        if (currentStatus === nextStatus) return;
        setOptimisticStatusByTaskId((prev) => ({ ...prev, [taskKey]: nextStatus }));
        try {
            await handleQuickStatusChange(task._id, nextStatus);
        } catch (_error) {
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                delete next[taskKey];
                return next;
            });
            return;
        }
        setOptimisticStatusByTaskId((prev) => {
            const next = { ...prev };
            delete next[taskKey];
            return next;
        });
    };

    return (
        <div className="event-tasks-tab">
            <div className="event-tasks-tab__header">
                <div>
                    <h3>
                        <Icon icon="mdi:clipboard-check-multiple-outline" />
                        Event Tasks
                    </h3>
                    <p>Plan and execute this event with guided, user-controlled tasks.</p>
                </div>
                <div className="event-tasks-tab__header-actions">
                    <button
                        type="button"
                        onClick={handleRecomputeDueDates}
                        disabled={actioningTaskId === 'recompute'}
                    >
                        {actioningTaskId === 'recompute' ? 'Recomputing…' : 'Recompute due dates'}
                    </button>
                    <button
                        type="button"
                        className="event-tasks-tab__create-trigger"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Icon icon="mdi:plus" />
                        Create
                    </button>
                    <div className="event-tasks-tab__view-toggle">
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
            </div>

            <Popup
                isOpen={showCreateModal}
                onClose={closeCreateModal}
                customClassName="event-tasks-tab__create-popup narrow-content"
            >
                <div className="event-tasks-tab__modal">
                    <div className="event-tasks-tab__modal-header">
                        <h4>Create task</h4>
                        <p>Add a new execution task for this event.</p>
                    </div>
                    <form className="event-tasks-tab__modal-form" onSubmit={handleCreateTask}>
                        <div className="event-tasks-tab__modal-grid">
                            <input
                                type="text"
                                placeholder="Task title"
                                value={newTask.title}
                                onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                                maxLength={180}
                            />
                            <select
                                value={newTask.priority}
                                onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value }))}
                            >
                                <option value="low">Low priority</option>
                                <option value="medium">Medium priority</option>
                                <option value="high">High priority</option>
                                <option value="critical">Critical priority</option>
                            </select>
                            <select
                                value={newTask.status}
                                onChange={(e) => setNewTask((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="todo">To do</option>
                                <option value="in_progress">In progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="done">Done</option>
                            </select>
                            <label className="event-tasks-tab__critical-toggle">
                                <input
                                    type="checkbox"
                                    checked={newTask.isCritical}
                                    onChange={(e) => setNewTask((prev) => ({ ...prev, isCritical: e.target.checked }))}
                                />
                                Critical
                            </label>
                        </div>
                        <textarea
                            placeholder="Optional context for collaborators"
                            value={newTask.description}
                            onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                            rows={3}
                        />
                        <div className="event-tasks-tab__modal-grid event-tasks-tab__modal-grid--deadline">
                            <select
                                value={newTask.dueMode}
                                onChange={(e) => setNewTask((prev) => ({ ...prev, dueMode: e.target.value }))}
                            >
                                <option value="none">No deadline</option>
                                <option value="absolute">Fixed date/time</option>
                                <option value="relative">Relative to event</option>
                            </select>
                            {newTask.dueMode === 'absolute' && (
                                <input
                                    type="datetime-local"
                                    value={newTask.dueAt}
                                    onChange={(e) => setNewTask((prev) => ({ ...prev, dueAt: e.target.value }))}
                                />
                            )}
                            {newTask.dueMode === 'relative' && (
                                <>
                                    <select
                                        value={newTask.dueRule.anchorType}
                                        onChange={(e) => setNewTask((prev) => ({
                                            ...prev,
                                            dueRule: { ...prev.dueRule, anchorType: e.target.value }
                                        }))}
                                    >
                                        <option value="event_start">Event start</option>
                                        <option value="event_end">Event end</option>
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newTask.dueRule.offsetValue}
                                        onChange={(e) => setNewTask((prev) => ({
                                            ...prev,
                                            dueRule: { ...prev.dueRule, offsetValue: e.target.value }
                                        }))}
                                    />
                                    <select
                                        value={newTask.dueRule.offsetUnit}
                                        onChange={(e) => setNewTask((prev) => ({
                                            ...prev,
                                            dueRule: { ...prev.dueRule, offsetUnit: e.target.value }
                                        }))}
                                    >
                                        <option value="days">days</option>
                                        <option value="weeks">weeks</option>
                                        <option value="hours">hours</option>
                                    </select>
                                    <select
                                        value={newTask.dueRule.direction}
                                        onChange={(e) => setNewTask((prev) => ({
                                            ...prev,
                                            dueRule: { ...prev.dueRule, direction: e.target.value }
                                        }))}
                                    >
                                        <option value="before">before</option>
                                        <option value="after">after</option>
                                    </select>
                                </>
                            )}
                        </div>
                        <div className="event-tasks-tab__modal-actions">
                            <button
                                type="button"
                                className="event-tasks-tab__modal-cancel"
                                onClick={closeCreateModal}
                            >
                                Cancel
                            </button>
                            <button type="submit" disabled={submitting}>
                                {submitting ? 'Creating…' : 'Create task'}
                            </button>
                        </div>
                    </form>
                </div>
            </Popup>

            <div className="event-tasks-tab__metrics">
                <div className="metric-card">
                    <span className="metric-label">Tasks</span>
                    <strong>{metrics.total}</strong>
                </div>
                <div className="metric-card">
                    <span className="metric-label">Completion</span>
                    <strong>{metrics.completion}%</strong>
                </div>
                <div className="metric-card">
                    <span className="metric-label">Blocked</span>
                    <strong>{metrics.blocked}</strong>
                </div>
                <div className="metric-card">
                    <span className="metric-label">Overdue</span>
                    <strong>{metrics.overdue}</strong>
                </div>
            </div>

            {readiness && (
                <div className="event-tasks-tab__readiness">
                    <div className="event-tasks-tab__readiness-top">
                        <div>
                            <p className="event-tasks-tab__readiness-score">{readiness.score}% readiness</p>
                            <p className="event-tasks-tab__task-meta">
                                Band: <strong>{(readiness.band || 'not_ready').replace('_', ' ')}</strong>
                            </p>
                        </div>
                        <div className="event-tasks-tab__readiness-breakdown">
                            <span>Tasks {readiness.dimensions?.taskCompletion ?? 0}%</span>
                            <span>Approvals {readiness.dimensions?.approvals ?? 0}%</span>
                            <span>Logistics {readiness.dimensions?.logistics ?? 0}%</span>
                            <span>Engagement {readiness.dimensions?.engagementReadiness ?? 0}%</span>
                        </div>
                    </div>
                    {(readiness.blockers || []).length > 0 && (
                        <div className="event-tasks-tab__readiness-blockers">
                            <strong>Blockers:</strong>{' '}
                            {readiness.blockers.map((blocker) => blocker.label).join(' • ')}
                        </div>
                    )}
                </div>
            )}

            <div className="event-tasks-tab__filters">
                <input
                    type="text"
                    placeholder="Search tasks"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                    <option value="all">All priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                </select>
            </div>

            {loading && (
                <div className="event-tasks-tab__state">
                    <Icon icon="mdi:loading" className="spin" />
                    <span>Loading tasks…</span>
                </div>
            )}
            {!loading && error && (
                <div className="event-tasks-tab__state error">
                    <Icon icon="mdi:alert-circle-outline" />
                    <span>Unable to load tasks: {error}</span>
                </div>
            )}

            {!loading && !error && viewMode === 'list' && (
                <div className="event-tasks-tab__list">
                    {tasks.length === 0 ? (
                        <div className="event-tasks-tab__empty">
                            <Icon icon="mdi:clipboard-text-outline" />
                            <p>No tasks yet. Start with the critical execution steps for this event.</p>
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <article key={task._id} className="event-task-item">
                                <header>
                                    <h5>{task.title}</h5>
                                    <div className="task-badges">
                                        <StatusPill status={task.effectiveStatus || task.status} />
                                        <PriorityPill priority={task.priority} />
                                        {task.isCritical && <span className="critical-badge">critical</span>}
                                        {task.overdue && <span className="overdue-badge">overdue</span>}
                                    </div>
                                </header>
                                {task.description && <p>{task.description}</p>}
                                <footer>
                                    <span>
                                        Due: {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date'}
                                    </span>
                                    <div className="task-actions">
                                        {task.status !== 'done' && (
                                            <button
                                                type="button"
                                                onClick={() => handleQuickStatusChange(task._id, 'done')}
                                                disabled={actioningTaskId === task._id}
                                            >
                                                Mark done
                                            </button>
                                        )}
                                        {task.status === 'todo' && (
                                            <button
                                                type="button"
                                                onClick={() => handleQuickStatusChange(task._id, 'in_progress')}
                                                disabled={actioningTaskId === task._id}
                                            >
                                                Start
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => handleDeleteTask(task._id)}
                                            disabled={actioningTaskId === task._id}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </footer>
                            </article>
                        ))
                    )}
                </div>
            )}

            {!loading && !error && viewMode === 'kanban' && (
                <div className="event-tasks-tab__kanban">
                    {KANBAN_STATUSES.map((status) => {
                        const statusTasks = groupedByStatus[status] || [];
                        return (
                        <section
                            key={status}
                            className={`kanban-column ${dragOverStatus === status ? 'drop-target' : ''}`}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                if (dragOverStatus !== status) {
                                    setDragOverStatus(status);
                                }
                            }}
                            onDragLeave={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) {
                                    setDragOverStatus((prev) => (prev === status ? null : prev));
                                }
                            }}
                            onDrop={async (event) => {
                                event.preventDefault();
                                const taskId = event.dataTransfer.getData('text/plain') || String(dragTaskId || '');
                                const droppedTask = tasks.find((item) => String(item._id) === taskId);
                                await handleTaskDropToStatus(droppedTask, status);
                                setDragTaskId(null);
                                setDragOverStatus(null);
                            }}
                        >
                            <header>
                                <h4>{status.replace('_', ' ')}</h4>
                                <span>{statusTasks.length}</span>
                            </header>
                            <div className="kanban-column__cards">
                                {statusTasks.length === 0 && <p className="kanban-empty">No tasks</p>}
                                {statusTasks.map((task) => (
                                    <div
                                        key={task._id}
                                        className={`kanban-card ${dragTaskId === task._id ? 'dragging' : ''}`}
                                        draggable
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData('text/plain', String(task._id));
                                            event.dataTransfer.effectAllowed = 'move';
                                            setDragTaskId(task._id);
                                        }}
                                        onDragEnd={() => {
                                            setDragTaskId(null);
                                            setDragOverStatus(null);
                                        }}
                                    >
                                        <h5>{task.title}</h5>
                                        <div className="task-badges">
                                            <PriorityPill priority={task.priority} />
                                            {task.isCritical && <span className="critical-badge">critical</span>}
                                        </div>
                                        {task.description && <p>{task.description}</p>}
                                    </div>
                                ))}
                            </div>
                        </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default EventTasksTab;
