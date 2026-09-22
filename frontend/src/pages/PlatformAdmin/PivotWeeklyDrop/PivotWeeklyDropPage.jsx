import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { toIsoWeek, isValidIsoWeek } from '../../../utils/pivotIsoWeek';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import PivotTenantPage from '../PivotTenantDashboard/PivotTenantPage';
import { PivotOpsSection, PivotOpsStack, PivotOpsStatus } from '../../../components/PivotOps';
import {
  mapMeridianDeliveriesToRecipients,
  mergeWeeklyDropHistory,
} from '../PivotNotifications/mergeWeeklyDropHistory';
import { notificationJobRunHref } from '../PivotNotifications/notificationJobRoutes';
import '../TenantManagement/TenantManagementPage.scss';
import './PivotWeeklyDropPage.scss';

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const EMPTY_OVERRIDE = {
  batchWeek: '',
  dayOfWeek: 4,
  hour: 18,
  minute: 0,
  pushTitle: '',
  pushBody: '',
};

const DEFAULT_PUSH_COPY = {
  title: 'just go*',
  body: 'What are you doing this week? Just go.',
};

function tenantToDropForm(tenant) {
  return {
    pivotDropTimezone: tenant?.pivotDropTimezone || 'America/New_York',
    pivotDropDayOfWeek:
      tenant?.pivotDropDayOfWeek !== undefined && tenant?.pivotDropDayOfWeek !== null
        ? String(tenant.pivotDropDayOfWeek)
        : '4',
    pivotDropHour:
      tenant?.pivotDropHour !== undefined && tenant?.pivotDropHour !== null
        ? String(tenant.pivotDropHour)
        : '18',
    pivotDropMinute:
      tenant?.pivotDropMinute !== undefined && tenant?.pivotDropMinute !== null
        ? String(tenant.pivotDropMinute)
        : '0',
    pivotDropPushTitle: tenant?.pivotDropPushTitle || '',
    pivotDropPushBody: tenant?.pivotDropPushBody || '',
    pivotDropOverrides: Array.isArray(tenant?.pivotDropOverrides)
      ? tenant.pivotDropOverrides.map((row) => ({
          batchWeek: row.batchWeek || '',
          dayOfWeek: String(row.dayOfWeek ?? 4),
          hour: String(row.hour ?? 18),
          minute: String(row.minute ?? 0),
          pushTitle: row.pushTitle || '',
          pushBody: row.pushBody || '',
        }))
      : [],
  };
}

