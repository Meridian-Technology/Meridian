import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsSection } from '../../../components/PivotOps';
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  WEEKDAY_OPTIONS,
  cronFromScheduleParts,
  defaultScheduleParts,
  parseTriggerConfigJson,
  schedulePartsFromCron,
  stringifyTriggerConfig,
  validateDefinitionKey,
  validateThirtyMinuteCron,
} from './notificationDefinitionCron';
import './PivotNotificationDefinitionEditor.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_OVERRIDES = {
  enabled: false,
  schedule: false,
  copy: false,
  trigger: false,
};

function tenantLabel(tenant) {
  const key = String(tenant?.tenantKey || '').trim().toLowerCase();
  const name = tenant?.location || tenant?.name || '';
  if (name && key && name.toLowerCase() !== key) return `${name} · ${key}`;
  return name || key || '—';
}

function formFromDefinition(definition) {
  const schedule = schedulePartsFromCron(definition?.scheduleCron || '0,30 * * * *');
  return {
    definitionKey: definition?.definitionKey || '',
    handlerKey: definition?.handlerKey || '',
    tenantKey: definition?.tenantKey || '',
    enabled: definition?.enabled !== false,
    scheduleParts: schedule.parts,
    advancedCron: Boolean(schedule.advanced),
    scheduleCron: definition?.scheduleCron || cronFromScheduleParts(schedule.parts),
    copyTitleKey: definition?.copyTitleKey || '',
    copyBodyKey: definition?.copyBodyKey || '',
    copyTitleFallback: definition?.copyTitleFallback || '',
    copyBodyFallback: definition?.copyBodyFallback || '',
    triggerConfigText: stringifyTriggerConfig(definition?.triggerConfig),
  };
}

function currentCron(form) {
  return form.advancedCron
    ? form.scheduleCron
    : cronFromScheduleParts(form.scheduleParts);
}

