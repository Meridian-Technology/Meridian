import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import apiRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import SharedTaskBoard from '../../../components/TaskBoard/SharedTaskBoard';
import TasksHubTaskListCard from '../../../components/TaskBoard/cards/TasksHubTaskListCard';
import TasksHubTaskKanbanCard from '../../../components/TaskBoard/cards/TasksHubTaskKanbanCard';
import TaskAssigneePicker from '../../../components/TaskWorkspace/TaskAssigneePicker';
import TaskDetailPanel from '../../../components/TaskWorkspace/TaskDetailPanel';
import TaskDetailSheet, {
    getTaskDetailSheetPanelWidthPx,
    TASK_DETAIL_SHEET_PANEL_MAX_PX
} from '../../../components/TaskWorkspace/TaskDetailSheet';
import TaskDetailFull from '../../../components/TaskWorkspace/TaskDetailFull';
import TaskBoardColumnsSettings from '../../../components/TaskWorkspace/TaskBoardColumnsSettings';
import { buildTaskDraft, ownerUserFromMembers } from '../../../components/TaskWorkspace/taskWorkspaceUtils';
import {
    DEFAULT_TASK_BOARD_STATUSES,
    formatTaskStatusLabel,
    pickFirstActiveKey,
    pickFirstDoneKey,
    pickFirstBacklogKey
} from '../../../constants/taskBoardDefaults';
import {useGradient} from '../../../hooks/useGradient';
import './TasksHub.scss';

const TASK_BOARD_VIEW_STORAGE_KEY = 'clubdash:task-board:view-mode';

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

function ownerLabel(task) {
    return task.ownerUserId?.name || task.ownerUserId?.username || 'Unassigned';
}

function readStoredViewMode() {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem(TASK_BOARD_VIEW_STORAGE_KEY);
    return stored === 'kanban' || stored === 'list' ? stored : 'list';
}