function StatusChip({ ok, label, warnLabel }) {
  return (
    <span className={`pivot-weekly-drop__chip ${ok ? 'is-ok' : 'is-warn'}`}>
      {ok ? label : warnLabel}
    </span>
  );
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

function recipientProductLabel(product) {
  if (product === 'justgo') return 'Just Go';
  if (product === 'campus') return 'Meridian';
  return 'Legacy unknown';
}

function recipientProductTone(product) {
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

function WeeklyDropRunRecipients({ run }) {
  const recipients = Array.isArray(run?.recipients) ? run.recipients : [];
  const overflow = Number(run?.recipientOverflowCount) || 0;

  if (!recipients.length) {
    return (
      <p className="pivot-weekly-drop__empty pivot-weekly-drop__run-recipients-empty">
        Recipient names were not recorded for this send. New sends include a per-user list.
      </p>
    );
  }

  return (
    <>
      {overflow > 0 ? (
        <p className="pivot-weekly-drop__data-note">
          Showing {recipients.length} of {recipients.length + overflow} recipients.
        </p>
      ) : null}
      <div className="pivot-weekly-drop__table-wrap pivot-weekly-drop__table-wrap--compact">
        <table className="pivot-weekly-drop__table">
          <thead>
            <tr>
              <th>User</th>
              <th>App</th>
              <th>Expo</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((row) => (
              <tr key={row.userId}>
                <td>
                  <strong>{row.name || row.username || 'Unnamed user'}</strong>
                  {row.name && row.username ? <span>@{row.username}</span> : null}
                  {!row.name && row.username ? <span>@{row.username}</span> : null}
                </td>
                <td>
                  <PivotOpsStatus tone={recipientProductTone(row.product)}>
                    {recipientProductLabel(row.product)}
                  </PivotOpsStatus>
                </td>
                <td>
                  <PivotOpsStatus tone={deliveryStatusTone(row.deliveryStatus)}>
                    {deliveryStatusLabel(row.deliveryStatus)}
                  </PivotOpsStatus>
                  {row.error ? (
                    <span className="pivot-weekly-drop__run-recipient-error">{row.error}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PivotWeeklyDropPage({
  tenantKey: fixedTenantKey = '',
  tenant: fixedTenant = null,
  notificationsPanel = false,
}) {
  const { addNotification } = useNotification();
  const [batchWeek, setBatchWeek] = useState(() => toIsoWeek());
  const [selectedTenantKey, setSelectedTenantKey] = useState(fixedTenantKey);
  const [form, setForm] = useState(() => tenantToDropForm(null));
  const [pushCopy, setPushCopy] = useState(DEFAULT_PUSH_COPY);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [meridianRecipientsByRunId, setMeridianRecipientsByRunId] = useState({});

  const { data: tenantsResponse, loading: tenantsLoading } = useFetch(fixedTenantKey ? null : '/admin/platform/tenants', {
    cache: { enabled: true, ttlMs: 15000 },
  });

  const pivotTenants = useMemo(() => {
    if (fixedTenantKey) return fixedTenant ? [fixedTenant] : [];
    const rows = tenantsResponse?.success ? tenantsResponse.data?.tenants || [] : [];
    return rows.filter(isPivotTenant);
  }, [fixedTenant, fixedTenantKey, tenantsResponse]);

  useEffect(() => {
    if (fixedTenantKey) {
      setSelectedTenantKey(fixedTenantKey);
      return;
    }
    if (!selectedTenantKey && pivotTenants.length) {
      setSelectedTenantKey(pivotTenants[0].tenantKey);
    }
  }, [fixedTenantKey, pivotTenants, selectedTenantKey]);

  const statusUrl = selectedTenantKey
    ? `/admin/platform/tenants/${selectedTenantKey}/pivot-weekly-drop?batchWeek=${encodeURIComponent(batchWeek)}`
    : null;

  const {
    data: statusResponse,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useFetch(statusUrl, {
    cache: { enabled: false },
  });

  const status = statusResponse?.success ? statusResponse.data : null;
  const dropSchedule = status?.dropSchedule;
  const audience = status?.audience;
  const selectedTenant = useMemo(
    () => pivotTenants.find((row) => row.tenantKey === selectedTenantKey) || null,
    [pivotTenants, selectedTenantKey]
  );

  const jobsUrl = selectedTenantKey
    ? `/admin/platform/tenants/${selectedTenantKey}/meridian/jobs/runs?type=weekly_drop&limit=50`
    : null;
  const {
    data: jobsResponse,
    error: jobsError,
    refetch: refetchJobs,
  } = useFetch(jobsUrl, {
    cache: { enabled: false },
  });
  const recentRuns = useMemo(
    () =>
      mergeWeeklyDropHistory({
        meridianRuns: !jobsError && jobsResponse?.success
          ? jobsResponse.data?.runs || []
          : [],
        legacyRuns: status?.recentRuns || [],
      }),
    [jobsError, jobsResponse, status?.recentRuns],
  );

  const refetchPanel = useCallback(() => {
    refetchStatus();
    refetchJobs();
  }, [refetchJobs, refetchStatus]);

  useEffect(() => {
    if (selectedTenant) {
      setForm(tenantToDropForm(selectedTenant));
    }
  }, [selectedTenant?.tenantKey, selectedTenant?.pivotDropTimezone, selectedTenant?.pivotDropDayOfWeek]);

  useEffect(() => {
    if (dropSchedule?.pushCopy) {
      setPushCopy({
        title: dropSchedule.pushCopy.title || DEFAULT_PUSH_COPY.title,
        body: dropSchedule.pushCopy.body || DEFAULT_PUSH_COPY.body,
      });
    }
  }, [dropSchedule?.pushCopy?.title, dropSchedule?.pushCopy?.body, batchWeek, selectedTenantKey]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOverrideChange = (index, field, value) => {
    setForm((prev) => {
      const next = [...prev.pivotDropOverrides];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, pivotDropOverrides: next };
    });
  };

  const addOverride = () => {
    setForm((prev) => ({
      ...prev,
      pivotDropOverrides: [...prev.pivotDropOverrides, { ...EMPTY_OVERRIDE, batchWeek: batchWeek }],
    }));
  };

  const removeOverride = (index) => {
    setForm((prev) => ({
      ...prev,
      pivotDropOverrides: prev.pivotDropOverrides.filter((_, i) => i !== index),
    }));
  };

  const buildConfigPayload = () => ({
    batchWeek,
    pivotDropTimezone: form.pivotDropTimezone.trim(),
    pivotDropDayOfWeek: Number(form.pivotDropDayOfWeek),
    pivotDropHour: Number(form.pivotDropHour),
    pivotDropMinute: Number(form.pivotDropMinute),
    pivotDropPushTitle: form.pivotDropPushTitle.trim() || undefined,
    pivotDropPushBody: form.pivotDropPushBody.trim() || undefined,
    pivotDropOverrides: form.pivotDropOverrides
      .filter((row) => row.batchWeek.trim())
      .map((row) => ({
        batchWeek: row.batchWeek.trim().toUpperCase(),
        dayOfWeek: Number(row.dayOfWeek),
        hour: Number(row.hour),
        minute: Number(row.minute),
        ...(row.pushTitle?.trim() ? { pushTitle: row.pushTitle.trim() } : {}),
        ...(row.pushBody?.trim() ? { pushBody: row.pushBody.trim() } : {}),
      })),
  });

  const handleSaveConfig = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedTenantKey) return;
      if (!isValidIsoWeek(batchWeek)) {
        addNotification({
          title: 'Invalid batch week',
          message: 'Use YYYY-Www format.',
          type: 'error',
        });
        return;
      }

      setSaving(true);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform/tenants/${selectedTenantKey}/pivot-weekly-drop`,
        {
          method: 'PUT',
          data: buildConfigPayload(),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      setSaving(false);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Save failed',
          message: res?.message || reqError || 'Unable to save drop schedule',
          type: 'error',
        });
        return;
      }

      addNotification({
        title: 'Drop schedule saved',
        message: res.data?.dropSchedule?.nextDropFormatted || selectedTenantKey,
        type: 'success',
      });
      if (res.data?.tenant) {
        setForm(tenantToDropForm(res.data.tenant));
      }
      refetchPanel();
    },
    [addNotification, batchWeek, form, refetchPanel, selectedTenantKey]
  );

  const handleSend = useCallback(
    async ({ dryRun = false, force = false } = {}) => {
      if (!selectedTenantKey) return;
      if (!isValidIsoWeek(batchWeek)) {
        addNotification({
          title: 'Invalid batch week',
          message: 'Use YYYY-Www format.',
          type: 'error',
        });
        return;
      }

      if (!dryRun && !force) {
        const confirmed = window.confirm(
          `Send weekly drop push to ${status?.pivotPushRecipientCount ?? 0} pivot devices for ${selectedTenantKey}?\n\nTitle: ${pushCopy.title}\nBody: ${pushCopy.body}`
        );
        if (!confirmed) return;
      }

      setSending(true);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform/tenants/${selectedTenantKey}/pivot-weekly-drop/send`,
        {
          method: 'POST',
          data: {
            batchWeek,
            dryRun,
            force,
            pushTitle: pushCopy.title.trim(),
            pushBody: pushCopy.body.trim(),
          },
          headers: { 'Content-Type': 'application/json' },
        }
      );
      setSending(false);

      if (reqError || !res?.success) {
        addNotification({
          title: dryRun ? 'Preview failed' : 'Send failed',
          message: res?.message || reqError || 'Unable to send weekly drop push',
          type: 'error',
        });
        return;
      }

      const result = res.data;
      if (dryRun) {
        addNotification({
          title: 'Push preview',
          message: `${result.pivotPushRecipientCount} recipients · ${result.publishedEventCount} published events · “${result.pushCopy?.title || pushCopy.title}”`,
          type: 'success',
        });
      } else {
        addNotification({
          title: 'Push sent',
          message: `Accepted by Expo ${result.sent} · failed ${result.failed}`,
          type: 'success',
        });
      }
      refetchPanel();
    },
    [
      addNotification,
      batchWeek,
      pushCopy.body,
      pushCopy.title,
      refetchPanel,
      selectedTenantKey,
      status?.pivotPushRecipientCount,
    ]
  );

  const handleInspectRun = useCallback(
    async (run) => {
      const runKey = run.historyId || run._id;
      if (expandedRunId === runKey) {
        setExpandedRunId(null);
        return;
      }
      setExpandedRunId(runKey);

      if (run.source !== 'meridian' || !run.meridianJobRunId || !selectedTenantKey) return;
      if (meridianRecipientsByRunId[run.meridianJobRunId]) return;

      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform/tenants/${selectedTenantKey}/meridian/jobs/runs/${run.meridianJobRunId}`,
      );
      if (reqError || !res?.success) {
        setMeridianRecipientsByRunId((prev) => ({
          ...prev,
          [run.meridianJobRunId]: { error: res?.message || reqError || 'Unable to load recipients' },
        }));
        return;
      }
      const deliveries = res.data?.deliveries || [];
      const overflow = Number(res.data?.run?.summary?.recipientOverflowCount) || 0;
      setMeridianRecipientsByRunId((prev) => ({
        ...prev,
        [run.meridianJobRunId]: {
          recipients: mapMeridianDeliveriesToRecipients(deliveries),
          recipientOverflowCount: overflow,
        },
      }));
    },
    [expandedRunId, meridianRecipientsByRunId, selectedTenantKey],
  );

  const content = (
    <div className={`pivot-weekly-drop linear-admin${fixedTenantKey ? ' pivot-weekly-drop--tenant' : ''}`}>
      {!fixedTenantKey ? <header className="pivot-weekly-drop__header">
        <div>
          <p className="pivot-weekly-drop__eyebrow">
            Internal · Just Go pilot{fixedTenantKey ? ` · ${selectedTenant?.location || selectedTenant?.name || fixedTenantKey}` : ''}
          </p>
          <h1>{notificationsPanel ? 'Notifications' : 'Weekly drop'}</h1>
          <p className="pivot-weekly-drop__subtitle">
            {notificationsPanel
              ? "Configure this city's weekly drop, dry-run or send, and inspect job history. Older sends without a job run still appear from the legacy push log."
              : "Configure each city's drop schedule and send the manual deck push at the resolved local instant. Publish catalog events in Pivot Lab first."}
          </p>
        </div>
        <div className="pivot-weekly-drop__controls">
          {!fixedTenantKey ? (
            <label className="linear-field">
              <span className="linear-field__label">City</span>
              <select
                className="linear-input"
                value={selectedTenantKey}
                onChange={(e) => setSelectedTenantKey(e.target.value)}
                disabled={tenantsLoading || !pivotTenants.length}
              >
                {pivotTenants.map((tenant) => (
                  <option key={tenant.tenantKey} value={tenant.tenantKey}>
                    {tenant.name} ({tenant.tenantKey})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="linear-field">
            <span className="linear-field__label">Batch week</span>
            <input
              className="linear-input"
              value={batchWeek}
              onChange={(e) => setBatchWeek(e.target.value.toUpperCase())}
              placeholder="2026-W26"
            />
          </label>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => refetchPanel()}
            disabled={statusLoading || !selectedTenantKey}
          >
            {statusLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header> : null}

      {!pivotTenants.length && !tenantsLoading ? (
        <p className="pivot-weekly-drop__empty">No pivot city tenants configured yet.</p>
      ) : null}

      {statusError ? <p className="pivot-weekly-drop__error">{statusError}</p> : null}

      {dropSchedule ? (
        <section className="linear-section pivot-weekly-drop__status" aria-label="Drop status">
          <h2 className="linear-section__title">Next drop</h2>
          <div className="pivot-weekly-drop__status-grid">
            <div className="linear-stat">
              <span className="linear-stat__label">Resolved instant</span>
              <span className="linear-stat__value">{dropSchedule.nextDropFormatted}</span>
              <span className="pivot-weekly-drop__meta">
                {dropSchedule.localSchedule} · {dropSchedule.source === 'override' ? 'override' : 'default'}
              </span>
            </div>
            <div className="linear-stat">
              <span className="linear-stat__label">Published events</span>
              <span className="linear-stat__value">{status.publishedEventCount ?? 0}</span>
            </div>
            <div className="linear-stat">
              <span className="linear-stat__label">Pivot push devices</span>
              <span className="linear-stat__value">{status.pivotPushRecipientCount ?? 0}</span>
            </div>
            <div className="linear-stat">
              <span className="linear-stat__label">Timing</span>
              <span className="linear-stat__value">
                {dropSchedule.withinDropWindow
                  ? 'Within 30 min window'
                  : `${dropSchedule.minutesFromDropAt} min from drop`}
              </span>
            </div>
          </div>

          <div className="pivot-weekly-drop__checks">
            <StatusChip
              ok={(status.publishedEventCount ?? 0) > 0}
              label="Catalog published"
              warnLabel="No published events"
            />
            <StatusChip
              ok={(status.pivotPushRecipientCount ?? 0) > 0}
              label="Push tokens ready"
              warnLabel="No pivot push tokens"
            />
            <StatusChip
              ok={!dropSchedule.usingPilotDefaults}
              label="Schedule configured"
              warnLabel="Using pilot defaults"
            />
            <StatusChip
              ok={dropSchedule.withinDropWindow}
              label="In drop window"
              warnLabel="Outside drop window"
            />
          </div>

          <div className="pivot-weekly-drop__copy">
            <div className="pivot-weekly-drop__copy-head">
              <p className="pivot-weekly-drop__copy-label">Push notification</p>
              {dropSchedule.pushCopy?.source ? (
                <span className="pivot-weekly-drop__copy-source">
                  {dropSchedule.pushCopy.source === 'override'
                    ? 'Per-week override'
                    : dropSchedule.pushCopy.source === 'tenant'
                      ? 'City default'
                      : 'Just Go default'}
                </span>
              ) : null}
            </div>
            <p className="pivot-weekly-drop__copy-hint">
              Edit copy for this send. Save schedule below to persist city defaults or per-week
              overrides.
            </p>
            <label className="linear-field">
              <span className="linear-field__label">Title</span>
              <input
                className="linear-input"
                value={pushCopy.title}
                onChange={(e) => setPushCopy((prev) => ({ ...prev, title: e.target.value }))}
                maxLength={100}
                placeholder={DEFAULT_PUSH_COPY.title}
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Body</span>
              <textarea
                className="linear-input pivot-weekly-drop__copy-textarea"
                value={pushCopy.body}
                onChange={(e) => setPushCopy((prev) => ({ ...prev, body: e.target.value }))}
                maxLength={240}
                rows={3}
                placeholder={DEFAULT_PUSH_COPY.body}
              />
            </label>
            <code className="linear-code">Opens PivotWeek · meridian://pivot/week</code>
          </div>

          <div className="pivot-weekly-drop__actions">
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              disabled={sending || !selectedTenantKey}
              onClick={() => handleSend({ dryRun: true })}
            >
              <Icon icon="mdi:eye-outline" />
              Preview push
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              disabled={sending || !selectedTenantKey}
              onClick={() => handleSend({ force: true })}
            >
              <Icon icon="mdi:send-clock-outline" />
              Send now (force)
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              disabled={sending || !selectedTenantKey}
              onClick={() => handleSend({ force: false })}
            >
              <Icon icon="mdi:bell-ring-outline" />
              {sending ? 'Sending…' : 'Send at drop window'}
            </button>
          </div>
        </section>
      ) : null}

      {audience ? (
        <div className="pivot-weekly-drop__insights-grid">
          <PivotOpsSection
            title="Send audience"
            description="Live eligibility from this tenant's user records. Raw push tokens are never shown."
            className="pivot-weekly-drop__audience"
          >
            <div className="pivot-weekly-drop__metric-grid">
              <div className="pivot-weekly-drop__metric pivot-weekly-drop__metric--accent">
                <span>Eligible now</span>
                <strong>{audience.eligible ?? 0}</strong>
              </div>
              <div className="pivot-weekly-drop__metric">
                <span>All users</span>
                <strong>{audience.totalUsers ?? 0}</strong>
              </div>
              <div className="pivot-weekly-drop__metric">
                <span>No token</span>
                <strong>{audience.noToken ?? 0}</strong>
              </div>
              <div className="pivot-weekly-drop__metric">
                <span>Other edition</span>
                <strong>{audience.otherEdition ?? 0}</strong>
              </div>
            </div>
            <PivotOpsStack
              title="Eligible devices by app project"
              ariaLabel="Eligible push devices by app product"
              segments={[
                { key: 'justgo', label: 'Just Go standalone', value: audience.products?.justgo || 0, tone: 'accent' },
                { key: 'campus', label: 'Meridian pivot', value: audience.products?.campus || 0, tone: 'ink' },
                { key: 'legacy', label: 'Legacy unknown', value: audience.products?.legacy || 0, tone: 'warn' },
              ]}
            />
            <p className="pivot-weekly-drop__data-note">
              Legacy tokens are sent individually until their app next registers and identifies its Expo project.
            </p>
          </PivotOpsSection>

          <PivotOpsSection
            title="Recent sends"
            description="Meridian job runs for this city, with older PivotDropPushRun history when a send was never dual-written. Expo acceptance is not the same as device delivery."
            className="pivot-weekly-drop__runs"
          >
            {recentRuns.length ? (
              <div className="pivot-weekly-drop__run-list">
                {recentRuns.map((run) => {
                  const runKey = run.historyId || run._id || `${run.batchWeek}-${run.createdAt}`;
                  const expanded = expandedRunId === runKey;
                  const meridianLoaded = run.meridianJobRunId
                    ? meridianRecipientsByRunId[run.meridianJobRunId]
                    : null;
                  const inspectRun = run.source === 'meridian'
                    ? {
                        ...run,
                        recipients: meridianLoaded?.recipients || [],
                        recipientOverflowCount:
                          meridianLoaded?.recipientOverflowCount ?? run.recipientOverflowCount ?? 0,
                      }
                    : run;
                  const recipientCount = Array.isArray(inspectRun.recipients) && inspectRun.recipients.length
                    ? inspectRun.recipients.length + (Number(inspectRun.recipientOverflowCount) || 0)
                    : (run.attempted ?? 0);
                  return (
                    <article
                      className={`pivot-weekly-drop__run${expanded ? ' is-expanded' : ''}`}
                      key={runKey}
                    >
                      <div className="pivot-weekly-drop__run-summary">
                        <div className="pivot-weekly-drop__run-detail">
                          <strong>{run.batchWeek || 'Job run'} · {run.title || 'Weekly drop'}</strong>
                          <span>{formatDateTime(run.createdAt)} · {run.attempted ?? 0} attempted</span>
                          <span>
                            {run.source === 'meridian' ? (
                              <>
                                Job run · {run.status || 'unknown'}
                                {run.skipped ? ` · ${run.skipped} skipped` : ''}
                              </>
                            ) : (
                              <>
                                Legacy send · Just Go {run.audience?.justgo || 0} · Meridian {run.audience?.campus || 0}
                                {run.audience?.legacy ? ` · Legacy ${run.audience.legacy}` : ''}
                              </>
                            )}
                          </span>
                          {run.errors?.length ? (
                            <span className="pivot-weekly-drop__run-error">{run.errors[0]}</span>
                          ) : null}
                        </div>
                        <div className="pivot-weekly-drop__run-actions">
                          <div className="pivot-weekly-drop__run-counts">
                            <PivotOpsStatus tone={run.failed ? 'warn' : 'ok'}>
                              {run.accepted ?? 0} accepted
                            </PivotOpsStatus>
                            {run.failed ? (
                              <PivotOpsStatus tone="danger">{run.failed} failed</PivotOpsStatus>
                            ) : null}
                          </div>
                          {run.source === 'meridian' && notificationsPanel ? (
                            <Link
                              className="linear-button linear-button--ghost pivot-weekly-drop__run-inspect"
                              to={notificationJobRunHref({
                                tenantKey: selectedTenantKey,
                                runId: run.meridianJobRunId,
                                batchWeek: run.batchWeek,
                              })}
                            >
                              Open run
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className="linear-button linear-button--ghost pivot-weekly-drop__run-inspect"
                              onClick={() => handleInspectRun(run)}
                              aria-expanded={expanded}
                            >
                              {expanded ? 'Hide recipients' : `Inspect ${recipientCount} users`}
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded ? (
                        <div className="pivot-weekly-drop__run-recipients">
                          {meridianLoaded?.error ? (
                            <p className="pivot-weekly-drop__error">{meridianLoaded.error}</p>
                          ) : (
                            <WeeklyDropRunRecipients run={inspectRun} />
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="pivot-weekly-drop__empty">No sends have been recorded for this city yet.</p>
            )}
          </PivotOpsSection>
        </div>
      ) : null}

      {audience ? (
        <PivotOpsSection
          title="Eligible user batch"
          description={`${audience.users.length} users currently selected by the weekly-drop query.`}
          className="pivot-weekly-drop__batch"
        >
          {audience.users.length ? (
            <div className="pivot-weekly-drop__table-wrap">
              <table className="pivot-weekly-drop__table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>App project</th>
                    <th>Token refreshed</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.users.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name || row.username || 'Unnamed user'}</strong>
                        {row.name && row.username ? <span>@{row.username}</span> : null}
                      </td>
                      <td>
                        <PivotOpsStatus tone={row.product === 'justgo' ? 'info' : row.product === 'campus' ? 'muted' : 'warn'}>
                          {row.product === 'justgo' ? 'Just Go' : row.product === 'campus' ? 'Meridian' : 'Legacy unknown'}
                        </PivotOpsStatus>
                      </td>
                      <td>{formatDateTime(row.tokenRegisteredAt)}</td>
                      <td>{formatDateTime(row.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="pivot-weekly-drop__empty">No users are currently eligible for this send.</p>
          )}
        </PivotOpsSection>
      ) : null}

      <section className="linear-section pivot-weekly-drop__config" aria-label="Drop schedule config">
        <h2 className="linear-section__title">Weekly drop schedule</h2>
        <p className="pivot-weekly-drop__hint">
          Default pilot suggestion is Thursday 18:00 local — configurable per city and per week via
          overrides below.
        </p>

        <form className="linear-form" onSubmit={handleSaveConfig}>
          <div className="linear-form__grid">
            <label className="linear-field">
              <span className="linear-field__label">Timezone (IANA)</span>
              <input
                className="linear-input"
                value={form.pivotDropTimezone}
                onChange={(e) => handleFormChange('pivotDropTimezone', e.target.value)}
                placeholder="America/New_York"
                required
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Day of week</span>
              <select
                className="linear-input"
                value={form.pivotDropDayOfWeek}
                onChange={(e) => handleFormChange('pivotDropDayOfWeek', e.target.value)}
              >
                {DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Hour (local)</span>
              <input
                className="linear-input"
                type="number"
                min={0}
                max={23}
                value={form.pivotDropHour}
                onChange={(e) => handleFormChange('pivotDropHour', e.target.value)}
                required
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Minute</span>
              <input
                className="linear-input"
                type="number"
                min={0}
                max={59}
                value={form.pivotDropMinute}
                onChange={(e) => handleFormChange('pivotDropMinute', e.target.value)}
                required
              />
            </label>
          </div>

          <div className="pivot-weekly-drop__push-defaults">
            <h3 className="pivot-weekly-drop__overrides-title">Default push copy</h3>
            <p className="pivot-weekly-drop__hint">
              Used for every week unless a per-week override or send-time edit replaces it. Leave
              blank to use the Just Go default.
            </p>
            <div className="linear-form__grid">
              <label className="linear-field">
                <span className="linear-field__label">Default title</span>
                <input
                  className="linear-input"
                  value={form.pivotDropPushTitle}
                  onChange={(e) => handleFormChange('pivotDropPushTitle', e.target.value)}
                  maxLength={100}
                  placeholder={DEFAULT_PUSH_COPY.title}
                />
              </label>
              <label className="linear-field pivot-weekly-drop__push-body-field">
                <span className="linear-field__label">Default body</span>
                <textarea
                  className="linear-input pivot-weekly-drop__copy-textarea"
                  value={form.pivotDropPushBody}
                  onChange={(e) => handleFormChange('pivotDropPushBody', e.target.value)}
                  maxLength={240}
                  rows={2}
                  placeholder={DEFAULT_PUSH_COPY.body}
                />
              </label>
            </div>
          </div>

          <div className="pivot-weekly-drop__overrides">
            <div className="pivot-weekly-drop__overrides-head">
              <h3 className="pivot-weekly-drop__overrides-title">Per-week overrides</h3>
              <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={addOverride}>
                <Icon icon="mdi:plus" />
                Add override
              </button>
            </div>
            {form.pivotDropOverrides.length === 0 ? (
              <p className="pivot-weekly-drop__empty">No overrides — default schedule applies to every week.</p>
            ) : (
              <div className="pivot-weekly-drop__override-list">
                {form.pivotDropOverrides.map((row, index) => (
                  <div key={`override-${index}`} className="pivot-weekly-drop__override-row">
                    <label className="linear-field">
                      <span className="linear-field__label">Batch week</span>
                      <input
                        className="linear-input"
                        value={row.batchWeek}
                        onChange={(e) => handleOverrideChange(index, 'batchWeek', e.target.value.toUpperCase())}
                        placeholder="2026-W26"
                      />
                    </label>
                    <label className="linear-field">
                      <span className="linear-field__label">Day</span>
                      <select
                        className="linear-input"
                        value={row.dayOfWeek}
                        onChange={(e) => handleOverrideChange(index, 'dayOfWeek', e.target.value)}
                      >
                        {DAY_OPTIONS.map((option) => (
                          <option key={option.value} value={String(option.value)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="linear-field">
                      <span className="linear-field__label">Hour</span>
                      <input
                        className="linear-input"
                        type="number"
                        min={0}
                        max={23}
                        value={row.hour}
                        onChange={(e) => handleOverrideChange(index, 'hour', e.target.value)}
                      />
                    </label>
                    <label className="linear-field">
                      <span className="linear-field__label">Min</span>
                      <input
                        className="linear-input"
                        type="number"
                        min={0}
                        max={59}
                        value={row.minute}
                        onChange={(e) => handleOverrideChange(index, 'minute', e.target.value)}
                      />
                    </label>
                    <label className="linear-field pivot-weekly-drop__override-push">
                      <span className="linear-field__label">Push title</span>
                      <input
                        className="linear-input"
                        value={row.pushTitle}
                        onChange={(e) => handleOverrideChange(index, 'pushTitle', e.target.value)}
                        maxLength={100}
                        placeholder="Optional"
                      />
                    </label>
                    <label className="linear-field pivot-weekly-drop__override-push pivot-weekly-drop__override-push-body">
                      <span className="linear-field__label">Push body</span>
                      <input
                        className="linear-input"
                        value={row.pushBody}
                        onChange={(e) => handleOverrideChange(index, 'pushBody', e.target.value)}
                        maxLength={240}
                        placeholder="Optional"
                      />
                    </label>
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--icon pivot-weekly-drop__remove"
                      aria-label="Remove override"
                      onClick={() => removeOverride(index)}
                    >
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="linear-form__actions">
            <button type="submit" className="linear-btn linear-btn--primary" disabled={saving || !selectedTenantKey}>
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  if (fixedTenantKey) {
    return (
      <PivotTenantPage
        title={notificationsPanel ? 'Notifications' : 'Weekly drop'}
        tenantKey={fixedTenantKey}
        cityDisplayName={selectedTenant?.location || selectedTenant?.name || fixedTenantKey}
        subtitle={
          notificationsPanel
            ? "Review the live audience, send or dry-run the weekly drop, and inspect this city's notification job history."
            : "Review the live audience, notification history, schedule, and release this city's weekly deck."
        }
        actions={(
          <div className="pivot-weekly-drop__tenant-actions">
            <label className="linear-field">
              <span className="linear-field__label">Batch week</span>
              <input
                className="linear-input"
                value={batchWeek}
                onChange={(e) => setBatchWeek(e.target.value.toUpperCase())}
                placeholder="2026-W26"
              />
            </label>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={() => refetchPanel()}
              disabled={statusLoading}
            >
              {statusLoading ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>
        )}
        className="pivot-weekly-drop-page"
      >
        {content}
      </PivotTenantPage>
    );
  }

  return content;
}

export default PivotWeeklyDropPage;