function PivotNotificationDefinitionEditor({
  definition = null,
  tenants = [],
  onCancel,
  onSaved,
}) {
  const { addNotification } = useNotification();
  const creating = !definition?.id;
  const fleetTemplate = Boolean(definition?.id) && !definition?.tenantKey;
  const [form, setForm] = useState(() => formFromDefinition(definition));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [overrideTenantKey, setOverrideTenantKey] = useState('');
  const [overrideToggles, setOverrideToggles] = useState(EMPTY_OVERRIDES);
  const [overrideForm, setOverrideForm] = useState(() => formFromDefinition(definition));
  const [overrideSaving, setOverrideSaving] = useState(false);

  const {
    data: handlersResponse,
    loading: handlersLoading,
    error: handlersError,
  } = useFetch('/admin/meridian/jobs/handlers', { cache: NO_FETCH_CACHE });

  const handlers = useMemo(() => {
    const rows = handlersResponse?.success
      ? (Array.isArray(handlersResponse.data) ? handlersResponse.data : [])
      : [];
    return rows.slice().sort((a, b) => String(a.handlerKey).localeCompare(String(b.handlerKey)));
  }, [handlersResponse]);

  useEffect(() => {
    setForm(formFromDefinition(definition));
    setFieldErrors({});
    setOverrideTenantKey('');
    setOverrideToggles(EMPTY_OVERRIDES);
    setOverrideForm(formFromDefinition(definition));
  }, [definition]);

  useEffect(() => {
    if (creating && !form.handlerKey && handlers[0]?.handlerKey) {
      setForm((current) => ({ ...current, handlerKey: handlers[0].handlerKey }));
    }
  }, [creating, form.handlerKey, handlers]);

  const {
    data: mergedResponse,
  } = useFetch(
    fleetTemplate && overrideTenantKey
      ? `/admin/meridian/jobs/definitions/${encodeURIComponent(definition.id)}`
      : null,
    {
      cache: NO_FETCH_CACHE,
      params: fleetTemplate && overrideTenantKey ? { tenantKey: overrideTenantKey } : undefined,
    },
  );

  useEffect(() => {
    if (!fleetTemplate || !overrideTenantKey) return;
    const merged = mergedResponse?.success ? mergedResponse.data : null;
    if (!merged) return;
    const fields = new Set(merged.overriddenFields || []);
    setOverrideToggles({
      enabled: fields.has('enabled'),
      schedule: fields.has('scheduleCron'),
      copy: fields.has('copyTitleKey')
        || fields.has('copyBodyKey')
        || fields.has('copyTitleFallback')
        || fields.has('copyBodyFallback'),
      trigger: fields.has('triggerConfig'),
    });
    setOverrideForm(formFromDefinition({
      ...definition,
      ...merged,
    }));
  }, [definition, fleetTemplate, mergedResponse, overrideTenantKey]);

  const setField = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const validateForm = useCallback(() => {
    const errors = {};
    if (creating) {
      const key = validateDefinitionKey(form.definitionKey);
      if (key.error) errors.definitionKey = key.error;
    }
    if (!form.handlerKey) errors.handlerKey = 'handlerKey is required';
    const cron = validateThirtyMinuteCron(currentCron(form));
    if (cron.error) errors.scheduleCron = cron.error;
    const trigger = parseTriggerConfigJson(form.triggerConfigText);
    if (trigger.error) errors.triggerConfig = trigger.error;
    setFieldErrors(errors);
    return { errors, cron, trigger };
  }, [creating, form]);

  const handleSave = useCallback(async (event) => {
    event.preventDefault();
    const { errors, cron, trigger } = validateForm();
    if (Object.keys(errors).length) return;

    const body = {
      handlerKey: form.handlerKey,
      tenantKey: form.tenantKey || null,
      enabled: form.enabled !== false,
      scheduleCron: cron.normalized,
      copyTitleKey: form.copyTitleKey.trim() || null,
      copyBodyKey: form.copyBodyKey.trim() || null,
      copyTitleFallback: form.copyTitleFallback.trim() || null,
      copyBodyFallback: form.copyBodyFallback.trim() || null,
      triggerConfig: trigger.value,
    };
    if (creating) body.definitionKey = form.definitionKey.trim().toLowerCase();

    setSaving(true);
    const path = creating
      ? '/admin/meridian/jobs/definitions'
      : `/admin/meridian/jobs/definitions/${encodeURIComponent(definition.id)}`;
    const { data: res, error: reqError } = await authenticatedRequest(path, {
      method: creating ? 'POST' : 'PATCH',
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Definition save failed',
        message: res?.message || reqError || 'Unable to save notification definition',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: creating ? 'Definition created' : 'Definition updated',
      message: res.data?.definitionKey || body.definitionKey,
      type: 'success',
    });
    onSaved?.(res.data);
  }, [addNotification, creating, definition, form, onSaved, validateForm]);

  const handleDelete = useCallback(async () => {
    if (!definition?.id) return;
    setSaving(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/meridian/jobs/definitions/${encodeURIComponent(definition.id)}`,
      { method: 'DELETE' },
    );
    setSaving(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Delete failed',
        message: res?.message || reqError || 'Unable to delete definition',
        type: 'error',
      });
      return;
    }
    addNotification({
      title: 'Definition deleted',
      message: definition.definitionKey,
      type: 'success',
    });
    onSaved?.(null);
  }, [addNotification, definition, onSaved]);

  const handleSaveOverride = useCallback(async (event) => {
    event.preventDefault();
    if (!fleetTemplate || !overrideTenantKey) return;

    const anyToggle = Object.values(overrideToggles).some(Boolean);
    setOverrideSaving(true);

    let payload = { patch: null };
    if (anyToggle) {
      const body = { definitionKey: definition.definitionKey };
      if (overrideToggles.enabled) body.enabled = overrideForm.enabled !== false;
      if (overrideToggles.schedule) {
        const cron = validateThirtyMinuteCron(currentCron(overrideForm));
        if (cron.error) {
          setFieldErrors((current) => ({ ...current, overrideCron: cron.error }));
          setOverrideSaving(false);
          return;
        }
        body.scheduleCron = cron.normalized;
      }
      if (overrideToggles.copy) {
        body.copyTitleKey = overrideForm.copyTitleKey.trim() || null;
        body.copyBodyKey = overrideForm.copyBodyKey.trim() || null;
        body.copyTitleFallback = overrideForm.copyTitleFallback.trim() || null;
        body.copyBodyFallback = overrideForm.copyBodyFallback.trim() || null;
      }
      if (overrideToggles.trigger) {
        const trigger = parseTriggerConfigJson(overrideForm.triggerConfigText);
        if (trigger.error) {
          setFieldErrors((current) => ({ ...current, overrideTrigger: trigger.error }));
          setOverrideSaving(false);
          return;
        }
        body.triggerConfig = trigger.value;
      }
      payload = body;
    }

    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${encodeURIComponent(overrideTenantKey)}/meridian/jobs/definitions/${encodeURIComponent(definition.definitionKey)}/override`,
      {
        method: 'PUT',
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setOverrideSaving(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Override save failed',
        message: res?.message || reqError || 'Unable to save tenant override',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: anyToggle ? 'Tenant override saved' : 'Tenant override cleared',
      message: `${definition.definitionKey} · ${overrideTenantKey}`,
      type: 'success',
    });
    onSaved?.(definition);
  }, [
    addNotification,
    definition,
    fleetTemplate,
    onSaved,
    overrideForm,
    overrideTenantKey,
    overrideToggles,
  ]);

  const scheduleFields = (prefix, target, setTarget) => (
    <div className="pivot-notification-definition-editor__cron">
      <label className="linear-field">
        <span className="linear-field__label">Minute</span>
        <select
          aria-label={`${prefix} minute`}
          value={target.scheduleParts.minute}
          disabled={target.advancedCron}
          onChange={(event) => setTarget((current) => ({
            ...current,
            scheduleParts: { ...current.scheduleParts, minute: event.target.value },
          }))}
        >
          {MINUTE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="linear-field">
        <span className="linear-field__label">Hour (local)</span>
        <select
          aria-label={`${prefix} hour`}
          value={target.scheduleParts.hour}
          disabled={target.advancedCron}
          onChange={(event) => setTarget((current) => ({
            ...current,
            scheduleParts: { ...current.scheduleParts, hour: event.target.value },
          }))}
        >
          {HOUR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="linear-field">
        <span className="linear-field__label">Weekday</span>
        <select
          aria-label={`${prefix} weekday`}
          value={target.scheduleParts.weekday}
          disabled={target.advancedCron}
          onChange={(event) => setTarget((current) => ({
            ...current,
            scheduleParts: { ...current.scheduleParts, weekday: event.target.value },
          }))}
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="linear-field linear-field--checkbox">
        <input
          type="checkbox"
          aria-label={`${prefix} advanced cron`}
          checked={target.advancedCron}
          onChange={(event) => setTarget((current) => ({
            ...current,
            advancedCron: event.target.checked,
            scheduleCron: currentCron({ ...current, advancedCron: false }),
          }))}
        />
        <span>Advanced cron</span>
      </label>
      {target.advancedCron ? (
        <label className="linear-field">
          <span className="linear-field__label">Cron (5 fields)</span>
          <input
            aria-label={`${prefix} cron`}
            value={target.scheduleCron}
            onChange={(event) => setTarget((current) => ({
              ...current,
              scheduleCron: event.target.value,
            }))}
          />
        </label>
      ) : null}
    </div>
  );

  return (
    <PivotOpsSection
      title={creating ? 'New definition' : `Edit ${definition.definitionKey}`}
      description="Handlers stay in code. Schedule minutes are only :00 or :30 in each city’s drop timezone."
    >
      <form className="pivot-notification-definition-editor" onSubmit={handleSave}>
        {handlersError ? (
          <p className="pivot-notification-definition-editor__error" role="alert">{handlersError}</p>
        ) : null}
        <div className="pivot-notification-definition-editor__grid">
          <label className="linear-field">
            <span className="linear-field__label">Definition key</span>
            <input
              aria-label="Definition key"
              value={form.definitionKey}
              disabled={!creating}
              onChange={(event) => setField('definitionKey', event.target.value)}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Handler</span>
            <select
              aria-label="Definition handler"
              value={form.handlerKey}
              onChange={(event) => setField('handlerKey', event.target.value)}
              disabled={handlersLoading}
            >
              {!form.handlerKey ? <option value="">Select a handler</option> : null}
              {handlers.map((handler) => (
                <option key={handler.handlerKey} value={handler.handlerKey}>
                  {handler.handlerKey}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Scope</span>
            <select
              aria-label="Definition tenant"
              value={form.tenantKey}
              disabled={!creating}
              onChange={(event) => setField('tenantKey', event.target.value)}
            >
              <option value="">Fleet template</option>
              {tenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenantLabel(tenant)}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Definition enabled"
              checked={form.enabled}
              onChange={(event) => setField('enabled', event.target.checked)}
            />
            <span>Enabled</span>
          </label>
        </div>

        {scheduleFields('Definition', form, setForm)}
        {fieldErrors.scheduleCron ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.scheduleCron}
          </p>
        ) : (
          <p className="pivot-notification-definition-editor__hint">
            Cron: <code>{currentCron(form)}</code>
          </p>
        )}
        {fieldErrors.definitionKey ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.definitionKey}
          </p>
        ) : null}
        {fieldErrors.handlerKey ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.handlerKey}
          </p>
        ) : null}

        <div className="pivot-notification-definition-editor__copy">
          <label className="linear-field">
            <span className="linear-field__label">Copy title key</span>
            <input
              aria-label="Copy title key"
              placeholder="notifications.ritual.title"
              value={form.copyTitleKey}
              onChange={(event) => setField('copyTitleKey', event.target.value)}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Copy body key</span>
            <input
              aria-label="Copy body key"
              placeholder="notifications.ritual.body"
              value={form.copyBodyKey}
              onChange={(event) => setField('copyBodyKey', event.target.value)}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Title fallback</span>
            <input
              aria-label="Copy title fallback"
              value={form.copyTitleFallback}
              onChange={(event) => setField('copyTitleFallback', event.target.value)}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Body fallback</span>
            <input
              aria-label="Copy body fallback"
              value={form.copyBodyFallback}
              onChange={(event) => setField('copyBodyFallback', event.target.value)}
            />
          </label>
        </div>

        <label className="linear-field pivot-notification-definition-editor__trigger">
          <span className="linear-field__label">triggerConfig JSON</span>
          <textarea
            aria-label="triggerConfig JSON"
            placeholder="{}"
            value={form.triggerConfigText}
            onChange={(event) => setField('triggerConfigText', event.target.value)}
          />
        </label>
        {fieldErrors.triggerConfig ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.triggerConfig}
          </p>
        ) : null}

        <div className="pivot-notification-definition-editor__actions">
          <button type="submit" className="linear-btn" disabled={saving}>
            {saving ? 'Saving…' : creating ? 'Create definition' : 'Save definition'}
          </button>
          <button type="button" className="linear-btn linear-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          {!creating ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>

      {fleetTemplate ? (
        <form className="pivot-notification-definition-editor" onSubmit={handleSaveOverride}>
          <h3>Tenant overrides</h3>
          <p className="pivot-notification-definition-editor__hint">
            Merged at read time from TenantConfig. Clearing all toggles removes the city override.
          </p>
          <label className="linear-field">
            <span className="linear-field__label">City</span>
            <select
              aria-label="Override tenant"
              value={overrideTenantKey}
              onChange={(event) => setOverrideTenantKey(event.target.value)}
            >
              <option value="">Select a city</option>
              {tenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenantLabel(tenant)}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Override enabled"
              checked={overrideToggles.enabled}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                enabled: event.target.checked,
              }))}
            />
            <span>Override enabled</span>
          </label>
          {overrideToggles.enabled ? (
            <label className="linear-field linear-field--checkbox">
              <input
                type="checkbox"
                aria-label="Override enabled value"
                checked={overrideForm.enabled}
                onChange={(event) => setOverrideForm((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))}
              />
              <span>Enabled in this city</span>
            </label>
          ) : null}
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Override schedule"
              checked={overrideToggles.schedule}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                schedule: event.target.checked,
              }))}
            />
            <span>Override schedule</span>
          </label>
          {overrideToggles.schedule ? scheduleFields('Override', overrideForm, setOverrideForm) : null}
          {fieldErrors.overrideCron ? (
            <p className="pivot-notification-definition-editor__error" role="alert">
              {fieldErrors.overrideCron}
            </p>
          ) : null}
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Override copy"
              checked={overrideToggles.copy}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                copy: event.target.checked,
              }))}
            />
            <span>Override copy keys</span>
          </label>
          {overrideToggles.copy ? (
            <div className="pivot-notification-definition-editor__copy">
              <label className="linear-field">
                <span className="linear-field__label">Override title key</span>
                <input
                  aria-label="Override copy title key"
                  value={overrideForm.copyTitleKey}
                  onChange={(event) => setOverrideForm((current) => ({
                    ...current,
                    copyTitleKey: event.target.value,
                  }))}
                />
              </label>
              <label className="linear-field">
                <span className="linear-field__label">Override body key</span>
                <input
                  aria-label="Override copy body key"
                  value={overrideForm.copyBodyKey}
                  onChange={(event) => setOverrideForm((current) => ({
                    ...current,
                    copyBodyKey: event.target.value,
                  }))}
                />
              </label>
            </div>
          ) : null}
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Override triggerConfig"
              checked={overrideToggles.trigger}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                trigger: event.target.checked,
              }))}
            />
            <span>Override triggerConfig</span>
          </label>
          {overrideToggles.trigger ? (
            <label className="linear-field">
              <span className="linear-field__label">Override triggerConfig JSON</span>
              <textarea
                aria-label="Override triggerConfig JSON"
                value={overrideForm.triggerConfigText}
                onChange={(event) => setOverrideForm((current) => ({
                  ...current,
                  triggerConfigText: event.target.value,
                }))}
              />
            </label>
          ) : null}
          {fieldErrors.overrideTrigger ? (
            <p className="pivot-notification-definition-editor__error" role="alert">
              {fieldErrors.overrideTrigger}
            </p>
          ) : null}
          <button
            type="submit"
            className="linear-btn linear-btn--secondary"
            disabled={!overrideTenantKey || overrideSaving}
          >
            {overrideSaving ? 'Saving override…' : 'Save tenant override'}
          </button>
        </form>
      ) : null}
    </PivotOpsSection>
  );
}

export default PivotNotificationDefinitionEditor;
