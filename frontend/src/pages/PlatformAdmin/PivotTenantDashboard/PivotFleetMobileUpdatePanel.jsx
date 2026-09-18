import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PivotOpsBanner,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import { authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  buildMobileConfigPatch,
  envOverrideLabels,
  formSignature,
  mergePivotMobileForm,
  mobileFormsEqual,
  summarizeFleetMobileConfig,
  validateMobileUpdateForm,
} from './pivotMobileConfigForm';
import './PivotFleetMobileUpdatePanel.scss';

function cityStatusLabel(city) {
  if (city.forceUpdate) {
    return `blocking < ${city.minAppVersion}`;
  }
  return `open · min ${city.minAppVersion}`;
}

/**
 * Fleet control for GET /pivot/config `mobile` (store force-update gate).
 * Writes the same tenant override to every pivot city.
 */
function PivotFleetMobileUpdatePanel({
  tenants = [],
  loading = false,
  envOverrides = {},
  onSaved,
}) {
  const { addNotification } = useNotification();
  const summary = useMemo(() => summarizeFleetMobileConfig(tenants), [tenants]);
  const seedKey = `${formSignature(summary.seed)}|${summary.cities
    .map((city) => `${city.tenantKey}:${formSignature(city.form)}`)
    .join(',')}`;
  const [form, setForm] = useState(() => summary.seed);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(mergePivotMobileForm(summary.seed));
    setValidationError('');
    // seedKey captures form values per city so we don't reset while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const envLabels = useMemo(() => envOverrideLabels(envOverrides), [envOverrides]);
  const dirty = !mobileFormsEqual(form, summary.seed) || summary.mixed;

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError('');
  }, []);

  const handleSave = useCallback(
    async (event) => {
      event.preventDefault();
      const validation = validateMobileUpdateForm(form);
      if (validation.error) {
        setValidationError(validation.error);
        return;
      }

      if (!summary.cities.length) {
        setValidationError('No pivot cities to update.');
        return;
      }

      if (validation.value.forceUpdate) {
        const confirmed = window.confirm(
          `Block Just Go binaries below ${validation.value.minAppVersion} in ${summary.cities.length} ${
            summary.cities.length === 1 ? 'city' : 'cities'
          }? Only turn this on after the store build is searchable.`,
        );
        if (!confirmed) return;
      }

      setSaving(true);
      const failures = [];
      for (const city of summary.cities) {
        const built = buildMobileConfigPatch(validation.value, city.stored);
        if (built.error) {
          failures.push(`${city.cityDisplayName}: ${built.error}`);
          continue;
        }
        const { data: res, error: reqError } = await authenticatedRequest(
          `/admin/platform/tenants/${city.tenantKey}`,
          {
            method: 'PUT',
            data: { pivotMobileConfig: built.patch },
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (reqError || !res?.success) {
          failures.push(
            `${city.cityDisplayName}: ${res?.message || reqError || 'save failed'}`,
          );
        }
      }
      setSaving(false);

      if (failures.length) {
        addNotification({
          title: 'Update gate save incomplete',
          message: failures.join(' · '),
          type: 'error',
        });
        return;
      }

      addNotification({
        title: validation.value.forceUpdate ? 'Force update on' : 'Update gate saved',
        message: `${summary.cities.length} ${
          summary.cities.length === 1 ? 'city' : 'cities'
        } now ${
          validation.value.forceUpdate
            ? `block binaries below ${validation.value.minAppVersion}`
            : 'leave older binaries open'
        }. Clients pick this up on next launch.`,
        type: 'success',
      });
      onSaved?.();
    },
    [addNotification, form, onSaved, summary.cities],
  );

  return (
    <PivotOpsSection
      className="pivot-fleet-mobile"
      title="App update gate"
      titleId="pivot-fleet-mobile-title"
      description="Just Go reads this from GET /pivot/config. Turn force update on only after the new store version is live. Dev binaries skip the gate."
    >
      {envLabels.length ? (
        <PivotOpsBanner
          tone="warn"
          role="status"
          title="API env overrides tenant values"
        >
          <p>
            {envLabels.join(', ')}. Unset <code>PIVOT_MOBILE_*</code> on the
            deployed API or those fields win over this panel.
          </p>
        </PivotOpsBanner>
      ) : null}

      {summary.mixed ? (
        <PivotOpsBanner tone="accent" role="status" title="Cities differ">
          <p>
            Saving writes the form to every pivot city. Review the chips below
            before you overwrite a city-specific min version.
          </p>
        </PivotOpsBanner>
      ) : null}

      {loading && !summary.cities.length ? (
        <p className="pivot-lab__empty">Loading cities…</p>
      ) : !summary.cities.length ? (
        <p className="pivot-lab__empty">No pivot cities yet.</p>
      ) : (
        <form className="pivot-fleet-mobile__form" onSubmit={handleSave}>
          <div className="pivot-fleet-mobile__grid">
            <label className="pivot-fleet-mobile__field">
              <span className="pivot-fleet-mobile__label">Min store version</span>
              <input
                className="linear-input"
                value={form.minAppVersion}
                onChange={(event) => handleChange('minAppVersion', event.target.value)}
                placeholder="1.2.0"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="pivot-fleet-mobile__hint">
                Expo marketing version, not iOS build number.
              </span>
            </label>
            <label className="pivot-fleet-mobile__checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.forceUpdate)}
                onChange={(event) => handleChange('forceUpdate', event.target.checked)}
              />
              Force update
            </label>
            <label className="pivot-fleet-mobile__field">
              <span className="pivot-fleet-mobile__label">Gate message</span>
              <input
                className="linear-input"
                value={form.message}
                maxLength={240}
                onChange={(event) => handleChange('message', event.target.value)}
              />
            </label>
          </div>

          <div className="pivot-fleet-mobile__cities" aria-label="Per-city gate status">
            {summary.cities.map((city) => (
              <div key={city.tenantKey} className="pivot-fleet-mobile__city">
                <span className="pivot-fleet-mobile__city-name">
                  {city.cityDisplayName}
                </span>
                <span className="pivot-fleet-mobile__city-meta">
                  <PivotOpsStatus tone={city.forceUpdate ? 'warn' : 'muted'}>
                    {cityStatusLabel(city)}
                  </PivotOpsStatus>
                </span>
              </div>
            ))}
          </div>

          {validationError ? (
            <p className="pivot-fleet-mobile__error" role="alert">
              {validationError}
            </p>
          ) : null}

          <div className="pivot-fleet-mobile__actions">
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={() => {
                setForm(mergePivotMobileForm(summary.seed));
                setValidationError('');
              }}
              disabled={saving || (!dirty && !summary.mixed)}
            >
              Revert
            </button>
            <button
              type="submit"
              className="linear-btn linear-btn--primary"
              disabled={saving || loading}
            >
              {saving
                ? 'Saving…'
                : `Apply to ${summary.cities.length} ${
                    summary.cities.length === 1 ? 'city' : 'cities'
                  }`}
            </button>
          </div>
        </form>
      )}
    </PivotOpsSection>
  );
}

export default PivotFleetMobileUpdatePanel;
export { cityStatusLabel };
