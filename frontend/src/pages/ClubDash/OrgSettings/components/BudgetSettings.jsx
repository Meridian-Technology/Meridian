import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../NotificationContext';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { downloadBudgetExport } from '../../../../utils/budgetExport';
import Popup from '../../../../components/Popup/Popup';
import BudgetStageMessagePopupBody from '../../../../components/BudgetWorkflow/BudgetStageMessagePopupBody';
import BudgetAuditTimeline from '../../../../components/BudgetWorkflow/BudgetAuditTimeline';
import './BudgetSettings.scss';

function currentStage(budget) {
    const stages = budget.workflow?.stagesSnapshot || [];
    const i = budget.workflow?.currentStageIndex ?? 0;
    return stages[i] || null;
}

function StatusPill({ status }) {
    const tone =
        {
            draft: 'muted',
            revision_requested: 'warn',
            in_review: 'progress',
            submitted: 'progress',
            approved: 'success',
            rejected: 'danger'
        }[status] || 'muted';
    const label = (status || '').replace(/_/g, ' ');
    return <span className={`budget-status-pill budget-status-pill--${tone}`}>{label}</span>;
}

function lastRevisionNote(budget) {
    const comments = budget.comments || [];
    for (let i = comments.length - 1; i >= 0; i--) {
        const b = comments[i]?.body || '';
        if (b.startsWith('Revision requested:')) return b.replace(/^Revision requested:\s*/i, '').trim();
    }
    return null;
}

