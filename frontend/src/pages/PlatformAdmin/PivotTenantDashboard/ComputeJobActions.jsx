import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { toIsoWeek } from '../../../utils/pivotIsoWeek';
import Popup from '../../../components/Popup/Popup';
import { ComputeResultPreviewPanel } from './PivotComputeJobReview';
import {
  formatComputeJobKind,
  formatComputeJobStatus,
  formatTimestamp,
  COMPUTE_JOB_KINDS,
} from './pivotComputeJobsFormat';
import {
  buildAdminCreateJobRequest,
  canApplyStoredComputeJob,
  canCancelComputeJob,
  canPreviewStoredComputeJob,
  canRetryComputeJob,
  mutationFeedback,
} from './pivotComputeJobActions';
import {
  ARTIFACTS_EXPIRED_COPY,
  CAROUSEL_EXPORT_KIND,
  artifactsExpired,
  formatBytes,
  slideArtifacts,
  startBrowserDownload,
  zipArtifact,
} from './carousel/pivotCarouselExport';

const NO_FETCH_CACHE = { enabled: false };

const WAKE_CHECK_LABELS = {
  passed: 'Passed',
  failed: 'Failed',
  async: 'Continuing',
  'not-run': 'Not run',
};

export function ComputeWakeDiagnostic() {
  const [loading, setLoading] = useState(null);
  const [report, setReport] = useState(null);
  const [reportKind, setReportKind] = useState(null);
  const [requestError, setRequestError] = useState(null);

  const handleCheck = useCallback(async (kind) => {
    setLoading(kind);
    setRequestError(null);
    const path = kind === 'storage'
      ? '/admin/pivot/compute-jobs/artifact-diagnostic'
      : '/admin/pivot/compute-jobs/wake-diagnostic';
    const { data, error } = await authenticatedRequest(path, {
      method: 'POST',
      data: {},
    });
    setLoading(null);
    if (error) {
      setReport(null);
      setReportKind(null);
      setRequestError(error);
      return;
    }
    setReportKind(kind);
    setReport(data?.diagnostic || null);
  }, []);

  const accepted = report?.status === 'accepted';
  const target = reportKind === 'storage'
    ? (report?.target?.bucket
      ? `${report.target.bucket}/${report.target.prefix || ''}`
      : 'Not configured')
    : (report?.target
      ? `${report.target.origin}${report.target.path}`
      : 'Not configured');

  return (
    <section className="pivot-compute-jobs__wake-check pivot-lab__panel" aria-labelledby="compute-wake-check-heading">
      <div className="pivot-compute-jobs__wake-check-head">
        <div>
          <span className="pivot-compute-jobs__eyebrow">Relay connection</span>
          <h2 id="compute-wake-check-heading" className="pivot-compute-jobs__activity-title">Wake handshake</h2>
          <p className="pivot-lab__section-hint">
            Send a real signed wake without creating a job, or confirm object storage can mint carousel upload URLs.
          </p>
        </div>
        <div className="pivot-compute-jobs__wake-check-actions">
          <button type="button" className="linear-btn" onClick={() => handleCheck('wake')} disabled={Boolean(loading)}>
            {loading === 'wake' ? 'Checking…' : reportKind === 'wake' && report ? 'Check wake again' : 'Test Relay wake'}
          </button>
          <button type="button" className="linear-btn linear-btn--secondary" onClick={() => handleCheck('storage')} disabled={Boolean(loading)}>
            {loading === 'storage' ? 'Checking…' : reportKind === 'storage' && report ? 'Check storage again' : 'Test export storage'}
          </button>
        </div>
      </div>

      {requestError ? (
        <p className="pivot-compute-jobs__wake-request-error" role="alert">
          The diagnostic request failed before a handshake report was returned: {requestError}
        </p>
      ) : null}

      {report ? (
        <div className={`pivot-compute-jobs__wake-report is-${accepted ? 'accepted' : 'failed'}`} aria-live="polite">
          <div className="pivot-compute-jobs__wake-report-summary">
            <span className="pivot-compute-jobs__wake-state">{accepted ? 'Accepted' : 'Not accepted'}</span>
            <strong>{report.message}</strong>
            <span>{target}</span>
          </div>
          <dl className="pivot-compute-jobs__wake-facts">
            <div><dt>HTTP</dt><dd>{report.response?.httpStatus || 'No response'}</dd></div>
            <div><dt>Round trip</dt><dd>{Number.isFinite(report.durationMs) ? `${report.durationMs} ms` : '—'}</dd></div>
            <div><dt>Checked</dt><dd>{formatTimestamp(report.checkedAt)}</dd></div>
            <div><dt>Code</dt><dd>{report.code || '—'}</dd></div>
          </dl>
          <ol className="pivot-compute-jobs__wake-checks">
            {(report.checks || []).map((check) => (
              <li key={check.name} className={`is-${check.status}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>{check.name}</strong>
                  <p>{check.detail}</p>
                </div>
                <small>{WAKE_CHECK_LABELS[check.status] || check.status}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export function ComputeJobCreateForm({
  tenantKey,
  onCreated,
  heading = 'Request compute job',
  description = 'Enqueue bounded discovery or refresh work for this city. Schedule configuration stays on the Mini.',
}) {
  const { addNotification } = useNotification();
  const [kind, setKind] = useState('city-source-discovery');
  const [contextVersion, setContextVersion] = useState('');
  const [tags, setTags] = useState('');
  const [maxQueries, setMaxQueries] = useState('');
  const [maxCandidates, setMaxCandidates] = useState(20);
  const [minEvents, setMinEvents] = useState(1);
  const [createJobs, setCreateJobs] = useState(true);
  const [recheckRejected, setRecheckRejected] = useState(false);
  const [batchWeek, setBatchWeek] = useState('');
  const [forceBatchWeek, setForceBatchWeek] = useState(false);
  const [jobIds, setJobIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleCreate = useCallback(async () => {
    const parsedTags = tags.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    const parsedJobIds = jobIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    const invalidJobIds = parsedJobIds.filter((value) => !/^[0-9a-f]{24}$/.test(value));
    if (kind === 'city-curation-refresh' && invalidJobIds.length) {
      setFeedback({
        tone: 'error',
        message: `Invalid curation job id${invalidJobIds.length === 1 ? '' : 's'}: ${invalidJobIds.slice(0, 3).join(', ')}`,
      });
      return;
    }
    if (kind === 'city-curation-refresh' && batchWeek && !/^\d{4}-W\d{2}$/.test(batchWeek)) {
      setFeedback({ tone: 'error', message: 'Batch week must use YYYY-WNN format, for example 2026-W37.' });
      return;
    }
    const request = buildAdminCreateJobRequest({
      tenantKey,
      kind,
      contextVersion,
      options: kind === 'city-source-discovery'
        ? { tags: parsedTags, maxQueries, maxCandidates, minEvents, createJobs, recheckRejected }
        : { batchWeek, forceBatchWeek, jobIds: parsedJobIds },
    });
    setLoading(true);
    setFeedback(null);

    const { data, error } = await authenticatedRequest('/admin/pivot/compute-jobs', {
      method: 'POST',
      data: { request },
    });

    setLoading(false);
    const result = mutationFeedback('create', data, error);
    setFeedback(result);
    if (error) return;

    addNotification({
      type: result.tone === 'success' ? 'success' : 'info',
      title: data?.created ? 'Compute job created' : 'Existing compute job',
      message: result.message,
    });
    onCreated?.(data?.job || null, { created: Boolean(data?.created) });
  }, [
    tenantKey,
    kind,
    contextVersion,
    tags,
    maxQueries,
    maxCandidates,
    minEvents,
    createJobs,
    recheckRejected,
    batchWeek,
    forceBatchWeek,
    jobIds,
    addNotification,
    onCreated,
  ]);

  return (
    <section
      className="pivot-compute-jobs__create"
      aria-labelledby="compute-job-create-heading"
      data-testid="compute-job-create"
    >
      <h3 id="compute-job-create-heading" className="pivot-compute-jobs__controls-title">
        {heading}
      </h3>
      <p className="pivot-lab__section-hint">
        {description}
      </p>
      <div className="pivot-compute-jobs__create-fields">
        <label className="pivot-compute-jobs__filter">
          <span>Kind</span>
          <select
            aria-label="Create job kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={loading}
          >
            {COMPUTE_JOB_KINDS.map((option) => (
              <option key={option} value={option}>{formatComputeJobKind(option)}</option>
            ))}
          </select>
        </label>
        <label className="pivot-compute-jobs__filter pivot-compute-jobs__create-context">
          <span>Context version (optional)</span>
          <input
            type="text"
            aria-label="Context version"
            value={contextVersion}
            onChange={(event) => setContextVersion(event.target.value)}
            placeholder="ctx:city.discovery.v3"
            disabled={loading}
          />
        </label>
        <button
          type="button"
          className="linear-btn"
          onClick={handleCreate}
          disabled={loading || !tenantKey}
        >
          {loading ? 'Creating…' : 'Create job'}
        </button>
      </div>
      <details className="pivot-compute-jobs__advanced">
        <summary>Run controls</summary>
        <p className="pivot-lab__section-hint">
          Use these bounds to make a smaller recovery run or isolate problematic inputs. Defaults are safe for routine runs.
        </p>
        {kind === 'city-source-discovery' ? (
          <div className="pivot-compute-jobs__advanced-grid">
            <label className="pivot-compute-jobs__filter">
              <span>Tags (comma or line separated)</span>
              <textarea aria-label="Discovery tags" value={tags} onChange={(event) => setTags(event.target.value)} disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__filter">
              <span>Max queries (optional)</span>
              <input aria-label="Max queries" type="number" min="1" max="50" value={maxQueries} onChange={(event) => setMaxQueries(event.target.value)} placeholder="All generated queries" disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__filter">
              <span>Max candidates</span>
              <input aria-label="Max candidates" type="number" min="1" max="50" value={maxCandidates} onChange={(event) => setMaxCandidates(event.target.value)} disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__filter">
              <span>Minimum events</span>
              <input aria-label="Minimum events" type="number" min="1" max="50" value={minEvents} onChange={(event) => setMinEvents(event.target.value)} disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__check">
              <input type="checkbox" checked={createJobs} onChange={(event) => setCreateJobs(event.target.checked)} disabled={loading} />
              Create curation jobs
            </label>
            <label className="pivot-compute-jobs__check">
              <input type="checkbox" checked={recheckRejected} onChange={(event) => setRecheckRejected(event.target.checked)} disabled={loading} />
              Recheck rejected sources
            </label>
          </div>
        ) : (
          <div className="pivot-compute-jobs__advanced-grid">
            <label className="pivot-compute-jobs__filter">
              <span>Batch week (optional)</span>
              <input aria-label="Batch week" type="text" value={batchWeek} onChange={(event) => setBatchWeek(event.target.value)} placeholder="2026-W37" disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__filter pivot-compute-jobs__job-ids">
              <span>Curation job IDs (optional, one per line)</span>
              <textarea aria-label="Curation job IDs" value={jobIds} onChange={(event) => setJobIds(event.target.value)} placeholder="507f1f77bcf86cd799439011" disabled={loading} />
            </label>
            <label className="pivot-compute-jobs__check">
              <input type="checkbox" checked={forceBatchWeek} onChange={(event) => setForceBatchWeek(event.target.checked)} disabled={loading} />
              Force every event into this batch week
            </label>
          </div>
        )}
      </details>
      {feedback ? (
        <p
          className={feedback.tone === 'error' ? 'pivot-lab__error' : 'pivot-lab__section-hint'}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}

function tenantOptionLabel(tenant) {
  return tenant?.location || tenant?.name || tenant?.tenantKey || '';
}

export function FleetComputeJobCreateForm({ tenants = [], onCreated }) {
  const [tenantKey, setTenantKey] = useState('');
  const batchWeek = useMemo(() => toIsoWeek(), []);
  const tenantOptions = useMemo(() => (tenants || [])
    .filter((tenant) => tenant?.tenantKey)
    .slice()
    .sort((a, b) => tenantOptionLabel(a).localeCompare(tenantOptionLabel(b))), [tenants]);
  const selectedTenant = tenantOptions.find((tenant) => tenant.tenantKey === tenantKey) || null;

  const {
    data: lastJobResponse,
    loading: lastJobLoading,
    error: lastJobError,
    refetch: refetchLastJob,
  } = useFetch(
    tenantKey ? '/admin/pivot/compute-jobs' : null,
    {
      params: { cityKey: tenantKey, limit: 1 },
      cache: NO_FETCH_CACHE,
    },
  );
  const { data: opsResponse, loading: opsLoading, error: opsError } = useFetch(
    tenantKey ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/ops` : null,
    {
      params: { batchWeek, include: 'overview' },
      cache: NO_FETCH_CACHE,
    },
  );

  const lastJob = lastJobResponse?.jobs?.[0] || null;
  const overview = opsResponse?.success ? opsResponse.data?.overview : null;
  const eventCounts = overview?.kpis?.eventCountsByStatus || null;
  const totalEvents = eventCounts?.total ?? overview?.kpis?.eventCount ?? null;
  const handleCreated = useCallback((job, metadata) => {
    refetchLastJob?.({ silent: true });
    onCreated?.(job, metadata);
  }, [onCreated, refetchLastJob]);

  return (
    <div className="pivot-compute-jobs__fleet-create" data-testid="fleet-compute-job-create">
      <div className="pivot-compute-jobs__fleet-create-head">
        <div>
          <span className="pivot-compute-jobs__eyebrow">New run</span>
          <h2>Choose a city before adding work to the shared queue</h2>
          <p>Review the city’s current workload and catalog before configuring the job.</p>
        </div>
        <label className="pivot-compute-jobs__filter pivot-compute-jobs__tenant-picker">
          <span>1. Tenant</span>
          <select
            aria-label="Job tenant"
            value={tenantKey}
            onChange={(event) => setTenantKey(event.target.value)}
          >
            <option value="">Select a city</option>
            {tenantOptions.map((tenant) => (
              <option key={tenant.tenantKey} value={tenant.tenantKey}>
                {tenantOptionLabel(tenant)} · {tenant.tenantKey}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tenantKey ? (
        <div className="pivot-compute-jobs__tenant-context" aria-label="Selected tenant context">
          <div>
            <span>Tenant</span>
            <strong>{tenantOptionLabel(selectedTenant) || tenantKey}</strong>
            <small>{tenantKey}</small>
          </div>
          <div>
            <span>Latest compute job</span>
            {lastJobLoading ? <strong>Loading…</strong> : lastJob ? (
              <>
                <strong>{formatComputeJobStatus(lastJob.status).label}</strong>
                <small>{formatComputeJobKind(lastJob.kind)} · {formatTimestamp(lastJob.requestedAt || lastJob.createdAt)}</small>
              </>
            ) : <strong>{lastJobError ? 'Unavailable' : 'No previous jobs'}</strong>}
          </div>
          <div>
            <span>Current batch</span>
            <strong>{batchWeek}</strong>
            <small>{opsLoading
              ? 'Loading event count…'
              : opsError || overview?.error
                ? 'Event count unavailable'
                : `${totalEvents ?? 0} events total`}</small>
          </div>
          <div>
            <span>Batch status</span>
            <strong>{eventCounts ? `${eventCounts.published ?? 0} published` : '—'}</strong>
            <small>{eventCounts
              ? `${eventCounts.staged ?? 0} staged · ${eventCounts.draft ?? 0} draft${eventCounts.other ? ` · ${eventCounts.other} other` : ''}`
              : 'Status breakdown unavailable'}</small>
          </div>
        </div>
      ) : (
        <p className="pivot-compute-jobs__tenant-prompt">Select a tenant to see its latest job and current batch inventory.</p>
      )}

      {tenantKey ? (
        <ComputeJobCreateForm
          key={tenantKey}
          tenantKey={tenantKey}
          heading="2. Configure the run"
          description="Choose the work type and bounds. The resulting job will remain tied to this tenant through execution, review, and apply."
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}

function StoredResultPopupSurface({ children }) {
  return (
    <div
      className="pivot-ops pivot-compute-review-popup__surface"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stored-result-review-title"
    >
      {children}
    </div>
  );
}

function applyDestinationCopy({ action, status, count }) {
  const eventWord = count === 1 ? 'event' : 'events';
  if (action === 'create' && status === 'staged') {
    return `${count} new ${eventWord} will be added to Curation as staged and remain hidden from the live feed.`;
  }
  if (status === 'published') {
    return `${count} published ${eventWord} will be updated in place and remain live.`;
  }
  return `${count} existing ${eventWord} will be updated in place and remain ${status}.`;
}

function StoredApplyPlan({ review }) {
  const plan = review?.applyPlan || {};
  const destinations = Array.isArray(plan.eventDestinations) ? plan.eventDestinations : [];
  const batchWeeks = Array.isArray(plan.batchWeeks) ? plan.batchWeeks : [];
  const sourceCreates = plan.sources?.creates || 0;
  const sourceUpdates = plan.sources?.updates || 0;
  const jobCreates = plan.curationJobs?.creates || 0;
  const jobUpdates = plan.curationJobs?.updates || 0;

  return (
    <div className="pivot-compute-review__apply-plan" aria-label="Planned production changes">
      <h5>This apply will</h5>
      <ul>
        {destinations.map((destination) => (
          <li key={`${destination.action}:${destination.status}`}>
            {applyDestinationCopy(destination)}
          </li>
        ))}
        {sourceCreates || sourceUpdates ? (
          <li>{sourceCreates} sources will be created and {sourceUpdates} will be updated.</li>
        ) : null}
        {jobCreates || jobUpdates ? (
          <li>{jobCreates} curation jobs will be created and {jobUpdates} will be updated.</li>
        ) : null}
      </ul>
      {batchWeeks.length ? (
        <p>
          <strong>Batch destination:</strong>
          {' '}
          {batchWeeks.map((item) => `${item.batchWeek} (${item.count})`).join(' · ')}.
          {' '}
          Weeks are resolved from event start dates, with the proposed week used only when no event date is available.
        </p>
      ) : null}
      <p className="pivot-compute-review__apply-note">
        Curation-job outcome records are not changed. The server rechecks production before writing; writes run
        sequentially, so completed rows remain if a later row fails.
      </p>
    </div>
  );
}

const APPLY_POLL_MS = 2500;
const APPLY_POLL_MAX_ATTEMPTS = 480;

function applyResultFromJob(job) {
  const audit = job?.applicationAudit || {};
  const summary = audit.summary || {};
  const outcome = audit.outcome || (job?.status === 'completed' ? 'completed' : 'rejected');
  return {
    outcome,
    job,
    summary,
    failedRow: null,
    validationIssues: [],
    code: audit.errorCode || null,
    message: audit.errorMessage || null,
    previewDrift: Boolean(audit.previewDrift),
  };
}

async function pollComputeJobApply(externalJobId, { onProgress } = {}) {
  for (let attempt = 0; attempt < APPLY_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, APPLY_POLL_MS));
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}`,
    );
    if (error || !data?.job) continue;
    onProgress?.(data.job);
    if (data.job.status !== 'applying') {
      return applyResultFromJob(data.job);
    }
  }
  return {
    outcome: 'rejected',
    job: null,
    summary: {},
    code: 'APPLY_POLL_TIMEOUT',
    message: 'Timed out waiting for background apply to finish. Re-open this job to inspect its current status.',
  };
}

function StoredApplyResult({ result, onClose, onRefreshPreview }) {
  if (result?.inProgress) {
    const summary = result?.summary || {};
    const processed = (Number(summary.creates) || 0)
      + (Number(summary.updates) || 0)
      + (Number(summary.skipped) || 0);
    return (
      <footer
        className="pivot-compute-review__apply-panel pivot-compute-review__apply-result is-info"
        data-testid="compute-apply-result"
        role="status"
      >
        <div className="pivot-compute-review__apply-result-head">
          <div>
            <span className="pivot-compute-review__result-label">Apply result</span>
            <h4>Apply in progress</h4>
          </div>
          <span className="pivot-lab__pill">applying</span>
        </div>
        <p>
          {result.message || 'Applying rows in the background.'}
          {' '}
          {processed
            ? `${processed} row${processed === 1 ? '' : 's'} processed so far.`
            : 'Production writes are running now.'}
        </p>
      </footer>
    );
  }

  const summary = result?.summary || {};
  const creates = Number(summary.creates) || 0;
  const updates = Number(summary.updates) || 0;
  const applied = creates + updates;
  const completed = result?.outcome === 'completed';
  const partial = result?.outcome === 'partial';
  const skipped = Number(summary.skipped) || 0;
  const skippedOnly = (completed || partial) && skipped > 0 && !result?.failedRow;
  const failed = !completed && !partial && !skippedOnly;
  const title = skippedOnly
    ? 'Apply completed with skipped rows'
    : completed
      ? 'Apply completed'
      : (partial ? 'Apply partially completed' : 'Nothing was applied');
  const status = result?.job?.status || (completed ? 'completed' : 'review-required');
  const issues = Array.isArray(result?.validationIssues) ? result.validationIssues : [];
  const skippedRows = Array.isArray(result?.skippedRows) ? result.skippedRows : [];
  const displayIssues = issues.length ? issues : skippedRows;

  return (
    <footer
      className={`pivot-compute-review__apply-panel pivot-compute-review__apply-result is-${(completed || skippedOnly) ? 'success' : 'error'}`}
      data-testid="compute-apply-result"
      role={(completed || skippedOnly) ? 'status' : 'alert'}
    >
      <div className="pivot-compute-review__apply-result-head">
        <div>
          <span className="pivot-compute-review__result-label">Apply result</span>
          <h4>{title}</h4>
        </div>
        <span className="pivot-lab__pill">{status.replace(/-/g, ' ')}</span>
      </div>
      <p>
        {skippedOnly
          ? `${creates} records created and ${updates} updated. ${skipped} row${skipped === 1 ? '' : 's'} skipped due to missing required fields.${completed ? ' This job no longer requires approval.' : ' The job returned to Review required for the skipped rows.'}`
          : completed
            ? `${creates} records created and ${updates} updated.${result?.previewDrift ? ' Production changed since preview; the server applied the refreshed plan.' : ''} This job no longer requires approval.`
            : partial
              ? `${applied} production changes succeeded before the failure (${creates} created, ${updates} updated). The job returned to Review required.`
              : result?.code === 'PREVIEW_STALE'
                ? 'Production changed since this preview was generated. Use Refresh preview below, review the updated plan, then Apply again.'
                : 'Preflight stopped the apply before any production writes. The job remains Review required.'}
      </p>
      {!completed && result?.message ? (
        <p className="pivot-compute-review__result-error">
          <strong>{result.code}</strong>
          {' · '}
          {result.code === 'PREVIEW_STALE'
            ? (result.message || 'Production changed since this preview was generated. Refresh preview before applying.')
            : result.code === 503 || /503/.test(String(result.message))
              ? 'The apply request timed out or the upstream service was unavailable. Close this result, click Preview stored result again, and retry; stale applying jobs reset after about ten minutes.'
              : result.message}
        </p>
      ) : null}
      {displayIssues.length ? (
        <ul className="pivot-compute-review__result-issues">
          {displayIssues.slice(0, 10).map((issue) => (
            <li key={issue.key}>
              <strong>{issue.title}</strong>
              <span>Missing {issue.missingFields?.join(', ') || 'required metadata'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!completed && result?.failedRow && !displayIssues.length ? (
        <p className="pivot-compute-review__apply-note">
          Failed at {result.failedRow.entityType || 'record'} <span className="pivot-compute-jobs__mono">{result.failedRow.key}</span>.
        </p>
      ) : null}
      <div className="pivot-compute-review__apply-result-actions">
        {failed && onRefreshPreview ? (
          <button type="button" className="linear-btn" onClick={onRefreshPreview}>
            Refresh preview
          </button>
        ) : null}
        <button type="button" className="linear-btn linear-btn--secondary" onClick={onClose}>
          {failed ? 'Close' : 'Close result'}
        </button>
      </div>
    </footer>
  );
}

export function ComputeJobDetailActions({
  job,
  tenantKey,
  onJobUpdated,
  allowManagementActions = true,
  previewButtonLabel = 'Preview stored result',
}) {
  const { addNotification } = useNotification();
  const [preview, setPreview] = useState(null);
  const [review, setReview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const externalJobId = job?.externalJobId || '';
  const isCarousel = job?.kind === CAROUSEL_EXPORT_KIND;
  const showPreview = !isCarousel && canPreviewStoredComputeJob(job);
  const showCancel = allowManagementActions && canCancelComputeJob(job);
  const showRetry = allowManagementActions && canRetryComputeJob(job);
  const applyInProgress = actionLoading === 'apply' || Boolean(applyResult?.inProgress);
  const showApply = !isCarousel && (applyInProgress || canApplyStoredComputeJob(job, preview));
  const showCarouselDownloads = isCarousel && job?.status === 'completed';
  const carouselExpired = showCarouselDownloads && artifactsExpired(job);
  const zip = showCarouselDownloads ? zipArtifact(job) : null;
  const slides = showCarouselDownloads ? slideArtifacts(job) : [];

  const resetPreview = useCallback(() => {
    setPreview(null);
    setReview(null);
    setApplyConfirmed(false);
    setApplyResult(null);
  }, []);

  const clearApplyResult = useCallback(() => {
    setApplyResult(null);
    setApplyConfirmed(false);
  }, []);

  useEffect(() => {
    resetPreview();
  }, [job?.externalJobId, resetPreview]);

  const runMutation = useCallback(async (action, request) => {
    setActionLoading(action);
    setActionFeedback(null);
    const response = await request();
    const {
      data,
      error,
      errorCode = null,
      errorData = null,
    } = response;
    setActionLoading(null);
    const feedback = mutationFeedback(action, data, error);
    setActionFeedback(feedback);
    if (error) return { ok: false, error, errorCode, errorData };
    addNotification({
      type: feedback.tone === 'error' ? 'error' : (feedback.tone === 'success' ? 'success' : 'info'),
      title: action.charAt(0).toUpperCase() + action.slice(1),
      message: feedback.message,
    });
    onJobUpdated?.(data?.job || job, { action, duplicate: Boolean(data?.duplicate) });
    return { ok: true, data };
  }, [addNotification, onJobUpdated, job]);

  const loadStoredPreview = useCallback(async ({ keepOpen = false } = {}) => {
    if (!externalJobId) return false;
    if (!keepOpen && !showPreview) return false;
    setPreviewLoading(true);
    if (!keepOpen) {
      setActionFeedback(null);
      setPreview(null);
      setReview(null);
      setApplyConfirmed(false);
      setApplyResult(null);
    } else {
      clearApplyResult();
    }

    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}/preview`,
      { method: 'POST', data: {} },
    );

    setPreviewLoading(false);
    if (error) {
      setActionFeedback({ tone: 'error', message: error });
      return false;
    }
    setPreview(data?.preview || null);
    setReview(data?.review || null);
    return true;
  }, [showPreview, externalJobId, clearApplyResult]);

  const handlePreview = useCallback(async () => {
    await loadStoredPreview();
  }, [loadStoredPreview]);

  const handleRefreshPreview = useCallback(async () => {
    await loadStoredPreview({ keepOpen: true });
  }, [loadStoredPreview]);

  const handleCancel = useCallback(async () => {
    if (!showCancel || !externalJobId) return;
    await runMutation('cancel', () => authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}/cancel`,
      { method: 'POST', data: {} },
    ));
    resetPreview();
  }, [showCancel, externalJobId, runMutation, resetPreview]);

  const handleRetry = useCallback(async () => {
    if (!showRetry || !externalJobId) return;
    await runMutation('retry', () => authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}/retry`,
      {
        method: 'POST',
        data: { contextVersion: job?.contextVersion || undefined },
      },
    ));
    resetPreview();
  }, [showRetry, externalJobId, job?.contextVersion, runMutation, resetPreview]);

  const handleDownload = useCallback(async (artifact) => {
    if (!externalJobId || !artifact?.artifactId || !tenantKey) return;
    setActionLoading(artifact.artifactId);
    setActionFeedback(null);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`,
      { params: { tenantKey } },
    );
    setActionLoading(null);
    if (error || !data?.downloadUrl) {
      setActionFeedback({ tone: 'error', message: error || 'The download request failed.' });
      return;
    }
    startBrowserDownload(data.downloadUrl, data.filename || artifact.logicalName);
  }, [externalJobId, tenantKey]);

  const handleApply = useCallback(async () => {
    if (!showApply || !applyConfirmed || !preview || !externalJobId) return;
    onJobUpdated?.({ ...job, status: 'applying' }, { action: 'apply', optimistic: true });
    const result = await runMutation('apply', () => authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}/apply`,
      {
        method: 'POST',
        data: {
          idempotencyKey: `apply:${preview.jobId}`,
          preview,
          tenantKey,
        },
      },
    ));
    if (result?.ok) {
      if (result.data?.async) {
        setApplyConfirmed(false);
        setApplyResult({
          inProgress: true,
          job: result.data?.job || null,
          summary: result.data?.job?.applicationAudit?.summary || {},
          message: result.data?.message || null,
        });
        const polled = await pollComputeJobApply(externalJobId, {
          onProgress: (nextJob) => {
            setApplyResult({
              inProgress: true,
              job: nextJob,
              summary: nextJob.applicationAudit?.summary || {},
              message: result.data?.message || null,
            });
            onJobUpdated?.(nextJob, { action: 'apply', optimistic: true });
          },
        });
        setApplyResult(polled);
        onJobUpdated?.(polled.job || job, { action: 'apply' });
        if (polled.outcome === 'completed' || polled.outcome === 'partial') {
          addNotification({
            type: 'success',
            title: 'Apply',
            message: 'Background apply finished.',
          });
        } else if (polled.code === 'APPLY_POLL_TIMEOUT') {
          addNotification({
            type: 'info',
            title: 'Apply',
            message: polled.message,
          });
        }
        return;
      }
      setApplyResult({
        outcome: result.data?.outcome || 'completed',
        job: result.data?.job || null,
        summary: result.data?.summary || {},
        skippedRows: result.data?.skippedRows || [],
        previewDrift: Boolean(result.data?.previewDrift),
      });
      setApplyConfirmed(false);
    } else {
      const failedResult = result?.errorData?.result || null;
      setApplyResult({
        outcome: failedResult?.outcome || 'rejected',
        job: failedResult?.job || job,
        summary: failedResult?.summary || {},
        failedRow: failedResult?.failedRow || null,
        validationIssues: failedResult?.validationIssues || [],
        code: result?.errorCode || 'COMPUTE_APPLY_FAILED',
        message: result?.error || 'The apply did not complete.',
      });
      onJobUpdated?.(failedResult?.job || job, { action: 'apply', rollback: true });
    }
  }, [
    showApply,
    applyConfirmed,
    preview,
    externalJobId,
    tenantKey,
    onJobUpdated,
    job,
    runMutation,
  ]);

  const controls = useMemo(() => {
    const items = [];
    if (showPreview) items.push('preview');
    if (showCancel) items.push('cancel');
    if (showRetry) items.push('retry');
    if (applyInProgress) items.push('apply');
    return items;
  }, [showPreview, showCancel, showRetry, applyInProgress]);

  if (!job || (controls.length === 0 && !preview && !applyResult && !showCarouselDownloads)) {
    return null;
  }

  return (
    <section
      className="pivot-compute-jobs__controls"
      aria-label="Job actions"
      data-testid="compute-job-detail-actions"
    >
      <h3 className="pivot-compute-jobs__controls-title">Job actions</h3>
      <p className="pivot-lab__section-hint">
        {isCarousel
          ? 'Downloads stay tenant-authorized. Cancel and retry follow the same job record.'
          : 'Actions follow server state for this job. A duplicate response means production already recorded the outcome.'}
      </p>

      {showCarouselDownloads ? (
        carouselExpired ? (
          <p className="pivot-compute-jobs__expired" role="status">{ARTIFACTS_EXPIRED_COPY}</p>
        ) : (
          <div className="pivot-compute-jobs__downloads" data-testid="compute-carousel-downloads">
            {zip ? (
              <button
                type="button"
                className="linear-btn"
                onClick={() => handleDownload(zip)}
                disabled={Boolean(actionLoading)}
              >
                {actionLoading === zip.artifactId ? 'Starting…' : 'Download ZIP'}
                <span className="pivot-compute-jobs__download-size">{formatBytes(zip.byteCount)}</span>
              </button>
            ) : null}
            {slides.map((slide) => (
              <button
                key={slide.artifactId}
                type="button"
                className="linear-btn linear-btn--secondary"
                onClick={() => handleDownload(slide)}
                disabled={Boolean(actionLoading)}
              >
                {actionLoading === slide.artifactId
                  ? 'Starting…'
                  : `Slide ${String(slide.slideNumber || '').padStart(2, '0')}`}
                <span className="pivot-compute-jobs__download-size">{formatBytes(slide.byteCount)}</span>
              </button>
            ))}
          </div>
        )
      ) : null}

      <div className="pivot-compute-jobs__controls-row">
        {showPreview ? (
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={handlePreview}
            disabled={previewLoading || Boolean(actionLoading)}
          >
            {previewLoading ? 'Opening…' : previewButtonLabel}
          </button>
        ) : null}
        {showCancel ? (
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={handleCancel}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel job'}
          </button>
        ) : null}
        {showRetry ? (
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={handleRetry}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'retry' ? 'Retrying…' : 'Retry job'}
          </button>
        ) : null}
      </div>

      {actionFeedback ? (
        <p
          className={actionFeedback.tone === 'error' ? 'pivot-lab__error' : 'pivot-lab__section-hint'}
          role={actionFeedback.tone === 'error' ? 'alert' : 'status'}
          data-testid="compute-job-action-feedback"
        >
          {actionFeedback.message}
        </p>
      ) : null}

      <Popup
        isOpen={Boolean(preview || applyResult)}
        onClose={resetPreview}
        customClassName="wide-content pivot-compute-review-popup"
        overlayClassName="pivot-compute-review-popup__overlay"
        hideCloseButton={applyInProgress}
        disableOutsideClick={applyInProgress}
      >
        <StoredResultPopupSurface>
          <header className="pivot-compute-review-popup__header">
            <span className="pivot-compute-jobs__eyebrow">Production review</span>
            <h2 id="stored-result-review-title">Stored result preview</h2>
            <p>Review curation quality, aggregate warnings, and mutations before applying this result.</p>
          </header>
          {preview ? (
            <>
              <div className="pivot-compute-review-popup__content">
                <ComputeResultPreviewPanel preview={preview} parsedResult={null} review={review} />
              </div>
              {applyResult ? (
                <StoredApplyResult
                  result={applyResult}
                  onClose={applyResult?.outcome === 'completed' || applyResult?.outcome === 'partial'
                    ? resetPreview
                    : clearApplyResult}
                  onRefreshPreview={handleRefreshPreview}
                />
              ) : showApply ? (
                <footer className="pivot-compute-review__apply-panel" data-testid="compute-stored-apply-panel">
                  <StoredApplyPlan review={review} />
                  <label className="pivot-compute-review__confirm">
                    <input
                      type="checkbox"
                      checked={applyConfirmed}
                      onChange={(event) => setApplyConfirmed(event.target.checked)}
                      disabled={actionLoading === 'apply'}
                    />
                    <span>
                      I confirm the status, batch-week, and production changes shown above for {preview.jobId}.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="linear-btn"
                    onClick={handleApply}
                    disabled={!applyConfirmed || actionLoading === 'apply'}
                  >
                    {actionLoading === 'apply' ? 'Applying…' : 'Confirm and apply'}
                  </button>
                </footer>
              ) : (
                <p className="pivot-compute-review__blocked pivot-compute-review__apply-panel" role="status">
                  Apply is unavailable until blocking preview issues are resolved.
                </p>
              )}
            </>
          ) : null}
        </StoredResultPopupSurface>
      </Popup>
    </section>
  );
}
