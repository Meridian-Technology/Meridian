import React, { useMemo } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import './ClubBudgets.scss';

function formatCurrency(value) {
    if (typeof value !== 'number') {
        return '$0.00';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function ClubBudgets({ orgId }) {
    const budgetResponse = useFetch(`/org-budgets/${orgId}`);
    const budgets = useMemo(() => budgetResponse?.data?.data || [], [budgetResponse?.data]);

    if (budgetResponse.loading) {
        return <div className="club-budgets"><div className="club-budgets__loading">Loading budgets...</div></div>;
    }

    return (
        <div className="club-budgets">
            <div className="club-budgets__header">
                <h2 className="club-budgets__title">Budgets</h2>
                <p className="club-budgets__subtitle">Configured finance workflows and request states.</p>
            </div>
            <div className="club-budgets__list">
                {budgets.length === 0 && <div className="club-budgets__empty">No budgets yet.</div>}
                {budgets.map((budget) => (
                    <article className="club-budgets__card" key={budget._id}>
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
        </div>
    );
}
