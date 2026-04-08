import React, { useState, useEffect, useCallback } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import BudgetReviewModal from './BudgetReviewModal';
import BudgetStageMessagePopupBody from '../../../../components/BudgetWorkflow/BudgetStageMessagePopupBody';
import './FinanceBudgetQueue.scss';

function currentStage(budget) {
    const stages = budget.workflow?.stagesSnapshot || [];
    const i = budget.workflow?.currentStageIndex ?? 0;
    return stages[i] || null;
}

function FinanceBudgetQueue() {
    const [statusFilter, setStatusFilter] = useState('in_review');
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const { data: res, loading, error, refetch } = useFetch(`/org-management/finance/budgets${qs}`);
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const [actingId, setActingId] = useState(null);
    const [reviewIdx, setReviewIdx] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [platDlg, setPlatDlg] = useState(null);

    const rows = res?.data || [];
    const pagination = res?.pagination;

    const reviewRow = reviewIdx !== null ? rows[reviewIdx] : null;

    useEffect(() => {
        if (reviewIdx !== null && (reviewIdx < 0 || reviewIdx >= rows.length)) {
            setReviewIdx(null);
            setDetail(null);
            setDetailError(null);
        }
    }, [reviewIdx, rows.length]);

    useEffect(() => {
        if (!reviewRow) {
            setDetail(null);
            setDetailError(null);
            setDetailLoading(false);
            return undefined;
        }
        const { orgId, _id: budgetId } = reviewRow;
        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            setDetailError(null);
            setDetail(null);
            const out = await apiRequest(
                `/org-management/organizations/${orgId}/budgets/${budgetId}`,
                null,
                { method: 'GET' }
            );
            if (cancelled) return;
            setDetailLoading(false);
            if (out?.success && out.data) {
                setDetail(out.data);
            } else {
                setDetailError(out?.message || out?.error || 'Could not load budget');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [reviewRow?.orgId, reviewRow?._id]);

    const runPlatformAction = useCallback(
        async (methodPath, orgId, budgetId, stageKey, extra = {}, onSuccess) => {
            const id = `${budgetId}:${methodPath}`;
            setActingId(id);
            try {
                const r = await apiRequest(
                    `/org-management/organizations/${orgId}/budgets/${budgetId}/stages/${stageKey}/${methodPath}`,
                    extra.body || {},
                    { method: 'PUT' }
                );
                if (r.success) {
                    addNotification({ title: 'Updated', message: r.message || 'Budget updated', type: 'success' });
                    await refetch();
                    onSuccess?.();
                } else {
                    addNotification({ title: 'Error', message: r.message || 'Request failed', type: 'error' });
                }
            } catch (e) {
                addNotification({
                    title: 'Error',
                    message: e?.response?.data?.message || e?.message || 'Request failed',
                    type: 'error'
                });
            } finally {
                setActingId(null);
            }
        },
        [addNotification, refetch]
    );

    const closeReview = useCallback(() => {
        setReviewIdx(null);
        setDetail(null);
        setDetailError(null);
    }, []);

    const handleApprove = (row) => {
        const st = currentStage(row);
        if (!st || st.actorType !== 'platform_admin') {
            addNotification({
                title: 'Not ready',
                message: 'This budget is not awaiting finance office action.',
                type: 'error'
            });
            return;
        }
        runPlatformAction('approve', row.orgId, row._id, st.key, {}, closeReview);
    };

    const submitPlatformDialog = (message) => {
        if (!platDlg) return;
        const { kind, row } = platDlg;
        const st = currentStage(row);
        if (!st || st.actorType !== 'platform_admin') {
            setPlatDlg(null);
            return;
        }
        const path = kind === 'reject' ? 'reject' : 'request-revision';
        runPlatformAction(path, row.orgId, row._id, st.key, { body: { message } }, () => {
            setPlatDlg(null);
            closeReview();
        });
    };

    const openReview = (idx) => setReviewIdx(idx);

    const goPrev = () => reviewIdx > 0 && setReviewIdx(reviewIdx - 1);
    const goNext = () => reviewIdx < rows.length - 1 && setReviewIdx(reviewIdx + 1);

    if (loading) {
        return (
            <div className="finance-budget-queue">
                <div className="loading">Loading budgets…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="finance-budget-queue">
                <div className="error">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="finance-budget-queue dash">
            <header className="header">
                <h1>Organization budgets</h1>
                <p>Review budgets submitted by clubs after officer approval. Approve, reject, or request changes.</p>
                <img src={AtlasMain} alt="" />
            </header>

            <div className="content">
                <div className="filter-row">
                    <label>
                        Status{' '}
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="in_review">In review</option>
                            <option value="submitted">Submitted</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="revision_requested">Revision requested</option>
                            <option value="draft">Draft</option>
                            <option value="">All</option>
                        </select>
                    </label>
                    {pagination && (
                        <span className="pagination-hint">
                            {pagination.total} total
                        </span>
                    )}
                </div>

                {rows.length === 0 ? (
                    <div className="empty-state">
                        <Icon icon="mdi:cash-multiple" />
                        <h3>No budgets in this view</h3>
                        <p>Submitted budgets appear here for finance office review after the officer stage.</p>
                    </div>
                ) : (
                    <div className="fb-table">
                        <div className="table-header">
                            <span className="col-org">Organization</span>
                            <span className="col-title">Budget</span>
                            <span className="col-fy">Fiscal year</span>
                            <span className="col-status">Status</span>
                            <span className="col-stage">Current stage</span>
                            <span className="col-actions">Actions</span>
                        </div>
                        {rows.map((row, idx) => {
                            const st = currentStage(row);
                            const platformPending = st?.actorType === 'platform_admin';
                            const key = row._id;
                            return (
                                <div
                                    className="table-row table-row--clickable"
                                    key={key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openReview(idx)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openReview(idx);
                                        }
                                    }}
                                >
                                    <span className="col-org">{row.org?.org_name || '—'}</span>
                                    <span className="col-title">{row.title || row.templateKey}</span>
                                    <span className="col-fy">{row.fiscalYear}</span>
                                    <span className="col-status">{row.status}</span>
                                    <span className="col-stage">{st ? `${st.label} (${st.actorType})` : '—'}</span>
                                    <span className="col-actions" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            className="btn-review"
                                            disabled={actingId}
                                            onClick={() => openReview(idx)}
                                        >
                                            Review
                                        </button>
                                        {platformPending && row.status === 'in_review' && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn-approve"
                                                    disabled={actingId}
                                                    onClick={() => handleApprove(row)}
                                                >
                                                    {actingId === `${row._id}:approve` ? '…' : 'Approve'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    disabled={actingId}
                                                    onClick={() => setPlatDlg({ kind: 'revision', row })}
                                                >
                                                    Request revision
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-reject"
                                                    disabled={actingId}
                                                    onClick={() => setPlatDlg({ kind: 'reject', row })}
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <BudgetReviewModal
                open={reviewIdx !== null}
                onClose={closeReview}
                detail={detail}
                detailLoading={detailLoading}
                detailError={detailError}
                listRow={reviewRow}
                positionLabel={reviewIdx !== null ? `${reviewIdx + 1} / ${rows.length}` : ''}
                hasPrev={reviewIdx > 0}
                hasNext={reviewIdx !== null && reviewIdx < rows.length - 1}
                onPrev={goPrev}
                onNext={goNext}
                actingId={actingId}
                onApprove={() => reviewRow && handleApprove(reviewRow)}
                onPlatformRevisionOpen={(row) => setPlatDlg({ kind: 'revision', row })}
                onPlatformRejectOpen={(row) => setPlatDlg({ kind: 'reject', row })}
            />

            <Popup
                isOpen={!!platDlg && platDlg.kind === 'reject'}
                onClose={() => setPlatDlg(null)}
                customClassName="narrow-content"
                overlayClassName="popup-overlay--elevated"
            >
                <BudgetStageMessagePopupBody
                    title="Reject budget"
                    description="Optional note for the organization (shown in comments and activity log)."
                    placeholder="Reason (optional)"
                    submitLabel="Reject"
                    requireNonEmpty={false}
                    onSubmit={submitPlatformDialog}
                />
            </Popup>
            <Popup
                isOpen={!!platDlg && platDlg.kind === 'revision'}
                onClose={() => setPlatDlg(null)}
                customClassName="narrow-content"
                overlayClassName="popup-overlay--elevated"
            >
                <BudgetStageMessagePopupBody
                    title="Request revision"
                    description="Describe what must change before you can approve. This is required and is recorded in the activity log."
                    placeholder="Be specific so the org knows what to update."
                    submitLabel="Send revision request"
                    requireNonEmpty
                    onSubmit={submitPlatformDialog}
                />
            </Popup>
        </div>
    );
}

export default FinanceBudgetQueue;
