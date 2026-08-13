import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import { PivotOpsSection } from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import {
  DROP_DECK_SCORE_FORMULA,
  buildDeckConfigSavePreview,
  countStoredOverrides,
  formatJsonDiff,
  mergePivotDeckConfig,
  validateEffectiveDeckConfig,
} from './pivotDeckConfigUtils';
import PivotTenantDropDeckInspector from './PivotTenantDropDeckInspector';
import './PivotTenantDropDeckPage.scss';
import './PivotTenantPage.scss';

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function NumberField({ label, hint, value, onChange, min, max, step = 'any' }) {
  return (
    <label className="pivot-drop-deck__field">
      <span className="pivot-drop-deck__label">{label}</span>
      <input
        className="pivot-drop-deck__input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <span className="pivot-drop-deck__hint">{hint}</span> : null}
    </label>
  );
}

function PivotTenantDropDeckPage({
  tenantKey,
  cityDisplayName,
  storedOverrides,
  onSaved,
}) {
  const { addNotification } = useNotification();
  const [form, setForm] = useState(() => mergePivotDeckConfig(storedOverrides));
  const [validationError, setValidationError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setForm(mergePivotDeckConfig(storedOverrides));
    setValidationError('');
    setPreviewOpen(false);
    setPreview(null);
  }, [storedOverrides, tenantKey]);

  const overrideCount = useMemo(
    () => countStoredOverrides(storedOverrides),
    [storedOverrides],
  );

  const diffLines = useMemo(() => {
    if (!preview) return [];
    return formatJsonDiff(preview.beforeEffective, preview.afterEffective);
  }, [preview]);

  const updateField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError('');
  }, []);

  const updateWeight = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      weights: {
        ...prev.weights,
        [field]: value,
      },
    }));
    setValidationError('');
  }, []);

  const handleResetDefaults = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset drop-deck scoring to shipped defaults for this city? Stored overrides will be removed. Already-frozen user decks stay until an admin refresh.',
    );
    if (!confirmed) return;

    setResetting(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}`,
      {
        method: 'PUT',
        data: { pivotDeckConfig: null },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setResetting(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Reset failed',
        message: res?.message || reqError || 'Unable to reset drop deck config',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Drop deck reset',
      message: `${tenantKey} now uses shipped defaults`,
      type: 'success',
    });
    onSaved?.();
  }, [addNotification, onSaved, tenantKey]);

  const handleReviewSave = useCallback(
    (event) => {
      event.preventDefault();
      const validation = validateEffectiveDeckConfig(form);
      if (validation.error) {
        setValidationError(validation.error);
        return;
      }

      const nextPreview = buildDeckConfigSavePreview(storedOverrides, form);
      if (!nextPreview.hasChanges) {
        addNotification({
          title: 'No changes',
          message: 'Drop deck config already matches your edits.',
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
        ? { pivotDeckConfig: preview.storedPatch }
        : { pivotDeckConfig: null };

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
        message: res?.message || reqError || 'Unable to save drop deck config',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Drop deck saved',
      message: `${tenantKey} overrides updated — new decks pick this up within a minute. Frozen decks stay until refresh.`,
      type: 'success',
    });
    setPreviewOpen(false);
    setPreview(null);
    onSaved?.();
  }, [addNotification, onSaved, preview, tenantKey]);

  return (
    <PivotTenantPage
      title="Drop deck"
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      className="pivot-drop-deck"
    >
      <PivotTenantDropDeckInspector tenantKey={tenantKey} />

      <form onSubmit={handleReviewSave}>
        <PivotOpsSection
          titleId="pivot-drop-deck-length"
          title="Length"
          description={
            overrideCount
              ? `${overrideCount} override${overrideCount === 1 ? '' : 's'} stored. Soft max ${form.softMax}, hard max ${form.hardMax}.`
              : `Using shipped defaults. Soft max ${form.softMax}, hard max ${form.hardMax}.`
          }
          actions={
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm"
              onClick={handleResetDefaults}
              disabled={resetting || saving || overrideCount === 0}
            >
              <Icon icon="mdi:backup-restore" />
              {resetting ? 'Resetting…' : 'Reset to defaults'}
            </button>
          }
        >
          <div className="pivot-drop-deck__grid">
            <NumberField
              label="Soft max"
              hint="Take the top N scored cards. Do not pad if the week is thinner."
              min={1}
              max={40}
              step="1"
              value={form.softMax}
              onChange={(value) => updateField('softMax', Number(value))}
            />
            <NumberField
              label="Hard max"
              hint="Never return more than this, even in a strong batch."
              min={1}
              max={40}
              step="1"
              value={form.hardMax}
              onChange={(value) => updateField('hardMax', Number(value))}
            />
            <NumberField
              label="Leeway ratio"
              hint="Keep extra cards while score ≥ Nth × this ratio."
              min={0}
              max={1}
              step="0.01"
              value={form.leewayRatio}
              onChange={(value) => updateField('leewayRatio', Number(value))}
            />
            <NumberField
              label="High-score floor"
              hint="Extras also need at least this score (one personal tag is 0.7 by default)."
              min={0}
              max={5}
              step="0.05"
              value={form.highScoreFloor}
              onChange={(value) => updateField('highScoreFloor', Number(value))}
            />
          </div>
        </PivotOpsSection>

        <PivotOpsSection
          titleId="pivot-drop-deck-weights"
          title="Score weights"
          description="Each eligible published event is scored for the user; the deck is the top N. No reserved mix buckets."
        >
          <div className="pivot-drop-deck__grid">
            <NumberField
              label="Friend going"
              hint="Added per friend registered. Default 1.5 keeps shared plans in the deck."
              min={0}
              max={5}
              step="0.05"
              value={form.weights.friendGoing}
              onChange={(value) => updateWeight('friendGoing', Number(value))}
            />
            <NumberField
              label="Friend interested"
              min={0}
              max={5}
              step="0.05"
              value={form.weights.friendInterested}
              onChange={(value) => updateWeight('friendInterested', Number(value))}
            />
            <NumberField
              label="Personal interest"
              hint="0–1, multiplied by matching catalog tags."
              min={0}
              max={1}
              step="0.01"
              value={form.weights.personalInterest}
              onChange={(value) => updateWeight('personalInterest', Number(value))}
            />
            <NumberField
              label="Crew signal"
              hint="0–1, multiplied by (1.5 × crew going + crew interested)."
              min={0}
              max={1}
              step="0.01"
              value={form.weights.crewSignal}
              onChange={(value) => updateWeight('crewSignal', Number(value))}
            />
            <NumberField
              label="Negative tag"
              hint="Subtracted per tag shared with events the user rated under 3. Can drop a card out of the deck."
              min={0}
              max={5}
              step="0.05"
              value={form.weights.negativeTag}
              onChange={(value) => updateWeight('negativeTag', Number(value))}
            />
          </div>
        </PivotOpsSection>

        <PivotOpsSection
          titleId="pivot-drop-deck-formula"
          title="Score formula"
          description="Crew interest bleed still comes from crew config, not these knobs."
        >
          <pre className="pivot-drop-deck__formula">{DROP_DECK_SCORE_FORMULA}</pre>
        </PivotOpsSection>

        {validationError ? (
          <p className="pivot-drop-deck__error" role="alert">
            {validationError}
          </p>
        ) : null}

        <div className="pivot-drop-deck__actions">
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => setForm(cloneConfig(mergePivotDeckConfig(storedOverrides)))}
            disabled={saving || resetting}
          >
            Discard edits
          </button>
          <button
            type="submit"
            className="linear-btn linear-btn--primary"
            disabled={saving || resetting}
          >
            Review and save
          </button>
        </div>
      </form>

      <Popup
        isOpen={previewOpen}
        onClose={() => {
          if (!saving) {
            setPreviewOpen(false);
          }
        }}
        customClassName="pivot-drop-deck-save-modal"
        disableOutsideClick={saving}
      >
        {preview ? (
          <div className="pivot-drop-deck-save-modal__body">
            <h2 className="pivot-drop-deck-save-modal__title">Review drop deck changes</h2>
            <p className="pivot-drop-deck-save-modal__lead">
              Stored tenant overrides will be replaced with the sparse patch below. New user decks
              pick this up within about a minute; already-frozen decks stay until an admin refresh.
            </p>
            <div className="pivot-drop-deck-save-modal__section">
              <h3 className="pivot-drop-deck-save-modal__section-title">Stored override patch</h3>
              <pre className="pivot-drop-deck-save-modal__json">
                {JSON.stringify(preview.storedPatch, null, 2)}
              </pre>
            </div>
            <div className="pivot-drop-deck-save-modal__section">
              <h3 className="pivot-drop-deck-save-modal__section-title">Effective config diff</h3>
              <pre className="pivot-drop-deck-save-modal__diff">
                {diffLines.map((line, index) => (
                  <span
                    key={`${line.type}-${index}`}
                    className={`pivot-drop-deck-save-modal__diff-line pivot-drop-deck-save-modal__diff-line--${line.type}`}
                  >
                    {line.text}
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
            <footer className="pivot-drop-deck-save-modal__footer">
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={() => setPreviewOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                onClick={handleConfirmSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save drop deck'}
              </button>
            </footer>
          </div>
        ) : null}
      </Popup>
    </PivotTenantPage>
  );
}

export default PivotTenantDropDeckPage;
