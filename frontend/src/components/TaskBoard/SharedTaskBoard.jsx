import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './SharedTaskBoard.scss';

function copyComputedStyles(fromNode, toNode) {
    if (!fromNode || !toNode) return;
    const computed = window.getComputedStyle(fromNode);
    for (let i = 0; i < computed.length; i += 1) {
        const key = computed[i];
        toNode.style.setProperty(key, computed.getPropertyValue(key), computed.getPropertyPriority(key));
    }
    const fromChildren = Array.from(fromNode.children || []);
    const toChildren = Array.from(toNode.children || []);
    for (let i = 0; i < fromChildren.length; i += 1) {
        copyComputedStyles(fromChildren[i], toChildren[i]);
    }
}

function SharedTaskBoard({
    viewMode,
    tasks,
    statuses,
    groupedByStatus,
    getTaskId,
    getStatusLabel,
    getTaskStatus,
    onDropToStatus,
    renderListItem,
    renderKanbanCard,
    renderEmptyList,
    listClassName,
    listTag,
    kanbanClassName,
    columnClassName,
    columnDropTargetClassName,
    cardsClassName,
    emptyColumnClassName,
    dragPreviewClassName,
    draggingShellClassName,
    onDragStartTask,
    onDropTask,
    onCommitColumnOrder
}) {
    const joinClasses = (...names) => names.filter(Boolean).join(' ');
    const [draggingTaskId, setDraggingTaskId] = useState(null);
    const [dropTargetStatus, setDropTargetStatus] = useState(null);
    const [dropPosition, setDropPosition] = useState(null);
    const [flashByTaskId, setFlashByTaskId] = useState({});
    const columnCardsRefs = useRef(new Map());
    const committedOrderRef = useRef(null);
    const didDropRef = useRef(false);
    const dragStartRef = useRef(null);
    const flashTimeoutsRef = useRef(new Map());

    const safeTasks = useMemo(() => tasks || [], [tasks]);
    const safeStatuses = useMemo(() => statuses || [], [statuses]);
    const kanbanStyle = useMemo(
        () => ({ '--task-board-columns': String(Math.max(1, safeStatuses.length || 1)) }),
        [safeStatuses.length]
    );
    const taskById = useMemo(() => {
        const map = new Map();
        safeTasks.forEach((task) => {
            const id = String(getTaskId(task));
            if (id) map.set(id, task);
        });
        return map;
    }, [safeTasks, getTaskId]);
    const [orderedIdsByStatus, setOrderedIdsByStatus] = useState(() => {
        const next = {};
        safeStatuses.forEach((status) => {
            next[status] = (groupedByStatus?.[status] || []).map((task) => String(getTaskId(task)));
        });
        return next;
    });

    const moveTaskInGroups = useCallback((groups, taskId, nextStatus, nextIndex) => {
        const targetTaskId = String(taskId);
        if (!targetTaskId) return groups;
        const next = {};
        safeStatuses.forEach((status) => {
            next[status] = (groups?.[status] || []).filter((id) => id !== targetTaskId);
        });
        if (!next[nextStatus]) next[nextStatus] = [];
        const insertAt = Math.max(0, Math.min(Number(nextIndex) || 0, next[nextStatus].length));
        next[nextStatus] = [
            ...next[nextStatus].slice(0, insertAt),
            targetTaskId,
            ...next[nextStatus].slice(insertAt)
        ];
        return next;
    }, [safeStatuses]);

    useLayoutEffect(() => {
        setOrderedIdsByStatus((previous) => {
            const next = {};
            safeStatuses.forEach((status) => {
                const incomingIds = (groupedByStatus?.[status] || [])
                    .map((task) => String(getTaskId(task)))
                    .filter(Boolean);
                const incomingSet = new Set(incomingIds);
                const current = (previous?.[status] || []).filter((id) => incomingSet.has(id));
                const missing = incomingIds.filter((id) => !current.includes(id));
                next[status] = [...current, ...missing];
            });
            return next;
        });
    }, [groupedByStatus, getTaskId, safeStatuses]);

    const orderedIdsRef = useRef(orderedIdsByStatus);
    useLayoutEffect(() => {
        orderedIdsRef.current = orderedIdsByStatus;
    }, [orderedIdsByStatus]);

    const setColumnCardsRef = useCallback((status, node) => {
        const key = String(status);
        if (!node) {
            columnCardsRefs.current.delete(key);
            return;
        }
        columnCardsRefs.current.set(key, node);
    }, []);

    const triggerMoveFlash = useCallback((taskId) => {
        const key = String(taskId || '');
        if (!key) return;
        const existing = flashTimeoutsRef.current.get(key);
        if (existing) {
            window.clearTimeout(existing);
        }
        setFlashByTaskId((prev) => ({ ...prev, [key]: true }));
        const timeoutId = window.setTimeout(() => {
            setFlashByTaskId((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
            flashTimeoutsRef.current.delete(key);
        }, 700);
        flashTimeoutsRef.current.set(key, timeoutId);
    }, []);

    useLayoutEffect(() => () => {
        flashTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        flashTimeoutsRef.current.clear();
    }, []);

    useLayoutEffect(() => {
        if (viewMode !== 'kanban' && viewMode !== 'list') return;
        safeStatuses.forEach((status) => {
            const node = columnCardsRefs.current.get(String(status));
            if (!node?.isConnected) return;
            const previousHeight = Number(node.dataset.prevHeight || 0);
            const nextHeight = node.scrollHeight;
            if (previousHeight > 0 && Math.abs(previousHeight - nextHeight) > 2) {
                node.style.height = `${previousHeight}px`;
                node.style.overflow = 'hidden';
                node.style.transition = 'height 260ms cubic-bezier(0.2, 0.7, 0.2, 1)';
                void node.offsetHeight;
                node.style.height = `${nextHeight}px`;
                const cleanup = () => {
                    node.style.height = '';
                    node.style.overflow = '';
                    node.style.transition = '';
                    node.removeEventListener('transitionend', cleanup);
                };
                node.addEventListener('transitionend', cleanup);
            }
            node.dataset.prevHeight = String(nextHeight);
        });
    }, [viewMode, groupedByStatus, safeStatuses]);

    const resolveDropIndex = useCallback((status, clientY) => {
        const container = columnCardsRefs.current.get(String(status));
        if (!container) return (orderedIdsByStatus?.[status] || []).length;
        const cardNodes = Array.from(container.querySelectorAll('[data-task-id]')).filter(
            (node) => String(node.dataset.taskId || '') !== String(draggingTaskId || '')
        );
        if (!cardNodes.length) return 0;
        const firstRect = cardNodes[0].getBoundingClientRect();
        const lastRect = cardNodes[cardNodes.length - 1].getBoundingClientRect();
        if (clientY <= firstRect.top) return 0;
        if (clientY >= lastRect.bottom) return cardNodes.length;

        // Cursor-anchored insertion: determine before/after the card currently under pointer.
        const hoveredCard = cardNodes.find((node) => {
            const rect = node.getBoundingClientRect();
            return clientY >= rect.top && clientY <= rect.bottom;
        });
        if (hoveredCard) {
            const hoveredRect = hoveredCard.getBoundingClientRect();
            const hoveredId = String(hoveredCard.dataset.taskId || '');
            const hoveredIndex = (orderedIdsByStatus?.[status] || []).indexOf(hoveredId);
            if (hoveredIndex < 0) return 0;
            const localY = clientY - hoveredRect.top;
            const beforeThreshold = hoveredRect.height * 0.35;
            const afterThreshold = hoveredRect.height * 0.65;
            if (localY <= beforeThreshold) return hoveredIndex;
            if (localY >= afterThreshold) return hoveredIndex + 1;
            return dropPosition?.status === status ? dropPosition.index : hoveredIndex + 1;
        }

        for (let i = 0; i < cardNodes.length - 1; i += 1) {
            const a = cardNodes[i].getBoundingClientRect();
            const b = cardNodes[i + 1].getBoundingClientRect();
            if (clientY > a.bottom && clientY < b.top) {
                return i + 1;
            }
        }
        return cardNodes.length;
    }, [orderedIdsByStatus, draggingTaskId, dropPosition]);

    const handleColumnDragOver = useCallback(
        (status, event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (dropTargetStatus !== status) {
                setDropTargetStatus(status);
            }
            if (draggingTaskId) {
                const nextIndex = resolveDropIndex(status, event.clientY);
                const current = dropPosition;
                if (!current || current.status !== status || current.index !== nextIndex) {
                    setDropPosition({ status, index: nextIndex });
                    setOrderedIdsByStatus((previous) => moveTaskInGroups(previous, draggingTaskId, status, nextIndex));
                }
            }
        },
        [dropTargetStatus, draggingTaskId, dropPosition, resolveDropIndex, moveTaskInGroups]
    );

    const handleColumnDragLeave = useCallback((status, event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setDropTargetStatus((prev) => (prev === status ? null : prev));
        }
    }, []);

    const handleColumnDrop = useCallback(
        async (status, event) => {
            event.preventDefault();
            didDropRef.current = true;
            const dropId = event.dataTransfer.getData('text/plain') || String(draggingTaskId || '');
            const droppedTask = safeTasks.find((task) => String(getTaskId(task)) === String(dropId));
            const finalIndex = resolveDropIndex(status, event.clientY);
            const dragStart = dragStartRef.current;
            const movedBetweenColumns = Boolean(dragStart && dragStart.status !== status);
            const movedWithinColumn = Boolean(
                dragStart && dragStart.status === status && dragStart.index !== finalIndex
            );
            const snap = orderedIdsRef.current;

            onDropTask?.({
                taskId: String(dropId || ''),
                task: droppedTask,
                sourceStatus: droppedTask ? getTaskStatus?.(droppedTask) : null,
                targetStatus: status
            });

            try {
                if (droppedTask && getTaskStatus?.(droppedTask) !== status) {
                    await onDropToStatus?.(droppedTask, status);
                }
                if (onCommitColumnOrder && (movedBetweenColumns || movedWithinColumn)) {
                    if (movedBetweenColumns && dragStart) {
                        const tgtKey = String(status);
                        const srcKey = String(dragStart.status);
                        await onCommitColumnOrder({ columnKey: tgtKey, taskIds: [...(snap[tgtKey] || [])] });
                        await onCommitColumnOrder({ columnKey: srcKey, taskIds: [...(snap[srcKey] || [])] });
                    } else if (movedWithinColumn) {
                        await onCommitColumnOrder({
                            columnKey: String(status),
                            taskIds: [...(snap[String(status)] || [])]
                        });
                    }
                }
            } catch (_err) {
                if (committedOrderRef.current) {
                    setOrderedIdsByStatus(committedOrderRef.current);
                }
            }

            if (droppedTask && (movedBetweenColumns || movedWithinColumn)) {
                triggerMoveFlash(getTaskId(droppedTask));
            }
            setDraggingTaskId(null);
            setDropTargetStatus(null);
            setDropPosition(null);
            dragStartRef.current = null;
        },
        [
            draggingTaskId,
            safeTasks,
            getTaskId,
            getTaskStatus,
            resolveDropIndex,
            onDropTask,
            onDropToStatus,
            onCommitColumnOrder,
            triggerMoveFlash
        ]
    );

    const startCardDrag = useCallback(
        (task, status, event) => {
            committedOrderRef.current = orderedIdsByStatus;
            didDropRef.current = false;
            const cardNode = event.currentTarget.firstElementChild || event.currentTarget;
            const cardRect = cardNode.getBoundingClientRect();
            const dragImageNode = cardNode.cloneNode(true);
            copyComputedStyles(cardNode, dragImageNode);
            dragImageNode.style.position = 'fixed';
            dragImageNode.style.left = '-9999px';
            dragImageNode.style.top = '-9999px';
            dragImageNode.style.width = `${Math.max(220, Math.round(cardRect.width))}px`;
            dragImageNode.style.pointerEvents = 'none';
            dragImageNode.style.opacity = '0.96';
            dragImageNode.style.transform = 'none';
            dragImageNode.style.transition = 'none';
            document.body.appendChild(dragImageNode);
            const pointerOffsetX = Math.max(
                0,
                Math.min(Math.round(event.clientX - cardRect.left), Math.round(cardRect.width))
            );
            const pointerOffsetY = Math.max(
                0,
                Math.min(Math.round(event.clientY - cardRect.top), Math.round(cardRect.height))
            );
            event.dataTransfer.setDragImage(dragImageNode, pointerOffsetX, pointerOffsetY);
            requestAnimationFrame(() => {
                if (dragImageNode.parentNode) {
                    dragImageNode.parentNode.removeChild(dragImageNode);
                }
            });
            const taskId = getTaskId(task);
            event.dataTransfer.setData('text/plain', String(taskId));
            event.dataTransfer.effectAllowed = 'move';
            setDraggingTaskId(taskId);
            const startingIndex = (orderedIdsByStatus?.[status] || []).indexOf(String(taskId));
            setDropPosition({ status, index: startingIndex });
            dragStartRef.current = { status, index: startingIndex };
            onDragStartTask?.(task);
        },
        [orderedIdsByStatus, getTaskId, onDragStartTask]
    );

    const endCardDrag = useCallback(() => {
        if (!didDropRef.current && committedOrderRef.current) {
            setOrderedIdsByStatus(committedOrderRef.current);
        }
        setDraggingTaskId(null);
        setDropTargetStatus(null);
        setDropPosition(null);
        dragStartRef.current = null;
    }, []);

    if (viewMode === 'list') {
        if (!safeTasks.length) {
            return renderEmptyList ? renderEmptyList() : null;
        }
        const ListTag = listTag || 'div';
        const draggingTask = safeTasks.find((task) => String(getTaskId(task)) === String(draggingTaskId));
        const draggingSourceStatus = draggingTask ? getTaskStatus?.(draggingTask) : null;

        return (
            <ListTag className={joinClasses('shared-task-board', 'shared-task-board__list-grouped', listClassName)}>
                {safeStatuses.map((status) => {
                    const statusTasks = (orderedIdsByStatus?.[status] || [])
                        .map((id) => taskById.get(String(id)))
                        .filter(Boolean);
                    const isDropTarget = dropTargetStatus === status;
                    return (
                        <section
                            key={status}
                            className={joinClasses(
                                'shared-task-board__list-section',
                                columnClassName,
                                isDropTarget ? columnDropTargetClassName : ''
                            )}
                            onDragOver={(e) => handleColumnDragOver(status, e)}
                            onDragLeave={(e) => handleColumnDragLeave(status, e)}
                            onDrop={(e) => handleColumnDrop(status, e)}
                        >
                            <header className="shared-task-board__list-section-header">
                                <h4>{getStatusLabel(status)}</h4>
                                <span>{statusTasks.length}</span>
                            </header>
                            <ul
                                className={joinClasses('shared-task-board__list-section-items', cardsClassName)}
                                ref={(node) => setColumnCardsRef(status, node)}
                            >
                                {isDropTarget && draggingTaskId && draggingSourceStatus !== status && (
                                    <li className="shared-task-board__list-drop-preview-wrap">
                                        <div
                                            className={joinClasses('shared-task-board__drop-preview', dragPreviewClassName)}
                                        >
                                            Drop to move here
                                        </div>
                                    </li>
                                )}
                                {statusTasks.length === 0 && (
                                    <li className="shared-task-board__list-empty-wrap">
                                        <p className={joinClasses('shared-task-board__empty', emptyColumnClassName)}>
                                            No tasks
                                        </p>
                                    </li>
                                )}
                                {statusTasks.map((task) => {
                                    const taskId = getTaskId(task);
                                    const isDragging = String(draggingTaskId) === String(taskId);
                                    return (
                                        <li key={taskId} className="shared-task-board__list-item-wrap">
                                            <motion.div
                                                className={joinClasses(
                                                    'shared-task-board__drag-shell',
                                                    isDragging ? draggingShellClassName : ''
                                                )}
                                                data-task-id={String(taskId)}
                                                layout
                                                transition={{
                                                    layout: { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }
                                                }}
                                                draggable
                                                onDragStart={(e) => startCardDrag(task, status, e)}
                                                onDragEnd={endCardDrag}
                                            >
                                                {renderListItem(task, {
                                                    isDragging,
                                                    isMoved: Boolean(flashByTaskId[String(taskId)])
                                                })}
                                            </motion.div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    );
                })}
            </ListTag>
        );
    }

    if (viewMode !== 'kanban') return null;

    const draggingTask = safeTasks.find((task) => String(getTaskId(task)) === String(draggingTaskId));
    const draggingSourceStatus = draggingTask ? getTaskStatus?.(draggingTask) : null;

    return (
        <div
            className={joinClasses('shared-task-board', 'shared-task-board__kanban', kanbanClassName)}
            style={kanbanStyle}
        >
            {safeStatuses.map((status) => {
                const statusTasks = (orderedIdsByStatus?.[status] || [])
                    .map((id) => taskById.get(String(id)))
                    .filter(Boolean);
                const isDropTarget = dropTargetStatus === status;
                return (
                    <section
                        key={status}
                        className={joinClasses('shared-task-board__column', columnClassName, isDropTarget ? columnDropTargetClassName : '')}
                        onDragOver={(e) => handleColumnDragOver(status, e)}
                        onDragLeave={(e) => handleColumnDragLeave(status, e)}
                        onDrop={(e) => handleColumnDrop(status, e)}
                    >
                        <header>
                            <h4>{getStatusLabel(status)}</h4>
                            <span>{statusTasks.length}</span>
                        </header>
                        <div
                            className={joinClasses('shared-task-board__cards', cardsClassName)}
                            ref={(node) => setColumnCardsRef(status, node)}
                        >
                            {isDropTarget && draggingTaskId && draggingSourceStatus !== status && (
                                <div className={joinClasses('shared-task-board__drop-preview', dragPreviewClassName)}>
                                    Drop to move here
                                </div>
                            )}
                            {statusTasks.length === 0 && (
                                <p className={joinClasses('shared-task-board__empty', emptyColumnClassName)}>No tasks</p>
                            )}
                            {statusTasks.map((task) => {
                                const taskId = getTaskId(task);
                                const isDragging = String(draggingTaskId) === String(taskId);
                                return (
                                    <motion.div
                                        key={taskId}
                                        className={joinClasses(
                                            'shared-task-board__drag-shell',
                                            isDragging ? draggingShellClassName : ''
                                        )}
                                        data-task-id={String(taskId)}
                                        layout
                                        transition={{ layout: { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] } }}
                                        draggable
                                        onDragStart={(e) => startCardDrag(task, status, e)}
                                        onDragEnd={endCardDrag}
                                    >
                                        {renderKanbanCard(task, {
                                            isDragging,
                                            isMoved: Boolean(flashByTaskId[String(taskId)])
                                        })}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

SharedTaskBoard.defaultProps = {
    statuses: [],
    tasks: [],
    groupedByStatus: {},
    listClassName: '',
    listTag: 'div',
    kanbanClassName: '',
    columnClassName: '',
    columnDropTargetClassName: 'drop-target',
    cardsClassName: '',
    emptyColumnClassName: '',
    dragPreviewClassName: '',
    draggingShellClassName: 'dragging-origin',
    getTaskStatus: null,
    onDropToStatus: null,
    onDragStartTask: null,
    onDropTask: null,
    onCommitColumnOrder: null,
    renderEmptyList: null
};

export default SharedTaskBoard;
