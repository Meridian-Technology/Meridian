import React, { useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import PivotTenantPage from '../PivotTenantDashboard/PivotTenantPage';
import { PivotOpsSection, PivotOpsStatus } from '../../../components/PivotOps';
import { notificationJobRunHref } from './notificationJobRoutes';
import './PivotJobRunDetail.scss';

export const JOB_RUN_DETAIL_POLL_MS = 45000;

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function productLabel(product) {
  if (product === 'justgo') return 'Just Go';
  if (product === 'campus') return 'Meridian';
  return 'Legacy unknown';
}

function productTone(product) {
  if (product === 'justgo') return 'info';
  if (product === 'campus') return 'muted';
  return 'warn';
}

function deliveryStatusLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'skipped') return 'Skipped';
  if (status === 'blocked_dev_gate') return 'Dev gate';
  return 'Failed';
}

function deliveryStatusTone(status) {
  if (status === 'accepted') return 'ok';
  if (status === 'skipped') return 'muted';
  if (status === 'blocked_dev_gate') return 'warn';
  return 'danger';
}

function attemptStatusTone(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'running') return 'info';
  if (status === 'failed') return 'danger';
  return 'muted';
}

function PivotJobRunDetail({ tenantKey, runId, batchWeek: batchWeekHint = '', onBack }) {
  const detailUrl = tenantKey && runId
    ? `/admin/platform/tenants/${tenantKey}/meridian/jobs/runs/${runId}?deliveriesLimit=100`
    : null;

  const { data, loading, error, refetch } = useFetch(detailUrl, {
    cache: { enabled: false },
  });

  useEffect(() => {
    if (!detailUrl) return undefined;
    const timer = window.setInterval(() => {
      refetch({ silent: true });
    }, JOB_RUN_DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [detailUrl, refetch]);

  const payload = data?.success ? data.data : null;
  const run = payload?.run || null;
  const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
  const deliveries = Array.isArray(payload?.deliveries) ? payload.deliveries : [];
  const batchWeek = run?.payload?.batchWeek || batchWeekHint || null;
  const overflow = Number(run?.summary?.recipientOverflowCount) || 0;
  const terminalError = run?.lastError || null;
  const permalink = notificationJobRunHref({
    tenantKey,
    runId,
    batchWeek,
  });

  return (
    <PivotTenantPage
      title="Run detail"
      tenantKey={tenantKey}
      subtitle={
        batchWeek
          ? `${batchWeek} · ${run?.type || 'notification job'}`
          : 'Per-user delivery audit for this notification job.'
      }
      className="pivot-job-run-detail-page"
      actions={(
        <div className="pivot-job-run-detail__actions">
          {onBack ? (
            <button type="button" className="linear-btn linear-btn--secondary" onClick={onBack}>
              <Icon icon="mdi:arrow-left" />
              Back to Notifications
            </button>
          ) : null}
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => refetch()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}
    >
      <div className="pivot-job-run-detail">
        {error ? <p className="pivot-job-run-detail__error">{error}</p> : null}
        {!run && loading ? <p className="pivot-job-run-detail__empty">Loading run…</p> : null}
        {run ? (
          <>
            <section className="linear-section" aria-label="Run summary">
              <h2 className="linear-section__title">{run.type || 'Job run'}</h2>
              <dl className="pivot-job-run-detail__meta">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <PivotOpsStatus tone={run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'ok' : 'muted'}>
                      {run.status}
                    </PivotOpsStatus>
                  </dd>
                </div>
                <div>
                  <dt>Batch week</dt>
                  <dd>{batchWeek || '—'}</dd>
                </div>
                <div>
                  <dt>Run id</dt>
                  <dd><code>{run.id}</code></dd>
                </div>
                <div>
                  <dt>Run key</dt>
                  <dd><code>{run.runKey || '—'}</code></dd>
                </div>
              </dl>
              <p className="pivot-job-run-detail__permalink">
                <a href={permalink}>Permalink</a>
                {' · '}
                {run.summary
                  ? `${run.summary.accepted || 0} accepted · ${run.summary.failed || 0} failed · ${run.summary.attempted || 0} attempted`
                  : null}
              </p>
              {terminalError ? (
                <p className="pivot-job-run-detail__terminal-error" role="alert">
                  {terminalError}
                </p>
              ) : null}
            </section>

            <PivotOpsSection
              title="Attempts"
              description="Retry timeline for this run. Terminal failure is after the last attempt."
            >
              {attempts.length ? (
                <ol className="pivot-job-run-detail__attempts">
                  {attempts.map((attempt) => (
                    <li key={attempt.id || attempt.attemptNumber}>
                      <div className="pivot-job-run-detail__attempt-head">
                        <strong>Attempt {attempt.attemptNumber}</strong>
                        <PivotOpsStatus tone={attemptStatusTone(attempt.status)}>
                          {attempt.status}
                        </PivotOpsStatus>
                      </div>
                      <span>
                        {formatDateTime(attempt.startedAt)}
                        {attempt.finishedAt ? ` → ${formatDateTime(attempt.finishedAt)}` : ''}
                      </span>
                      {attempt.error ? (
                        <span className="pivot-job-run-detail__attempt-error">{attempt.error}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="pivot-job-run-detail__empty">No attempts recorded yet.</p>
              )}
            </PivotOpsSection>

            <PivotOpsSection
              title="Deliveries"
              description="Resolved copy is stored on each row. Expo acceptance is not device delivery."
            >
              {overflow > 0 ? (
                <p className="pivot-job-run-detail__note">
                  Showing {deliveries.length} of {deliveries.length + overflow} recipients.
                </p>
              ) : null}
              {deliveries.length ? (
                <div className="pivot-job-run-detail__table-wrap">
                  <table className="pivot-job-run-detail__table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>App</th>
                        <th>Status</th>
                        <th>Time</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((row) => (
                        <tr key={row.id || row.userId}>
                          <td>
                            <strong>{row.name || row.username || 'Unnamed user'}</strong>
                            {row.username ? <span>@{row.username}</span> : null}
                          </td>
                          <td>
                            <PivotOpsStatus tone={productTone(row.product)}>
                              {productLabel(row.product)}
                            </PivotOpsStatus>
                          </td>
                          <td>
                            <PivotOpsStatus tone={deliveryStatusTone(row.deliveryStatus)}>
                              {deliveryStatusLabel(row.deliveryStatus)}
                            </PivotOpsStatus>
                          </td>
                          <td>{formatDateTime(row.sentAt)}</td>
                          <td>{row.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="pivot-job-run-detail__empty">No delivery rows for this run.</p>
              )}
            </PivotOpsSection>
          </>
        ) : null}
      </div>
    </PivotTenantPage>
  );
}

export default PivotJobRunDetail;
