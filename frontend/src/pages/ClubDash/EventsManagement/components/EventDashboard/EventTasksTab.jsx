import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import apiRequest from '../../../../../utils/postRequest';
import { useNotification } from '../../../../../NotificationContext';
import Popup from '../../../../../components/Popup/Popup';
import SharedTaskBoard from '../../../../../components/TaskBoard/SharedTaskBoard';
import EventTasksTaskListCard from '../../../../../components/TaskBoard/cards/EventTasksTaskListCard';
import EventTasksTaskKanbanCard from '../../../../../components/TaskBoard/cards/EventTasksTaskKanbanCard';
import TaskAssigneePicker from '../../../../../components/TaskWorkspace/TaskAssigneePicker';
import TaskDetailPanel from '../../../../../components/TaskWorkspace/TaskDetailPanel';
import TaskDetailSheet, {
    getTaskDetailSheetPanelWidthPx,
    TASK_DETAIL_SHEET_PANEL_MAX_PX
} from '../../../../../components/TaskWorkspace/TaskDetailSheet';
import TaskDetailFull from '../../../../../components/TaskWorkspace/TaskDetailFull';
import TaskBoardColumnsSettings from '../../../../../components/TaskWorkspace/TaskBoardColumnsSettings';
import {
    buildTaskDraft,
    descriptionToPreviewPlain,
    ownerUserFromMembers
} from '../../../../../components/TaskWorkspace/taskWorkspaceUtils';
import {
    DEFAULT_TASK_BOARD_STATUSES,
    formatTaskStatusLabel,
    pickFirstActiveKey,
    pickFirstDoneKey,
    pickFirstBacklogKey
} from '../../../../../constants/taskBoardDefaults';
import './EventTasksTab.scss';

const TASK_BOARD_VIEW_STORAGE_KEY = 'clubdash:task-board:view-mode';

const createDefaultTaskForm = () => ({
    title: '',
    description: '',
    priority: 'medium',
    isCritical: false,
    status: 'todo',
    ownerUserId: '',
    dueMode: 'none',
    dueAt: '',
    dueRule: {
        anchorType: 'event_start',
        offsetValue: 14,
        offsetUnit: 'days',
        direction: 'before'
    }
});

function readStoredViewMode() {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem(TASK_BOARD_VIEW_STORAGE_KEY);
    return stored === 'kanban' || stored === 'list' ? stored : 'list';
}

