import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { describeWhoRules, scheduleName, schedulePurpose } from './notificationScheduleCopy';
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  WEEKDAY_OPTIONS,
  cronFromScheduleParts,
  defaultScheduleParts,
  describeSchedule,
  isSingleClockSchedule,
  schedulePartsFromCron,
  validateDefinitionKey,
  validateThirtyMinuteCron,
} from './notificationDefinitionCron';
import PivotNotificationVoiceFields, { voiceKeysFor } from './PivotNotificationVoiceFields';
import PivotNotificationWhoRules from './PivotNotificationWhoRules';
import './PivotNotificationDefinitionEditor.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_OVERRIDES = {
  enabled: false,
  schedule: false,
  copy: false,
  trigger: false,
  rules: false,
};

const DISCOVERY_MODES = [
  { value: 'catalog_publish', label: 'Catalog publish' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'both', label: 'Both' },
];

function quietHour(value, fallback) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

function quietHoursFrom(triggerConfig) {
  const raw = triggerConfig?.quietHours;
  return {
    quietStartHour: quietHour(raw?.startHour, 22),
    quietEndHour: quietHour(raw?.endHour, 8),
  };
}

function discoveryOnFrom(triggerConfig) {
  const on = triggerConfig?.on;
  return DISCOVERY_MODES.some((mode) => mode.value === on) ? on : 'catalog_publish';
}

function triggerConfigFromForm(form) {
  const config = {
    quietHours: {
      startHour: quietHour(form.quietStartHour, null),
      endHour: quietHour(form.quietEndHour, null),
    },
  };
  if (form.handlerKey === 'event_discovery') {
    config.on = DISCOVERY_MODES.some((mode) => mode.value === form.discoveryOn)
      ? form.discoveryOn
      : 'catalog_publish';
  }
  return config;
}

function quietHoursError(form) {
  if (!Number.isInteger(Number(form.quietStartHour)) || form.quietStartHour < 0 || form.quietStartHour > 23) {
    return 'Quiet hours start must be an hour from 0 to 23';
  }
  if (!Number.isInteger(Number(form.quietEndHour)) || form.quietEndHour < 0 || form.quietEndHour > 23) {
    return 'Quiet hours end must be an hour from 0 to 23';
  }
  return null;
}

function tenantLabel(tenant) {
  const key = String(tenant?.tenantKey || '').trim().toLowerCase();
  const name = tenant?.location || tenant?.name || '';
  if (name && key && name.toLowerCase() !== key) return `${name} · ${key}`;
  return name || key || '—';
}

