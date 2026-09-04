import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useSearchParams } from 'react-router-dom';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsBanner,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStack,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import { formatBatchWeekRange, isValidIsoWeek, toIsoWeek } from '../../../utils/pivotIsoWeek';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotLocationReviewInspector from './PivotLocationReviewInspector';
import PivotTenantPage from './PivotTenantPage';
import usePivotBatchWeekState from './usePivotBatchWeekState';
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
  { key: 'reads', label: 'Show rich locations', description: 'Return structured locations to approved client experiences.' },
  { key: 'autocomplete', label: 'Suggest places to creators', description: 'Use Google-backed suggestions while creators enter a location.' },
  { key: 'writes', label: 'Save rich locations', description: 'Allow creators and admins to save structured location data.' },
  { key: 'search', label: 'Use locations in search', description: 'Include structured location fields in discovery and search.' },
];

function friendlyLabel(value) {
  return String(value || 'not_started').replace(/_/g, ' ');
}

function runLabel(value, activeLease) {
  if (activeLease) return 'Processing';
  const labels = {
    not_started: 'Not started',
    batch_complete: 'In progress',
    quota_reached: 'Call limit reached',
    completed: 'Week evaluated',
    paused: 'Paused',
    failed: 'Needs attention',
  };
  return labels[value || 'not_started'] || friendlyLabel(value);
}