function EventTasksTab({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [newTask, setNewTask] = useState(createDefaultTaskForm);
    const [submitting, setSubmitting] = useState(false);
    const [actioningTaskId, setActioningTaskId] = useState(null);
    const [viewMode, setViewMode] = useState(() => readStoredViewMode());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [optimisticStatusByTaskId, setOptimisticStatusByTaskId] = useState({});
    const [showSuggestionModal, setShowSuggestionModal] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [applyingSuggestions, setApplyingSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
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

    const membersEndpoint = orgId ? `/org-roles/${orgId}/members` : null;
    const { data: membersData } = useFetch(membersEndpoint);
    const members = membersData?.members || [];

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
    const detailTaskUrl =
        event?._id && orgId && selectedTaskId && detailMode !== 'closed'
            ? `/org-event-management/${orgId}/events/${event._id}/tasks/${selectedTaskId}`
            : null;
    const { data: detailTaskData, refetch: refetchDetailTask } = useFetch(detailTaskUrl);
    const { data: readinessFetchData, refetch: refetchReadiness } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/readiness` : null
    );
    const boardStatusesEndpoint = orgId ? `/org-event-management/${orgId}/task-board-statuses` : null;
    const { data: boardStatusesData, refetch: refetchBoardStatuses } = useFetch(boardStatusesEndpoint);

    const serverTasks = useMemo(() => data?.data?.tasks || [], [data]);

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

    const boardStatuses = useMemo(() => {
        const list = boardStatusesData?.data?.statuses;
        return Array.isArray(list) && list.length ? list : DEFAULT_TASK_BOARD_STATUSES;
    }, [boardStatusesData]);

    const kanbanColumnKeys = useMemo(() => boardStatuses.map((s) => s.key), [boardStatuses]);

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
    const readiness = readinessFetchData?.data || null;

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

        // #endregion
    }, [displayTasks, groupedByStatus, optimisticStatusByTaskId, viewMode, event?._id, kanbanColumnKeys]);

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

    const metrics = useMemo(() => {
        const total = displayTasks.length;
        const done = displayTasks.filter((task) => {
            const st = getTaskStatus(task);
            const row = boardStatuses.find((s) => s.key === st);
            return row?.category === 'done';
        }).length;
        const overdue = displayTasks.filter((task) => task.overdue).length;
        return {
            total,
            done,
            overdue,
            completion: total > 0 ? Math.round((done / total) * 100) : 0
        };
    }, [displayTasks, getTaskStatus, boardStatuses]);

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setNewTask({ ...createDefaultTaskForm(), status: pickFirstBacklogKey(boardStatuses) });
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
            if (newTask.ownerUserId) {
                payload.ownerUserId = newTask.ownerUserId;
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
            refetchReadiness();
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

    const handleQuickStatusChange = async (task, nextStatus) => {
        const taskId = task?._id;
        if (!taskId) return;
        const taskKey = String(taskId);
        const currentStatus = getTaskStatus(task);
        if (currentStatus === nextStatus) return;
        setOptimisticStatusByTaskId((prev) => ({ ...prev, [taskKey]: nextStatus }));
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
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                delete next[taskKey];
                return next;
            });
            setStatusOverrideByTaskId((prev) => ({ ...prev, [taskKey]: nextStatus }));
            void refetchReadiness({ silent: true });
        } catch (updateError) {
            setOptimisticStatusByTaskId((prev) => {
                const next = { ...prev };
                delete next[taskKey];
                return next;
            });
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
            refetchReadiness();
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

    const handleOpenSuggestions = async () => {
        setShowSuggestionModal(true);
        setLoadingSuggestions(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/task-suggestions`,
                null,
                { method: 'GET' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to load suggestions');
            }
            const nextSuggestions = (response?.data?.suggestions || []).map((task, index) => ({
                ...task,
                _selectionId: `${task.key || 'suggestion'}-${index}`,
                selected: true
            }));
            setSuggestions(nextSuggestions);
        } catch (fetchError) {
            addNotification({
                title: 'Suggestion load failed',
                message: fetchError.message || 'Please try again.',
                type: 'error'
            });
            setSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleApplySuggestions = async () => {
        const selectedSuggestions = suggestions.filter((task) => task.selected);
        if (!selectedSuggestions.length) {
            addNotification({
                title: 'No tasks selected',
                message: 'Select at least one suggested task to apply.',
                type: 'error'
            });
            return;
        }
        setApplyingSuggestions(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/tasks/apply-suggestions`,
                {
                    suggestions: selectedSuggestions.map(({ selected, _selectionId, ...task }) => task)
                },
                { method: 'POST' }
            );
            if (!response?.success) {
                throw new Error(response?.message || response?.error || 'Unable to apply suggestions');
            }
            addNotification({
                title: 'Tasks applied',
                message: `Created ${response?.data?.createdCount || selectedSuggestions.length} guided task(s).`,
                type: 'success'
            });
            setShowSuggestionModal(false);
            setSuggestions([]);
            refetch();
            refetchReadiness();
        } catch (applyError) {
            addNotification({
                title: 'Apply failed',
                message: applyError.message || 'Please try again.',
                type: 'error'
            });
        } finally {
            setApplyingSuggestions(false);
        }
    };

    const handleTaskDropToStatus = async (task, nextStatus) => {
        if (!task?._id || !nextStatus) return;
        await handleQuickStatusChange(task, nextStatus);
    };

    const handleCommitColumnOrder = useCallback(
        async ({ taskIds }) => {
            if (!orgId || !event?._id || !Array.isArray(taskIds) || !taskIds.length) return;
            try {
                const response = await apiRequest(
                    `/org-event-management/${orgId}/events/${event._id}/tasks/column-order`,
                    { taskIds },
                    { method: 'PUT' }
                );
                if (!response?.success) {
                    throw new Error(response?.message || response?.error || 'Failed to save task order');
                }
                void refetch({ silent: true });
                void refetchReadiness({ silent: true });
            } catch (err) {
                addNotification({
                    title: 'Order not saved',
                    message: err.message || 'Unable to save task order.',
                    type: 'error'
                });
                throw err;
            }
        },
        [orgId, event?._id, refetch, refetchReadiness, addNotification]
    );

    const handleCardAssigneeChange = useCallback(
        async (task, userId) => {
            if (!orgId || !event?._id || !task?._id) return;
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
                    `/org-event-management/${orgId}/events/${event._id}/tasks/${taskId}`,
                    { ownerUserId: next || null },
                    { method: 'PUT' }
                );
                if (!response?.success) {
                    throw new Error(response?.message || response?.error || 'Failed to update assignee');
                }
                void refetchReadiness({ silent: true });
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
        [orgId, event?._id, members, selectedTaskId, addNotification, refetchReadiness]
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
        if (!orgId || !event?._id || !selectedTaskId || !taskDraft.title.trim()) return;
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
                `/org-event-management/${orgId}/events/${event._id}/tasks/${selectedTaskId}`,
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
            void refetchReadiness({ silent: true });
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
    }, [orgId, event?._id, selectedTaskId, taskDraft, addNotification, members, refetch, refetchDetailTask, refetchReadiness]);

    const formatStatusLabel = useCallback(
        (status) => formatTaskStatusLabel(status, boardStatuses),
        [boardStatuses]
    );

    return (
        <div
            className={`event-tasks-tab${taskSheetOpen ? ' event-tasks-tab--task-sheet-open' : ''}`}
            style={taskSheetOpen ? { '--task-detail-sheet-pad': `${taskSheetPadPx}px` } : undefined}
        >
            <TaskBoardColumnsSettings
                orgId={orgId}
                isOpen={showBoardSettings}
                onClose={() => setShowBoardSettings(false)}
                onSaved={() => refetchBoardStatuses()}
            />

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
                                {boardStatuses.map((s) => (
                                    <option key={s.key} value={s.key}>
                                        {s.label}
                                    </option>
                                ))}
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
                        <label className="event-tasks-tab__assignee-field">
                            <span>Assignee</span>
                            <TaskAssigneePicker
                                members={members}
                                value={newTask.ownerUserId}
                                onChange={(id) => setNewTask((prev) => ({ ...prev, ownerUserId: id ? String(id) : '' }))}
                            />
                        </label>
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

            <Popup
                isOpen={showSuggestionModal}
                onClose={() => setShowSuggestionModal(false)}
                customClassName="event-tasks-tab__create-popup narrow-content"
            >
                <div className="event-tasks-tab__modal">
                    <div className="event-tasks-tab__modal-header">
                        <h4>Guided task setup</h4>
                        <p>Select the suggested tasks you want to apply for this event.</p>
                    </div>
                    {loadingSuggestions ? (
                        <div className="event-tasks-tab__state">
                            <Icon icon="mdi:loading" className="spin" />
                            <span>Loading suggestions…</span>
                        </div>
                    ) : (
                        <div className="event-tasks-tab__suggestions-list">
                            {suggestions.map((task) => (
                                <label key={task._selectionId} className="event-tasks-tab__suggestion-item">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(task.selected)}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setSuggestions((prev) => prev.map((item) => (
                                                item._selectionId === task._selectionId
                                                    ? { ...item, selected: checked }
                                                    : item
                                            )));
                                        }}
                                    />
                                    <div>
                                        <strong>{task.title}</strong>
                                        {task.description && (
                                            <p>{descriptionToPreviewPlain(task.description)}</p>
                                        )}
                                    </div>
                                </label>
                            ))}
                            {suggestions.length === 0 && (
                                <p className="event-tasks-tab__state">No suggestions available right now.</p>
                            )}
                        </div>
                    )}
                    <div className="event-tasks-tab__modal-actions">
                        <button
                            type="button"
                            className="event-tasks-tab__modal-cancel"
                            onClick={() => setShowSuggestionModal(false)}
                        >
                            Cancel
                        </button>
                        <button type="button" onClick={handleApplySuggestions} disabled={applyingSuggestions || loadingSuggestions}>
                            {applyingSuggestions ? 'Applying…' : 'Apply selected'}
                        </button>
                    </div>
                </div>
            </Popup>

            <div className="event-tasks-tab__h-scroll-inner">
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
                                className="event-tasks-tab__columns-btn"
                                onClick={() => setShowBoardSettings(true)}
                                title="Customize task columns for this organization"
                            >
                                <Icon icon="mdi:view-column" />
                                Columns
                            </button>
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
                                onClick={() => {
                                    setNewTask({ ...createDefaultTaskForm(), status: pickFirstBacklogKey(boardStatuses) });
                                    setShowCreateModal(true);
                                }}
                            >
                                <Icon icon="mdi:plus" />
                                Create
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenSuggestions}
                                disabled={loadingSuggestions}
                            >
                                {loadingSuggestions ? 'Loading suggestions…' : 'Suggest tasks'}
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
                            <button
                                type="button"
                                className="event-tasks-tab__readiness-action"
                                onClick={() => {
                                    setStatusFilter(activeStatusKey);
                                    setPriorityFilter('high');
                                }}
                            >
                                Focus blockers
                            </button>
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
                    {boardStatuses.map((s) => (
                        <option key={s.key} value={s.key}>
                            {s.label}
                        </option>
                    ))}
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

                    {!loading && !error && (
                <SharedTaskBoard
                    viewMode={viewMode}
                    tasks={boardSortedTasks}
                    statuses={kanbanColumnKeys}
                    groupedByStatus={groupedByStatus}
                    getTaskId={(task) => task._id}
                    getTaskStatus={getTaskStatus}
                    getStatusLabel={formatStatusLabel}
                    onDropToStatus={handleTaskDropToStatus}
                    onCommitColumnOrder={handleCommitColumnOrder}
                    listClassName="event-tasks-tab__list"
                    // onDragStartTask={(task) => {
                    //     // #region agent log
                    //     appendAgentDebugLog({
                    //         hypothesisId: 'B',
                    //         location: 'EventTasksTab.jsx:onDragStart',
                    //         message: 'Drag start',
                    //         data: { taskId: String(task?._id || ''), sourceStatus: getTaskStatus(task) }
                    //     });
                    //     // #endregion
                    // }}
                    // onDropTask={({ taskId, task, sourceStatus, targetStatus }) => {
                    //     // #region agent log
                    //     appendAgentDebugLog({
                    //         hypothesisId: 'B',
                    //         location: 'EventTasksTab.jsx:onDrop',
                    //         message: 'Drop received',
                    //         data: {
                    //             taskId: String(taskId || ''),
                    //             foundTask: Boolean(task),
                    //             sourceStatus,
                    //             targetStatus
                    //         }
                    //     });
                    //     // #endregion
                    // }}
                    renderEmptyList={() => (
                        <div className="event-tasks-tab__empty">
                            <Icon icon="mdi:clipboard-text-outline" />
                            <p>No tasks yet. Start with the critical execution steps for this event.</p>
                        </div>
                    )}
                    renderListItem={(task, { isDragging, isMoved } = {}) => (
                        <EventTasksTaskListCard
                            key={task._id}
                            task={task}
                            isDragging={isDragging}
                            isMoved={isMoved}
                            getTaskStatus={getTaskStatus}
                            formatStatusLabel={formatStatusLabel}
                            onOpenDetail={(t) => openTaskDetail(t, 'sheet')}
                            members={members}
                            assigningTaskId={assigningTaskId}
                            onAssigneeChange={handleCardAssigneeChange}
                            boardStatuses={boardStatuses}
                            doneStatusKey={doneStatusKey}
                            activeStatusKey={activeStatusKey}
                            activeQuickLabel={activeQuickLabel}
                            doneQuickLabel={doneQuickLabel}
                            onQuickStatusChange={handleQuickStatusChange}
                            onDeleteTask={handleDeleteTask}
                            actioningTaskId={actioningTaskId}
                        />
                    )}
                    renderKanbanCard={(task, { isDragging, isMoved }) => (
                        <EventTasksTaskKanbanCard
                            task={task}
                            isDragging={isDragging}
                            isMoved={isMoved}
                            onOpenDetail={(t) => openTaskDetail(t, 'sheet')}
                            members={members}
                            assigningTaskId={assigningTaskId}
                            onAssigneeChange={handleCardAssigneeChange}
                        />
                    )}
                />
                    )}
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
                        currentEventId={event?._id}
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
                        currentEventId={event?._id}
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

export default EventTasksTab;
