import React, { useEffect, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import BudgetAuditTimeline from '../../../../components/BudgetWorkflow/BudgetAuditTimeline';

function currentStage(budget) {
    const stages = budget?.workflow?.stagesSnapshot || [];
    const i = budget?.workflow?.currentStageIndex ?? 0;
    return stages[i] || null;
}

function formatCurrency(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }).format(Number(n));
}

function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
}

/** Popup cloneElement passes handleClose — swallow on a component, not a bare div. */
function BudgetReviewPlaceholder({ handleClose: _h }) {
    return <div className="fb-review-popup__inner fb-review-popup__inner--placeholder" aria-hidden />;
}

/** Single root for Popup (cloneElement injects handleClose). */
function BudgetReviewBody({
    handleClose,
    listRow,
    detail,
    detailLoading,
    detailError,
    positionLabel,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    actingId,
    onApprove,
    onPlatformRevisionOpen,
    onPlatformRejectOpen
}) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') handleClose?.();
            if (e.key === 'ArrowLeft' && hasPrev) onPrev();
            if (e.key === 'ArrowRight' && hasNext) onNext();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleClose, hasPrev, hasNext, onPrev, onNext]);

    const row = detail || listRow;
    const st = currentStage(row);
    const platformPending = row?.status === 'in_review' && st?.actorType === 'platform_admin';
    const budgetForLines = row;
    const org = listRow?.org || {};
    const lineItems = budgetForLines?.lineItems || [];
    const currencyLineItems = lineItems.filter((li) => li.kind === 'currency');
    const requestedTotal = currencyLineItems.reduce((sum, li) => {
        const v = Number(li.amount);
        return Number.isNaN(v) ? sum : sum + v;
    }, 0);

    return (
        <div
            className="fb-review-popup__inner"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-review-title"
        >
            <header className="fb-review-modal__head">
                <div>
                    <p className="fb-review-modal__org">{listRow.org?.org_name || 'Organization'}</p>
                    <h2 id="fb-review-title">{row.title || row.templateKey}</h2>
                    <p className="fb-review-modal__meta">
                        FY {row.fiscalYear} · {row.status}
                        {st ? ` · ${st.label}` : ''}
                    </p>
                </div>
            </header>

            <div className="fb-review-modal__nav">
                <button type="button" className="fb-review-nav-btn" disabled={!hasPrev} onClick={onPrev}>
                    <Icon icon="mdi:chevron-left" /> Previous
                </button>
                <span className="fb-review-modal__position">{positionLabel}</span>
                <button type="button" className="fb-review-nav-btn" disabled={!hasNext} onClick={onNext}>
                    Next <Icon icon="mdi:chevron-right" />
                </button>
            </div>

            <div className="fb-review-modal__body">
                {detailLoading && <p className="fb-review-modal__loading">Loading budget details…</p>}
                {detailError && !detailLoading && <p className="fb-review-modal__error">{detailError}</p>}
                {!detailLoading && (
                    <>
                        <section className="fb-review-section fb-review-context">
                            <div className="fb-review-org-card">
                                <div className="fb-review-org-main">
                                    <img
                                        src={org?.org_profile_image || '/Logo.svg'}
                                        alt=""
                                        className="fb-review-org-avatar"
                                    />
                                    <div>
                                        <p className="fb-review-org-kicker">Organization context</p>
                                        <h4 className="fb-review-org-name">{org?.org_name || 'Organization'}</h4>
                                        <p className="fb-review-org-sub">
                                            {org?.orgTypeKey ? `Type: ${org.orgTypeKey}` : 'No org type on file'}
                                        </p>
                                    </div>
                                </div>
                                <div className="fb-review-org-stats">
                                    <div className="fb-review-stat">
                                        <span className="label">Fiscal year</span>
                                        <strong>{budgetForLines.fiscalYear || '—'}</strong>
                                    </div>
                                    <div className="fb-review-stat">
                                        <span className="label">Line items</span>
                                        <strong>{lineItems.length}</strong>
                                    </div>
                                    <div className="fb-review-stat">
                                        <span className="label">Requested total</span>
                                        <strong>{formatCurrency(requestedTotal)}</strong>
                                    </div>
                                    <div className="fb-review-stat">
                                        <span className="label">Last updated</span>
                                        <strong>{formatDateTime(budgetForLines.updatedAt)}</strong>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="fb-review-section">
                            <h3>Line items</h3>
                            <div className="fb-review-lines">
                                {(budgetForLines.lineItems || []).length === 0 ? (
                                    <p className="fb-review-muted">No line items.</p>
                                ) : (
                                    <table className="fb-review-table">
                                        <thead>
                                            <tr>
                                                <th>Item</th>
                                                <th>Value</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(budgetForLines.lineItems || []).map((li) => (
                                                <tr key={li.key}>
                                                    <td>{li.label || li.key}</td>
                                                    <td>
                                                        {li.kind === 'currency' && formatCurrency(li.amount)}
                                                        {li.kind === 'number' &&
                                                            (li.numberValue != null && !Number.isNaN(Number(li.numberValue))
                                                                ? String(li.numberValue)
                                                                : '—')}
                                                        {li.kind === 'text' && (li.textValue || '—')}
                                                        {!['currency', 'number', 'text'].includes(li.kind) && '—'}
                                                    </td>
                                                    <td className="fb-review-note">{li.note || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </section>

                        <BudgetAuditTimeline entries={budgetForLines.auditLog} className="fb-review-audit" />

                        {(budgetForLines.comments || []).length > 0 && (
                            <section className="fb-review-section">
                                <h3>Comments</h3>
                                <ul className="fb-review-comments">
                                    {(budgetForLines.comments || []).map((c, i) => (
                                        <li key={i}>
                                            <time dateTime={c.createdAt}>
                                                {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
                                            </time>
                                            <p>{c.body}</p>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>

            {platformPending && !detailLoading && (
                <footer className="fb-review-modal__footer">
                    <button
                        type="button"
                        className="btn-approve"
                        disabled={!!actingId}
                        onClick={onApprove}
                    >
                        {actingId === `${listRow._id}:approve` ? '…' : 'Approve'}
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={!!actingId}
                        onClick={() => onPlatformRevisionOpen(listRow)}
                    >
                        Request revision
                    </button>
                    <button
                        type="button"
                        className="btn-reject"
                        disabled={!!actingId}
                        onClick={() => onPlatformRejectOpen(listRow)}
                    >
                        {actingId === `${listRow._id}:reject` ? '…' : 'Reject'}
                    </button>
                </footer>
            )}
        </div>
    );
}

export default function BudgetReviewModal({
    open,
    onClose,
    listRow,
    detail,
    detailLoading,
    detailError,
    positionLabel,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    actingId,
    onApprove,
    onPlatformRevisionOpen,
    onPlatformRejectOpen
}) {
    const lastListRowRef = useRef(null);
    if (listRow) lastListRowRef.current = listRow;
    const displayRow = listRow || lastListRowRef.current;

    return (
        <Popup
            isOpen={open}
            onClose={onClose}
            defaultStyling={false}
            customClassName="fb-review-popup"
        >
            {displayRow ? (
                <BudgetReviewBody
                    listRow={displayRow}
                    detail={detail}
                    detailLoading={detailLoading}
                    detailError={detailError}
                    positionLabel={positionLabel}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    onPrev={onPrev}
                    onNext={onNext}
                    actingId={actingId}
                    onApprove={onApprove}
                    onPlatformRevisionOpen={onPlatformRevisionOpen}
                    onPlatformRejectOpen={onPlatformRejectOpen}
                />
            ) : (
                <BudgetReviewPlaceholder />
            )}
        </Popup>
    );
}
