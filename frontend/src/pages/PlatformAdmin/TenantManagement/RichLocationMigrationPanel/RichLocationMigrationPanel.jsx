import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest, useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import './RichLocationMigrationPanel.scss';

const UI_ENABLED = process.env.REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI === 'true';
const EMPTY_CONTROLS = {
  rollout: 'off',
  reads: false,
  writes: false,
  autocomplete: false,
  search: false,
};

function isoNow() {
  return new Date().toISOString();
}

function countsEntries(counts) {
  return Object.entries(counts || {}).filter(([, value]) => Number(value) !== 0);
}

function RunSummary({ result }) {
  if (!result) return null;
  return (
    <div className="rich-location-migration__summary" aria-live="polite">
      <div className="rich-location-migration__summary-head">
        <span className={`linear-badge linear-badge--${result.status === 'completed' ? 'active' : 'coming_soon'}`}>
          {String(result.status || '').replace(/_/g, ' ')}
        </span>
        <span>{result.dryRun ? 'Dry run' : 'Applied batch'}</span>
        <span>{result.scope}</span>
      </div>
      <div className="rich-location-migration__counts">
        {countsEntries(result.counts).map(([name, value]) => (
          <span key={name}><strong>{value}</strong> {name}</span>
        ))}
      </div>
      {result.items?.length ? (
        <details>
          <summary>Batch decisions ({result.items.length})</summary>
          <div className="rich-location-migration__items">
            {result.items.map((item) => (
              <div key={`${item.eventId}-${item.outcome}`}>
                <code>{item.eventId}</code>
                <span>{item.outcome}</span>
                <span>{item.reason || item.code || item.mode || ''}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function RunState({ label, run, lease }) {
  return (
    <div className="linear-stat">
      <span className="linear-stat__label">{label}</span>
      <span className="linear-stat__value">
        {lease ? `Running · ${lease.actor || 'platform admin'}` : run?.status?.replace(/_/g, ' ') || 'Not started'}
      </span>
      {run?.catalogAsOf ? (
        <span className="rich-location-migration__muted">
          Cutoff {new Date(run.catalogAsOf).toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}

function ReviewCard({ candidate, busy, onReview }) {
  const suggested = candidate.candidateMatches?.[0] || null;
  const [representation, setRepresentation] = useState(() =>
    JSON.stringify(suggested || candidate.richLocation || {}, null, 2));
  const submitCorrection = () => {
    try {
      onReview(candidate.eventId, 'correct_representation', JSON.parse(representation));
    } catch {
      onReview(candidate.eventId, 'invalid_json');
    }
  };

  return (
    <article className="rich-location-review">
      <div className="rich-location-review__head">
        <div>
          <strong>{candidate.name || 'Untitled event'}</strong>
          <p>{candidate.rawLocationText || candidate.legacyLocation || 'No location text'}</p>
        </div>
        <code>{candidate.eventId}</code>
      </div>
      <p className="rich-location-migration__muted">
        Reason: {candidate.review?.reason || 'manual review'}
      </p>
      <textarea
        className="linear-input rich-location-review__json"
        value={representation}
        onChange={(event) => setRepresentation(event.target.value)}
        rows={8}
        aria-label={`Rich location representation for ${candidate.name || candidate.eventId}`}
      />
      <div className="linear-detail__actions">
        {suggested ? (
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            disabled={busy}
            onClick={() => onReview(candidate.eventId, 'select_match', suggested)}
          >
            Approve candidate
          </button>
        ) : null}
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={busy}
          onClick={submitCorrection}
        >
          Save correction
        </button>
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          disabled={busy}
          onClick={() => onReview(candidate.eventId, 'reject_match')}
        >
          Reject match
        </button>
      </div>
    </article>
  );
}

export default function RichLocationMigrationPanel({ tenant, onTenantUpdated }) {
  const { addNotification } = useNotification();
  const baseUrl = `/admin/platform/tenants/${tenant.tenantKey}/rich-location-migration`;
  const enabled = UI_ENABLED && tenant.tenantType === 'pivot';
  const statusQuery = useFetch(enabled ? baseUrl : null, { cache: { enabled: false } });
  const reviewsQuery = useFetch(enabled ? `${baseUrl}/reviews` : null, {
    params: { status: 'needs_review', limit: 200 },
    cache: { enabled: false },
  });
  const status = statusQuery.data?.success ? statusQuery.data.data : null;
  const reviews = reviewsQuery.data?.success ? reviewsQuery.data.data?.candidates || [] : [];
  const [scope, setScope] = useState('live');
  const [asOf, setAsOf] = useState(isoNow);
  const [batchSize, setBatchSize] = useState(25);
  const [maxProviderOperations, setMaxProviderOperations] = useState(25);
  const [minIntervalMs, setMinIntervalMs] = useState(100);
  const [autoApplyConfidence, setAutoApplyConfidence] = useState(0.9);
  const [reviewConfidence, setReviewConfidence] = useState(0.6);
  const [confirmLiveStable, setConfirmLiveStable] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [constraintsText, setConstraintsText] = useState('{}');
  const [controls, setControls] = useState(EMPTY_CONTROLS);
  const [running, setRunning] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (!status) return;
    setConstraintsText(JSON.stringify(status.constraints || {}, null, 2));
    setControls({ ...EMPTY_CONTROLS, ...(status.configuredControls || {}) });
  }, [status]);

  const lockedCutoff = useMemo(() => {
    const selected = status?.runs?.[scope]?.catalogAsOf;
    if (selected) return new Date(selected).toISOString();
    if (scope === 'historical' && status?.runs?.live?.catalogAsOf) {
      return new Date(status.runs.live.catalogAsOf).toISOString();
    }
    return null;
  }, [scope, status]);

  useEffect(() => {
    if (lockedCutoff) setAsOf(lockedCutoff);
  }, [lockedCutoff]);

  if (!enabled) return null;

  const notifyError = (title, message) => addNotification({
    title,
    message: message || 'Request failed',
    type: 'error',
  });

  const refresh = () => {
    statusQuery.refetch();
    reviewsQuery.refetch();
    onTenantUpdated?.();
  };

  const saveConfig = async (nextControls = controls) => {
    let constraints;
    try {
      constraints = JSON.parse(constraintsText);
    } catch {
      notifyError('Invalid constraints', 'Constraints must be valid JSON.');
      return;
    }
    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(
      `/admin/platform/tenants/${tenant.tenantKey}`,
      {
        method: 'PUT',
        data: { richLocationConstraints: constraints, richLocationControls: nextControls },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSavingConfig(false);
    if (error || !data?.success) {
      notifyError('Configuration failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Configuration saved', message: tenant.tenantKey, type: 'success' });
    refresh();
  };

  const disableRollout = async () => {
    const disabled = { ...EMPTY_CONTROLS };
    setControls(disabled);
    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(
      `/admin/platform/tenants/${tenant.tenantKey}`,
      {
        method: 'PUT',
        data: { richLocationControls: disabled },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSavingConfig(false);
    if (error || !data?.success) {
      notifyError('Disable rollout failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Rollout disabled', message: tenant.tenantKey, type: 'success' });
    refresh();
  };

  const runBatch = async (apply) => {
    setRunning(true);
    const { data, error } = await authenticatedRequest(`${baseUrl}/run`, {
      method: 'POST',
      data: {
        scope,
        apply,
        asOf,
        batchSize: Number(batchSize),
        maxProviderOperations: Number(maxProviderOperations),
        minIntervalMs: Number(minIntervalMs),
        autoApplyConfidence: Number(autoApplyConfidence),
        reviewConfidence: Number(reviewConfidence),
        confirmLiveStable,
        confirmTenantKey: confirmation,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    setRunning(false);
    if (error || !data?.success) {
      notifyError(apply ? 'Applied batch failed' : 'Dry run failed', data?.message || error);
      return;
    }
    setLastResult(data.data);
    addNotification({
      title: apply ? 'Batch applied' : 'Dry run complete',
      message: `${data.data.counts?.scanned || 0} events scanned · ${data.data.status}`,
      type: 'success',
    });
    refresh();
  };

  const reviewCandidate = async (eventId, action, richLocation) => {
    if (action === 'invalid_json') {
      notifyError('Invalid representation', 'The rich-location representation must be valid JSON.');
      return;
    }
    setReviewingId(eventId);
    const { data, error } = await authenticatedRequest(`${baseUrl}/reviews/${eventId}`, {
      method: 'POST',
      data: {
        action,
        ...(richLocation !== undefined ? { richLocation } : {}),
      },
      headers: { 'Content-Type': 'application/json' },
    });
    setReviewingId(null);
    if (error || !data?.success) {
      notifyError('Review failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Review saved', message: candidateName(eventId), type: 'success' });
    refresh();
  };

  const candidateName = (eventId) =>
    reviews.find((candidate) => candidate.eventId === eventId)?.name || eventId;

  const cutoffIsLocked = Boolean(lockedCutoff);
  const canApply = confirmation.trim().toLowerCase() === tenant.tenantKey;

  return (
    <section className="tenant-detail__section rich-location-migration" aria-label="Rich location migration">
      <div className="rich-location-migration__title-row">
        <div>
          <h3 className="linear-section__title">Rich location migration</h3>
          <p className="tenant-detail__pivot-ops-copy">
            Temporary operator interface. Every request processes one bounded batch.
          </p>
        </div>
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          onClick={refresh}
          disabled={statusQuery.loading || running}
        >
          <Icon icon="mdi:refresh" /> Refresh
        </button>
      </div>

      {statusQuery.error ? (
        <p className="linear-admin__error">{statusQuery.error}</p>
      ) : null}

      <div className="linear-detail__stats">
        <RunState label="Live catalog" run={status?.runs?.live} lease={status?.leases?.live} />
        <RunState label="Historical catalog" run={status?.runs?.historical} lease={status?.leases?.historical} />
        <div className="linear-stat">
          <span className="linear-stat__label">Google provider</span>
          <span className={`linear-stat__value ${status?.providerConfigured ? 'is-ok' : 'is-error'}`}>
            {status?.providerConfigured ? 'Configured' : 'Not configured'}
          </span>
        </div>
        <div className="linear-stat">
          <span className="linear-stat__label">Needs review</span>
          <span className="linear-stat__value">{status?.needsReview ?? '—'}</span>
        </div>
      </div>

      <details open>
        <summary>City configuration</summary>
        <div className="rich-location-migration__configuration">
          <label className="linear-field rich-location-migration__constraints">
            <span className="linear-field__label">Constraints JSON</span>
            <textarea
              className="linear-input"
              rows={7}
              value={constraintsText}
              onChange={(event) => setConstraintsText(event.target.value)}
            />
          </label>
          <div className="rich-location-migration__controls">
            <label className="linear-field">
              <span className="linear-field__label">Rollout</span>
              <select
                className="linear-input"
                value={controls.rollout}
                onChange={(event) => setControls((value) => ({ ...value, rollout: event.target.value }))}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            {['reads', 'writes', 'autocomplete', 'search'].map((capability) => (
              <label key={capability} className="rich-location-migration__checkbox">
                <input
                  type="checkbox"
                  checked={controls[capability]}
                  onChange={(event) => setControls((value) => ({
                    ...value,
                    [capability]: event.target.checked,
                  }))}
                />
                {capability}
              </label>
            ))}
          </div>
        </div>
        <div className="linear-detail__actions">
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            disabled={savingConfig}
            onClick={() => saveConfig()}
          >
            Save configuration
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            disabled={savingConfig}
            onClick={disableRollout}
          >
            Disable rollout
          </button>
        </div>
      </details>

      <details open>
        <summary>Run a batch</summary>
        <div className="linear-form__grid rich-location-migration__run-form">
          <label className="linear-field">
            <span className="linear-field__label">Scope</span>
            <select className="linear-input" value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="live">Live</option>
              <option value="historical">Historical</option>
            </select>
          </label>
          <label className="linear-field rich-location-migration__cutoff">
            <span className="linear-field__label">Catalog cutoff (ISO)</span>
            <input
              className="linear-input"
              value={asOf}
              readOnly={cutoffIsLocked}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Batch size</span>
            <input className="linear-input" type="number" min="1" max="50" value={batchSize} onChange={(event) => setBatchSize(event.target.value)} />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Provider operations</span>
            <input className="linear-input" type="number" min="0" max={batchSize || 50} value={maxProviderOperations} onChange={(event) => setMaxProviderOperations(event.target.value)} />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Pacing (ms)</span>
            <input className="linear-input" type="number" min="0" max="5000" value={minIntervalMs} onChange={(event) => setMinIntervalMs(event.target.value)} />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Auto-apply confidence</span>
            <input className="linear-input" type="number" min="0" max="1" step="0.05" value={autoApplyConfidence} onChange={(event) => setAutoApplyConfidence(event.target.value)} />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Review confidence</span>
            <input className="linear-input" type="number" min="0" max={autoApplyConfidence || 1} step="0.05" value={reviewConfidence} onChange={(event) => setReviewConfidence(event.target.value)} />
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Type tenant key to apply</span>
            <input className="linear-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={tenant.tenantKey} />
          </label>
        </div>
        {scope === 'historical' ? (
          <label className="rich-location-migration__checkbox rich-location-migration__historical-confirm">
            <input type="checkbox" checked={confirmLiveStable} onChange={(event) => setConfirmLiveStable(event.target.checked)} />
            I confirm the live catalog backfill is complete and stable.
          </label>
        ) : null}
        <div className="linear-detail__actions">
          <button type="button" className="linear-btn linear-btn--secondary" disabled={running} onClick={() => runBatch(false)}>
            {running ? 'Running…' : 'Dry run next batch'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            disabled={running || !canApply || (scope === 'historical' && !confirmLiveStable)}
            onClick={() => runBatch(true)}
          >
            {running ? 'Running…' : 'Apply next batch'}
          </button>
        </div>
        <RunSummary result={lastResult} />
      </details>

      <details>
        <summary>Review queue ({reviews.length})</summary>
        {reviewsQuery.error ? <p className="linear-admin__error">{reviewsQuery.error}</p> : null}
        {reviews.length ? reviews.map((candidate) => (
          <ReviewCard
            key={candidate.eventId}
            candidate={candidate}
            busy={reviewingId === candidate.eventId}
            onReview={reviewCandidate}
          />
        )) : <p className="rich-location-migration__muted">No events currently need review.</p>}
      </details>
    </section>
  );
}

export { UI_ENABLED, EMPTY_CONTROLS, countsEntries };
