import React, { useMemo, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsStatus } from '../../../components/PivotOps';
import { SCHEDULE_HANDLER_LABELS, scheduleCadence, scheduleName } from './notificationScheduleCopy';
import './PivotNotificationScheduleAudit.scss';

const NO_FETCH_CACHE = { enabled: false };

const RUN_STATUS_LABELS = {
  failed: 'Failed',
  succeeded: 'Sent',
  preview: 'Dry run',
  running: 'Running',
  retry_wait: 'Retrying',
  pending: 'Queued',
};

function tenantLabel(tenant, tenantKey) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const name = tenant?.location || tenant?.name || '';
  if (name && key && name.toLowerCase() !== key) return `${name} · ${key}`;
  return name || key || '—';
}

function formatDateTime(value) {
  if (!value) return 'Time not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Time not recorded';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function runStatusTone(status) {
  if (status === 'failed') return 'danger';
  if (status === 'succeeded' || status === 'preview') return 'ok';
  if (status === 'running' || status === 'retry_wait') return 'info';
  return 'muted';
}

function countOf(run, field) {
  const value = Number(run?.summary?.[field]);
  return Number.isFinite(value) ? value : 0;
}

function deliveryName(row) {
  return row?.name || row?.username || 'Unnamed user';
}

function PivotNotificationScheduleAudit({
  definition,
  tenants = [],
  tenantKey = '',
  initialRunId = '',
  onClose,
  onEdit,
  onQueued,
}) {
  const { addNotification } = useNotification();
  const scopedTenant = String(tenantKey || definition?.tenantKey || '').trim().toLowerCase();
  const handlerKey = definition?.handlerKey || '';
  const name = scheduleName(definition);
  const [selectedRunId, setSelectedRunId] = useState(initialRunId || '');
  const [runDraft, setRunDraft] = useState({
    tenantKey: definition?.tenantKey || scopedTenant || '',
    dryRun: true,
  });
  const [enqueueing, setEnqueueing] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');

  const {
    data: runsResponse,
    loading: runsLoading,
    error: runsError,
  } = useFetch(handlerKey ? '/admin/meridian/jobs/runs' : null, {
    cache: NO_FETCH_CACHE,
    params: {
      type: handlerKey,
      limit: 30,
      ...(scopedTenant ? { tenantKey: scopedTenant } : {}),
    },
  });

  const runs = useMemo(() => {
    const rows = runsResponse?.success ? (runsResponse.data?.runs || []) : [];
    return rows.filter((run) => !handlerKey || run?.type === handlerKey);
  }, [handlerKey, runsResponse]);

  const activeRunId = selectedRunId || runs[0]?.id || '';
  const activeRun = runs.find((run) => run.id === activeRunId) || null;

  const detailUrl = activeRunId
    ? `/admin/meridian/jobs/runs/${activeRunId}?deliveriesLimit=100`
    : null;
  const {
    data: detailResponse,
    loading: detailLoading,
    error: detailError,
  } = useFetch(detailUrl, { cache: NO_FETCH_CACHE });

  const detail = detailResponse?.success ? detailResponse.data : null;
  const deliveries = Array.isArray(detail?.deliveries) ? detail.deliveries : [];
  const shownRun = detail?.run || activeRun;

  const handleEnqueue = async (event) => {
    event.preventDefault();
    if (!handlerKey || !runDraft.tenantKey) return;
    setEnqueueing(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      '/admin/meridian/jobs/runs/enqueue',
      {
        method: 'POST',
        data: {
          handlerKey,
          tenantKey: runDraft.tenantKey,
          payload: { dryRun: runDraft.dryRun !== false },
        },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setEnqueueing(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not queue run',
        message: res?.message || reqError || 'Unable to enqueue notification job',
        type: 'error',
      });
      return;
    }
    addNotification({
      title: res.data?.created !== false ? 'Run queued' : 'Already queued',
      message: `${name} · ${runDraft.tenantKey}${runDraft.dryRun === false ? '' : ' · dry run'}`,
      type: res.data?.created !== false ? 'success' : 'info',
    });
    onQueued?.();
  };

  const handleEligibility = async () => {
    if (!handlerKey || !runDraft.tenantKey) return;
    setEligibilityLoading(true);
    setEligibilityError('');
    const { data: res, error: reqError } = await authenticatedRequest(
      '/admin/meridian/jobs/notifications/eligibility',
      {
        params: {
          handlerKey,
          tenantKey: runDraft.tenantKey,
        },
      },
    );
    setEligibilityLoading(false);
    if (reqError || !res?.success) {
      setEligibility(null);
      setEligibilityError(res?.message || reqError || 'Unable to check who is eligible');
      return;
    }
    setEligibility(res.data || null);
  };

  const canEnqueue = Boolean(SCHEDULE_HANDLER_LABELS[handlerKey]);

  return (
    <div className="pivot-notification-schedule-audit">
      <header className="pivot-notification-schedule-audit__head">
        <div>
          <h2 className="pivot-notification-schedule-audit__title">{name}</h2>
          <p className="pivot-notification-schedule-audit__lead">
            {scheduleCadence(definition)}
            {definition?.tenantKey
              ? ` · ${tenantLabel(tenants.find((row) => row.tenantKey === definition.tenantKey), definition.tenantKey)}`
              : ''}
          </p>
        </div>
        <div className="pivot-notification-schedule-audit__head-actions">
          {onEdit ? (
            <button type="button" className="linear-btn linear-btn--secondary" onClick={onEdit}>
              Edit schedule
            </button>
          ) : null}
          <button type="button" className="linear-btn linear-btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <section className="pivot-notification-schedule-audit__checks" aria-label="Check history">
        <h3>Checks</h3>
        <p>Each row is one time this schedule ran. Found is who qualified. Sent is who Expo accepted.</p>
        {runsError ? <p className="pivot-notification-schedule-audit__error" role="alert">{runsError}</p> : null}
        {runsLoading && !runs.length ? (
          <p className="pivot-notification-schedule-audit__empty">Loading checks…</p>
        ) : runs.length ? (
          <ul>
            {runs.map((run) => {
              const selected = run.id === activeRunId;
              const when = run.finishedAt || run.updatedAt || run.createdAt;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <time dateTime={when || undefined}>{formatDateTime(when)}</time>
                    <span>{tenantLabel(tenants.find((row) => row.tenantKey === run.tenantKey), run.tenantKey)}</span>
                    <span>Found {countOf(run, 'attempted')}</span>
                    <span>Sent {countOf(run, 'accepted')}</span>
                    <PivotOpsStatus tone={runStatusTone(run.status)}>
                      {RUN_STATUS_LABELS[run.status] || run.status}
                    </PivotOpsStatus>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pivot-notification-schedule-audit__empty">No checks recorded yet.</p>
        )}
      </section>

      <section className="pivot-notification-schedule-audit__people" aria-label="Who this check sent to">
        <h3>Who it sent to</h3>
        {detailError ? <p className="pivot-notification-schedule-audit__error" role="alert">{detailError}</p> : null}
        {shownRun?.lastError ? (
          <p className="pivot-notification-schedule-audit__error" role="alert">{shownRun.lastError}</p>
        ) : null}
        {detailLoading && !deliveries.length ? (
          <p className="pivot-notification-schedule-audit__empty">Loading recipients…</p>
        ) : deliveries.length ? (
          <ul>
            {deliveries.map((row) => (
              <li key={row.id || row.userId}>
                <strong>{deliveryName(row)}</strong>
                <span>{row.username ? `@${row.username}` : ''}</span>
                <PivotOpsStatus tone={row.deliveryStatus === 'accepted' ? 'ok' : row.deliveryStatus === 'failed' ? 'danger' : 'muted'}>
                  {{
                    accepted: 'Sent',
                    failed: 'Failed',
                    skipped: 'Skipped',
                    pending: 'Pending',
                    blocked_dev_gate: 'Blocked',
                  }[row.deliveryStatus] || row.deliveryStatus || 'Unknown'}
                </PivotOpsStatus>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pivot-notification-schedule-audit__empty">
            {activeRunId ? 'This check did not send to anyone.' : 'Select a check.'}
          </p>
        )}
      </section>

      {canEnqueue ? (
        <>
        <form className="pivot-notification-schedule-audit__run" onSubmit={handleEnqueue}>
        {definition?.tenantKey || scopedTenant ? null : (
          <label className="linear-field">
            <span className="linear-field__label">City</span>
            <select
              aria-label={`City for ${name}`}
              value={runDraft.tenantKey}
              onChange={(event) => setRunDraft((current) => ({
                ...current,
                tenantKey: event.target.value,
              }))}
            >
              <option value="">Select a city</option>
              {tenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenantLabel(tenant, tenant.tenantKey)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="linear-field linear-field--checkbox">
          <input
            type="checkbox"
            checked={runDraft.dryRun !== false}
            onChange={(event) => setRunDraft((current) => ({
              ...current,
              dryRun: event.target.checked,
            }))}
          />
          <span>Dry run</span>
        </label>
        <button
          type="button"
          className="linear-btn"
          disabled={!runDraft.tenantKey || eligibilityLoading}
          onClick={handleEligibility}
        >
          {eligibilityLoading ? 'Checking…' : "Who's eligible"}
        </button>
        <button
          type="submit"
          className="linear-btn linear-btn--primary"
          disabled={!runDraft.tenantKey || enqueueing}
        >
          {enqueueing ? 'Queuing…' : 'Queue run'}
        </button>
        </form>
        {eligibilityError ? (
          <p className="pivot-notification-schedule-audit__error" role="alert">{eligibilityError}</p>
        ) : null}
        {eligibility ? (
          <section className="pivot-notification-schedule-audit__people" aria-label="Who is eligible right now">
            <h3>Eligible right now</h3>
            <p>
              {eligibility.count} {eligibility.count === 1 ? 'person matches' : 'people match'} this schedule. Nothing was sent.
              {eligibility.overflow ? ` Showing the first ${eligibility.people?.length || 0}.` : ''}
            </p>
            {eligibility.people?.length ? (
              <ul>
                {eligibility.people.map((row) => (
                  <li key={row.userId}>
                    <strong>{deliveryName(row)}</strong>
                    <span>{row.username ? `@${row.username}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pivot-notification-schedule-audit__empty">Nobody matches right now.</p>
            )}
          </section>
        ) : null}
        </>
      ) : null}
    </div>
  );
}

export default PivotNotificationScheduleAudit;