function TasksHub({ orgId, expandedClass, clubName = '' }) {
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
    const [viewMode, setViewMode] = useState(() => readStoredViewMode());
    const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState({});
    const [detailMode, setDetailMode] = useState('closed');
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [taskDraft, setTaskDraft] = useState(() => buildTaskDraft({ title: '', status: 'todo' }, () => 'todo'));
    const [detailSaving, setDetailSaving] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [assigningTaskId, setAssigningTaskId] = useState(null);
    const [showBoardSettings, setShowBoardSettings] = useState(false);
    const [statusOverrideByTaskId, setStatusOverrideByTaskId] = useState({});
    const [assigneeOverrideByTaskId, setAssigneeOverrideByTaskId] = useState({});
    const taskSheetOpen = detailMode === 'sheet';
    const [taskSheetPadPx, setTaskSheetPadPx] = useState(TASK_DETAIL_SHEET_PANEL_MAX_PX);

    useEffect(() => {
        if (!taskSheetOpen) return undefined;
        const next = () => setTaskSheetPadPx(getTaskDetailSheetPanelWidthPx());
        next();
        window.addEventListener('resize', next);
        return () => window.removeEventListener('resize', next);
    }, [taskSheetOpen]);

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
    const boardStatusesEndpoint = orgId ? `/org-event-management/${orgId}/task-board-statuses` : null;
    const { data: boardStatusesData, refetch: refetchBoardStatuses } = useFetch(boardStatusesEndpoint);
    const membersEndpoint = orgId ? `/org-roles/${orgId}/members` : null;
    const { data: membersData } = useFetch(membersEndpoint);
    const members = membersData?.members || [];

    const boardStatuses = useMemo(() => {
        const list = boardStatusesData?.data?.statuses;
        return Array.isArray(list) && list.length ? list : DEFAULT_TASK_BOARD_STATUSES;
    }, [boardStatusesData]);

    const kanbanColumnKeys = useMemo(() => boardStatuses.map((s) => s.key), [boardStatuses]);

    const formatStatusLabel = useCallback(
        (status) => formatTaskStatusLabel(status, boardStatuses),
        [boardStatuses]
    );

    const activeStatusKey = useMemo(() => pickFirstActiveKey(boardStatuses), [boardStatuses]);
    const doneStatusKey = useMemo(() => pickFirstDoneKey(boardStatuses), [boardStatuses]);
    const activeQuickLabel = useMemo(
        () => boardStatuses.find((s) => s.key === activeStatusKey)?.label || 'Active',
        [boardStatuses, activeStatusKey]
    );
    const doneQuickLabel = useMemo(
        () => boardStatuses.find((s) => s.key === doneStatusKey)?.label || 'Done',
        [boardStatuses, doneStatusKey]
    );

    const detailTaskUrl =
        orgId && selectedTaskId && detailMode !== 'closed'
            ? `/org-event-management/${orgId}/tasks/hub/${selectedTaskId}`
            : null;
    const { data: detailTaskData, refetch: refetchDetailTask } = useFetch(detailTaskUrl);

    const serverTasks = useMemo(() => {
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

    const displayTasks = useMemo(
        () =>
            serverTasks.map((t) => {
                const id = String(t._id);
                if (Object.prototype.hasOwnProperty.call(assigneeOverrideByTaskId, id)) {
                    return { ...t, ownerUserId: assigneeOverrideByTaskId[id] };
                }
                return t;
            }),
        [serverTasks, assigneeOverrideByTaskId]
    );
    const summary = data?.data?.summary || {
        total: 0,
        overdue: 0,
        blocked: 0,
        highPriority: 0
    };

    const eventsById = useMemo(() => {
        const map = new Map();
        displayTasks.forEach((task) => {
            if (task.eventId?._id) {
                map.set(String(task.eventId._id), task.eventId.name || 'Untitled event');
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [displayTasks]);

    const ownersById = useMemo(() => {
        const map = new Map();
        displayTasks.forEach((task) => {
            if (task.ownerUserId?._id) {
                const label = ownerLabel(task);
                map.set(String(task.ownerUserId._id), label);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [displayTasks]);

    const getTaskStatus = useCallback((task) => {
        if (!task?._id) return task?.effectiveStatus || task?.status || 'todo';
        const id = String(task._id);
        const optimistic = optimisticStatusByTaskId[id];
        if (optimistic != null) return optimistic;
        if (Object.prototype.hasOwnProperty.call(statusOverrideByTaskId, id)) {
            return statusOverrideByTaskId[id];
        }
        return task.effectiveStatus || task.status || 'todo';
    }, [optimisticStatusByTaskId, statusOverrideByTaskId]);

    const boardSortedTasks = useMemo(() => {
        const keys = kanbanColumnKeys;
        const colOf = (t) => {
            let k = getTaskStatus(t);
            if (k === 'blocked') k = activeStatusKey || keys[0];
            return k;
        };
        const colIndex = (k) => {
            const i = keys.indexOf(k);
            return i >= 0 ? i : keys.length;
        };
        return [...displayTasks].sort((a, b) => {
            const c = colIndex(colOf(a)) - colIndex(colOf(b));
            if (c !== 0) return c;
            const ra = Number(a.boardRank);
            const rb = Number(b.boardRank);
            const r = (Number.isFinite(ra) ? ra : 0) - (Number.isFinite(rb) ? rb : 0);
            if (r !== 0) return r;
            return String(a._id).localeCompare(String(b._id));
        });
    }, [displayTasks, getTaskStatus, kanbanColumnKeys, activeStatusKey]);

    const groupedByStatus = useMemo(() => {
        const groups = kanbanColumnKeys.reduce((acc, status) => {
            acc[status] = [];
            return acc;
        }, {});
        const activeFallback = activeStatusKey || kanbanColumnKeys[0];
        boardSortedTasks.forEach((task) => {
            let key = getTaskStatus(task);
            if (key === 'blocked') {
                key = activeFallback;
            }
            if (!groups[key]) groups[key] = [];
            groups[key].push(task);
        });
        return groups;
    }, [boardSortedTasks, getTaskStatus, kanbanColumnKeys, activeStatusKey]);

    useEffect(() => {
        const ids = displayTasks.map((task) => String(task?._id || ''));
        const missingIdCount = ids.filter((id) => !id).length;
        const uniqueIds = new Set(ids.filter(Boolean));
        const duplicateIdCount = ids.filter(Boolean).length - uniqueIds.size;
        const statusCounts = kanbanColumnKeys.reduce((acc, status) => {
            acc[status] = (groupedByStatus[status] || []).length;
            return acc;
        }, {});
    }, [displayTasks, groupedByStatus, optimisticStatusByTaskId, viewMode, kanbanColumnKeys]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(TASK_BOARD_VIEW_STORAGE_KEY, viewMode);
    }, [viewMode]);

    useEffect(() => {
        setOptimisticStatusByTaskId((previous) => {
            if (!Object.keys(previous).length) return previous;
            const next = { ...previous };
            let changed = false;
            const taskMap = new Map(serverTasks.map((task) => [String(task._id), task]));
            Object.entries(previous).forEach(([taskId, optimisticStatus]) => {
                const task = taskMap.get(taskId);
                if (!task) {
                    delete next[taskId];
                    changed = true;
                    return;
                }
                const persisted = task.status || 'todo';
                if (persisted === optimisticStatus) {
                    delete next[taskId];
                    changed = true;
                }
            });
            return changed ? next : previous;
        });
    }, [serverTasks]);

    useEffect(() => {
        setStatusOverrideByTaskId((prev) => {
            const keys = Object.keys(prev);
            if (!keys.length) return prev;
            const next = { ...prev };
            let changed = false;
            keys.forEach((taskId) => {
                const task = serverTasks.find((t) => String(t._id) === taskId);
                if (!task) {
                    delete next[taskId];
                    changed = true;
                    return;
                }
                if ((task.status || 'todo') === prev[taskId]) {
                    delete next[taskId];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [serverTasks]);

    useEffect(() => {
        setAssigneeOverrideByTaskId((prev) => {
            const keys = Object.keys(prev);
            if (!keys.length) return prev;
            const next = { ...prev };
            let changed = false;
            keys.forEach((taskId) => {
                const task = serverTasks.find((t) => String(t._id) === taskId);
                if (!task) {
                    delete next[taskId];
                    changed = true;
                    return;
                }
                const serverId =
                    task.ownerUserId?._id != null
                        ? String(task.ownerUserId._id)
                        : task.ownerUserId
                          ? String(task.ownerUserId)
                          : '';
                const override = prev[taskId];
                const overrideId = override == null ? '' : String(override._id || '');
                if (serverId === overrideId) {
                    delete next[taskId];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [serverTasks]);

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setForm({ ...DEFAULT_FORM, status: pickFirstBacklogKey(boardStatuses) });
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
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });
            setStatusOverrideByTaskId((prev) => ({ ...prev, [taskId]: nextStatus }));
        } catch (updateError) {
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                delete next[taskId];
                return next;
            });

            addNotification({
                title: 'Task update failed',
                message: updateError.message || 'Unable to update task status.',
                type: 'error'
            });
            throw updateError;
        }
    };


    const onKanbanDropToColumn = async (task, status) => {
        if (!task?._id) return;
        if (getTaskStatus(task) === status) return;
        await onTaskStatusChange(task, status);
    };

    const handleCommitColumnOrder = useCallback(
        async ({ taskIds }) => {
            if (!orgId || !Array.isArray(taskIds) || !taskIds.length) return;
            try {
                const response = await apiRequest(
                    `/org-event-management/${orgId}/tasks/hub/column-order`,
                    { taskIds },
                    { method: 'PUT' }
                );
                if (!response?.success) {
                    throw new Error(response?.message || response?.error || 'Failed to save task order');
                }
                void refetch({ silent: true });
            } catch (err) {
                addNotification({
                    title: 'Order not saved',
                    message: err.message || 'Unable to save task order.',
                    type: 'error'
                });
                throw err;
            }
        },
        [orgId, refetch, addNotification]
    );

    const handleCardAssigneeChange = useCallback(
        async (task, userId) => {
            if (!orgId || !task?._id) return;
            const taskId = String(task._id);
            const prev =
                task.ownerUserId?._id != null
                    ? String(task.ownerUserId._id)
                    : task.ownerUserId
                      ? String(task.ownerUserId)
                      : '';
            const next = userId ? String(userId) : '';
            if (prev === next) return;
            const nextOwner = next ? ownerUserFromMembers(members, next) : null;
            setAssigneeOverrideByTaskId((p) => ({ ...p, [taskId]: nextOwner }));
            setAssigningTaskId(taskId);
            try {
                const response = await apiRequest(
                    `/org-event-management/${orgId}/tasks/hub/${taskId}`,
                    { ownerUserId: next || null },
                    { method: 'PUT' }
                );
                if (!response?.success) {
                    throw new Error(response?.message || response?.error || 'Failed to update assignee');
                }
                if (String(selectedTaskId) === taskId) {
                    setTaskDraft((d) => ({ ...d, ownerUserId: next }));
                }
            } catch (assignErr) {
                setAssigneeOverrideByTaskId((p) => {
                    const n = { ...p };
                    delete n[taskId];
                    return n;
                });
                addNotification({
                    title: 'Assignee update failed',
                    message: assignErr.message || 'Unable to update assignee.',
                    type: 'error'
                });
            } finally {
                setAssigningTaskId(null);
            }
        },
        [orgId, members, selectedTaskId, addNotification]
    );

    const taskForDetailPanel = useMemo(() => {
        if (!selectedTaskId) return null;
        const id = String(selectedTaskId);
        const fromFetch = detailTaskData?.data?.task;
        let base =
            fromFetch && String(fromFetch._id) === id
                ? fromFetch
                : displayTasks.find((t) => String(t._id) === id) || null;
        if (!base) return null;
        const merged = { ...base };
        if (Object.prototype.hasOwnProperty.call(statusOverrideByTaskId, id)) {
            merged.status = statusOverrideByTaskId[id];
        }
        if (Object.prototype.hasOwnProperty.call(assigneeOverrideByTaskId, id)) {
            merged.ownerUserId = assigneeOverrideByTaskId[id];
        }
        return merged;
    }, [selectedTaskId, detailTaskData, displayTasks, statusOverrideByTaskId, assigneeOverrideByTaskId]);

    const openTaskDetail = useCallback(
        (task, mode = 'sheet') => {
            if (!task?._id) return;
            setSelectedTaskId(String(task._id));
            setDetailMode(mode);
            setDetailError('');
            setTaskDraft(buildTaskDraft(task, getTaskStatus));
        },
        [getTaskStatus]
    );

    const closeTaskDetail = useCallback(() => {
        setDetailMode('closed');
        setSelectedTaskId(null);
        setDetailError('');
    }, []);

    const handleDetailSave = useCallback(async () => {
        if (!orgId || !selectedTaskId || !taskDraft.title.trim()) return;
        setDetailSaving(true);
        setDetailError('');
        try {
            const payload = {
                title: taskDraft.title.trim(),
                description: taskDraft.description.trim(),
                status: taskDraft.status,
                priority: taskDraft.priority,
                isCritical: Boolean(taskDraft.isCritical),
                ownerUserId: taskDraft.ownerUserId || null,
                dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt).toISOString() : null
            };
            const response = await apiRequest(
                `/org-event-management/${orgId}/tasks/hub/${selectedTaskId}`,
                payload,
                { method: 'PUT' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Failed to save task');
            }
            addNotification({
                title: 'Task updated',
                message: 'Your changes were saved.',
                type: 'success'
            });
            const sid = String(selectedTaskId);
            setStatusOverrideByTaskId((prev) => ({ ...prev, [sid]: taskDraft.status }));
            setAssigneeOverrideByTaskId((prev) => ({
                ...prev,
                [sid]: taskDraft.ownerUserId ? ownerUserFromMembers(members, taskDraft.ownerUserId) : null
            }));
            void refetch({ silent: true });
            void refetchDetailTask({ silent: true });
        } catch (saveErr) {
            setDetailError(saveErr.message || 'Unable to save.');
            addNotification({
                title: 'Save failed',
                message: saveErr.message || 'Unable to save task.',
                type: 'error'
            });
        } finally {
            setDetailSaving(false);
        }
    }, [orgId, selectedTaskId, taskDraft, addNotification, members, refetch, refetchDetailTask]);

    return (
        <div
            className={`dash tasks-hub ${expandedClass || ''}${taskSheetOpen ? ' tasks-hub--task-sheet-open' : ''}`}
            style={taskSheetOpen ? { '--task-detail-sheet-pad': `${taskSheetPadPx}px` } : undefined}
        >
            <img src={useGradient().AtlasMain} alt="" className="grad" />
            <header className="header">
                <h1>Task Hub</h1>
                <p>
                    {clubName
                        ? `Cross-event coordination for ${clubName}.`
                        : 'Cross-event coordination for your organization.'}
                </p>
            </header>
            <TaskBoardColumnsSettings
                orgId={orgId}
                isOpen={showBoardSettings}
                onClose={() => setShowBoardSettings(false)}
                onSaved={() => refetchBoardStatuses()}
            />

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
                                    {boardStatuses.map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {s.label}
                                        </option>
                                    ))}
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
                                Assignee
                                <TaskAssigneePicker
                                    members={members}
                                    value={form.ownerUserId}
                                    onChange={(id) => setForm((prev) => ({ ...prev, ownerUserId: id ? String(id) : '' }))}
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

            <div className="tasks-hub__h-scroll-inner">
                    <div className="tasks-hub__actions">
                        <button type="button" className="tasks-hub__refresh" onClick={() => refetch()}>
                            <Icon icon="mdi:refresh" />
                            Refresh
                        </button>
                        <button
                            type="button"
                            className="tasks-hub__board-settings"
                            onClick={() => setShowBoardSettings(true)}
                            title="Customize task columns"
                        >
                            <Icon icon="mdi:view-column" />
                            Columns
                        </button>
                        <button
                            type="button"
                            className="tasks-hub__create-trigger"
                            onClick={() => {
                                setForm({ ...DEFAULT_FORM, status: pickFirstBacklogKey(boardStatuses) });
                                setShowCreateModal(true);
                            }}
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
                            {boardStatuses.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
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
                    {!loading && !error && displayTasks.length === 0 && (
                        <p className="tasks-hub__state">No tasks match current filters.</p>
                    )}

                    {!loading && !error && displayTasks.length > 0 && (
                        <SharedTaskBoard
                            viewMode={viewMode}
                            tasks={boardSortedTasks}
                            statuses={kanbanColumnKeys}
                            groupedByStatus={groupedByStatus}
                            getTaskId={(task) => task._id}
                            getTaskStatus={getTaskStatus}
                            getStatusLabel={formatStatusLabel}
                            onDropToStatus={onKanbanDropToColumn}
                            onCommitColumnOrder={handleCommitColumnOrder}
                            listClassName="tasks-hub-task-board__list"
                            renderListItem={(task, { isDragging, isMoved } = {}) => (
                                <TasksHubTaskListCard
                                    key={task._id}
                                    task={task}
                                    isDragging={isDragging}
                                    isMoved={isMoved}
                                    getTaskStatus={getTaskStatus}
                                    formatStatusLabel={formatStatusLabel}
                                    formatDate={formatDate}
                                    onOpenDetail={(t) => openTaskDetail(t, 'sheet')}
                                    members={members}
                                    assigningTaskId={assigningTaskId}
                                    onAssigneeChange={handleCardAssigneeChange}
                                    activeStatusKey={activeStatusKey}
                                    doneStatusKey={doneStatusKey}
                                    activeQuickLabel={activeQuickLabel}
                                    doneQuickLabel={doneQuickLabel}
                                    onTaskStatusChange={onTaskStatusChange}
                                />
                            )}
                            renderKanbanCard={(task, { isDragging, isMoved }) => (
                                <TasksHubTaskKanbanCard
                                    task={task}
                                    isDragging={isDragging}
                                    isMoved={isMoved}
                                    formatDate={formatDate}
                                    onOpenDetail={(t) => openTaskDetail(t, 'sheet')}
                                    members={members}
                                    assigningTaskId={assigningTaskId}
                                    onAssigneeChange={handleCardAssigneeChange}
                                    activeStatusKey={activeStatusKey}
                                    doneStatusKey={doneStatusKey}
                                    activeQuickLabel={activeQuickLabel}
                                    doneQuickLabel={doneQuickLabel}
                                    getTaskStatus={getTaskStatus}
                                    onTaskStatusChange={onTaskStatusChange}
                                />
                            )}
                        />
                    )}
                </article>
                    </section>
            </div>

            <TaskDetailSheet
                open={detailMode === 'sheet'}
                onClose={closeTaskDetail}
                title={taskForDetailPanel?.title || 'Task'}
                backdrop={false}
                panelWidthPx={taskSheetPadPx}
            >
                {taskForDetailPanel && (
                    <TaskDetailPanel
                        task={taskForDetailPanel}
                        draft={taskDraft}
                        setDraft={setTaskDraft}
                        members={members}
                        orgId={orgId}
                        taskBoardStatuses={boardStatuses}
                        variant="sheet"
                        onClose={closeTaskDetail}
                        onExpand={() => setDetailMode('full')}
                        onSave={handleDetailSave}
                        saving={detailSaving}
                        saveError={detailError}
                    />
                )}
            </TaskDetailSheet>

            <TaskDetailFull
                open={detailMode === 'full'}
                onClose={closeTaskDetail}
                title={taskForDetailPanel?.title || 'Task'}
            >
                {taskForDetailPanel && (
                    <TaskDetailPanel
                        task={taskForDetailPanel}
                        draft={taskDraft}
                        setDraft={setTaskDraft}
                        members={members}
                        orgId={orgId}
                        taskBoardStatuses={boardStatuses}
                        variant="full"
                        onClose={closeTaskDetail}
                        onCollapse={() => setDetailMode('sheet')}
                        onSave={handleDetailSave}
                        saving={detailSaving}
                        saveError={detailError}
                    />
                )}
            </TaskDetailFull>
        </div>
    );
}

export default TasksHub;
