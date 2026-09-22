import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsSection, PivotOpsStatus } from '../../../components/PivotOps';
import PivotTenantPage from '../PivotTenantDashboard/PivotTenantPage';
import { notificationJobRunHref, computeJobInspectorHref } from './notificationJobRoutes';
import PivotNotificationDefinitionEditor from './PivotNotificationDefinitionEditor';
import '../TenantManagement/TenantManagementPage.scss';
import './PivotFleetNotificationsPage.scss';

const NO_FETCH_CACHE = { enabled: false };
export const FLEET_NOTIFICATIONS_POLL_MS = 45000;

const ENQUEUEABLE_HANDLERS = [
  { value: 'weekly_drop', label: 'Weekly drop' },
  { value: 'ritual_crew_scan', label: 'Ritual crew scan' },
  { value: 'solo_swipe_reminder', label: 'Solo swipe reminder' },
  { value: 'event_discovery', label: 'Event discovery' },
];

function tenantLabel(tenant, tenantKey) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const row = tenant || null;
  const name = row?.location || row?.name || '';
  if (name && key && name.toLowerCase() !== key) return `${name} · ${key}`;
  return name || key || '—';
}

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

function runStatusTone(status) {
  if (status === 'failed') return 'danger';
  if (status === 'succeeded' || status === 'preview') return 'ok';
  if (status === 'running') return 'info';
  return 'muted';
}

function definitionScope(tenantKey) {
  return tenantKey ? tenantKey : 'Fleet template';
}

