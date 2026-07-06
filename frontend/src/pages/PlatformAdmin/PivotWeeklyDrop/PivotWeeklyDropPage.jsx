import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { toIsoWeek, isValidIsoWeek } from '../../../utils/pivotIsoWeek';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
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
    pivotDropOverrides: Array.isArray(tenant?.pivotDropOverrides)
      ? tenant.pivotDropOverrides.map((row) => ({
          batchWeek: row.batchWeek || '',
          dayOfWeek: String(row.dayOfWeek ?? 4),
          hour: String(row.hour ?? 18),
          minute: String(row.minute ?? 0),
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

function PivotWeeklyDropPage() {
  const { addNotification } = useNotification();
  const [batchWeek, setBatchWeek] = useState(() => toIsoWeek());
  const [selectedTenantKey, setSelectedTenantKey] = useState('');
  const [form, setForm] = useState(() => tenantToDropForm(null));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: tenantsResponse, loading: tenantsLoading } = useFetch('/admin/platform/tenants', {
    cache: { enabled: true, ttlMs: 15000 },
  });

  const pivotTenants = useMemo(() => {
    const rows = tenantsResponse?.success ? tenantsResponse.data?.tenants || [] : [];
    return rows.filter(isPivotTenant);
  }, [tenantsResponse]);

  useEffect(() => {
    if (!selectedTenantKey && pivotTenants.length) {
      setSelectedTenantKey(pivotTenants[0].tenantKey);
    }
  }, [pivotTenants, selectedTenantKey]);

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
  const selectedTenant = useMemo(
    () => pivotTenants.find((row) => row.tenantKey === selectedTenantKey) || null,
    [pivotTenants, selectedTenantKey]
  );

  useEffect(() => {
    if (selectedTenant) {
      setForm(tenantToDropForm(selectedTenant));
    }
  }, [selectedTenant?.tenantKey, selectedTenant?.pivotDropTimezone, selectedTenant?.pivotDropDayOfWeek]);

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
    pivotDropOverrides: form.pivotDropOverrides
      .filter((row) => row.batchWeek.trim())
      .map((row) => ({
        batchWeek: row.batchWeek.trim().toUpperCase(),
        dayOfWeek: Number(row.dayOfWeek),
        hour: Number(row.hour),
        minute: Number(row.minute),
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
      refetchStatus();
    },
    [addNotification, batchWeek, form, refetchStatus, selectedTenantKey]
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
          `Send weekly drop push to ${status?.pivotPushRecipientCount ?? 0} pivot devices for ${selectedTenantKey}?`
        );
        if (!confirmed) return;
      }

      setSending(true);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform/tenants/${selectedTenantKey}/pivot-weekly-drop/send`,
        {
          method: 'POST',
          data: { batchWeek, dryRun, force },
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
          message: `${result.pivotPushRecipientCount} recipients · ${result.publishedEventCount} published events`,
          type: 'success',
        });
      } else {
        addNotification({
          title: 'Push sent',
          message: `Delivered ${result.sent} · failed ${result.failed}`,
          type: 'success',
        });
      }
      refetchStatus();
    },
    [addNotification, batchWeek, refetchStatus, selectedTenantKey, status?.pivotPushRecipientCount]
  );

  return (
    <div className="pivot-weekly-drop linear-admin">
      <header className="pivot-weekly-drop__header">
        <div>
          <p className="pivot-weekly-drop__eyebrow">Internal · Just Go pilot</p>
          <h1>Weekly drop</h1>
          <p className="pivot-weekly-drop__subtitle">
            Configure each city&apos;s drop schedule and send the manual deck push at the resolved local
            instant. Publish catalog events in Pivot Lab first.
          </p>
        </div>
        <div className="pivot-weekly-drop__controls">
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
            onClick={() => refetchStatus()}
            disabled={statusLoading || !selectedTenantKey}
          >
            {statusLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

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
            <p className="pivot-weekly-drop__copy-label">Push copy</p>
            <p className="pivot-weekly-drop__copy-title">{dropSchedule.pushCopy?.title}</p>
            <p className="pivot-weekly-drop__copy-body">{dropSchedule.pushCopy?.body}</p>
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
}

export default PivotWeeklyDropPage;