export default function BudgetSettings({ org, expandedClass }) {
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const orgId = org?._id;
    const [meta, setMeta] = useState(null);
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newFy, setNewFy] = useState(String(new Date().getFullYear()));
    const [newTemplateKey, setNewTemplateKey] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [savingId, setSavingId] = useState(null);
    const [exportingId, setExportingId] = useState(null);
    const [orgMsg, setOrgMsg] = useState(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [tRes, bRes] = await Promise.all([
                axios.get(`/org-budgets/${orgId}/budget-templates`, { withCredentials: true }),
                axios.get(`/org-budgets/${orgId}/budgets`, { withCredentials: true })
            ]);
            if (tRes.data?.success) {
                setMeta(tRes.data.data);
                const templates = tRes.data.data?.templates || [];
                setNewTemplateKey((prev) => prev || templates[0]?.templateKey || '');
            }
            if (bRes.data?.success) {
                setBudgets(bRes.data.data || []);
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || 'Could not load budgets',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    }, [orgId, addNotification]);

    useEffect(() => {
        load();
    }, [load]);

    const templates = meta?.templates || [];

    const duplicateBlocked = useMemo(() => {
        const fy = String(newFy || '').trim();
        const tk = newTemplateKey;
        if (!fy || !tk) return false;
        return budgets.some((b) => b.fiscalYear === fy && b.templateKey === tk && b.status !== 'rejected');
    }, [budgets, newFy, newTemplateKey]);

    const { pipeline, closed } = useMemo(() => {
        const p = [];
        const c = [];
        for (const b of budgets) {
            if (['approved', 'rejected'].includes(b.status)) c.push(b);
            else p.push(b);
        }
        const sortByUpdated = (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        p.sort(sortByUpdated);
        c.sort(sortByUpdated);
        return { pipeline: p, closed: c };
    }, [budgets]);

    const handleCreate = async () => {
        if (!orgId || !newTemplateKey || duplicateBlocked) return;
        setCreating(true);
        try {
            const r = await apiRequest(
                `/org-budgets/${orgId}/budgets`,
                { templateKey: newTemplateKey, fiscalYear: newFy },
                { method: 'POST' }
            );
            if (r.success) {
                addNotification({ title: 'Created', message: 'Draft budget created.', type: 'success' });
                load();
                setExpandedId(r.data._id);
            } else {
                addNotification({ title: 'Error', message: r.message || 'Failed', type: 'error' });
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || e.message,
                type: 'error'
            });
        } finally {
            setCreating(false);
        }
    };

    const saveDraft = async (budget) => {
        if (!orgId) return;
        setSavingId(budget._id);
        try {
            const r = await apiRequest(`/org-budgets/${orgId}/budgets/${budget._id}`, { lineItems: budget.lineItems }, {
                method: 'PATCH'
            });
            if (r.success) {
                addNotification({ title: 'Saved', message: 'Budget updated.', type: 'success' });
                load();
            } else {
                addNotification({ title: 'Error', message: r.message || 'Failed', type: 'error' });
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || e.message,
                type: 'error'
            });
        } finally {
            setSavingId(null);
        }
    };

    const submitBudget = async (budget) => {
        if (!orgId || !budget?._id) return;
        setSavingId(budget._id);
        try {
            const patch = await apiRequest(
                `/org-budgets/${orgId}/budgets/${budget._id}`,
                { lineItems: budget.lineItems },
                { method: 'PATCH' }
            );
            if (!patch.success) {
                addNotification({ title: 'Error', message: patch.message || 'Could not save before submit', type: 'error' });
                return;
            }
            const r = await apiRequest(`/org-budgets/${orgId}/budgets/${budget._id}/submit`, {}, { method: 'POST' });
            if (r.success) {
                addNotification({ title: 'Submitted', message: 'Budget is in review.', type: 'success' });
                load();
            } else {
                addNotification({ title: 'Error', message: r.message || 'Failed', type: 'error' });
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || e.message,
                type: 'error'
            });
        } finally {
            setSavingId(null);
        }
    };

    const orgStageAction = async (id, stageKey, action, body = {}) => {
        try {
            const r = await apiRequest(
                `/org-budgets/${orgId}/budgets/${id}/stages/${stageKey}/${action}`,
                body,
                { method: 'PUT' }
            );
            if (r.success) {
                addNotification({ title: 'Updated', message: 'Workflow updated.', type: 'success' });
                load();
                setOrgMsg(null);
            } else {
                addNotification({ title: 'Error', message: r.message || 'Failed', type: 'error' });
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || e.message,
                type: 'error'
            });
        }
    };

    const patchLocalLineItem = (budgetId, key, field, raw) => {
        setBudgets((prev) =>
            prev.map((b) => {
                if (b._id !== budgetId) return b;
                const lineItems = (b.lineItems || []).map((li) => {
                    if (li.key !== key) return li;
                    let v = raw;
                    if (field === 'amount' || field === 'numberValue') {
                        v = raw === '' ? null : Number(raw);
                    }
                    return { ...li, [field]: v };
                });
                return { ...b, lineItems };
            })
        );
    };

    const runExport = async (budget, format) => {
        const id = budget._id;
        setExportingId(id);
        try {
            const url = `/org-budgets/${orgId}/budgets/${id}/export?format=${format}`;
            const ext = format === 'csv' ? 'csv' : 'json';
            await downloadBudgetExport(url, `budget-${budget.fiscalYear}-${budget.templateKey}.${ext}`);
        } catch (e) {
            addNotification({
                title: 'Export failed',
                message: e.response?.data?.message || e.message || 'Could not download',
                type: 'error'
            });
        } finally {
            setExportingId(null);
        }
    };

    if (!orgId) return null;

    const templateLabel = (key) => templates.find((t) => t.templateKey === key)?.displayName || key;

    return (
        <div className={`dash settings-section ${expandedClass || ''}`}>
            <header className="header">
                <h1>Budgets</h1>
                <p>One active budget per fiscal year and template. Submit for officer review, then finance office approval.</p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="settings-content">
                <div className="budget-settings">
                    {loading ? (
                        <p className="budget-settings__muted">Loading…</p>
                    ) : (
                        <>
                            <section className="budget-settings__composer" aria-labelledby="budget-composer-title">
                                <h2 id="budget-composer-title" className="budget-settings__section-title">
                                    Start a budget
                                </h2>
                                <p className="budget-settings__section-desc">
                                    Choose the template and fiscal year. You cannot create a duplicate while another non-rejected
                                    budget exists for the same pair.
                                </p>
                                <div className="budget-settings__create-row">
                                    <div className="budget-settings__field">
                                        <label htmlFor="budget-template-select">Template</label>
                                        <select
                                            id="budget-template-select"
                                            value={newTemplateKey}
                                            onChange={(e) => setNewTemplateKey(e.target.value)}
                                            disabled={!templates.length}
                                        >
                                            {templates.length === 0 ? (
                                                <option value="">No templates</option>
                                            ) : (
                                                templates.map((t) => (
                                                    <option key={t.templateKey} value={t.templateKey}>
                                                        {t.displayName || t.templateKey}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                    <div className="budget-settings__field">
                                        <label htmlFor="budget-fy-input">Fiscal year</label>
                                        <input
                                            id="budget-fy-input"
                                            type="text"
                                            value={newFy}
                                            onChange={(e) => setNewFy(e.target.value)}
                                            placeholder="e.g. 2026"
                                            aria-label="Fiscal year"
                                        />
                                    </div>
                                    <div className="budget-settings__create-actions">
                                        <button
                                            type="button"
                                            className="budget-btn primary"
                                            onClick={handleCreate}
                                            disabled={creating || !templates.length || duplicateBlocked}
                                        >
                                            {creating ? 'Creating…' : 'Create draft'}
                                        </button>
                                    </div>
                                </div>
                                {duplicateBlocked && (
                                    <p className="budget-settings__warn" role="status">
                                        A budget for this template and fiscal year already exists. Open it below or reject the
                                        existing one before creating another.
                                    </p>
                                )}
                            </section>

                            <section className="budget-settings__lane" aria-labelledby="budget-pipeline-title">
                                <h2 id="budget-pipeline-title" className="budget-settings__section-title">
                                    In progress
                                </h2>
                                {pipeline.length === 0 ? (
                                    <p className="budget-settings__muted">No active budgets.</p>
                                ) : (
                                    <div className="budget-settings__cards">
                                        {pipeline.map((b) => {
                                            const open = expandedId === b._id;
                                            const st = currentStage(b);
                                            const canEdit = b.status === 'draft' || b.status === 'revision_requested';
                                            const orgStage = b.status === 'in_review' && st?.actorType === 'org_permission';
                                            const revNote = b.status === 'revision_requested' ? lastRevisionNote(b) : null;
                                            return (
                                                <article className="budget-card" key={b._id}>
                                                    <button
                                                        type="button"
                                                        className="budget-card__head"
                                                        onClick={() => setExpandedId(open ? null : b._id)}
                                                        aria-expanded={open}
                                                    >
                                                        <div className="budget-card__head-main">
                                                            <span className="budget-card__template">{templateLabel(b.templateKey)}</span>
                                                            <span className="budget-card__title">{b.title || b.templateKey}</span>
                                                            <span className="budget-card__fy">FY {b.fiscalYear}</span>
                                                        </div>
                                                        <StatusPill status={b.status} />
                                                        <Icon icon={open ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
                                                    </button>
                                                    {open && (
                                                        <div className="budget-card__body">
                                                            {revNote && (
                                                                <div className="budget-revision-callout" role="status">
                                                                    <strong>Reviewer requested changes</strong>
                                                                    <p>{revNote}</p>
                                                                    <p className="budget-revision-callout__hint">
                                                                        Update line items below, save, then submit again.
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {canEdit && (
                                                                <div className="budget-lines">
                                                                    <h4 className="budget-card__subhead">Line items</h4>
                                                                    {(b.lineItems || []).map((li) => (
                                                                        <div className="budget-line" key={li.key}>
                                                                            <label>
                                                                                {li.label}
                                                                                {li.kind === 'currency' && (
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="0.01"
                                                                                        value={li.amount ?? ''}
                                                                                        onChange={(e) =>
                                                                                            patchLocalLineItem(
                                                                                                b._id,
                                                                                                li.key,
                                                                                                'amount',
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                )}
                                                                                {li.kind === 'number' && (
                                                                                    <input
                                                                                        type="number"
                                                                                        value={li.numberValue ?? ''}
                                                                                        onChange={(e) =>
                                                                                            patchLocalLineItem(
                                                                                                b._id,
                                                                                                li.key,
                                                                                                'numberValue',
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                )}
                                                                                {li.kind === 'text' && (
                                                                                    <input
                                                                                        type="text"
                                                                                        value={li.textValue || ''}
                                                                                        onChange={(e) =>
                                                                                            patchLocalLineItem(
                                                                                                b._id,
                                                                                                li.key,
                                                                                                'textValue',
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                )}
                                                                            </label>
                                                                            <input
                                                                                type="text"
                                                                                className="budget-line__note"
                                                                                placeholder="Note"
                                                                                value={li.note || ''}
                                                                                onChange={(e) =>
                                                                                    patchLocalLineItem(
                                                                                        b._id,
                                                                                        li.key,
                                                                                        'note',
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                    <div className="budget-card__actions">
                                                                        <button
                                                                            type="button"
                                                                            className="budget-btn"
                                                                            disabled={savingId === b._id}
                                                                            onClick={() => saveDraft(b)}
                                                                        >
                                                                            Save draft
                                                                        </button>
                                                                        {(b.status === 'draft' || b.status === 'revision_requested') && (
                                                                            <button
                                                                                type="button"
                                                                                className="budget-btn primary"
                                                                                disabled={savingId === b._id}
                                                                                onClick={() => submitBudget(b)}
                                                                            >
                                                                                {savingId === b._id ? 'Submitting…' : 'Submit for review'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {orgStage && st && (
                                                                <div className="budget-card__officer">
                                                                    <h4 className="budget-card__subhead">Officer review</h4>
                                                                    <p className="budget-settings__muted">
                                                                        This budget is waiting for an officer with finance permissions.
                                                                    </p>
                                                                    <div className="budget-card__actions">
                                                                        <button
                                                                            type="button"
                                                                            className="budget-btn primary"
                                                                            onClick={() => orgStageAction(b._id, st.key, 'approve')}
                                                                        >
                                                                            Approve (officer)
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="budget-btn"
                                                                            onClick={() =>
                                                                                setOrgMsg({
                                                                                    kind: 'revision',
                                                                                    budgetId: b._id,
                                                                                    stageKey: st.key
                                                                                })
                                                                            }
                                                                        >
                                                                            Request revision
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="budget-btn budget-btn--danger"
                                                                            onClick={() =>
                                                                                setOrgMsg({
                                                                                    kind: 'reject',
                                                                                    budgetId: b._id,
                                                                                    stageKey: st.key
                                                                                })
                                                                            }
                                                                        >
                                                                            Reject
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <BudgetAuditTimeline entries={b.auditLog} className="budget-card__audit" />

                                                            <div className="budget-card__exports">
                                                                <span className="budget-card__exports-label">Export</span>
                                                                <button
                                                                    type="button"
                                                                    className="budget-linkish"
                                                                    disabled={exportingId === b._id}
                                                                    onClick={() => runExport(b, 'csv')}
                                                                >
                                                                    CSV
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="budget-linkish"
                                                                    disabled={exportingId === b._id}
                                                                    onClick={() => runExport(b, 'json')}
                                                                >
                                                                    JSON
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {closed.length > 0 && (
                                <section className="budget-settings__lane budget-settings__lane--closed" aria-labelledby="budget-closed-title">
                                    <h2 id="budget-closed-title" className="budget-settings__section-title">
                                        Closed
                                    </h2>
                                    <div className="budget-settings__cards budget-settings__cards--compact">
                                        {closed.map((b) => (
                                            <article className="budget-card budget-card--compact" key={b._id}>
                                                <div className="budget-card__head budget-card__head--static">
                                                    <div className="budget-card__head-main">
                                                        <span className="budget-card__template">{templateLabel(b.templateKey)}</span>
                                                        <span className="budget-card__title">{b.title || b.templateKey}</span>
                                                        <span className="budget-card__fy">FY {b.fiscalYear}</span>
                                                    </div>
                                                    <StatusPill status={b.status} />
                                                </div>
                                                <div className="budget-card__body budget-card__body--compact">
                                                    <BudgetAuditTimeline entries={b.auditLog} title="History" />
                                                    <div className="budget-card__exports">
                                                        <button
                                                            type="button"
                                                            className="budget-linkish"
                                                            disabled={exportingId === b._id}
                                                            onClick={() => runExport(b, 'csv')}
                                                        >
                                                            CSV
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="budget-linkish"
                                                            disabled={exportingId === b._id}
                                                            onClick={() => runExport(b, 'json')}
                                                        >
                                                            JSON
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>

            <Popup
                isOpen={!!orgMsg && orgMsg.kind === 'reject'}
                onClose={() => setOrgMsg(null)}
                customClassName="narrow-content"
                overlayClassName="popup-overlay--elevated"
            >
                <BudgetStageMessagePopupBody
                    title="Reject budget"
                    description="Optional note to the submitter."
                    placeholder="Reason (optional)"
                    submitLabel="Reject budget"
                    requireNonEmpty={false}
                    onSubmit={(message) => {
                        if (!orgMsg) return;
                        orgStageAction(orgMsg.budgetId, orgMsg.stageKey, 'reject', { message });
                    }}
                />
            </Popup>
            <Popup
                isOpen={!!orgMsg && orgMsg.kind === 'revision'}
                onClose={() => setOrgMsg(null)}
                customClassName="narrow-content"
                overlayClassName="popup-overlay--elevated"
            >
                <BudgetStageMessagePopupBody
                    title="Request revision"
                    description="Explain what needs to change before this budget can move forward. This note is required."
                    placeholder="Be specific so the org can address your feedback."
                    submitLabel="Send revision request"
                    requireNonEmpty
                    onSubmit={(message) => {
                        if (!orgMsg) return;
                        orgStageAction(orgMsg.budgetId, orgMsg.stageKey, 'request-revision', { message });
                    }}
                />
            </Popup>
        </div>
    );
}
