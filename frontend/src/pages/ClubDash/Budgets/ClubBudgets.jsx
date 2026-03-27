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
    const budgets = useMemo(() => budgetResponse?.data?.data || [], [budgetResponse?.data]);
    const reviewQueue = useMemo(() => reviewQueueResponse?.data?.data || [], [reviewQueueResponse?.data]);
    const [selectedBudgetId, setSelectedBudgetId] = useState(null);
    const [transitionState, setTransitionState] = useState('');
    const [transitionMessage, setTransitionMessage] = useState('');
    const historyResponse = useFetch(selectedBudgetId ? `/org-budgets/${orgId}/${selectedBudgetId}/history` : null);

    const selectedBudget = useMemo(
        () => budgets.find((budget) => budget._id === selectedBudgetId) || null,
        [budgets, selectedBudgetId]
    );
    const workflowEvents = useMemo(() => historyResponse?.data?.data?.workflowEvents || [], [historyResponse?.data]);
    const reviews = useMemo(() => historyResponse?.data?.data?.reviews || [], [historyResponse?.data]);

    const transitionBudget = async () => {
        if (!selectedBudgetId || !transitionState) {
            return;
        }
        const response = await authenticatedRequest(`/org-budgets/${orgId}/${selectedBudgetId}/state`, {
            method: 'PATCH',
            data: { toState: transitionState, reason: 'clubdash_state_transition' }
        });
        if (response.error) {
            setTransitionMessage(response.error);
            return;
        }
        setTransitionMessage('State updated.');
        budgetResponse.refetch({ silent: true });
        reviewQueueResponse.refetch({ silent: true });
        historyResponse.refetch({ silent: true });
    };

    if (budgetResponse.loading) {
        return <div className="club-budgets"><div className="club-budgets__loading">Loading budgets...</div></div>;
    }

    return (
        <div className="club-budgets">
            <div className="club-budgets__header">
                <h2 className="club-budgets__title">Budgets</h2>
                <p className="club-budgets__subtitle">Configured finance workflows and request states.</p>
            </div>
            <div className="club-budgets__review-queue">
                <h3>Review queue</h3>
                <p>{reviewQueue.length} budgets in review-ready states.</p>
            </div>
            <div className="club-budgets__list">
                {budgets.length === 0 && <div className="club-budgets__empty">No budgets yet.</div>}
                {budgets.map((budget) => (
                    <article
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
                    </article>
                ))}
            </div>
            {selectedBudget && (
                <div className="club-budgets__detail">
                    <h3>{selectedBudget.name} workflow</h3>
                    <div className="club-budgets__transition">
                        <select value={transitionState} onChange={(e) => setTransitionState(e.target.value)}>
                            {[...new Set([...BUDGET_STATE_OPTIONS, selectedBudget.state])].map((state) => (
                                <option value={state} key={state}>
                                    {state}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={transitionBudget}>Transition state</button>
                    </div>
                    {transitionMessage && <p className="club-budgets__message">{transitionMessage}</p>}
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
                                        <small>{review.comment || 'No comment'}</small>
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
