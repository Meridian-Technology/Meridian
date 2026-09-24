import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { formatBatchWeekRange, toIsoWeek } from '../../../utils/pivotIsoWeek';
import Popup from '../../../components/Popup/Popup';
import {
  PivotOpsAnimateNumber,
  PivotOpsBarList,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import AdminPlatformMetricChart from '../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart';
import PivotTenantPage from '../PivotTenantDashboard/PivotTenantPage';
import PivotBatchWeekPicker from '../PivotTenantDashboard/PivotBatchWeekPicker';
import usePivotBatchWeekState from '../PivotTenantDashboard/usePivotBatchWeekState';
import PivotNotificationDefinitionEditor from './PivotNotificationDefinitionEditor';
import PivotNotificationScheduleAudit from './PivotNotificationScheduleAudit';
import PivotWeeklyDropPage from '../PivotWeeklyDrop/PivotWeeklyDropPage';
import { summarizeNotificationActivity } from './notificationActivity';
import {
  describeWhoRules,
  lastRunForSchedule,
  scheduleCadence,
  scheduleName,
  schedulePurpose,
  sortSchedules,
} from './notificationScheduleCopy';
import '../TenantManagement/TenantManagementPage.scss';
import './PivotFleetNotificationsPage.scss';

const NO_FETCH_CACHE = { enabled: false };
export const FLEET_NOTIFICATIONS_POLL_MS = 45000;

const SENT_CHART_COLOR = '#ff4f1f';

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
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
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

function definitionKeyOf(definition) {
  return definition?.id || `${definition?.definitionKey}:${definition?.tenantKey || 'fleet'}`;
}

function PivotFleetNotificationsPage({
  tenants = [],
  tenantKey = '',
  embedded = false,
}) {
  const scopedTenant = String(tenantKey || '').trim().toLowerCase();
  const { addNotification } = useNotification();
  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    weekSettled,
  } = usePivotBatchWeekState(toIsoWeek());
  const [stateSavingId, setStateSavingId] = useState('');
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [enabledById, setEnabledById] = useState({});
  const scheduleListRef = useRef(null);
  const scheduleTopsRef = useRef(new Map());
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
    data: recentResponse,
    loading: recentLoading,
    error: recentError,
    refetch: refetchRecent,
  } = useFetch('/admin/meridian/jobs/runs', {
    cache: NO_FETCH_CACHE,
    params: {
      limit: 50,
      ...(scopedTenant ? { tenantKey: scopedTenant } : {}),
    },
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
      refetchRecent({ silent: true });
    }, FLEET_NOTIFICATIONS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refetchRecent]);

  const recentRuns = useMemo(
    () => (recentResponse?.success ? (recentResponse.data?.runs || []) : []),
    [recentResponse],
  );
  const definitions = useMemo(() => {
    const rows = definitionsResponse?.success
      ? (Array.isArray(definitionsResponse.data) ? definitionsResponse.data : [])
      : [];
    if (!scopedTenant) return rows;
    return rows.filter((row) => {
      const key = String(row.tenantKey || '').trim().toLowerCase();
      return !key || key === scopedTenant;
    });
  }, [definitionsResponse, scopedTenant]);
  const schedules = useMemo(() => {
    const withState = definitions.map((row) => (
      Object.prototype.hasOwnProperty.call(enabledById, row.id)
        ? { ...row, enabled: enabledById[row.id] }
        : row
    ));
    return sortSchedules(withState, recentRuns);
  }, [definitions, enabledById, recentRuns]);
  const activity = useMemo(
    () => summarizeNotificationActivity(recentRuns),
    [recentRuns],
  );
  const sentSeries = useMemo(() => ([
    {
      label: 'Sent',
      color: SENT_CHART_COLOR,
      data: activity.heat.map((cell) => ({
        x: cell.key,
        y: cell.value,
      })),
    },
  ]), [activity.heat]);

  const [editorState, setEditorState] = useState(null);
  const [auditDefinition, setAuditDefinition] = useState(null);
  const scopedCity = scopedTenant ? tenantsByKey.get(scopedTenant) : null;
  const dropTimeZone = scopedCity?.pivotDropTimezone || 'UTC';
  const dropDayOfWeek = Number.isInteger(Number(scopedCity?.pivotDropDayOfWeek))
    ? Number(scopedCity.pivotDropDayOfWeek)
    : 4;

  useEffect(() => {
    setEnabledById((current) => {
      const ids = Object.keys(current);
      if (!ids.length) return current;
      const next = { ...current };
      let changed = false;
      definitions.forEach((row) => {
        if (!Object.prototype.hasOwnProperty.call(next, row.id)) return;
        if ((row.enabled !== false) === next[row.id]) {
          delete next[row.id];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [definitions]);

  useLayoutEffect(() => {
    const list = scheduleListRef.current;
    if (!list) return undefined;
    const rows = list.querySelectorAll('tr[data-schedule-key]');
    const nextTops = new Map();
    rows.forEach((row) => {
      const key = row.dataset.scheduleKey;
      const top = row.offsetTop;
      nextTops.set(key, top);
      const previous = scheduleTopsRef.current.get(key);
      if (previous == null || previous === top || typeof row.animate !== 'function') return;
      const delta = previous - top;
      row.animate(
        [
          { transform: `translateY(${delta}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    });
    scheduleTopsRef.current = nextTops;
    return undefined;
  }, [schedules]);

  const setScheduleEnabled = useCallback(async (definition, enabled) => {
    if (!definition?.id || stateSavingId) return;
    if ((definition.enabled !== false) === enabled) return;
    const name = scheduleName(definition);
    const confirmed = window.confirm(enabled ? `Turn on ${name}?` : `Pause ${name}?`);
    if (!confirmed) return;
    setEnabledById((current) => ({ ...current, [definition.id]: enabled }));
    setStateSavingId(definition.id);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/meridian/jobs/definitions/${encodeURIComponent(definition.id)}`,
      {
        method: 'PATCH',
        data: { enabled },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setStateSavingId('');
    if (reqError || !res?.success) {
      setEnabledById((current) => {
        const next = { ...current };
        delete next[definition.id];
        return next;
      });
      addNotification({
        title: 'Could not update schedule',
        message: res?.message || reqError || 'Unable to change schedule state',
        type: 'error',
      });
      return;
    }
    refetchDefinitions({ silent: true });
  }, [addNotification, refetchDefinitions, stateSavingId]);

  const restoreDefaultSchedules = useCallback(async () => {
    if (restoringDefaults) return;
    const confirmed = window.confirm(
      'Restore all default schedules? Each built-in schedule goes back to its shipped clock, message, conditions, and on/off state.',
    );
    if (!confirmed) return;
    setRestoringDefaults(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      '/admin/meridian/jobs/definitions/restore-defaults',
      { method: 'POST' },
    );
    setRestoringDefaults(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not restore schedules',
        message: res?.message || reqError || 'Unable to restore default schedules',
        type: 'error',
      });
      return;
    }
    setEnabledById({});
    addNotification({
      title: 'Default schedules restored',
      message: 'Built-in schedules are back to their shipped settings.',
      type: 'success',
    });
    refetchDefinitions({ silent: true });
  }, [addNotification, refetchDefinitions, restoringDefaults]);

  const refreshAll = useCallback(() => {
    refetchRecent();
    refetchDefinitions();
  }, [refetchDefinitions, refetchRecent]);

  const listError = recentError
    || definitionsError
    || (recentResponse && !recentResponse.success ? recentResponse.message : null)
    || (definitionsResponse && !definitionsResponse.success ? definitionsResponse.message : null);
  const loading = recentLoading || definitionsLoading;

  const board = (
    <>
      {listError ? (
        <p className="pivot-lab__error" role="alert">{listError}</p>
      ) : null}

      <aside className="pivot-fleet-notifications__weekbar" aria-label="Batch week">
        <div className="pivot-fleet-notifications__weekbar-main">
          <p className="pivot-fleet-notifications__week">{batchWeekValid ? batchWeek : '—'}</p>
          <p className="pivot-fleet-notifications__week-range">
            {batchWeekValid
              ? formatBatchWeekRange(batchWeek, { dropDayOfWeek, timeZone: dropTimeZone })
              : 'Batch week must look like 2026-W01'}
          </p>
        </div>
        <PivotBatchWeekPicker
          batchWeek={batchWeek}
          onChange={setBatchWeek}
          timeZone={dropTimeZone}
          dropDayOfWeek={dropDayOfWeek}
          pending={!weekSettled}
          showLabel={false}
        />
      </aside>

      <div className="pivot-fleet-notifications__overview">
      <PivotOpsSection
        title="Activity"
        description="Accepted pushes in the latest runs. A check that found nobody to notify stays at zero. Dry runs are counted apart from sends."
      >
        <div className="pivot-fleet-notifications__activity">
          <PivotOpsMetricGrid>
            <PivotOpsMetric
              label="Sent"
              value={<PivotOpsAnimateNumber value={activity.totals.sent} />}
            />
            <PivotOpsMetric
              label="Failed"
              value={<PivotOpsAnimateNumber value={activity.totals.failed} />}
            />
            <PivotOpsMetric
              label="Dry runs"
              value={<PivotOpsAnimateNumber value={activity.totals.dryRuns} />}
            />
          </PivotOpsMetricGrid>
          <div className="pivot-fleet-notifications__chart">
            <AdminPlatformMetricChart
              title=""
              series={sentSeries}
              granularity="day"
              height={160}
              emptyMessage="No sends in this range"
              margin={{ top: 8, right: 0, bottom: 22, left: 0 }}
              edgeToEdge
              hideYAxis
            />
          </div>
          {activity.bars.length ? (
            <>
              <p className="pivot-fleet-notifications__bars-label">Sent by schedule</p>
              <PivotOpsBarList
                ariaLabel="Notifications sent by schedule"
                items={activity.bars}
                valueFormat={(value) => `${value} sent`}
              />
            </>
          ) : null}
        </div>
      </PivotOpsSection>
      <PivotWeeklyDropPage
        embedded
        audiencePanel
        tenantKey={scopedTenant}
        tenant={scopedTenant ? tenantsByKey.get(scopedTenant) || null : null}
        batchWeek={committedWeek}
      />
      </div>

      <PivotOpsSection
        title="Schedules"
        description="Each schedule sends one message. Open it to see the wording and who it reaches. Repeating checks run from 8:00 AM to 9:30 PM. Nothing sends from 10:00 PM to 8:00 AM in that city’s timezone."
        actions={(
          <>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              disabled={restoringDefaults}
              onClick={restoreDefaultSchedules}
            >
              {restoringDefaults ? 'Restoring…' : 'Restore default schedules'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={() => setEditorState({ definition: null })}
            >
              New schedule
            </button>
          </>
        )}
      >
        {definitionsLoading && !schedules.length ? (
          <p className="pivot-lab__empty">Loading schedules…</p>
        ) : schedules.length ? (
          <div className="pivot-fleet-notifications__table-wrap">
            <table className="pivot-fleet-notifications__table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>When</th>
                  <th>Last check</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody ref={scheduleListRef}>
                {schedules.map((definition) => {
                  const key = definitionKeyOf(definition);
                  const name = scheduleName(definition);
                  const last = lastRunForSchedule(definition, recentRuns);
                  const lastCity = last
                    ? tenantLabel(tenantsByKey.get(last.tenantKey), last.tenantKey)
                    : '';
                  const lastWhen = formatDateTime(last?.finishedAt || last?.updatedAt || last?.createdAt);
                  const showKey = definition.definitionKey
                    && definition.definitionKey !== definition.handlerKey;
                  const purpose = schedulePurpose(definition);
                  const who = describeWhoRules(definition.rules);

                  return (
                    <tr
                      key={key}
                      data-schedule-key={key}
                      className="pivot-fleet-notifications__schedule"
                      onClick={() => setEditorState({ definition, condensed: true })}
                    >
                      <td>
                        <button
                          type="button"
                          className="pivot-fleet-notifications__open"
                          onClick={() => setEditorState({ definition, condensed: true })}
                        >
                          <strong>{name}</strong>
                          {definition.tenantKey ? (
                            <span>{tenantLabel(tenantsByKey.get(definition.tenantKey), definition.tenantKey)}</span>
                          ) : null}
                          {showKey ? <span>{definition.definitionKey}</span> : null}
                        </button>
                        <p className="pivot-fleet-notifications__purpose">{purpose}</p>
                        {who ? <p className="pivot-fleet-notifications__purpose">{who}</p> : null}
                      </td>
                      <td>{scheduleCadence(definition)}</td>
                      <td>
                        {last ? (
                          <div className="pivot-fleet-notifications__last">
                            <PivotOpsStatus tone={runStatusTone(last.status)}>
                              {RUN_STATUS_LABELS[last.status] || last.status}
                            </PivotOpsStatus>
                            <span>{[lastCity, lastWhen].filter(Boolean).join(' · ')}</span>
                          </div>
                        ) : (
                          <span>No checks yet</span>
                        )}
                      </td>
                      <td>
                        <div
                          className="pivot-fleet-notifications__state"
                          role="group"
                          aria-label={`State for ${name}`}
                          title={definition.tenantKey ? undefined : 'Applies to every city'}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-pressed={definition.enabled !== false}
                            disabled={stateSavingId === definition.id}
                            onClick={() => setScheduleEnabled(definition, true)}
                          >
                            On
                          </button>
                          <button
                            type="button"
                            aria-pressed={definition.enabled === false}
                            disabled={stateSavingId === definition.id}
                            onClick={() => setScheduleEnabled(definition, false)}
                          >
                            Paused
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No schedules yet.</p>
        )}
      </PivotOpsSection>

      <Popup
        isOpen={Boolean(editorState)}
        onClose={() => setEditorState(null)}
        defaultStyling={false}
        hideCloseButton
      >
        {editorState ? (
          <PivotNotificationDefinitionEditor
            definition={editorState.definition}
            tenants={pivotTenants}
            startCondensed={Boolean(editorState.condensed)}
            onOpenChecks={editorState.definition ? () => {
              setAuditDefinition(editorState.definition);
              setEditorState(null);
            } : null}
            onCancel={() => setEditorState(null)}
            onSaved={() => {
              setEditorState(null);
              refetchDefinitions();
            }}
          />
        ) : null}
      </Popup>

      <Popup
        isOpen={Boolean(auditDefinition)}
        onClose={() => setAuditDefinition(null)}
        defaultStyling={false}
        hideCloseButton
      >
        {auditDefinition ? (
          <PivotNotificationScheduleAudit
            definition={auditDefinition}
            tenants={pivotTenants}
            tenantKey={scopedTenant}
            onClose={() => setAuditDefinition(null)}
            onEdit={() => {
              setEditorState({ definition: auditDefinition });
              setAuditDefinition(null);
            }}
            onQueued={() => refetchRecent({ silent: true })}
          />
        ) : null}
      </Popup>
    </>
  );

  if (embedded) return board;

  return (
    <PivotTenantPage
      title="Notifications"
      subtitle="What went out, who is eligible for the next drop, and the history of each schedule."
      tenantKey={scopedTenant}
      cityDisplayName={scopedTenant ? (tenantsByKey.get(scopedTenant)?.location || scopedTenant) : 'All cities'}
      className="pivot-fleet-notifications"
      actions={(
        <button
          type="button"
          className="linear-btn linear-btn--secondary"
          onClick={refreshAll}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
    >
      {board}
    </PivotTenantPage>
  );
}

export default PivotFleetNotificationsPage;
