import React, { useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import './ClubBudgets.scss';

const BUDGET_STATE_OPTIONS = [
    'draft',
    'submitted',
    'preliminary_review',
    'final_review',
    'changes_requested',
    'approved',
    'appealed',
    'finalized',
    'rejected'
];

function formatCurrency(value) {
    if (typeof value !== 'number') {
        return '$0.00';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function ClubBudgets({ orgId }) {
    const budgetResponse = useFetch(`/org-budgets/${orgId}`);
    const reviewQueueResponse = useFetch(`/org-budgets/${orgId}/review-queue`);
    const templatesResponse = useFetch(`/org-budgets/${orgId}/templates`);
    const policyResponse = useFetch(`/org-budgets/${orgId}/policy`);
    const budgets = useMemo(() => budgetResponse?.data?.data || [], [budgetResponse?.data]);
    const reviewQueue = useMemo(() => reviewQueueResponse?.data?.data || [], [reviewQueueResponse?.data]);
    const templates = useMemo(() => templatesResponse?.data?.data || [], [templatesResponse?.data]);
    const policy = useMemo(() => policyResponse?.data?.data || {}, [policyResponse?.data]);
    const [selectedBudgetId, setSelectedBudgetId] = useState(null);
    const [transitionState, setTransitionState] = useState('');
    const [actionMessage, setActionMessage] = useState('');
    const [actionStatus, setActionStatus] = useState('success');
    const [reviewComment, setReviewComment] = useState('');
    const [lineItemDraft, setLineItemDraft] = useState({ sectionKey: 'general', label: '', requestedAmount: '', account: '' });
    const [budgetDraft, setBudgetDraft] = useState({ fiscalYear: '', name: '', templateId: '' });
    const historyResponse = useFetch(selectedBudgetId ? `/org-budgets/${orgId}/${selectedBudgetId}/history` : null);
    const revisionSummaryResponse = useFetch(
        selectedBudgetId ? `/org-budgets/${orgId}/${selectedBudgetId}/revision-summary` : null
    );
    const workflowContextResponse = useFetch(
        selectedBudgetId ? `/org-budgets/${orgId}/${selectedBudgetId}/workflow-context` : null
    );

    const selectedBudget = useMemo(
        () => budgets.find((budget) => budget._id === selectedBudgetId) || null,
        [budgets, selectedBudgetId]
    );
    const workflowEvents = useMemo(() => historyResponse?.data?.data?.workflowEvents || [], [historyResponse?.data]);
    const reviews = useMemo(() => historyResponse?.data?.data?.reviews || [], [historyResponse?.data]);
    const revisionSummary = useMemo(() => revisionSummaryResponse?.data?.data || [], [revisionSummaryResponse?.data]);
    const workflowContext = useMemo(() => workflowContextResponse?.data?.data || {}, [workflowContextResponse?.data]);
    const allowedNextStates = workflowContext?.allowedNextStates || [];
    const reviewActions = workflowContext?.reviewActions || policy?.reviewActions || [];

    const postMessage = (status, message) => {
        setActionStatus(status);
        setActionMessage(message);
    };

    const transitionBudget = async () => {
        if (!selectedBudgetId || !transitionState) {
            return;
        }
        const response = await authenticatedRequest(`/org-budgets/${orgId}/${selectedBudgetId}/state`, {
            method: 'PATCH',
            data: { toState: transitionState, reason: 'clubdash_state_transition' }
        });
        if (response.error) {
            postMessage('error', response.error);
            return;
        }
        postMessage('success', 'State updated.');
        budgetResponse.refetch({ silent: true });
        reviewQueueResponse.refetch({ silent: true });
        historyResponse.refetch({ silent: true });
        revisionSummaryResponse.refetch({ silent: true });
        workflowContextResponse.refetch({ silent: true });
    };

    const createBudget = async () => {
        if (!budgetDraft.fiscalYear || !budgetDraft.name) {
            postMessage('error', 'Fiscal year and budget name are required.');
            return;
        }
        const response = await authenticatedRequest(`/org-budgets/${orgId}`, {
            method: 'POST',
            data: {
                fiscalYear: budgetDraft.fiscalYear,
                name: budgetDraft.name,
                templateId: budgetDraft.templateId || null,
                lineItems: []
            }
        });
        if (response.error) {
            postMessage('error', response.error);
            return;
        }
        postMessage('success', 'Budget created.');
        setBudgetDraft({ fiscalYear: '', name: '', templateId: '' });
        budgetResponse.refetch({ silent: true });
    };

    const addLineItem = async () => {
        if (!selectedBudget) return;
        if (!lineItemDraft.label || !lineItemDraft.requestedAmount) {
            postMessage('error', 'Line item label and requested amount are required.');
            return;
        }
        const nextLineItems = [
            ...(selectedBudget.lineItems || []),
            {
                sectionKey: lineItemDraft.sectionKey || 'general',
                label: lineItemDraft.label,
                description: '',
                requestedAmount: Number(lineItemDraft.requestedAmount || 0),
                approvedAmount: 0,
                accounting: {
                    account: lineItemDraft.account || ''
                }
            }
        ];
        const response = await authenticatedRequest(`/org-budgets/${orgId}/${selectedBudget._id}/line-items`, {
            method: 'PATCH',
            data: {
                lineItems: nextLineItems,
                reason: 'line_item_added_from_clubdash'
            }
        });
        if (response.error) {
            postMessage('error', response.error);
            return;
        }
        postMessage('success', 'Line item added.');
        setLineItemDraft({ sectionKey: 'general', label: '', requestedAmount: '', account: '' });
        budgetResponse.refetch({ silent: true });
        historyResponse.refetch({ silent: true });
        revisionSummaryResponse.refetch({ silent: true });
    };

    const submitReviewAction = async (action) => {
        if (!selectedBudgetId) return;
        const response = await authenticatedRequest(`/org-budgets/${orgId}/${selectedBudgetId}/reviews`, {
            method: 'POST',
            data: {
                action,
                comment: reviewComment,
                reason: 'clubdash_reviewer_action'
            }
        });
        if (response.error) {
            postMessage('error', response.error);
            return;
        }
        postMessage('success', `Review action "${action}" saved.`);
        setReviewComment('');
        budgetResponse.refetch({ silent: true });
        reviewQueueResponse.refetch({ silent: true });
        historyResponse.refetch({ silent: true });
        revisionSummaryResponse.refetch({ silent: true });
        workflowContextResponse.refetch({ silent: true });
    };

    if (budgetResponse.loading || policyResponse.loading) {
        return <div className="club-budgets"><div className="club-budgets__loading">Loading budgets...</div></div>;
    }

    return (
        <div className="club-budgets">
            <div className="club-budgets__header">
                <h2 className="club-budgets__title">Budgets</h2>
                <p className="club-budgets__subtitle">Configured finance workflows and request states.</p>
            </div>
            <div className="club-budgets__workspace">
                <article className="club-budgets__workspace-card">
                    <h3>Create budget</h3>
                    <input
                        value={budgetDraft.name}
                        onChange={(event) => setBudgetDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Budget name"
                    />
                    <input
                        value={budgetDraft.fiscalYear}
                        onChange={(event) => setBudgetDraft((current) => ({ ...current, fiscalYear: event.target.value }))}
                        placeholder="Fiscal year"
                    />
                    <select
                        value={budgetDraft.templateId}
                        onChange={(event) => setBudgetDraft((current) => ({ ...current, templateId: event.target.value }))}
                    >
                        <option value="">No template</option>
                        {templates.map((template) => (
                            <option value={template._id} key={template._id}>
                                {template.name}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={createBudget}>Create budget</button>
                </article>

                <article className="club-budgets__workspace-card">
                    <h3>Review queue</h3>
                    <p>{reviewQueue.length} budgets in review-ready states.</p>
                    <ul className="club-budgets__queue-list">
                        {reviewQueue.map((budget) => (
                            <li key={budget._id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedBudgetId(budget._id);
                                        setTransitionState(budget.state || '');
                                    }}
                                >
                                    <span>{budget.name}</span>
                                    <small>{budget.state}</small>
                                </button>
                            </li>
                        ))}
                    </ul>
                </article>

                <article className="club-budgets__workspace-card">
                    <h3>Policy snapshot</h3>
                    <div className="club-budgets__policy-pills">
                        <span>{(policy?.editableStates || []).length} editable states</span>
                        <span>{(policy?.reviewActions || []).length} review actions</span>
                        <span>{policy?.capabilities?.canApprove ? 'Can approve' : 'Cannot approve'}</span>
                    </div>
                </article>
            </div>
            <div className="club-budgets__review-queue">
                <h3>Review queue</h3>
                <p>{reviewQueue.length} budgets in review-ready states.</p>
            </div>
            <div className="club-budgets__list">
                {budgets.length === 0 && <div className="club-budgets__empty">No budgets yet.</div>}
                {budgets.map((budget) => (
                    <button
                        type="button"
                        className={`club-budgets__card ${selectedBudgetId === budget._id ? 'club-budgets__card--selected' : ''}`}
                        key={budget._id}
                        onClick={() => {
                            setSelectedBudgetId(budget._id);
                            setTransitionState(budget.state || '');
                        }}
                    >
                        <div className="club-budgets__card-title">{budget.name}</div>
                        <div className="club-budgets__card-meta">
                            <span>{budget.fiscalYear}</span>
                            <span className="club-budgets__state">{budget.state}</span>
                        </div>
                        <div className="club-budgets__amounts">
                            <div>
                                <label>Requested</label>
                                <strong>{formatCurrency(budget.totalRequested || 0)}</strong>
                            </div>
                            <div>
                                <label>Approved</label>
                                <strong>{formatCurrency(budget.totalApproved || 0)}</strong>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            {selectedBudget && (
                <div className="club-budgets__detail">
                    <h3>{selectedBudget.name} workspace</h3>
                    <div className="club-budgets__transition">
                        <select value={transitionState} onChange={(e) => setTransitionState(e.target.value)}>
                            {[...new Set([...(allowedNextStates.length > 0 ? allowedNextStates : BUDGET_STATE_OPTIONS), selectedBudget.state])].map((state) => (
                                <option value={state} key={state}>
                                    {state}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={transitionBudget}>Transition state</button>
                    </div>
                    <div className="club-budgets__line-item-editor">
                        <h4>Add line item</h4>
                        <input
                            value={lineItemDraft.label}
                            onChange={(event) => setLineItemDraft((current) => ({ ...current, label: event.target.value }))}
                            placeholder="Line item label"
                        />
                        <input
                            value={lineItemDraft.requestedAmount}
                            onChange={(event) => setLineItemDraft((current) => ({ ...current, requestedAmount: event.target.value }))}
                            placeholder="Requested amount"
                            type="number"
                        />
                        <input
                            value={lineItemDraft.account}
                            onChange={(event) => setLineItemDraft((current) => ({ ...current, account: event.target.value }))}
                            placeholder="Accounting account"
                        />
                        <button type="button" onClick={addLineItem}>Add line item</button>
                    </div>

                    <div className="club-budgets__review-actions">
                        <h4>Reviewer actions</h4>
                        <textarea
                            value={reviewComment}
                            onChange={(event) => setReviewComment(event.target.value)}
                            placeholder="Add reviewer context or decision notes"
                        />
                        <div className="club-budgets__action-row">
                            {reviewActions.map((action) => (
                                <button key={action} type="button" onClick={() => submitReviewAction(action)}>
                                    {action}
                                </button>
                            ))}
                        </div>
                    </div>

                    {actionMessage && (
                        <p className={`club-budgets__message club-budgets__message--${actionStatus}`} role="status" aria-live="polite">
                            {actionMessage}
                        </p>
                    )}
                    <div className="club-budgets__history-columns">
                        <div>
                            <h4>Workflow events</h4>
                            <ul>
                                {workflowEvents.map((event) => (
                                    <li key={event._id}>
                                        <span>{event.fromState || 'n/a'} -&gt; {event.toState}</span>
                                        <small>{new Date(event.createdAt).toLocaleString()}</small>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4>Reviewer actions</h4>
                            <ul>
                                {reviews.map((review) => (
                                    <li key={review._id}>
                                        <span>{review.action}</span>
                                        <small>
                                            {review.parentReviewId ? 'Reply - ' : ''}
                                            {review.comment || 'No comment'}
                                        </small>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4>Revision diff summaries</h4>
                            <ul>
                                {revisionSummary.map((revision) => (
                                    <li key={revision.id}>
                                        <span>
                                            Requested {formatCurrency(revision.requestedDelta)} | Approved {formatCurrency(revision.approvedDelta)}
                                        </span>
                                        <small>
                                            Lines {revision.previousLineItemCount} -&gt; {revision.newLineItemCount}
                                        </small>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
