import React, { useCallback, useMemo, useState } from 'react';
import { useFetch } from '../../../../../hooks/useFetch';
import apiRequest from '../../../../../utils/postRequest';
import TaskDetailPanel from '../../../../../components/TaskWorkspace/TaskDetailPanel';
import TaskDetailSheet from '../../../../../components/TaskWorkspace/TaskDetailSheet';
import TaskDetailFull from '../../../../../components/TaskWorkspace/TaskDetailFull';
import { buildTaskDraft } from '../../../../../components/TaskWorkspace/taskWorkspaceUtils';
import { DEFAULT_TASK_BOARD_STATUSES } from '../../../../../constants/taskBoardDefaults';
import './EventPlanningOverviewSnapshot.scss';

function formatMonthDay(value) {
    if (!value) return 'TBD';
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

function formatDueDay(value) {
    if (!value) return 'TBD';
    return new Date(value).toLocaleDateString('en-US', { weekday: 'short' });
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isSameOrAfterDay(a, b) {
    return a.getTime() >= b.getTime();
}

function isSameOrBeforeDay(a, b) {
    return a.getTime() <= b.getTime();
}

function resolveEventCreatedAt(event) {
    return (
        event?.createdAt
        || event?.created_at
        || event?.createdOn
        || event?.created_on
        || event?.timestamps?.createdAt
        || null
    );
}

function toDisplayTitle(task) {
    return task?.title || task?.name || 'Untitled task';
}

function toTaskStatus(task) {
    return task?.effectiveStatus || task?.status || '';
}

function isDoneStatus(task) {
    return /(done|completed|cancelled|canceled)/i.test(toTaskStatus(task));
}

function getTaskOwnerId(task) {
    const ownerRaw = task?.ownerUserId || task?.assigneeUserId || task?.assignedToUserId || null;
    if (!ownerRaw) return '';
    if (typeof ownerRaw === 'object') {
        return String(ownerRaw?._id || ownerRaw?.id || '');
    }
    return String(ownerRaw);
}

function EventPlanningOverviewSnapshot({ event, orgId, userId, onOpenTasks }) {
    const [detailMode, setDetailMode] = useState('closed');
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [taskDraft, setTaskDraft] = useState(() => buildTaskDraft({ title: '', status: 'todo' }, () => 'todo'));
    const [detailSaving, setDetailSaving] = useState(false);
    const [detailError, setDetailError] = useState('');
    const tasksUrl = event?._id && orgId
        ? `/org-event-management/${orgId}/events/${event._id}/tasks?status=all&priority=all`
        : null;

    const { data: tasksData, refetch: refetchTasks } = useFetch(tasksUrl);
    const tasks = tasksData?.data?.tasks || [];
    const membersEndpoint = orgId ? `/org-roles/${orgId}/members` : null;
    const { data: membersData } = useFetch(membersEndpoint);
    const members = membersData?.members || [];
    const boardStatusesEndpoint = orgId ? `/org-event-management/${orgId}/task-board-statuses` : null;
    const { data: boardStatusesData } = useFetch(boardStatusesEndpoint);
    const boardStatuses = useMemo(() => {
        const list = boardStatusesData?.data?.statuses;
        return Array.isArray(list) && list.length ? list : DEFAULT_TASK_BOARD_STATUSES;
    }, [boardStatusesData]);

    const now = new Date();
    const eventStart = event?.start_time ? new Date(event.start_time) : null;
    const eventEndRaw = event?.end_time ? new Date(event.end_time) : null;
    const eventEnd = eventEndRaw || eventStart;
    const createdAt = resolveEventCreatedAt(event);
    const timelineStart = createdAt ? startOfDay(createdAt) : null;
    const timelineEnd = eventEnd ? startOfDay(eventEnd) : null;
    const liveStartDay = eventStart ? startOfDay(eventStart) : null;
    const liveEndDay = eventEnd ? startOfDay(eventEnd) : liveStartDay;
    const todayStart = startOfDay(now);
    const currentUserId = userId ? String(userId) : '';
    const countdownMs = eventStart ? Math.max(eventStart.getTime() - now.getTime(), 0) : 0;
    const days = Math.floor(countdownMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((countdownMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((countdownMs % (1000 * 60 * 60)) / (1000 * 60));
    const totalHours = Math.floor(countdownMs / (1000 * 60 * 60));

    const countdownDisplay = useMemo(() => {
        if (!eventStart) {
            return {
                primaryValue: '--',
                primaryLabel: 'days',
                secondaryText: 'Time TBD'
            };
        }
        if (countdownMs >= 1000 * 60 * 60 * 24) {
            return {
                primaryValue: days,
                primaryLabel: 'days',
                secondaryText: `${hours} hrs - ${minutes} min`
            };
        }
        return {
            primaryValue: totalHours,
            primaryLabel: 'hrs',
            secondaryText: `${minutes} min`
        };
    }, [countdownMs, days, eventStart, hours, minutes, totalHours]);

    const upcomingTasks = useMemo(() => {
        const activeTasks = tasks.filter((task) => {
            if (isDoneStatus(task)) return false;
            if (!currentUserId) return false;
            return getTaskOwnerId(task) === currentUserId;
        });
        activeTasks.sort((a, b) => {
            const aDue = a?.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
            const bDue = b?.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
            if (aDue !== bDue) return aDue - bDue;
            const aCreated = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bCreated = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return aCreated - bCreated;
        });
        return activeTasks.slice(0, 4);
    }, [tasks, currentUserId]);

    const timelineDots = useMemo(() => {
        if (!timelineStart || !timelineEnd || timelineEnd < timelineStart) return [];

        const dots = [];
        const current = new Date(timelineStart);
        while (current <= timelineEnd) {
            const dotDay = new Date(current);
            dotDay.setHours(0, 0, 0, 0);
            dots.push({
                key: dotDay.toISOString(),
                isPast: dotDay < todayStart,
                isToday: dotDay.getTime() === todayStart.getTime(),
                isLive:
                    liveStartDay
                    && liveEndDay
                    && isSameOrAfterDay(dotDay, liveStartDay)
                    && isSameOrBeforeDay(dotDay, liveEndDay)
            });
            current.setDate(current.getDate() + 1);
        }
        return dots;
    }, [timelineStart, timelineEnd, todayStart, liveStartDay, liveEndDay]);

    const detailTaskUrl =
        event?._id && orgId && selectedTaskId && detailMode !== 'closed'
            ? `/org-event-management/${orgId}/events/${event._id}/tasks/${selectedTaskId}`
            : null;
    const { data: detailTaskData, refetch: refetchDetailTask } = useFetch(detailTaskUrl);

    const taskForDetailPanel = useMemo(() => {
        if (!selectedTaskId) return null;
        const id = String(selectedTaskId);
        const fromFetch = detailTaskData?.data?.task;
        if (fromFetch && String(fromFetch._id) === id) return fromFetch;
        return tasks.find((task) => String(task?._id) === id) || null;
    }, [detailTaskData, selectedTaskId, tasks]);

    const openTaskDetail = useCallback(
        (task) => {
            if (!task?._id) return;
            setSelectedTaskId(String(task._id));
            setDetailMode('full');
            setDetailError('');
            setTaskDraft(buildTaskDraft(task, toTaskStatus));
        },
        []
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
            await refetchTasks?.({ silent: true });
            await refetchDetailTask?.({ silent: true });
        } catch (saveErr) {
            setDetailError(saveErr.message || 'Unable to save.');
        } finally {
            setDetailSaving(false);
        }
    }, [event?._id, orgId, refetchDetailTask, refetchTasks, selectedTaskId, taskDraft]);

    return (
        <section className="event-planning-overview-snapshot">
            <div className="event-planning-overview-snapshot__countdown">
                <p className="event-planning-overview-snapshot__eyebrow">Event starts in</p>
                <div className="event-planning-overview-snapshot__clock">
                    <strong>{countdownDisplay.primaryValue}</strong>
                    <div>
                        <span>{countdownDisplay.primaryLabel}</span>
                        <small>{countdownDisplay.secondaryText}</small>
                    </div>
                </div>
                <div className="event-planning-overview-snapshot__timeline">
                    <div
                        className="event-planning-overview-snapshot__timeline-dots"
                        aria-hidden
                        style={{
                            gridTemplateColumns: `repeat(${Math.max(timelineDots.length, 1)}, minmax(0, 1fr))`
                        }}
                    >
                        {timelineDots.map((dot) => (
                            <span
                                key={dot.key}
                                className={`event-planning-overview-snapshot__day-segment${dot.isPast ? ' is-past' : ''}${dot.isToday ? ' is-today' : ''}${dot.isLive ? ' is-live' : ''}`}
                            />
                        ))}
                    </div>
                    <div className="event-planning-overview-snapshot__timeline-labels">
                        <span>{formatMonthDay(createdAt)} - created</span>
                        <span>today</span>
                        <span className="event-planning-overview-snapshot__timeline-label-live">
                            {formatMonthDay(eventStart)} - live
                        </span>
                    </div>
                </div>
            </div>

            <div className="event-planning-overview-snapshot__tasks">
                <div className="event-planning-overview-snapshot__tasks-head">
                    <p>This week - {upcomingTasks.length} item{upcomingTasks.length === 1 ? '' : 's'} need you</p>
                    {onOpenTasks ? (
                        <button type="button" onClick={onOpenTasks}>
                            View all
                        </button>
                    ) : null}
                </div>
                <ul>
                    {upcomingTasks.length > 0 ? (
                        upcomingTasks.map((task) => (
                            <li key={task._id || task.id || toDisplayTitle(task)}>
                                <button
                                    type="button"
                                    className="event-planning-overview-snapshot__task-button"
                                    onClick={() => openTaskDetail(task)}
                                >
                                    <span className="event-planning-overview-snapshot__task-chip">
                                        {/* {(task?.priority || toTaskStatus(task) || 'T').charAt(0).toUpperCase()} */}
                                        <img src={task?.ownerUserId?.picture} alt="" />
                                    </span>
                                    <p>{toDisplayTitle(task)}</p>
                                    <small>by {formatDueDay(task?.dueAt)}</small>
                                </button>
                            </li>
                        ))
                    ) : (
                        <li className="event-planning-overview-snapshot__empty">
                            <p>No active tasks assigned to you yet.</p>
                        </li>
                    )}
                </ul>
            </div>

            <TaskDetailSheet
                open={detailMode === 'sheet'}
                onClose={closeTaskDetail}
                title={taskForDetailPanel?.title || 'Task'}
                backdrop={false}
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
        </section>
    );
}

export default EventPlanningOverviewSnapshot;
