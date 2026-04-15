import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import Popup from '../Popup/Popup';
import {
    DEFAULT_TASK_BOARD_STATUSES,
    slugTaskStatusKey
} from '../../constants/taskBoardDefaults';
import './TaskWorkspace.scss';

const MAX_COLS = 10;
const CATEGORY_OPTIONS = [
    { value: 'backlog', label: 'Backlog (not started)' },
    { value: 'active', label: 'Active (in progress)' },
    { value: 'done', label: 'Done (complete)' },
    { value: 'cancelled', label: 'Cancelled' }
];

export default function TaskBoardColumnsSettings({ orgId, isOpen, onClose, onSaved }) {
    const { addNotification } = useNotification();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const res = await apiRequest(`/org-event-management/${orgId}/task-board-statuses`, null, {
                method: 'GET'
            });
            const list = res?.data?.statuses;
            setRows(Array.isArray(list) && list.length ? list.map((r) => ({ ...r })) : [...DEFAULT_TASK_BOARD_STATUSES]);
        } catch (e) {
            setRows([...DEFAULT_TASK_BOARD_STATUSES]);
            addNotification({
                title: 'Could not load columns',
                message: e.message || 'Using defaults until refresh.',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    }, [orgId, addNotification]);

    useEffect(() => {
        if (isOpen && orgId) load();
    }, [isOpen, orgId, load]);

    const move = (index, dir) => {
        setRows((prev) => {
            const j = index + dir;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[j]] = [next[j], next[index]];
            return next;
        });
    };

    const updateRow = (index, patch) => {
        setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    };

    const removeRow = (index) => {
        setRows((prev) => prev.filter((_, i) => i !== index));
    };

    const addRow = () => {
        setRows((prev) => {
            if (prev.length >= MAX_COLS) return prev;
            const keys = prev.map((r) => r.key);
            const key = slugTaskStatusKey('New column', keys);
            return [
                ...prev,
                { key, label: 'New column', category: 'backlog', order: prev.length }
            ];
        });
    };

    const save = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/task-board-statuses`,
                { statuses: rows.map((r, i) => ({ key: r.key, label: r.label, category: r.category, order: i })) },
                { method: 'PUT' }
            );
            if (!res?.success) {
                throw new Error(res?.message || res?.error || 'Save failed');
            }
            addNotification({ title: 'Board updated', message: 'Task columns saved for your organization.', type: 'success' });
            onSaved?.(res?.data?.statuses || rows);
            onClose?.();
        } catch (e) {
            addNotification({
                title: 'Save failed',
                message: e.message || 'Unable to save columns.',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const restoreDefaults = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/task-board-statuses`,
                { reset: true },
                { method: 'PUT' }
            );
            if (!res?.success) throw new Error(res?.message || 'Reset failed');
            addNotification({ title: 'Defaults restored', message: 'Using the standard three-column board.', type: 'success' });
            onSaved?.(res?.data?.statuses || DEFAULT_TASK_BOARD_STATUSES);
            onClose?.();
        } catch (e) {
            addNotification({ title: 'Reset failed', message: e.message || 'Try again.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Popup isOpen={isOpen} onClose={onClose} customClassName="task-board-columns-popup narrow-content">
            <article className="task-board-columns-settings">
                <h2>Task board columns</h2>
                <p className="task-board-columns-settings__hint">
                    Up to {MAX_COLS} columns. Each needs a <strong>done</strong> column and at least one <strong>backlog</strong> or{' '}
                    <strong>active</strong> column. Removing a column is blocked while tasks still use it.
                </p>
                {loading ? (
                    <p className="task-board-columns-settings__loading">Loading…</p>
                ) : (
                    <ul className="task-board-columns-settings__list">
                        {rows.map((row, index) => (
                            <li key={row.key}>
                                <div className="task-board-columns-settings__row">
                                    <div className="task-board-columns-settings__order">
                                        <button type="button" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                                            <Icon icon="mdi:chevron-up" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Move down"
                                            onClick={() => move(index, 1)}
                                            disabled={index === rows.length - 1}
                                        >
                                            <Icon icon="mdi:chevron-down" />
                                        </button>
                                    </div>
                                    <label className="task-board-columns-settings__label">
                                        <span>Label</span>
                                        <input
                                            value={row.label}
                                            onChange={(e) => updateRow(index, { label: e.target.value })}
                                            maxLength={64}
                                        />
                                    </label>
                                    <label className="task-board-columns-settings__label">
                                        <span>Type</span>
                                        <select
                                            value={row.category}
                                            onChange={(e) => updateRow(index, { category: e.target.value })}
                                        >
                                            {CATEGORY_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <code className="task-board-columns-settings__key" title="Stored on tasks">
                                        {row.key}
                                    </code>
                                    <button
                                        type="button"
                                        className="task-board-columns-settings__remove"
                                        onClick={() => removeRow(index)}
                                        disabled={rows.length <= 1}
                                        aria-label="Remove column"
                                    >
                                        <Icon icon="mdi:close" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="task-board-columns-settings__footer">
                    <button type="button" onClick={addRow} disabled={rows.length >= MAX_COLS || loading}>
                        <Icon icon="mdi:plus" />
                        Add column ({rows.length}/{MAX_COLS})
                    </button>
                    <div className="task-board-columns-settings__footer-actions">
                        <button type="button" className="ghost" onClick={restoreDefaults} disabled={saving || loading}>
                            Restore defaults
                        </button>
                        <button type="button" className="ghost" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="button" onClick={save} disabled={saving || loading}>
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            </article>
        </Popup>
    );
}
