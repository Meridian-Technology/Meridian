import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify-icon/react';
import './TaskWorkspace.scss';

export default function TaskDetailFull({ open, onClose, title = 'Task', children }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    className="task-detail-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    <motion.button
                        type="button"
                        className="task-detail-full__backdrop"
                        aria-label="Close task"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />
                    <motion.div
                        className="task-detail-full__frame"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                        <header className="task-detail-full__header">
                            <h2>{title}</h2>
                            <div className="task-detail-full__header-actions">
                                <button type="button" className="task-detail-sheet__close" onClick={onClose}>
                                    <Icon icon="mdi:close" />
                                </button>
                            </div>
                        </header>
                        <div className="task-detail-full__body">{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
