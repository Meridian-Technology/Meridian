import React from 'react';
import { Icon } from '@iconify-icon/react';
import TaskAssigneePicker from './TaskAssigneePicker';
import TaskDescriptionEditor from './TaskDescriptionEditor';
import TaskEventMiniCard from './TaskEventMiniCard';
import { formatTaskDueDisplay } from './taskWorkspaceUtils';
import { DEFAULT_TASK_BOARD_STATUSES } from '../../constants/taskBoardDefaults';
import './TaskWorkspace.scss';

function dueRuleSummary(task) {
    const rule = task?.dueRule;
    if (!rule || rule.anchorType === 'none' || rule.anchorType === 'absolute') return null;
    const anchor = String(rule.anchorType || '').replace(/_/g, ' ');
    const dir = rule.direction === 'after' ? 'after' : 'before';
    const n = rule.offsetValue ?? 0;
    const u = rule.offsetUnit || 'days';
    return `Due ${n} ${u} ${dir} ${anchor}`;
}

export default function TaskDetailPanel({
    task,
    draft,
    setDraft,
    members = [],
    orgId,
    currentEventId = null,
    taskBoardStatuses = null,
    variant = 'sheet',
    onClose,
    onExpand,
    onCollapse,
    onSave,
    saving = false,
    saveError = ''
}) {
    const blockers = Array.isArray(task?.blockers) ? task.blockers : [];
    const ruleLine = dueRuleSummary(task);
    const statusOptions =
        Array.isArray(taskBoardStatuses) && taskBoardStatuses.length
            ? taskBoardStatuses
            : DEFAULT_TASK_BOARD_STATUSES;

    const showToolbar = (variant === 'sheet' && onExpand) || (variant === 'full' && onCollapse) || onClose;

    return (
        <div className="task-detail-panel task-detail-panel--readable">
            {showToolbar && (
                <div className="task-detail-panel__toolbar">
                    {variant === 'sheet' && onExpand && (
                        <button type="button" className="task-detail-panel__toolbar-btn" onClick={onExpand}>
                            <Icon icon="mdi:arrow-expand" />
                            Expand
                        </button>
                    )}
                    {variant === 'full' && onCollapse && (
                        <button type="button" className="task-detail-panel__toolbar-btn" onClick={onCollapse}>
                            <Icon icon="mdi:arrow-collapse" />
                            Side panel
                        </button>
                    )}
                    {onClose && (
                        <button type="button" className="task-detail-panel__toolbar-btn" onClick={onClose}>
                            <Icon icon="mdi:close" />
                            Close
                        </button>
                    )}
                </div>
            )}

            <div className="task-detail-panel__field task-detail-panel__title-field">
                {/* <label htmlFor="task-detail-title" className="task-detail-panel__hint-label">
                    Title
                </label> */}
                <input
                    id="task-detail-title"
                    className="task-detail-panel__title-input"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    maxLength={180}
                    placeholder="Untitled task"
                    autoComplete="off"
                />
            </div>

            <div className="task-detail-panel__field task-detail-panel__body-field">
                <label htmlFor="task-detail-desc" className="task-detail-panel__hint-label">
                    Description
                </label>
                <TaskDescriptionEditor
                    key={task?._id != null ? String(task._id) : 'new'}
                    id="task-detail-desc"
                    value={draft.description}
                    onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                    placeholder="Add a description…"
                    disabled={saving}
                />
            </div>

            <div className="task-detail-panel__meta" role="group" aria-label="Task properties">
                <div className="task-detail-panel__meta-row">
                    <span className="task-detail-panel__meta-label" id="task-detail-status-lbl">
                        Status
                    </span>
                    <div className="task-detail-panel__meta-value">
                        <select
                            id="task-detail-status"
                            className="task-detail-panel__ghost-select"
                            aria-labelledby="task-detail-status-lbl"
                            value={draft.status}
                            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                        >
                            {statusOptions.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="task-detail-panel__meta-row">
                    <span className="task-detail-panel__meta-label" id="task-detail-priority-lbl">
                        Priority
                    </span>
                    <div className="task-detail-panel__meta-value">
                        <select
                            id="task-detail-priority"
                            className="task-detail-panel__ghost-select"
                            aria-labelledby="task-detail-priority-lbl"
                            value={draft.priority}
                            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                </div>

                <div className="task-detail-panel__meta-row">
                    <span className="task-detail-panel__meta-label" id="task-detail-critical-lbl">
                        Critical
                    </span>
                    <label className="task-detail-panel__meta-inline-check">
                        <input
                            type="checkbox"
                            checked={Boolean(draft.isCritical)}
                            onChange={(e) => setDraft((d) => ({ ...d, isCritical: e.target.checked }))}
                            aria-labelledby="task-detail-critical-lbl"
                        />
                        <span>Critical path</span>
                    </label>
                </div>

                <div className="task-detail-panel__meta-row">
                    <span className="task-detail-panel__meta-label" id="task-detail-assignee-lbl">
                        Assignee
                    </span>
                    <div className="task-detail-panel__meta-value task-detail-panel__assignee-slot">
                        <TaskAssigneePicker
                            members={members}
                            value={draft.ownerUserId || ''}
                            onChange={(id) => setDraft((d) => ({ ...d, ownerUserId: id ? String(id) : '' }))}
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="task-detail-panel__meta-row task-detail-panel__meta-row--stack">
                    <span className="task-detail-panel__meta-label" id="task-detail-due-lbl">
                        Due
                    </span>
                    <div className="task-detail-panel__meta-value">
                        <input
                            id="task-detail-due"
                            className="task-detail-panel__ghost-datetime"
                            type="datetime-local"
                            aria-labelledby="task-detail-due-lbl"
                            value={draft.dueAt}
                            onChange={(e) => setDraft((d) => ({ ...d, dueAt: e.target.value }))}
                        />
                        {ruleLine && (
                            <p className="task-detail-panel__due-note">
                                Rule: {ruleLine} (computed: {formatTaskDueDisplay(task?.dueAt)})
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {blockers.length > 0 && (
                <div className="task-detail-panel__field task-detail-panel__blockers-field">
                    <span className="task-detail-panel__hint-label">Blockers</span>
                    <ul className="task-detail-panel__blockers">
                        {blockers.map((b, i) => (
                            <li key={`${b.referenceId || i}-${i}`}>
                                {b.label || b.type || 'Blocker'}
                                {b.resolved ? ' (resolved)' : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <TaskEventMiniCard task={task} orgId={orgId} currentEventId={currentEventId} />

            {saveError ? <p className="task-detail-panel__error">{saveError}</p> : null}

            <div className="task-detail-panel__footer">
                <button type="button" className="task-detail-panel__footer-text" onClick={onClose}>
                    Cancel
                </button>
                <button
                    type="button"
                    className="task-detail-panel__save"
                    disabled={saving || !draft.title.trim()}
                    onClick={onSave}
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
}