function statusTone(value) {
  if (value === 'completed') return 'ok';
  if (value === 'failed' || value === 'blocked') return 'danger';
  if (['running', 'in_progress', 'batch_complete'].includes(value)) return 'info';
  if (value === 'paused' || value === 'quota_reached') return 'warn';
  return 'muted';
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

function WeekCoverage({ coverage, batchWeek, loading }) {
  const total = Number(coverage?.total || 0);
  const evaluated = Math.min(total, Number(coverage?.processed || 0));
  const resolved = Math.min(total, Number(coverage?.resolved || 0));
  const review = Math.min(total, Number(coverage?.needsReview || 0));
  const remaining = Math.max(0, Number(coverage?.remaining ?? total - evaluated));
  const otherEvaluated = Math.max(0, evaluated - resolved - review);
  const percent = total ? Math.min(100, Math.round((evaluated / total) * 100)) : 0;
  const segments = [
    { key: 'ready', label: 'Locations ready', value: resolved, tone: 'accent' },
    { key: 'review', label: 'Need a decision', value: review, tone: 'striped-muted' },
    ...(otherEvaluated
      ? [{ key: 'other', label: 'Other evaluated', value: otherEvaluated, tone: 'ink' }]
      : []),
    { key: 'remaining', label: 'Not evaluated', value: remaining, tone: 'soft' },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="pivot-location-migration__coverage">
      <div className="pivot-location-migration__coverage-head">
        <div>
          <span>{batchWeek}</span>
          <strong>{loading ? 'Loading…' : `${evaluated.toLocaleString()} of ${total.toLocaleString()} events evaluated`}</strong>
        </div>
        <span className="pivot-location-migration__coverage-percent">{percent}%</span>
      </div>
      {total > 0 ? (
        <PivotOpsStack
          segments={segments}
          ariaLabel={`${batchWeek} location migration coverage`}
          className="pivot-location-migration__coverage-stack"
        />
      ) : null}
      {!loading && total === 0 ? <p>No events with a legacy location were found in this batch week.</p> : null}
    </div>
  );
}

function BatchResult({ result }) {
  if (!result) return null;
  const providerFailures = outcomeCount(result.counts, 'providerFailures', 'providerFailure', 'provider_failed');
  return (
    <div className="pivot-location-migration__result" aria-live="polite">
      <div className="pivot-location-migration__result-head">
        <div>
          <strong>{result.dryRun ? 'Preview complete' : 'Batch processed'}</strong>
          <span>{result.items?.length || 0} location decisions for {result.batchWeek}</span>
        </div>
        <PivotOpsStatus tone={statusTone(result.status)}>{runLabel(result.status)}</PivotOpsStatus>
      </div>
      {providerFailures > 0 ? (
        <PivotOpsBanner tone="danger" title={`${providerFailures} Google requests failed`} role="alert">
          Check the reason codes below before processing another batch.
        </PivotOpsBanner>
      ) : null}
      <div className="pivot-location-migration__result-counts">
        {Object.entries(result.counts || {}).map(([name, value]) => (
          <span key={name}><strong>{Number(value).toLocaleString()}</strong>{friendlyLabel(name)}</span>
        ))}
      </div>
      {result.items?.length ? (
        <div className="pivot-location-migration__table-wrap">
          <table className="pivot-location-migration__table">
            <thead><tr><th>Event ID</th><th>Decision</th><th>Why</th></tr></thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={`${item.eventId}-${item.outcome}`}>
                  <td><code>{item.eventId}</code></td>
                  <td>{friendlyLabel(item.outcome)}</td>
                  <td>{friendlyLabel(item.reason || item.code || item.mode || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function PivotTenantLocationMigrationPage({ tenantKey, cityDisplayName, onTenantUpdated }) {
  const { addNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlBatchWeek = searchParams.get('batchWeek');
  const { batchWeek, committedWeek, setBatchWeek, batchWeekValid, committedWeekValid, weekSettled } =
    usePivotBatchWeekState(isValidIsoWeek(urlBatchWeek) ? urlBatchWeek.trim() : toIsoWeek());
  const baseUrl = `/admin/platform/tenants/${tenantKey}/rich-location-migration`;
  const statusQuery = useFetch(
    RICH_LOCATION_MIGRATION_UI_ENABLED && committedWeekValid ? baseUrl : null,
    { params: { batchWeek: committedWeek }, cache: { enabled: false } },
  );
  const reviewsQuery = useFetch(
    RICH_LOCATION_MIGRATION_UI_ENABLED && committedWeekValid ? `${baseUrl}/reviews` : null,
    { params: { status: 'needs_review', limit: 200, batchWeek: committedWeek }, cache: { enabled: false } },
  );
  const status = statusQuery.data?.success ? statusQuery.data.data : null;
  const reviews = useMemo(
    () => (reviewsQuery.data?.success ? reviewsQuery.data.data?.candidates || [] : []),
    [reviewsQuery.data],
  );

  const [batchSize, setBatchSize] = useState(25);
  const [maxProviderOperations, setMaxProviderOperations] = useState(25);
  const [minIntervalMs, setMinIntervalMs] = useState(100);
  const [autoApplyConfidence, setAutoApplyConfidence] = useState(0.9);
  const [reviewConfidence, setReviewConfidence] = useState(0.6);
  const [confirmation, setConfirmation] = useState('');
  const [constraints, setConstraints] = useState(() => constraintFields(null));
  const [controls, setControls] = useState(EMPTY_CONTROLS);
  const [running, setRunning] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (!committedWeekValid || searchParams.get('batchWeek') === committedWeek) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('batchWeek', committedWeek);
      return next;
    }, { replace: true });
  }, [committedWeek, committedWeekValid, searchParams, setSearchParams]);

  useEffect(() => {
    setLastResult(null);
    setConfirmation('');
    setSelectedReviewId(null);
  }, [committedWeek]);

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

  const selectedReview = reviews.find((candidate) => candidate.eventId === selectedReviewId) || null;
  const coverage = status?.coverage || null;
  const weekRun = status?.weekRun || null;
  const activeLease = status?.leases?.live || null;
  const hasConstraints = Boolean(status?.constraints?.countryCode && (status?.constraints?.bounds || status?.constraints?.center));
  const canApply = confirmation.trim().toLowerCase() === tenantKey.toLowerCase();
  const weekRange = batchWeekValid ? formatBatchWeekRange(batchWeek) : 'Choose a valid week';

  const notifyError = (title, message) => addNotification({ title, message: message || 'Request failed', type: 'error' });
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
    const { data, error } = await authenticatedRequest(`/admin/platform/tenants/${tenantKey}`, {
      method: 'PUT',
      data: { richLocationConstraints, richLocationControls: controls },
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingConfig(false);
    if (error || !data?.success) {
      notifyError('Configuration failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Location settings saved', message: tenantKey, type: 'success' });
    refresh();
  };

  const disableRollout = async () => {
    const disabled = { ...EMPTY_CONTROLS };
    setControls(disabled);
    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(`/admin/platform/tenants/${tenantKey}`, {
      method: 'PUT',
      data: { richLocationControls: disabled },
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingConfig(false);
    if (error || !data?.success) {
      notifyError('Disable rollout failed', data?.message || error);
      return;
    }
    addNotification({ title: 'Rich locations turned off', message: tenantKey, type: 'success' });
    refresh();
  };

  const runBatch = async (apply) => {
    setRunning(true);
    const { data, error } = await authenticatedRequest(`${baseUrl}/run`, {
      method: 'POST',
      data: {
        scope: 'live',
        batchWeek: committedWeek,
        apply,
        batchSize: Number(batchSize),
        maxProviderOperations: Number(maxProviderOperations),
        minIntervalMs: Number(minIntervalMs),
        autoApplyConfidence: Number(autoApplyConfidence),
        reviewConfidence: Number(reviewConfidence),
        confirmTenantKey: confirmation,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    setRunning(false);
    if (error || !data?.success) {
      notifyError(apply ? 'Could not process batch' : 'Could not preview batch', data?.message || error);
      return;
    }
    setLastResult(data.data);
    addNotification({
      title: apply ? 'Batch processed' : 'Preview ready',
      message: `${data.data.counts?.scanned || 0} events evaluated · ${runLabel(data.data.status)}`,
      type: 'success',
    });
    refresh();
  };

  const reviewCandidate = async (eventId, action, richLocation) => {
    if (action === 'invalid_json') {
      notifyError('Invalid location JSON', 'The rich location must be valid JSON.');
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
      notifyError('Could not save decision', data?.message || error);
      return;
    }
    const name = reviews.find((candidate) => candidate.eventId === eventId)?.name || eventId;
    addNotification({ title: 'Location decision saved', message: name, type: 'success' });
    refresh();
  };

  if (!RICH_LOCATION_MIGRATION_UI_ENABLED) return null;

  return (
    <PivotTenantPage
      title="Location migration"
      subtitle={`${cityDisplayName || tenantKey} · Prepare structured event locations for ${weekRange}.`}
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      className="pivot-location-migration"
      actions={(
        <>
          <PivotBatchWeekPicker batchWeek={batchWeek} onChange={setBatchWeek} disabled={running} pending={!weekSettled} extraWeeks={status?.availableWeeks || []} label="Event batch" showLabel={false} />
          <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={refresh} disabled={statusQuery.loading || running}>
            <Icon icon="mdi:refresh" /> Refresh
          </button>
          <button type="button" className="linear-btn linear-btn--secondary linear-btn--sm" onClick={disableRollout} disabled={savingConfig}>
            Turn off rich locations
          </button>
        </>
      )}
    >
      {statusQuery.error ? (
        <PivotOpsBanner tone="danger" title="Location status unavailable" role="alert">{String(statusQuery.error)}</PivotOpsBanner>
      ) : null}

      {status && !status.providerConfigured ? (
        <PivotOpsBanner tone="danger" title="Google location lookup is not configured" role="alert">
          Add the server-side Google Maps key before previewing or processing events.
        </PivotOpsBanner>
      ) : status && !hasConstraints ? (
        <PivotOpsBanner tone="warn" title="Set the city boundary first">
          The migration uses this boundary to catch suggestions that belong to another city.
        </PivotOpsBanner>
      ) : null}

      <PivotOpsMetricGrid className="pivot-location-migration__metrics">
        <PivotOpsMetric label="Locations ready" value={Number(coverage?.resolved || 0).toLocaleString()} hint="Structured location saved" />
        <PivotOpsMetric label="Need a decision" value={Number(coverage?.needsReview || 0).toLocaleString()} hint={`${reviews.length} loaded below`} />
        <PivotOpsMetric label="Not evaluated" value={Number(coverage?.remaining || 0).toLocaleString()} hint={committedWeek} />
        <PivotOpsMetric label="Rich locations" value={controls.rollout === 'on' ? 'On' : 'Off'} hint={`${CONTROL_OPTIONS.filter(({ key }) => controls[key]).length} of 4 capabilities enabled`} />
      </PivotOpsMetricGrid>

      <div className="pivot-location-migration__workspace">
        <main>
          <PivotOpsSection
            title="Batch coverage"
            description={`${committedWeek} · ${formatBatchWeekRange(committedWeek)}`}
            actions={<PivotOpsStatus tone={statusTone(weekRun?.status)}>{runLabel(weekRun?.status, activeLease)}</PivotOpsStatus>}
          >
            <WeekCoverage coverage={coverage} batchWeek={committedWeek} loading={statusQuery.loading || !weekSettled} />

            <details className="pivot-location-migration__processing-settings">
              <summary>Processing settings</summary>
              <div className="pivot-location-migration__run-grid">
                <label className="pivot-location-migration__field"><span>Events per group</span><input className="linear-input" type="number" min="1" max="50" value={batchSize} onChange={(event) => setBatchSize(event.target.value)} /></label>
                <label className="pivot-location-migration__field"><span>Maximum Google lookups</span><input className="linear-input" type="number" min="0" max={batchSize || 50} value={maxProviderOperations} onChange={(event) => setMaxProviderOperations(event.target.value)} /></label>
                <label className="pivot-location-migration__field"><span>Delay between lookups (ms)</span><input className="linear-input" type="number" min="0" max="5000" value={minIntervalMs} onChange={(event) => setMinIntervalMs(event.target.value)} /></label>
                <label className="pivot-location-migration__field"><span>Apply automatically at</span><input className="linear-input" type="number" min="0" max="1" step="0.05" value={autoApplyConfidence} onChange={(event) => setAutoApplyConfidence(event.target.value)} /><small>0.90 means 90% confidence.</small></label>
                <label className="pivot-location-migration__field"><span>Show a Google candidate at</span><input className="linear-input" type="number" min="0" max={autoApplyConfidence || 1} step="0.05" value={reviewConfidence} onChange={(event) => setReviewConfidence(event.target.value)} /><small>Weaker matches still enter review without a suggestion.</small></label>
              </div>
            </details>

            <div className="pivot-location-migration__apply-confirmation">
              <label className="pivot-location-migration__field">
                <span>To process events, type “{tenantKey}”</span>
                <input className="linear-input" aria-label={`Type ${tenantKey} to process`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={tenantKey} />
              </label>
              <small>Previewing is read-only and does not need confirmation.</small>
            </div>

            <div className="pivot-location-migration__run-footer">
              <div className="pivot-location-migration__run-totals">
                <span><strong>{Number(coverage?.remaining || 0).toLocaleString()}</strong> left to evaluate</span>
                <span><strong>{Number(coverage?.needsReview || 0).toLocaleString()}</strong> awaiting you</span>
              </div>
              <div className="pivot-location-migration__actions">
                <button type="button" className="linear-btn linear-btn--secondary" disabled={running || Boolean(activeLease) || !hasConstraints || !batchWeekValid || !weekSettled} onClick={() => runBatch(false)}>{running ? 'Working…' : `Preview next ${batchSize}`}</button>
                <button type="button" className="linear-btn linear-btn--primary" disabled={running || Boolean(activeLease) || !canApply || !hasConstraints || !batchWeekValid || !weekSettled} onClick={() => runBatch(true)}>{running ? 'Working…' : `Process next ${batchSize}`}</button>
              </div>
            </div>

            <BatchResult result={lastResult} />
          </PivotOpsSection>

          <PivotOpsSection title={`Decisions needed (${reviews.length})`} description="Choose an event to compare what the source says with the Google result.">
            {reviewsQuery.error ? (
              <PivotOpsBanner tone="danger" role="alert">{String(reviewsQuery.error)}</PivotOpsBanner>
            ) : reviews.length ? (
              <div className="pivot-location-migration__review-layout">
                <div className="pivot-location-migration__review-list">
                  <table className="pivot-location-migration__table">
                    <thead><tr><th>Event</th><th>Source location</th><th>Why it needs you</th></tr></thead>
                    <tbody>
                      {reviews.map((candidate) => (
                        <tr key={candidate.eventId} className={candidate.eventId === selectedReviewId ? 'is-selected' : ''} onClick={() => setSelectedReviewId(candidate.eventId)}>
                          <td><strong>{candidate.name || 'Untitled event'}</strong><code>{candidate.eventId}</code></td>
                          <td>{candidate.rawLocationText || candidate.legacyLocation || 'No location supplied'}</td>
                          <td><strong>{candidate.whyReview?.title || 'Human decision needed'}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PivotLocationReviewInspector candidate={selectedReview} busy={reviewingId === selectedReview?.eventId} onReview={reviewCandidate} />
              </div>
            ) : (
              <div className="pivot-location-migration__empty-state">
                <Icon icon="mdi:check-circle-outline" /><strong>No decisions needed for {committedWeek}</strong><span>Ambiguous or weak matches will appear here after you process events.</span>
              </div>
            )}
          </PivotOpsSection>
        </main>

        <aside>
          <PivotOpsSection title="City boundary" description="Google suggestions outside this area are sent to you for review.">
            <div className="pivot-location-migration__segmented" role="group" aria-label="Boundary type">
              {['bounds', 'radius'].map((mode) => (
                <button key={mode} type="button" className={constraints.mode === mode ? 'is-active' : ''} onClick={() => setConstraints((value) => ({ ...value, mode }))}>{mode === 'bounds' ? 'Bounding box' : 'Center + radius'}</button>
              ))}
            </div>
            <label className="pivot-location-migration__field"><span>Country code</span><input className="linear-input" aria-label="Country code" maxLength="2" value={constraints.countryCode} onChange={(event) => setConstraints((value) => ({ ...value, countryCode: event.target.value }))} placeholder="US" /></label>
            <div className="pivot-location-migration__boundary-grid">
              {(constraints.mode === 'bounds' ? [['north', 'North'], ['west', 'West'], ['east', 'East'], ['south', 'South']] : [['latitude', 'Latitude'], ['longitude', 'Longitude'], ['radiusKm', 'Radius (km)']]).map(([key, label]) => (
                <label key={key} className="pivot-location-migration__field"><span>{label}</span><input className="linear-input" type="number" step="any" aria-label={label} value={constraints[key]} onChange={(event) => setConstraints((value) => ({ ...value, [key]: event.target.value }))} /></label>
              ))}
            </div>
          </PivotOpsSection>

          <PivotOpsSection title="Turn on rich locations" description="Keep the master switch off until this tenant is ready to use the migrated data.">
            <label className="pivot-location-migration__master-control">
              <span><strong>Use rich locations for this tenant</strong><small>{controls.rollout === 'on' ? 'Enabled capabilities can serve production traffic.' : 'Migrated data is saved, but no rich-location behavior is live.'}</small></span>
              <input type="checkbox" aria-label="Use rich locations for this tenant" checked={controls.rollout === 'on'} onChange={(event) => setControls((value) => ({ ...value, rollout: event.target.checked ? 'on' : 'off' }))} />
            </label>
            <div className="pivot-location-migration__control-list">
              {CONTROL_OPTIONS.map(({ key, label, description }) => (
                <label key={key} className="pivot-location-migration__control"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" aria-label={label} checked={controls[key]} onChange={(event) => setControls((value) => ({ ...value, [key]: event.target.checked }))} /></label>
              ))}
            </div>
            <button type="button" className="linear-btn linear-btn--primary pivot-location-migration__save" disabled={savingConfig} onClick={saveConfiguration}>{savingConfig ? 'Saving…' : 'Save location settings'}</button>
          </PivotOpsSection>
        </aside>
      </div>
    </PivotTenantPage>
  );
}

export { EMPTY_CONTROLS, RICH_LOCATION_MIGRATION_UI_ENABLED, WeekCoverage, buildConstraints, constraintFields };
