import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import PivotCrewConfigSaveModal from './PivotCrewConfigSaveModal';
import {
  buildCrewConfigSavePreview,
  countStoredOverrides,
  mergePivotCrewConfig,
  validateEffectiveCrewConfig,
} from './pivotCrewConfigUtils';
import '../PivotReferralCodesPanel/PivotReferralCodesPanel.scss';
import './PivotCrewConfigPanel.scss';

function cloneEffectiveConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function NumberField({ label, hint, value, onChange, min, max, step = 'any' }) {
  return (
    <label className="linear-field">
      <span className="linear-field__label">{label}</span>
      <input
        className="linear-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <span className="linear-field__hint">{hint}</span> : null}
    </label>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="linear-field linear-field--checkbox">
      <span className="linear-field__label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function TextField({ label, value, onChange, maxLength }) {
  return (
    <label className="linear-field">
      <span className="linear-field__label">{label}</span>
      <input
        className="linear-input"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function PivotCrewConfigPanel({ tenantKey, storedOverrides, onSaved }) {
  const { addNotification } = useNotification();
  const [form, setForm] = useState(() => mergePivotCrewConfig(storedOverrides));
  const [validationError, setValidationError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setForm(mergePivotCrewConfig(storedOverrides));
    setValidationError('');
    setPreviewOpen(false);
    setPreview(null);
  }, [storedOverrides, tenantKey]);

  const overrideCount = useMemo(
    () => countStoredOverrides(storedOverrides),
    [storedOverrides],
  );

  const updateSection = useCallback((section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
    setValidationError('');
  }, []);

  const handleResetDefaults = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset crew config to shipped defaults for this tenant? Stored overrides will be removed.',
    );
    if (!confirmed) return;

    setResetting(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}`,
      {
        method: 'PUT',
        data: { pivotCrewConfig: null },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setResetting(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Reset failed',
        message: res?.message || reqError || 'Unable to reset crew config',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Crew config reset',
      message: `${tenantKey} now uses shipped defaults`,
      type: 'success',
    });
    onSaved?.();
  }, [addNotification, onSaved, tenantKey]);

  const handleReviewSave = useCallback(
    (event) => {
      event.preventDefault();
      const validation = validateEffectiveCrewConfig(form);
      if (validation.error) {
        setValidationError(validation.error);
        return;
      }

      const nextPreview = buildCrewConfigSavePreview(storedOverrides, form);
      if (!nextPreview.hasChanges) {
        addNotification({
          title: 'No changes',
          message: 'Crew config already matches your edits.',
          type: 'info',
        });
        return;
      }

      setPreview(nextPreview);
      setPreviewOpen(true);
    },
    [addNotification, form, storedOverrides],
  );

  const handleConfirmSave = useCallback(async () => {
    if (!preview) return;

    setSaving(true);
    const payload =
      Object.keys(preview.storedPatch).length > 0
        ? { pivotCrewConfig: preview.storedPatch }
        : { pivotCrewConfig: null };

    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}`,
      {
        method: 'PUT',
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSaving(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || reqError || 'Unable to save crew config',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Crew config saved',
      message: `${tenantKey} overrides updated — clients pick up via GET /pivot/config`,
      type: 'success',
    });
    setPreviewOpen(false);
    setPreview(null);
    onSaved?.();
  }, [addNotification, onSaved, preview, tenantKey]);

  return (
    <>
      <section
        className="linear-section pivot-referral pivot-crew-config"
        aria-labelledby="pivot-crew-config-title"
      >
        <div className="pivot-referral__head">
          <div>
            <h3 id="pivot-crew-config-title" className="linear-section__title">
              Crew config
            </h3>
            <p className="pivot-referral__hint">
              Tenant tunables for feed mix, quorum, judgement, and nudges. Values merge onto shipped
              defaults in <code>GET /pivot/config</code>.
              {overrideCount
                ? ` ${overrideCount} override section${overrideCount === 1 ? '' : 's'} stored.`
                : ' Using shipped defaults.'}
            </p>
          </div>
          <div className="pivot-referral__head-actions">
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm"
              onClick={handleResetDefaults}
              disabled={resetting || saving || overrideCount === 0}
            >
              <Icon icon="mdi:backup-restore" />
              {resetting ? 'Resetting…' : 'Reset to defaults'}
            </button>
          </div>
        </div>

        <form className="pivot-crew-config__form linear-form" onSubmit={handleReviewSave}>
          <details className="pivot-crew-config__group" open>
            <summary className="pivot-crew-config__group-title">Feed mix</summary>
            <div className="linear-form__grid">
              <NumberField
                label="Personal interest weight"
                hint="0–1. Deck still feels like the user's taste."
                min={0}
                max={1}
                step="0.01"
                value={form.feedMix.personalInterestWeight}
                onChange={(value) => updateSection('feedMix', 'personalInterestWeight', Number(value))}
              />
              <NumberField
                label="Crew signal weight"
                min={0}
                max={1}
                step="0.01"
                value={form.feedMix.crewSignalWeight}
                onChange={(value) => updateSection('feedMix', 'crewSignalWeight', Number(value))}
              />
              <NumberField
                label="Friend signal weight"
                min={0}
                max={1}
                step="0.01"
                value={form.feedMix.friendSignalWeight}
                onChange={(value) => updateSection('feedMix', 'friendSignalWeight', Number(value))}
              />
              <NumberField
                label="Exploration weight"
                min={0}
                max={1}
                step="0.01"
                value={form.feedMix.explorationWeight}
                onChange={(value) => updateSection('feedMix', 'explorationWeight', Number(value))}
              />
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Interest bleed</summary>
            <div className="linear-form__grid">
              <CheckboxField
                label="Enabled"
                checked={form.interestBleed.enabled}
                onChange={(value) => updateSection('interestBleed', 'enabled', value)}
              />
              <NumberField
                label="Max weight"
                min={0}
                max={1}
                step="0.01"
                value={form.interestBleed.maxWeight}
                onChange={(value) => updateSection('interestBleed', 'maxWeight', Number(value))}
              />
              <CheckboxField
                label="Requires crew member swipe"
                checked={form.interestBleed.requiresCrewMemberSwipe}
                onChange={(value) =>
                  updateSection('interestBleed', 'requiresCrewMemberSwipe', value)
                }
              />
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Quorum</summary>
            <div className="linear-form__grid">
              <NumberField
                label="Min swipe participation"
                hint="Fraction of active members who must swipe (0–1)."
                min={0}
                max={1}
                step="0.01"
                value={form.quorum.minSwipeParticipation}
                onChange={(value) =>
                  updateSection('quorum', 'minSwipeParticipation', Number(value))
                }
              />
              <NumberField
                label="Min active members"
                min={1}
                max={100}
                step="1"
                value={form.quorum.minActiveMembers}
                onChange={(value) =>
                  updateSection('quorum', 'minActiveMembers', Number(value))
                }
              />
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Judgement window</summary>
            <div className="linear-form__grid">
              <NumberField
                label="Hours before event"
                min={1}
                max={168}
                step="1"
                value={form.judgement.windowHoursBeforeEvent}
                onChange={(value) =>
                  updateSection('judgement', 'windowHoursBeforeEvent', Number(value))
                }
              />
              <NumberField
                label="Min hours after deck complete"
                min={0}
                max={168}
                step="1"
                value={form.judgement.minHoursAfterDeckComplete}
                onChange={(value) =>
                  updateSection('judgement', 'minHoursAfterDeckComplete', Number(value))
                }
              />
              <NumberField
                label="Consensus window (minutes)"
                min={30}
                max={720}
                step="1"
                value={form.judgement.consensusWindowMinutes}
                onChange={(value) =>
                  updateSection('judgement', 'consensusWindowMinutes', Number(value))
                }
              />
              <NumberField
                label="Swap reset bonus (minutes)"
                min={0}
                max={120}
                step="1"
                value={form.judgement.swapResetBonusMinutes}
                onChange={(value) =>
                  updateSection('judgement', 'swapResetBonusMinutes', Number(value))
                }
              />
              <NumberField
                label="Crew swap budget"
                min={0}
                max={5}
                step="1"
                value={form.judgement.crewSwapBudget}
                onChange={(value) =>
                  updateSection('judgement', 'crewSwapBudget', Number(value))
                }
              />
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Pick algorithm</summary>
            <div className="linear-form__grid">
              <label className="linear-field">
                <span className="linear-field__label">Algorithm</span>
                <select
                  className="linear-input"
                  value={form.pick.algorithm}
                  onChange={(e) => updateSection('pick', 'algorithm', e.target.value)}
                >
                  <option value="weighted_majority">weighted_majority</option>
                </select>
              </label>
              <NumberField
                label="Interested weight"
                min={0}
                max={10}
                step="0.1"
                value={form.pick.interestedWeight}
                onChange={(value) => updateSection('pick', 'interestedWeight', Number(value))}
              />
              <NumberField
                label="Registered weight"
                min={0}
                max={10}
                step="0.1"
                value={form.pick.registeredWeight}
                onChange={(value) => updateSection('pick', 'registeredWeight', Number(value))}
              />
              <label className="linear-field">
                <span className="linear-field__label">Tie break</span>
                <select
                  className="linear-input"
                  value={form.pick.tieBreak}
                  onChange={(e) => updateSection('pick', 'tieBreak', e.target.value)}
                >
                  <option value="most_registered_then_earliest_start">
                    most_registered_then_earliest_start
                  </option>
                </select>
              </label>
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Cross-crew surfacing</summary>
            <div className="linear-form__grid">
              <CheckboxField
                label="Enabled"
                checked={form.crossCrew.enabled}
                onChange={(value) => updateSection('crossCrew', 'enabled', value)}
              />
              <NumberField
                label="Min shared friends"
                min={0}
                max={50}
                step="1"
                value={form.crossCrew.minSharedFriends}
                onChange={(value) =>
                  updateSection('crossCrew', 'minSharedFriends', Number(value))
                }
              />
              <TextField
                label="Surface copy key"
                maxLength={64}
                value={form.crossCrew.surfaceCopyKey}
                onChange={(value) => updateSection('crossCrew', 'surfaceCopyKey', value)}
              />
            </div>
          </details>

          <details className="pivot-crew-config__group">
            <summary className="pivot-crew-config__group-title">Nudges</summary>
            <div className="linear-form__grid">
              <NumberField
                label="Solo create crew after weeks"
                min={0}
                max={52}
                step="1"
                value={form.nudges.soloCreateCrewAfterWeeks}
                onChange={(value) =>
                  updateSection('nudges', 'soloCreateCrewAfterWeeks', Number(value))
                }
              />
              <NumberField
                label="Unfinished swipe reminder (hours)"
                min={1}
                max={168}
                step="1"
                value={form.nudges.unfinishedSwipeReminderHours}
                onChange={(value) =>
                  updateSection('nudges', 'unfinishedSwipeReminderHours', Number(value))
                }
              />
            </div>
          </details>

          {validationError ? (
            <p className="pivot-referral__error">{validationError}</p>
          ) : null}

          <div className="linear-form__actions pivot-crew-config__actions">
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={() => setForm(cloneEffectiveConfig(mergePivotCrewConfig(storedOverrides)))}
              disabled={saving || resetting}
            >
              Revert edits
            </button>
            <button type="submit" className="linear-btn linear-btn--primary" disabled={saving || resetting}>
              Review JSON diff
            </button>
          </div>
        </form>
      </section>

      <PivotCrewConfigSaveModal
        isOpen={previewOpen}
        preview={preview}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setPreviewOpen(false);
            setPreview(null);
          }
        }}
        onConfirm={handleConfirmSave}
      />
    </>
  );
}

export default PivotCrewConfigPanel;