function PivotFleetNotificationsPage({ tenants = [] }) {
  const { addNotification } = useNotification();
  const pivotTenants = useMemo(
    () => (tenants || []).filter((row) => row?.tenantKey).slice().sort((a, b) => {
      const left = a.location || a.name || a.tenantKey;
      const right = b.location || b.name || b.tenantKey;
      return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
    }),
    [tenants],
  );
  const tenantsByKey = useMemo(() => {
    const map = new Map();
    pivotTenants.forEach((row) => {
      map.set(String(row.tenantKey).trim().toLowerCase(), row);
    });
    return map;
  }, [pivotTenants]);

  const {
    data: failedResponse,
    loading: failedLoading,
    error: failedError,
    refetch: refetchFailed,
  } = useFetch('/admin/meridian/jobs/runs', {
    cache: NO_FETCH_CACHE,
    params: { status: 'failed', limit: 50 },
  });

  const {
    data: computeResponse,
    loading: computeLoading,
    error: computeError,
    refetch: refetchCompute,
  } = useFetch('/admin/meridian/jobs/compute-runs', {
    cache: NO_FETCH_CACHE,
    params: { limit: 20 },
  });

  const {
    data: definitionsResponse,
    loading: definitionsLoading,
    error: definitionsError,
    refetch: refetchDefinitions,
  } = useFetch('/admin/meridian/jobs/definitions', {
    cache: NO_FETCH_CACHE,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      refetchFailed({ silent: true });
      refetchCompute({ silent: true });
    }, FLEET_NOTIFICATIONS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refetchCompute, refetchFailed]);

  const failedRuns = failedResponse?.success
    ? (failedResponse.data?.runs || [])
    : [];
  const computeRuns = computeResponse?.success
    ? (computeResponse.data?.runs || [])
    : [];
  const definitions = definitionsResponse?.success
    ? (Array.isArray(definitionsResponse.data) ? definitionsResponse.data : [])
    : [];

  const [handlerKey, setHandlerKey] = useState(ENQUEUEABLE_HANDLERS[0].value);
  const [tenantKey, setTenantKey] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [enqueueing, setEnqueueing] = useState(false);
  const [editorState, setEditorState] = useState(null);

  const handleEnqueue = useCallback(async (event) => {
    event.preventDefault();
    if (!tenantKey || !handlerKey) return;
    setEnqueueing(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      '/admin/meridian/jobs/runs/enqueue',
      {
        method: 'POST',
        data: {
          handlerKey,
          tenantKey,
          payload: { dryRun: dryRun === true },
        },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setEnqueueing(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Enqueue failed',
        message: res?.message || reqError || 'Unable to enqueue notification job',
        type: 'error',
      });
      return;
    }

    const created = res.data?.created !== false;
    addNotification({
      title: created ? 'Job enqueued' : 'Already queued',
      message: `${handlerKey} · ${tenantKey}${dryRun ? ' · dry-run' : ''}`,
      type: created ? 'success' : 'info',
    });
    refetchFailed({ silent: true });
  }, [addNotification, dryRun, handlerKey, refetchFailed, tenantKey]);

  const refreshAll = useCallback(() => {
    refetchFailed();
    refetchCompute();
    refetchDefinitions();
  }, [refetchCompute, refetchDefinitions, refetchFailed]);

  const listError = failedError
    || computeError
    || definitionsError
    || (failedResponse && !failedResponse.success ? failedResponse.message : null)
    || (computeResponse && !computeResponse.success ? computeResponse.message : null)
    || (definitionsResponse && !definitionsResponse.success ? definitionsResponse.message : null);

  return (
    <PivotTenantPage
      title="Notifications"
      tenantKey=""
      cityDisplayName="All cities"
      className="pivot-fleet-notifications"
      actions={(
        <button
          type="button"
          className="linear-btn linear-btn--secondary"
          onClick={refreshAll}
          disabled={failedLoading || computeLoading || definitionsLoading}
        >
          {failedLoading || computeLoading || definitionsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
    >
      {listError ? (
        <p className="pivot-lab__error" role="alert">{listError}</p>
      ) : null}

      <PivotOpsSection
        title="Failed runs"
        description="Terminal failed notification jobs across cities. Open a run for attempts and per-user deliveries."
      >
        {failedLoading && !failedRuns.length ? (
          <p className="pivot-fleet-notifications__empty">Loading failed runs…</p>
        ) : failedRuns.length ? (
          <div className="pivot-fleet-notifications__table-wrap">
            <table className="pivot-fleet-notifications__table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Finished</th>
                  <th>Error</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {failedRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{tenantLabel(tenantsByKey.get(run.tenantKey), run.tenantKey)}</strong>
                    </td>
                    <td><code>{run.type || '—'}</code></td>
                    <td>
                      <PivotOpsStatus tone={runStatusTone(run.status)}>
                        {run.status || 'failed'}
                      </PivotOpsStatus>
                    </td>
                    <td>{formatDateTime(run.finishedAt || run.updatedAt)}</td>
                    <td>{run.lastError || '—'}</td>
                    <td>
                      <Link
                        className="linear-button linear-button--ghost"
                        to={notificationJobRunHref({
                          tenantKey: run.tenantKey,
                          runId: run.id,
                          batchWeek: run.payload?.batchWeek,
                        })}
                      >
                        Open run
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-fleet-notifications__empty">No failed notification runs.</p>
        )}
      </PivotOpsSection>

      <PivotOpsSection
        title="Compute jobs"
        description="Read-only view of Relay-scheduled compute work in the same run shape. Open inspect for apply/retry; this panel does not enqueue compute."
      >
        {computeLoading && !computeRuns.length ? (
          <p className="pivot-fleet-notifications__empty">Loading compute jobs…</p>
        ) : computeRuns.length ? (
          <div className="pivot-fleet-notifications__table-wrap">
            <table className="pivot-fleet-notifications__table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Finished</th>
                  <th>Error</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {computeRuns.map((run) => (
                  <tr key={run.id || run.externalJobId}>
                    <td>
                      <strong>{tenantLabel(tenantsByKey.get(run.tenantKey), run.tenantKey)}</strong>
                    </td>
                    <td><code>{run.type || '—'}</code></td>
                    <td>
                      <PivotOpsStatus tone={runStatusTone(run.status)}>
                        {run.computeStatus || run.status || '—'}
                      </PivotOpsStatus>
                    </td>
                    <td>{formatDateTime(run.finishedAt || run.updatedAt)}</td>
                    <td>{run.lastError || '—'}</td>
                    <td>
                      <Link
                        className="linear-button linear-button--ghost"
                        to={run.inspectorHref || computeJobInspectorHref({
                          tenantKey: run.tenantKey,
                          externalJobId: run.externalJobId,
                        })}
                      >
                        Open inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-fleet-notifications__empty">No compute jobs yet.</p>
        )}
      </PivotOpsSection>

      <PivotOpsSection
        title="Definitions"
        description="Fleet templates and tenant rows. Schedules evaluate every 30 minutes in each city’s drop timezone."
        actions={(
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={() => setEditorState({ definition: null })}
          >
            New definition
          </button>
        )}
      >
        {definitionsLoading && !definitions.length ? (
          <p className="pivot-fleet-notifications__empty">Loading definitions…</p>
        ) : definitions.length ? (
          <div className="pivot-fleet-notifications__table-wrap">
            <table className="pivot-fleet-notifications__table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Handler</th>
                  <th>Scope</th>
                  <th>Schedule</th>
                  <th>Enabled</th>
                  <th>Copy</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((row) => (
                  <tr key={row.id || `${row.definitionKey}:${row.tenantKey || 'fleet'}`}>
                    <td><code>{row.definitionKey}</code></td>
                    <td><code>{row.handlerKey}</code></td>
                    <td>{definitionScope(row.tenantKey)}</td>
                    <td><code>{row.scheduleCron || '—'}</code></td>
                    <td>
                      <PivotOpsStatus tone={row.enabled === false ? 'muted' : 'ok'}>
                        {row.enabled === false ? 'Off' : 'On'}
                      </PivotOpsStatus>
                    </td>
                    <td>
                      {[row.copyTitleKey, row.copyBodyKey].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linear-button linear-button--ghost"
                        aria-label={`Edit ${row.definitionKey}`}
                        onClick={() => setEditorState({ definition: row })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-fleet-notifications__empty">No notification definitions yet.</p>
        )}
      </PivotOpsSection>

      {editorState ? (
        <PivotNotificationDefinitionEditor
          definition={editorState.definition}
          tenants={pivotTenants}
          onCancel={() => setEditorState(null)}
          onSaved={() => {
            setEditorState(null);
            refetchDefinitions();
          }}
        />
      ) : null}

      <PivotOpsSection
        title="Enqueue"
        description="Manual run for a registered handler. Weekly drop still respects the drop window unless you force from the city panel."
      >
        <form className="pivot-fleet-notifications__enqueue" onSubmit={handleEnqueue}>
          <label className="linear-field">
            <span className="linear-field__label">Handler</span>
            <select
              aria-label="Notification handler"
              value={handlerKey}
              onChange={(event) => setHandlerKey(event.target.value)}
            >
              {ENQUEUEABLE_HANDLERS.map((handler) => (
                <option key={handler.value} value={handler.value}>
                  {handler.label}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field">
            <span className="linear-field__label">City</span>
            <select
              aria-label="Notification tenant"
              value={tenantKey}
              onChange={(event) => setTenantKey(event.target.value)}
            >
              <option value="">Select a city</option>
              {pivotTenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenantLabel(tenant, tenant.tenantKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
            />
            <span>Dry-run (no Expo send)</span>
          </label>
          <button
            type="submit"
            className="linear-btn"
            disabled={!tenantKey || enqueueing}
          >
            <Icon icon="mdi:playlist-plus" />
            {enqueueing ? 'Enqueueing…' : 'Enqueue'}
          </button>
        </form>
      </PivotOpsSection>
    </PivotTenantPage>
  );
}

export default PivotFleetNotificationsPage;