function formFromDefinition(definition) {
  const schedule = schedulePartsFromCron(definition?.scheduleCron || '0,30 8-21 * * *');
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
    ...quietHoursFrom(definition?.triggerConfig),
    discoveryOn: discoveryOnFrom(definition?.triggerConfig),
    rules: Array.isArray(definition?.rules) ? definition.rules : null,
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
  startCondensed = false,
  onOpenChecks,
}) {
  const { addNotification } = useNotification();
  const creating = !definition?.id;
  const fleetTemplate = Boolean(definition?.id) && !definition?.tenantKey;
  const [settingsOpen, setSettingsOpen] = useState(!startCondensed || creating);
  const [form, setForm] = useState(() => formFromDefinition(definition));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [overrideTenantKey, setOverrideTenantKey] = useState('');
  const [overrideToggles, setOverrideToggles] = useState(EMPTY_OVERRIDES);
  const [overrideForm, setOverrideForm] = useState(() => formFromDefinition(definition));
  const [overrideSaving, setOverrideSaving] = useState(false);
  const voiceRef = useRef(null);
  const voiceKeys = useMemo(
    () => voiceKeysFor(creating ? null : definition, form.handlerKey),
    [creating, definition, form.handlerKey],
  );

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

  const {
    data: catalogResponse,
  } = useFetch(
    form.handlerKey
      ? `/admin/meridian/jobs/notification-rule-catalog?handlerKey=${encodeURIComponent(form.handlerKey)}`
      : null,
    { cache: NO_FETCH_CACHE },
  );
  const catalog = catalogResponse?.success ? catalogResponse.data : null;

  useEffect(() => {
    if (!catalog || catalog.handlerKey !== form.handlerKey) return;
    if (!Array.isArray(catalog.defaultRules)) return;
    setForm((current) => {
      if (current.handlerKey !== catalog.handlerKey || current.rules != null) return current;
      return { ...current, rules: catalog.defaultRules };
    });
  }, [catalog, form.handlerKey]);

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
      rules: fields.has('rules'),
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
    const quiet = quietHoursError(form);
    if (quiet) errors.quietHours = quiet;
    const catalogMatches = catalog?.handlerKey === form.handlerKey;
    const rules = catalogMatches && Array.isArray(form.rules)
      ? form.rules
      : (catalogMatches ? catalog.defaultRules : null);
    if (!Array.isArray(rules)) errors.rules = 'Who rules are still loading';
    setFieldErrors(errors);
    return { errors, cron, rules };
  }, [catalog, creating, form]);

  const handleSave = useCallback(async (event) => {
    event.preventDefault();
    const { errors, cron, rules } = validateForm();
    if (Object.keys(errors).length) return;

    setSaving(true);
    const voiceResult = await voiceRef.current?.save();
    if (voiceResult && !voiceResult.ok) {
      setSaving(false);
      addNotification({
        title: 'Voice save failed',
        message: voiceResult.message,
        type: 'error',
      });
      return;
    }

    const body = {
      handlerKey: form.handlerKey,
      tenantKey: form.tenantKey || null,
      enabled: form.enabled !== false,
      scheduleCron: cron.normalized,
      copyTitleKey: voiceResult?.titleKey || voiceKeys.title || null,
      copyBodyKey: voiceResult?.bodyKey || voiceKeys.body || null,
      copyTitleFallback: definition?.copyTitleFallback || null,
      copyBodyFallback: definition?.copyBodyFallback || null,
      triggerConfig: triggerConfigFromForm(form),
      rules,
    };
    if (creating) body.definitionKey = form.definitionKey.trim().toLowerCase();

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
  }, [addNotification, creating, definition, form, onSaved, validateForm, voiceKeys.body, voiceKeys.title]);

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
        const quiet = quietHoursError(overrideForm);
        if (quiet) {
          setFieldErrors((current) => ({ ...current, overrideTrigger: quiet }));
          setOverrideSaving(false);
          return;
        }
        body.triggerConfig = triggerConfigFromForm(overrideForm);
      }
      if (overrideToggles.rules) {
        if (!Array.isArray(overrideForm.rules)) {
          setFieldErrors((current) => ({ ...current, overrideRules: 'Who rules are still loading' }));
          setOverrideSaving(false);
          return;
        }
        body.rules = overrideForm.rules;
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

  const scheduleFields = (prefix, target, setTarget, { clock = false } = {}) => {
    const patchParts = (patch) => setTarget((current) => ({
      ...current,
      scheduleParts: { ...current.scheduleParts, ...patch },
    }));
    const singleClock = clock && !target.advancedCron && isSingleClockSchedule(target.scheduleParts);
    const clockValue = `${String(target.scheduleParts.hour).padStart(2, '0')}:${String(target.scheduleParts.minute).padStart(2, '0')}`;

    return (
    <div className="pivot-notification-definition-editor__cron">
      {singleClock ? (
        <div className="pivot-notification-time">
          <div className="pivot-notification-time__days" role="group" aria-label={`${prefix} day`}>
            {WEEKDAY_OPTIONS.filter((option) => option.value !== '*').map((option) => (
              <button
                key={option.value}
                type="button"
                className={target.scheduleParts.weekday === option.value ? 'is-selected' : ''}
                aria-pressed={target.scheduleParts.weekday === option.value}
                aria-label={option.label}
                onClick={() => patchParts({ weekday: option.value })}
              >
                {option.label.slice(0, 3)}
              </button>
            ))}
            <button
              type="button"
              className={target.scheduleParts.weekday === '*' ? 'is-selected' : ''}
              aria-pressed={target.scheduleParts.weekday === '*'}
              onClick={() => patchParts({ weekday: '*' })}
            >
              Every day
            </button>
          </div>
          <label className="pivot-notification-time__clock">
            <span className="linear-field__label">Time</span>
            <input
              type="time"
              step="1800"
              aria-label={`${prefix} time`}
              value={clockValue}
              onChange={(event) => {
                const match = /^(\d{1,2}):(\d{2})$/.exec(event.target.value);
                if (!match) return;
                const hour = Number(match[1]);
                let minute = Number(match[2]);
                if (hour > 23) return;
                if (minute !== 0 && minute !== 30) minute = minute < 30 ? 0 : 30;
                patchParts({ hour: String(hour), minute: String(minute) });
              }}
            />
          </label>
        </div>
      ) : (
        <>
      <label className="linear-field">
        <span className="linear-field__label">Minute</span>
        <select
          aria-label={`${prefix} minute`}
          value={target.scheduleParts.minute}
          disabled={target.advancedCron}
          onChange={(event) => patchParts({ minute: event.target.value })}
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
          onChange={(event) => patchParts({ hour: event.target.value })}
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
          onChange={(event) => patchParts({ weekday: event.target.value })}
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
        </>
      )}
      {clock && singleClock ? null : (
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
      )}
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
  };

  const whoSummary = describeWhoRules(form.rules);
  const condensed = !settingsOpen;
  const timedOnly = Boolean(catalog) && !(catalog.attributes || []).length;
  const timeSummary = describeSchedule(currentCron(form));

  return (
    <div className="pivot-notification-definition-editor">
      <header className="pivot-notification-definition-editor__head">
        <h2 className="pivot-notification-definition-editor__title">
          {creating ? 'New schedule' : condensed ? scheduleName(definition) : `Edit ${scheduleName(definition)}`}
        </h2>
        <p className="pivot-notification-definition-editor__lead">
          {condensed
            ? schedulePurpose(definition)
            : 'Handlers stay in code. Schedule minutes are only :00 or :30 in each city’s drop timezone.'}
        </p>
        {condensed && !timedOnly && whoSummary ? (
          <p className="pivot-notification-definition-editor__summary">{whoSummary}</p>
        ) : null}
      </header>
      <form onSubmit={handleSave}>
        {handlersError ? (
          <p className="pivot-notification-definition-editor__error" role="alert">{handlersError}</p>
        ) : null}
        {settingsOpen ? (
        <>
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
              onChange={(event) => setForm((current) => ({
                ...current,
                handlerKey: event.target.value,
                rules: null,
                discoveryOn: 'catalog_publish',
              }))}
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

        <div className="pivot-notification-definition-editor__quiet">
          <label className="linear-field">
            <span className="linear-field__label">Quiet hours start</span>
            <input
              type="number"
              min="0"
              max="23"
              aria-label="Quiet hours start"
              value={form.quietStartHour}
              onChange={(event) => setField('quietStartHour', event.target.value === '' ? '' : Number(event.target.value))}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Quiet hours end</span>
            <input
              type="number"
              min="0"
              max="23"
              aria-label="Quiet hours end"
              value={form.quietEndHour}
              onChange={(event) => setField('quietEndHour', event.target.value === '' ? '' : Number(event.target.value))}
            />
          </label>
        </div>
        {form.handlerKey === 'event_discovery' ? (
          <label className="linear-field">
            <span className="linear-field__label">Fire mode</span>
            <select
              aria-label="Discovery fire mode"
              value={form.discoveryOn}
              onChange={(event) => setField('discoveryOn', event.target.value)}
            >
              {DISCOVERY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {fieldErrors.quietHours ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.quietHours}
          </p>
        ) : null}
        </>
        ) : null}

        <PivotNotificationVoiceFields
          ref={voiceRef}
          titleKey={voiceKeys.title}
          bodyKey={voiceKeys.body}
          disabled={saving}
        />

        {condensed && timedOnly ? (
          <div className="pivot-notification-definition-editor__when">
            <h3 className="pivot-notification-definition-editor__section-title">When it sends</h3>
            {timeSummary ? (
              <p className="pivot-notification-definition-editor__summary">{timeSummary}</p>
            ) : null}
            {scheduleFields('Definition', form, setForm, { clock: true })}
            {fieldErrors.scheduleCron ? (
              <p className="pivot-notification-definition-editor__error" role="alert">
                {fieldErrors.scheduleCron}
              </p>
            ) : null}
          </div>
        ) : null}

        {timedOnly ? null : (
          <PivotNotificationWhoRules
            catalog={catalog}
            rules={form.rules}
            disabled={saving}
            labelPrefix="Who"
            onChange={(rules) => setField('rules', rules)}
          />
        )}
        {fieldErrors.rules ? (
          <p className="pivot-notification-definition-editor__error" role="alert">
            {fieldErrors.rules}
          </p>
        ) : null}

        <div className="pivot-notification-definition-editor__actions">
          <button type="button" className="linear-btn linear-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          {condensed ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={() => setSettingsOpen(true)}
            >
              Advanced settings
            </button>
          ) : null}
          {condensed && onOpenChecks ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={onOpenChecks}
            >
              Checks
            </button>
          ) : null}
          <button type="submit" className="linear-btn linear-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : creating ? 'Create schedule' : 'Save schedule'}
          </button>
          {!creating && !condensed ? (
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

      {fleetTemplate && !condensed ? (
        <form className="pivot-notification-definition-editor__override" onSubmit={handleSaveOverride}>
          <h3 className="pivot-notification-definition-editor__section-title">City overrides</h3>
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
              aria-label="Override quiet hours"
              checked={overrideToggles.trigger}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                trigger: event.target.checked,
              }))}
            />
            <span>Override quiet hours</span>
          </label>
          {overrideToggles.trigger ? (
            <div className="pivot-notification-definition-editor__quiet">
              <label className="linear-field">
                <span className="linear-field__label">Quiet hours start</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  aria-label="Override quiet hours start"
                  value={overrideForm.quietStartHour}
                  onChange={(event) => setOverrideForm((current) => ({
                    ...current,
                    quietStartHour: event.target.value === '' ? '' : Number(event.target.value),
                  }))}
                />
              </label>
              <label className="linear-field">
                <span className="linear-field__label">Quiet hours end</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  aria-label="Override quiet hours end"
                  value={overrideForm.quietEndHour}
                  onChange={(event) => setOverrideForm((current) => ({
                    ...current,
                    quietEndHour: event.target.value === '' ? '' : Number(event.target.value),
                  }))}
                />
              </label>
            </div>
          ) : null}
          {overrideToggles.trigger && form.handlerKey === 'event_discovery' ? (
            <label className="linear-field">
              <span className="linear-field__label">Fire mode</span>
              <select
                aria-label="Override discovery fire mode"
                value={overrideForm.discoveryOn}
                onChange={(event) => setOverrideForm((current) => ({
                  ...current,
                  discoveryOn: event.target.value,
                }))}
              >
                {DISCOVERY_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {timedOnly ? null : (
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="Override who gets it"
              checked={overrideToggles.rules}
              disabled={!overrideTenantKey}
              onChange={(event) => setOverrideToggles((current) => ({
                ...current,
                rules: event.target.checked,
              }))}
            />
            <span>Override who gets it</span>
          </label>
          )}
          {!timedOnly && overrideToggles.rules ? (
            <PivotNotificationWhoRules
              catalog={catalog}
              rules={overrideForm.rules}
              disabled={overrideSaving}
              labelPrefix="Override who"
              onChange={(rules) => setOverrideForm((current) => ({ ...current, rules }))}
            />
          ) : null}
          {fieldErrors.overrideTrigger ? (
            <p className="pivot-notification-definition-editor__error" role="alert">
              {fieldErrors.overrideTrigger}
            </p>
          ) : null}
          {fieldErrors.overrideRules ? (
            <p className="pivot-notification-definition-editor__error" role="alert">
              {fieldErrors.overrideRules}
            </p>
          ) : null}
          <button
            type="submit"
            className="linear-btn linear-btn--primary"
            disabled={!overrideTenantKey || overrideSaving}
          >
            {overrideSaving ? 'Saving override…' : 'Save city override'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default PivotNotificationDefinitionEditor;
