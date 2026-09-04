import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsBanner,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import './PivotTenantLocationMigrationPage.scss';

const RICH_LOCATION_MIGRATION_UI_ENABLED =
  process.env.REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI === 'true';

const EMPTY_CONTROLS = {
  rollout: 'off',
  reads: false,
  writes: false,
  autocomplete: false,
  search: false,
};

const CONTROL_OPTIONS = [
  {
    key: 'reads',
    label: 'Rich location reads',
    description: 'Return structured locations to authorized clients.',
  },
  {
    key: 'autocomplete',
    label: 'Creator suggestions',
    description: 'Show provider-backed suggestions while creators type.',
  },
  {
    key: 'writes',
    label: 'Structured saves',
    description: 'Allow creators and admins to save rich locations.',
  },
  {
    key: 'search',
    label: 'Search metadata',
    description: 'Use structured location fields in discovery and search.',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function displayStatus(value) {
  return String(value || 'not_started').replace(/_/g, ' ');
}

function statusTone(value) {
  if (value === 'completed') return 'ok';
  if (value === 'failed' || value === 'blocked') return 'danger';
  if (value === 'running' || value === 'in_progress') return 'info';
  return 'muted';
}

function formatDate(value) {
  if (!value) return 'Not locked';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function constraintFields(constraints) {
  const hasBounds = Boolean(constraints?.bounds);
  return {
    mode: hasBounds ? 'bounds' : 'radius',
    countryCode: constraints?.countryCode || '',
    north: constraints?.bounds?.north ?? '',
    south: constraints?.bounds?.south ?? '',
    east: constraints?.bounds?.east ?? '',
    west: constraints?.bounds?.west ?? '',
    latitude: constraints?.center?.latitude ?? '',
    longitude: constraints?.center?.longitude ?? '',
    radiusKm: constraints?.radiusKm ?? '',
  };
}

function numberField(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildConstraints(fields) {
  const countryCode = fields.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Country must be a two-letter ISO code, such as US.');
  }

  if (fields.mode === 'bounds') {
    const bounds = {
      north: numberField(fields.north),
      south: numberField(fields.south),
      east: numberField(fields.east),
      west: numberField(fields.west),
    };
    if (Object.values(bounds).some((value) => value === null)) {
      throw new Error('All four boundary coordinates are required.');
    }
    if (bounds.south > bounds.north) {
      throw new Error('South must be less than or equal to north.');
    }
    return { countryCode, bounds };
  }

  const center = {
    latitude: numberField(fields.latitude),
    longitude: numberField(fields.longitude),
  };
  const radiusKm = numberField(fields.radiusKm);
  if (center.latitude === null || center.longitude === null || radiusKm === null) {
    throw new Error('Center latitude, longitude, and radius are required.');
  }
  if (radiusKm <= 0 || radiusKm > 500) {
    throw new Error('Radius must be greater than 0 and no more than 500 km.');
  }
  return { countryCode, center, radiusKm };
}

function outcomeCount(counts, ...keys) {
  return keys.reduce((total, key) => total + Number(counts?.[key] || 0), 0);
}

function RunStateCard({ label, run, lease, active, onSelect }) {
  const runStatus = lease ? 'running' : run?.status;
  return (
    <button
      type="button"
      className={`pivot-location-migration__scope${active ? ' is-active' : ''}`}
      data-scope={label.toLowerCase()}
      onClick={onSelect}
    >
      <span className="pivot-location-migration__scope-head">
        <strong>{label}</strong>
        <PivotOpsStatus tone={statusTone(runStatus)}>{displayStatus(runStatus)}</PivotOpsStatus>
      </span>
      <span>{lease ? `Locked by ${lease.actor || 'another operator'}` : formatDate(run?.catalogAsOf)}</span>
      <small>{Number(run?.cumulativeCounts?.scanned || 0).toLocaleString()} scanned</small>
    </button>
  );
}

function ReviewInspector({ candidate, busy, onReview }) {
  const suggested = candidate?.candidateMatches?.[0] || null;
  const [representation, setRepresentation] = useState('{}');

  useEffect(() => {
    setRepresentation(JSON.stringify(suggested || candidate?.richLocation || {}, null, 2));
  }, [candidate, suggested]);

  if (!candidate) {
    return (
      <div className="pivot-location-migration__review-empty">
        Select an event to inspect its candidate representation.
      </div>
    );
  }

  const saveCorrection = () => {
    try {
      onReview(candidate.eventId, 'correct_representation', JSON.parse(representation));
    } catch {
      onReview(candidate.eventId, 'invalid_json');
    }
  };

  return (
    <aside className="pivot-location-migration__inspector">
      <div className="pivot-location-migration__inspector-head">
        <div>
          <strong>{candidate.name || 'Untitled event'}</strong>
          <span>{candidate.rawLocationText || candidate.legacyLocation || 'No location text'}</span>
        </div>
        <PivotOpsStatus tone="warn">{candidate.review?.reason || 'manual review'}</PivotOpsStatus>
      </div>
      <label className="pivot-location-migration__field">
        <span>Rich location representation</span>
        <textarea
          className="linear-input pivot-location-migration__json"
          aria-label="Rich location representation"
          rows={12}
          value={representation}
          onChange={(event) => setRepresentation(event.target.value)}
        />
      </label>
      <div className="pivot-location-migration__actions">
        {suggested ? (
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            disabled={busy}
            onClick={() => onReview(candidate.eventId, 'select_match', suggested)}
          >
            Approve top match
          </button>
        ) : null}
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={busy}
          onClick={saveCorrection}
        >
          Save correction
        </button>
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          disabled={busy}
          onClick={() => onReview(candidate.eventId, 'reject_match')}
        >
          Reject
        </button>
      </div>
    </aside>
  );
}

export default function PivotTenantLocationMigrationPage({
  tenantKey,
  cityDisplayName,
  onTenantUpdated,
}) {
  const { addNotification } = useNotification();
  const baseUrl = `/admin/platform/tenants/${tenantKey}/rich-location-migration`;
  const statusQuery = useFetch(RICH_LOCATION_MIGRATION_UI_ENABLED ? baseUrl : null, {
    cache: { enabled: false },
  });
  const reviewsQuery = useFetch(
    RICH_LOCATION_MIGRATION_UI_ENABLED ? `${baseUrl}/reviews` : null,
    { params: { status: 'needs_review', limit: 200 }, cache: { enabled: false } },
  );
  const status = statusQuery.data?.success ? statusQuery.data.data : null;
  const reviews = useMemo(
    () => (reviewsQuery.data?.success ? reviewsQuery.data.data?.candidates || [] : []),
    [reviewsQuery.data],
  );

  const [scope, setScope] = useState('live');
  const [asOf, setAsOf] = useState(nowIso);
  const [batchSize, setBatchSize] = useState(25);
  const [maxProviderOperations, setMaxProviderOperations] = useState(25);
  const [minIntervalMs, setMinIntervalMs] = useState(100);
  const [autoApplyConfidence, setAutoApplyConfidence] = useState(0.9);
  const [reviewConfidence, setReviewConfidence] = useState(0.6);
  const [confirmLiveStable, setConfirmLiveStable] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [constraints, setConstraints] = useState(() => constraintFields(null));
  const [controls, setControls] = useState(EMPTY_CONTROLS);
  const [running, setRunning] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (!status) return;
    setConstraints(constraintFields(status.constraints));
    setControls({ ...EMPTY_CONTROLS, ...(status.configuredControls || {}) });
  }, [status]);

  useEffect(() => {
    if (!reviews.length) {
      setSelectedReviewId(null);
      return;
    }
    if (!reviews.some((candidate) => candidate.eventId === selectedReviewId)) {
      setSelectedReviewId(reviews[0].eventId);
    }
  }, [reviews, selectedReviewId]);

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

  const selectedReview =
    reviews.find((candidate) => candidate.eventId === selectedReviewId) || null;
  const selectedRun = status?.runs?.[scope] || null;
  const cumulative = selectedRun?.cumulativeCounts || {};
  const activeLease = status?.leases?.[scope] || null;
  const hasConstraints = Boolean(
    status?.constraints?.countryCode &&
      (status?.constraints?.bounds || status?.constraints?.center),
  );
  const canApply = confirmation.trim().toLowerCase() === tenantKey.toLowerCase();
  const providerFailures = outcomeCount(
    lastResult?.counts,
    'providerFailures',
    'providerFailure',
    'provider_failed',
  );

  const notifyError = (title, message) =>
    addNotification({ title, message: message || 'Request failed', type: 'error' });

  const refresh = () => {
    statusQuery.refetch();
    reviewsQuery.refetch();
    onTenantUpdated?.();
  };

  const saveConfiguration = async () => {
    let richLocationConstraints;
    try {
      richLocationConstraints = buildConstraints(constraints);
    } catch (error) {
      notifyError('Invalid city boundary', error.message);
      return;
    }

    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}`,
      {
        method: 'PUT',
        data: { richLocationConstraints, richLocationControls: controls },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSavingConfig(false);
    if (error || !data?.success) {
      notifyError('Configuration failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Migration configuration saved', message: tenantKey, type: 'success' });
    refresh();
  };

  const disableRollout = async () => {
    const disabled = { ...EMPTY_CONTROLS };
    setControls(disabled);
    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}`,
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
    addNotification({ title: 'Rich location rollout disabled', message: tenantKey, type: 'success' });
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
      message: `${data.data.counts?.scanned || 0} events scanned · ${displayStatus(data.data.status)}`,
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
      data: { action, ...(richLocation !== undefined ? { richLocation } : {}) },
      headers: { 'Content-Type': 'application/json' },
    });
    setReviewingId(null);
    if (error || !data?.success) {
      notifyError('Review failed', data?.message || error);
      return;
    }
    const name = reviews.find((candidate) => candidate.eventId === eventId)?.name || eventId;
    addNotification({ title: 'Review saved', message: name, type: 'success' });
    refresh();
  };

  if (!RICH_LOCATION_MIGRATION_UI_ENABLED) return null;

  return (
    <PivotTenantPage
      title="Location migration"
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      className="pivot-location-migration"
      actions={(
        <>
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm"
            onClick={refresh}
            disabled={statusQuery.loading || running}
          >
            <Icon icon="mdi:refresh" /> Refresh
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            onClick={disableRollout}
            disabled={savingConfig}
          >
            Disable rollout
          </button>
        </>
      )}
    >
      {statusQuery.error ? (
        <PivotOpsBanner tone="danger" title="Migration status unavailable" role="alert">
          {String(statusQuery.error)}
        </PivotOpsBanner>
      ) : null}

      <div className="pivot-location-migration__steps" aria-label="Migration workflow">
        {[
          ['1', 'Configure', hasConstraints],
          ['2', 'Dry run', Boolean(lastResult?.dryRun)],
          ['3', 'Apply batches', status?.runs?.live?.status === 'completed'],
          ['4', 'Review & roll out', controls.rollout === 'on'],
        ].map(([number, label, complete]) => (
          <div key={number} className={`pivot-location-migration__step${complete ? ' is-complete' : ''}`}>
            <span>{complete ? <Icon icon="mdi:check" /> : number}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      {!status?.providerConfigured ? (
        <PivotOpsBanner tone="danger" title="Google provider is not configured" role="alert">
          Set the server-side API key before running a batch. Rollout can remain off while you configure the city.
        </PivotOpsBanner>
      ) : !hasConstraints ? (
        <PivotOpsBanner tone="warn" title="City boundary required">
          Define and save the tenant boundary before running the migration.
        </PivotOpsBanner>
      ) : null}

      <PivotOpsMetricGrid className="pivot-location-migration__metrics">
        <PivotOpsMetric
          label="Live catalog"
          value={displayStatus(status?.leases?.live ? 'running' : status?.runs?.live?.status)}
          hint={`${Number(status?.runs?.live?.cumulativeCounts?.scanned || 0).toLocaleString()} scanned`}
        />
        <PivotOpsMetric
          label="Historical catalog"
          value={displayStatus(status?.leases?.historical ? 'running' : status?.runs?.historical?.status)}
          hint={`${Number(status?.runs?.historical?.cumulativeCounts?.scanned || 0).toLocaleString()} scanned`}
        />
        <PivotOpsMetric
          label="Needs review"
          value={Number(status?.needsReview || 0).toLocaleString()}
          hint={`${reviews.length} loaded in queue`}
        />
        <PivotOpsMetric
          label="Rollout"
          value={controls.rollout === 'on' ? 'On' : 'Off'}
          hint={`${CONTROL_OPTIONS.filter(({ key }) => controls[key]).length} of 4 capabilities enabled`}
        />
      </PivotOpsMetricGrid>

      <div className="pivot-location-migration__workspace">
        <main>
          <PivotOpsSection
            title="Run migration"
            description="Process one bounded batch. Dry runs never write event data or advance the checkpoint."
          >
            <div className="pivot-location-migration__scopes">
              <RunStateCard
                label="Live"
                run={status?.runs?.live}
                lease={status?.leases?.live}
                active={scope === 'live'}
                onSelect={() => setScope('live')}
              />
              <RunStateCard
                label="Historical"
                run={status?.runs?.historical}
                lease={status?.leases?.historical}
                active={scope === 'historical'}
                onSelect={() => setScope('historical')}
              />
            </div>

            <div className="pivot-location-migration__run-grid">
              <label className="pivot-location-migration__field pivot-location-migration__field--wide">
                <span>Catalog cutoff</span>
                <input
                  className="linear-input"
                  value={asOf}
                  readOnly={Boolean(lockedCutoff)}
                  onChange={(event) => setAsOf(event.target.value)}
                />
                <small>{lockedCutoff ? 'Locked by the first applied batch.' : 'Snapshot time for this migration.'}</small>
              </label>
              <label className="pivot-location-migration__field">
                <span>Batch size</span>
                <input
                  className="linear-input"
                  type="number"
                  min="1"
                  max="50"
                  value={batchSize}
                  onChange={(event) => setBatchSize(event.target.value)}
                />
              </label>
              <label className="pivot-location-migration__field">
                <span>Provider calls</span>
                <input
                  className="linear-input"
                  type="number"
                  min="0"
                  max={batchSize || 50}
                  value={maxProviderOperations}
                  onChange={(event) => setMaxProviderOperations(event.target.value)}
                />
              </label>
              <label className="pivot-location-migration__field">
                <span>Pacing (ms)</span>
                <input
                  className="linear-input"
                  type="number"
                  min="0"
                  max="5000"
                  value={minIntervalMs}
                  onChange={(event) => setMinIntervalMs(event.target.value)}
                />
              </label>
              <label className="pivot-location-migration__field">
                <span>Auto-apply at</span>
                <input
                  className="linear-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={autoApplyConfidence}
                  onChange={(event) => setAutoApplyConfidence(event.target.value)}
                />
              </label>
              <label className="pivot-location-migration__field">
                <span>Review at</span>
                <input
                  className="linear-input"
                  type="number"
                  min="0"
                  max={autoApplyConfidence || 1}
                  step="0.05"
                  value={reviewConfidence}
                  onChange={(event) => setReviewConfidence(event.target.value)}
                />
              </label>
              <label className="pivot-location-migration__field">
                <span>Type “{tenantKey}” to apply</span>
                <input
                  className="linear-input"
                  aria-label={`Type ${tenantKey} to apply`}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={tenantKey}
                />
              </label>
            </div>

            {scope === 'historical' ? (
              <label className="pivot-location-migration__confirm">
                <input
                  type="checkbox"
                  checked={confirmLiveStable}
                  onChange={(event) => setConfirmLiveStable(event.target.checked)}
                />
                I confirm the live catalog backfill is complete and stable.
              </label>
            ) : null}

            <div className="pivot-location-migration__run-footer">
              <div className="pivot-location-migration__run-totals">
                <span><strong>{Number(cumulative.scanned || 0).toLocaleString()}</strong> scanned</span>
                <span><strong>{Number(cumulative.applied || 0).toLocaleString()}</strong> applied</span>
                <span><strong>{Number(cumulative.needsReview || 0).toLocaleString()}</strong> review</span>
              </div>
              <div className="pivot-location-migration__actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  disabled={running || Boolean(activeLease) || !hasConstraints}
                  onClick={() => runBatch(false)}
                >
                  {running ? 'Running…' : 'Dry run next batch'}
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--primary"
                  disabled={
                    running ||
                    Boolean(activeLease) ||
                    !canApply ||
                    !hasConstraints ||
                    (scope === 'historical' && !confirmLiveStable)
                  }
                  onClick={() => runBatch(true)}
                >
                  {running ? 'Running…' : 'Apply next batch'}
                </button>
              </div>
            </div>

            {lastResult ? (
              <div className="pivot-location-migration__result" aria-live="polite">
                <div className="pivot-location-migration__result-head">
                  <div>
                    <strong>{lastResult.dryRun ? 'Dry run' : 'Applied batch'} · {lastResult.scope}</strong>
                    <span>{lastResult.items?.length || 0} decisions returned</span>
                  </div>
                  <PivotOpsStatus tone={statusTone(lastResult.status)}>{displayStatus(lastResult.status)}</PivotOpsStatus>
                </div>
                {providerFailures > 0 ? (
                  <PivotOpsBanner tone="danger" title={`${providerFailures} provider failures`} role="alert">
                    Inspect the decision codes below before applying another batch.
                  </PivotOpsBanner>
                ) : null}
                <div className="pivot-location-migration__result-counts">
                  {Object.entries(lastResult.counts || {}).map(([name, value]) => (
                    <span key={name}><strong>{Number(value).toLocaleString()}</strong>{displayStatus(name)}</span>
                  ))}
                </div>
                {lastResult.items?.length ? (
                  <div className="pivot-location-migration__table-wrap">
                    <table className="pivot-location-migration__table">
                      <thead><tr><th>Event</th><th>Outcome</th><th>Reason / code</th></tr></thead>
                      <tbody>
                        {lastResult.items.map((item) => (
                          <tr key={`${item.eventId}-${item.outcome}`}>
                            <td><code>{item.eventId}</code></td>
                            <td>{displayStatus(item.outcome)}</td>
                            <td>{displayStatus(item.reason || item.code || item.mode || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </PivotOpsSection>

          <PivotOpsSection
            title={`Review queue (${reviews.length})`}
            description="Select an event, inspect one representation, then approve or correct it."
          >
            {reviewsQuery.error ? (
              <PivotOpsBanner tone="danger" role="alert">{String(reviewsQuery.error)}</PivotOpsBanner>
            ) : reviews.length ? (
              <div className="pivot-location-migration__review-layout">
                <div className="pivot-location-migration__review-list">
                  <table className="pivot-location-migration__table">
                    <thead><tr><th>Event</th><th>Location</th><th>Reason</th></tr></thead>
                    <tbody>
                      {reviews.map((candidate) => (
                        <tr
                          key={candidate.eventId}
                          className={candidate.eventId === selectedReviewId ? 'is-selected' : ''}
                          onClick={() => setSelectedReviewId(candidate.eventId)}
                        >
                          <td><strong>{candidate.name || 'Untitled event'}</strong><code>{candidate.eventId}</code></td>
                          <td>{candidate.rawLocationText || candidate.legacyLocation || '—'}</td>
                          <td>{displayStatus(candidate.review?.reason || 'manual review')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ReviewInspector
                  candidate={selectedReview}
                  busy={reviewingId === selectedReview?.eventId}
                  onReview={reviewCandidate}
                />
              </div>
            ) : (
              <div className="pivot-location-migration__empty-state">
                <Icon icon="mdi:check-circle-outline" />
                <strong>Review queue is clear</strong>
                <span>New ambiguous matches will appear here after a batch runs.</span>
              </div>
            )}
          </PivotOpsSection>
        </main>

        <aside>
          <PivotOpsSection title="City boundary" description="Only locations inside this tenant's operating area are eligible.">
            <div className="pivot-location-migration__segmented" role="group" aria-label="Boundary type">
              {['bounds', 'radius'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={constraints.mode === mode ? 'is-active' : ''}
                  onClick={() => setConstraints((value) => ({ ...value, mode }))}
                >
                  {mode === 'bounds' ? 'Bounding box' : 'Center + radius'}
                </button>
              ))}
            </div>
            <label className="pivot-location-migration__field">
              <span>Country code</span>
              <input
                className="linear-input"
                aria-label="Country code"
                maxLength="2"
                value={constraints.countryCode}
                onChange={(event) => setConstraints((value) => ({ ...value, countryCode: event.target.value }))}
                placeholder="US"
              />
            </label>
            <div className="pivot-location-migration__boundary-grid">
              {(constraints.mode === 'bounds'
                ? [['north', 'North'], ['west', 'West'], ['east', 'East'], ['south', 'South']]
                : [['latitude', 'Latitude'], ['longitude', 'Longitude'], ['radiusKm', 'Radius (km)']]
              ).map(([key, label]) => (
                <label key={key} className="pivot-location-migration__field">
                  <span>{label}</span>
                  <input
                    className="linear-input"
                    type="number"
                    step="any"
                    aria-label={label}
                    value={constraints[key]}
                    onChange={(event) => setConstraints((value) => ({ ...value, [key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
          </PivotOpsSection>

          <PivotOpsSection title="Rollout controls" description="The master switch must be on before any capability takes effect.">
            <label className="pivot-location-migration__master-control">
              <span>
                <strong>Tenant rollout</strong>
                <small>{controls.rollout === 'on' ? 'Capabilities may serve production traffic.' : 'All rich location behavior is dormant.'}</small>
              </span>
              <input
                type="checkbox"
                checked={controls.rollout === 'on'}
                onChange={(event) => setControls((value) => ({
                  ...value,
                  rollout: event.target.checked ? 'on' : 'off',
                }))}
              />
            </label>
            <div className="pivot-location-migration__control-list">
              {CONTROL_OPTIONS.map(({ key, label, description }, index) => (
                <label key={key} className="pivot-location-migration__control">
                  <span className="pivot-location-migration__control-order">{index + 1}</span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={controls[key]}
                    onChange={(event) => setControls((value) => ({ ...value, [key]: event.target.checked }))}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="linear-btn linear-btn--primary pivot-location-migration__save"
              disabled={savingConfig}
              onClick={saveConfiguration}
            >
              {savingConfig ? 'Saving…' : 'Save boundary & rollout'}
            </button>
          </PivotOpsSection>
        </aside>
      </div>
    </PivotTenantPage>
  );
}

export {
  EMPTY_CONTROLS,
  RICH_LOCATION_MIGRATION_UI_ENABLED,
  buildConstraints,
  constraintFields,
};
