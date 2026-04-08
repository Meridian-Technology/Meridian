import React from 'react';
import './BudgetAuditTimeline.scss';

const ACTION_LABELS = {
    draft_created: 'Draft created',
    submitted: 'Submitted for review',
    officer_stage_approved: 'Officer stage approved',
    officer_approved: 'Officer approved',
    approved: 'Approved',
    platform_stage_approved: 'Finance office stage approved',
    workflow_completed_approved: 'Fully approved',
    rejected: 'Rejected',
    revision_requested: 'Revision requested',
    resumed_after_revision: 'Returned to draft after revision'
};

function formatWhen(at) {
    if (!at) return '';
    try {
        return new Date(at).toLocaleString();
    } catch {
        return '';
    }
}

export default function BudgetAuditTimeline({ entries, title = 'Activity log', className = '' }) {
    const list = Array.isArray(entries) ? [...entries].reverse() : [];

    if (!list.length) {
        return (
            <section className={`budget-audit ${className}`.trim()}>
                <h3 className="budget-audit__title">{title}</h3>
                <p className="budget-audit__empty">No recorded activity yet.</p>
            </section>
        );
    }

    return (
        <section className={`budget-audit ${className}`.trim()}>
            <h3 className="budget-audit__title">{title}</h3>
            <ol className="budget-audit__list">
                {list.map((e, i) => (
                    <li key={i} className="budget-audit__item">
                        <div className="budget-audit__row">
                            <span className={`budget-audit__actor budget-audit__actor--${e.actor || 'org'}`}>
                                {e.actor === 'platform' ? 'Finance office' : e.actor === 'system' ? 'System' : 'Organization'}
                            </span>
                            <time className="budget-audit__time" dateTime={e.at}>
                                {formatWhen(e.at)}
                            </time>
                        </div>
                        <p className="budget-audit__action">{ACTION_LABELS[e.action] || e.action}</p>
                        {(e.fromStatus || e.toStatus) && (
                            <p className="budget-audit__statuses">
                                {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
                                    ? `${e.fromStatus} → ${e.toStatus}`
                                    : e.toStatus || e.fromStatus}
                            </p>
                        )}
                        {e.stageKey ? <p className="budget-audit__stage">Stage: {e.stageKey}</p> : null}
                        {e.message ? <p className="budget-audit__message">{e.message}</p> : null}
                    </li>
                ))}
            </ol>
        </section>
    );
}
