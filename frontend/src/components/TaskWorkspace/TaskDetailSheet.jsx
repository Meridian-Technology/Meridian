import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify-icon/react';
import './TaskWorkspace.scss';

export const TASK_DETAIL_SHEET_PANEL_MAX_PX = 420;

const PANEL_WIDTH_PX = TASK_DETAIL_SHEET_PANEL_MAX_PX;

/** Roots of list/kanban task cards (clicking these switches task or stays on card UI; do not close float sheet). */
const TASK_BOARD_CARD_ROOT_SELECTOR = [
    '.tasks-hub-task-list-card',
    '.tasks-hub-task-kanban-card',
    '.event-tasks-task-list-card',
    '.event-tasks-task-kanban-card'
].join(', ');

export function getTaskDetailSheetPanelWidthPx() {
    if (typeof window === 'undefined') return PANEL_WIDTH_PX;
    return Math.min(PANEL_WIDTH_PX, window.innerWidth);
}

function usePushPanelWidth(enabled) {
    const [w, setW] = useState(PANEL_WIDTH_PX);
    useEffect(() => {
        if (!enabled) return undefined;
        const next = () => setW(Math.min(PANEL_WIDTH_PX, window.innerWidth));
        next();
        window.addEventListener('resize', next);
        return () => window.removeEventListener('resize', next);
    }, [enabled]);
    return w;
}

export default function TaskDetailSheet({
    open,
    onClose,
    title = 'Task',
    children,
    layout = 'overlay',
    backdrop = true,
    panelWidthPx = null
}) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const floatOverlay = layout === 'overlay' && !backdrop;

    useEffect(() => {
        if (!open || !floatOverlay || typeof document === 'undefined') return undefined;

        const onPointerDownCapture = (e) => {
            if (e.button !== 0) return;
            const raw = e.target;
            if (!(raw instanceof Element)) return;
            if (raw.closest('.task-detail-sheet')) return;
            if (raw.closest(TASK_BOARD_CARD_ROOT_SELECTOR)) return;
            onClose?.();
        };

        document.addEventListener('pointerdown', onPointerDownCapture, true);
        return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
    }, [open, floatOverlay, onClose]);

    const pushWidth = usePushPanelWidth(layout === 'push');

    if (layout === 'push') {
        return (
            <AnimatePresence initial={false}>
                {open && (
                    <motion.aside
                        key="task-detail-push"
                        className="task-detail-sheet task-detail-sheet--push"
                        initial={{ width: 0, opacity: 0.97 }}
                        animate={{ width: pushWidth, opacity: 1 }}
                        exit={{ width: 0, opacity: 0.97 }}
                        transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                        <div className="task-detail-sheet__push-inner" style={{ width: pushWidth }}>
                            {/* <header className="task-detail-sheet__header">
                                <h2>{title}</h2>
                                <button type="button" className="task-detail-sheet__close" onClick={onClose}>
                                    <Icon icon="mdi:close" />
                                </button>
                            </header> */}
                            <div className="task-detail-sheet__body">{children}</div>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        );
    }

    if (typeof document === 'undefined') return null;

    const rootClass =
        `task-detail-sheet task-detail-sheet--open${backdrop ? '' : ' task-detail-sheet--float'}`;
    const panelStyle =
        panelWidthPx != null
            ? { width: panelWidthPx, maxWidth: '100vw', minWidth: 0 }
            : undefined;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    className={rootClass}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    {backdrop && (
                        <motion.button
                            type="button"
                            className="task-detail-sheet__backdrop"
                            aria-label="Close task panel"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                        />
                    )}
                    <motion.aside
                        className="task-detail-sheet__panel"
                        style={panelStyle}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                        {/* <header className="task-detail-sheet__header">
                            <h2>{title}</h2>
                            <button type="button" className="task-detail-sheet__close" onClick={onClose}>
                                <Icon icon="mdi:close" />
                            </button>
                        </header> */}
                        <div className="task-detail-sheet__body">{children}</div>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
