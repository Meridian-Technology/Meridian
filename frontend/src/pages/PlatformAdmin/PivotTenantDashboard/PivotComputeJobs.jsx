import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import PivotTenantPage from './PivotTenantPage';
import {
  COMPUTE_JOB_FILTER_KINDS,
  COMPUTE_JOB_STATUSES,
  PIVOT_FLEET_COMPUTE_JOBS_PAGE,
  PIVOT_TENANT_COMPUTE_JOBS_PAGE,
  formatAge,
  formatComputeJobKind,
  formatComputeJobOrigin,
  formatComputeJobStatus,
  formatFailure,
  formatProgress,
  formatTimestamp,
  hasActiveComputeJobs,
  isActiveComputeJob,
  redactSensitiveFields,
  resolveScheduleOccurrenceId,
  resolveWorkerId,
  summarizeStoredResult,
} from './pivotComputeJobsFormat';
import {
  ARTIFACTS_EXPIRED_COPY,
  CAROUSEL_EXPORT_KIND,
  artifactsExpired,
  carouselEditorHref,
  deriveExportUiState,
  exportArtifactTotals,
  exportDurationLabel,
  exportFailureLabel,
  formatBytes as formatExportBytes,
  formatExportProgress,
  renderedRevision,
} from './carousel/pivotCarouselExport';
import './PivotTenantPage.scss';
import './PivotComputeJobs.scss';
import PivotComputeJobReview from './PivotComputeJobReview';
import {
  ComputeJobCreateForm,
  ComputeJobDetailActions,
  ComputeWakeDiagnostic,
  FleetComputeJobCreateForm,
} from './ComputeJobActions';

export { PIVOT_FLEET_COMPUTE_JOBS_PAGE, PIVOT_TENANT_COMPUTE_JOBS_PAGE };

const NO_FETCH_CACHE = { enabled: false };
const LIST_POLL_MS = 5000;
const DETAIL_POLL_MS = 5000;
const MAX_ATTEMPTS_SHOWN = 20;

/**
 * `/platform-admin/pivot/:tenantKey?page=10`
 * Appended after Notifications (former Weekly drop) — do not insert earlier pages.
 */

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...COMPUTE_JOB_STATUSES.map((status) => ({
    value: status,
    label: formatComputeJobStatus(status).label,
  })),
];

const KIND_FILTER_OPTIONS = [
  { value: 'all', label: 'All kinds' },
  ...COMPUTE_JOB_FILTER_KINDS.map((kind) => ({
    value: kind,
    label: formatComputeJobKind(kind),
  })),
];

function ComputeJobStatusPill({ status }) {
  const { label, pillClass } = formatComputeJobStatus(status);
  return (
    <span className={`pivot-lab__pill${pillClass ? ` ${pillClass}` : ''}`}>
      {label}
    </span>
  );
}

function AttemptStatusPill({ status }) {
  const normalized = String(status || '').replace(/-/g, ' ');
  const label = normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '—';
  return <span className="pivot-lab__pill pivot-lab__pill--muted">{label}</span>;
}

function DetailField({ label, value, mono = false }) {
  return (
    <div className="pivot-compute-jobs__detail-field">
      <dt>{label}</dt>
      <dd className={mono ? 'pivot-compute-jobs__mono' : undefined}>{value}</dd>
    </div>
  );
}

function SummaryCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className={`pivot-compute-jobs__summary-card is-${tone}`}>
      <span className="pivot-compute-jobs__summary-label">{label}</span>
      <strong className="pivot-compute-jobs__summary-value">{value}</strong>
      <span className="pivot-compute-jobs__summary-hint">{hint}</span>
    </div>
  );
}

function listProgress(job) {
  if (job?.kind === CAROUSEL_EXPORT_KIND) {
    return formatExportProgress(job, deriveExportUiState({ job })) || formatProgress(job.progress);
  }
  return formatProgress(job.progress);
}

function listFailure(job) {
  if (job?.kind === CAROUSEL_EXPORT_KIND) {
    return job.failure ? exportFailureLabel(job) : '—';
  }
  return formatFailure(job.failure, { maxLength: 112 });
}

function ComputeJobListItem({ job, isSelected, nowMs, onSelect, showCity = false }) {
  const progress = listProgress(job);
  const failure = listFailure(job);
  const worker = resolveWorkerId(job);
  const scheduleOccurrence = resolveScheduleOccurrenceId(job);
  const age = formatAge(job.requestedAt || job.createdAt, nowMs);
  const statusLabel = formatComputeJobStatus(job.status).label;

  return (
    <li className="pivot-compute-jobs__queue-item">
      <button
        type="button"
        className={`pivot-compute-jobs__job-card${isSelected ? ' is-selected' : ''}`}
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`${formatComputeJobKind(job.kind)} — ${formatComputeJobOrigin(job.origin)} — ${statusLabel}`}
      >
        <span className="pivot-compute-jobs__job-card-head">
          <span>
            <strong className="pivot-compute-jobs__job-kind">{formatComputeJobKind(job.kind)}</strong>
            <span className="pivot-compute-jobs__job-origin">{formatComputeJobOrigin(job.origin)}</span>
          </span>
          <ComputeJobStatusPill status={job.status} />
        </span>

        <span className={`pivot-compute-jobs__job-progress${progress === '—' ? ' is-empty' : ''}`}>
          {progress === '—' ? 'No progress update yet' : progress}
        </span>

        {failure !== '—' ? (
          <span className="pivot-compute-jobs__job-failure">{failure}</span>
        ) : null}

        <span className="pivot-compute-jobs__job-meta">
          {showCity ? <span className="pivot-compute-jobs__mono">{job.cityKey || job.tenantKey || 'Unknown city'}</span> : null}
          <span>{age === '—' ? 'Age unavailable' : `${age} ago`}</span>
          <span>Attempt {job.attemptCount ?? job.lease?.attemptNumber ?? 0}</span>
          {worker !== '—' ? <span className="pivot-compute-jobs__mono">{worker}</span> : null}
          {scheduleOccurrence !== '—' ? (
            <span className="pivot-compute-jobs__mono" title="Schedule occurrence">{scheduleOccurrence}</span>
          ) : null}
        </span>
        <span className="pivot-compute-jobs__job-version pivot-compute-jobs__mono">
          {job.contextVersion || 'No context version'}
        </span>
      </button>
    </li>
  );
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function CarouselDeckTitle({ tenantKey, deckId }) {
  const { data } = useFetch(
    tenantKey && deckId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousels/${encodeURIComponent(deckId)}`
      : null,
    { cache: NO_FETCH_CACHE },
  );
  const title = data?.success ? data.data?.deck?.title : null;
  return title || '—';
}

function CarouselExportFacts({ job, tenantKey }) {
  const resolvedTenant = tenantKey || job.tenantKey || job.cityKey || '—';
  const totals = exportArtifactTotals(job);
  const revision = renderedRevision(job);
  const duration = exportDurationLabel(job);
  const editorHref = carouselEditorHref({ ...job, tenantKey: resolvedTenant === '—' ? job.tenantKey : resolvedTenant });
  const expired = artifactsExpired(job);
  const slideCount = job.result?.slideCount ?? (totals.pngCount || null);

  return (
    <section className="pivot-compute-jobs__detail-section" aria-label="Carousel export">
      <h3 className="pivot-compute-jobs__detail-heading">Export</h3>
      <dl className="pivot-compute-jobs__detail-grid">
        <DetailField label="Tenant" value={resolvedTenant} mono />
        <DetailField
          label="Deck title"
          value={<CarouselDeckTitle tenantKey={resolvedTenant === '—' ? null : resolvedTenant} deckId={job.options?.deckId} />}
        />
        <DetailField label="Deck revision" value={revision || job.options?.deckRevision || '—'} mono />
        <DetailField label="Slide count" value={slideCount == null ? '—' : String(slideCount)} />
        <DetailField label="Artifact count" value={totals.artifactCount ? String(totals.artifactCount) : '—'} />
        <DetailField label="Total size" value={totals.artifactCount ? formatExportBytes(totals.totalBytes) : '—'} />
        <DetailField label="Worker" value={resolveWorkerId(job)} mono />
        <DetailField
          label="Attempt"
          value={String(job.attemptCount ?? job.lease?.attemptNumber ?? 0)}
        />
        <DetailField label="Duration" value={duration || '—'} />
      </dl>
      {expired ? (
        <p className="pivot-compute-jobs__expired" role="status">{ARTIFACTS_EXPIRED_COPY}</p>
      ) : null}
      {editorHref ? (
        <p className="pivot-compute-jobs__editor-link">
          <Link to={editorHref}>Open in carousel editor</Link>
        </p>
      ) : null}
    </section>
  );
}

function ComputeJobDetail({
  job,
  attempts,
  loading,
  error,
  nowMs,
  tenantKey = null,
}) {
  if (loading && !job) {
    return <p className="pivot-lab__empty">Loading job detail…</p>;
  }
  if (error) {
    return <p className="pivot-lab__error" role="alert">{error}</p>;
  }
  if (!job) {
    return null;
  }

  const safeJob = redactSensitiveFields(job);
  const isCarousel = safeJob.kind === CAROUSEL_EXPORT_KIND;
  const resultSummary = isCarousel ? null : summarizeStoredResult(job.result);
  const visibleAttempts = Array.isArray(attempts) ? attempts.slice(0, MAX_ATTEMPTS_SHOWN) : [];
  const failure = safeJob.failure;
  const canRetry = safeJob.status === 'retryable';
  const jobAge = formatAge(safeJob.requestedAt || safeJob.createdAt, nowMs);
  const repairCandidatePreserved = Array.isArray(failure?.details)
    && failure.details.some((detail) => String(detail).includes('Repair candidate preserved'));
  const progressLabel = isCarousel
    ? (formatExportProgress(safeJob, deriveExportUiState({ job: safeJob })) || formatProgress(safeJob.progress))
    : formatProgress(safeJob.progress);
  const carouselTenant = tenantKey || safeJob.tenantKey || safeJob.cityKey || null;

  return (
    <div className="pivot-compute-jobs__detail" data-testid="compute-job-detail">
      <div className="pivot-compute-jobs__detail-hero">
        <div>
          <p className="pivot-compute-jobs__detail-kicker">{formatComputeJobOrigin(safeJob.origin)}</p>
          <h3 className="pivot-compute-jobs__detail-title">{formatComputeJobKind(safeJob.kind)}</h3>
          <p className="pivot-compute-jobs__detail-progress">{progressLabel}</p>
        </div>
        <div className="pivot-compute-jobs__detail-state">
          <ComputeJobStatusPill status={safeJob.status} />
          <span>{jobAge === '—' ? 'Age unavailable' : `${jobAge} old`}</span>
        </div>
      </div>

      {failure ? (
        <section className="pivot-compute-jobs__failure" role="alert" aria-label="Failure and recovery">
          <div>
            <p className="pivot-compute-jobs__failure-code">
              {isCarousel ? exportFailureLabel(safeJob) : (failure.code || 'JOB_FAILED')}
            </p>
            <p className="pivot-compute-jobs__failure-message">{failure.message || 'The job failed without a message.'}</p>
            {Array.isArray(failure.details) && failure.details.length ? (
              <ul className="pivot-compute-jobs__failure-details">
                {failure.details.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            ) : null}
          </div>
          <p className="pivot-compute-jobs__failure-recourse">
            {isCarousel
              ? (canRetry
                ? 'This export is retryable. Retry uses the same deck revision and a fresh lease.'
                : 'This export failed. Start a new export from the carousel editor after fixing the cause.')
              : (canRetry
                ? repairCandidatePreserved
                  ? 'The expensive result is preserved on the worker. After deploying a correction, Retry revalidates and submits that candidate without repeating provider calls. Use Run controls only to discard it and create a replacement.'
                  : 'This attempt is retryable. Retry uses the same request and a fresh lease; use Run controls above to create a smaller replacement instead.'
                : 'This failure is terminal. Use Run controls above to create a corrected or smaller replacement job.')}
          </p>
        </section>
      ) : null}

      {isCarousel ? <CarouselExportFacts job={safeJob} tenantKey={carouselTenant} /> : null}

      <section className="pivot-compute-jobs__detail-section" aria-label="Execution summary">
        <h3 className="pivot-compute-jobs__detail-heading">Execution</h3>
        <dl className="pivot-compute-jobs__detail-grid">
          <DetailField label="Worker" value={resolveWorkerId(safeJob)} mono />
          <DetailField
            label="Attempt"
            value={String(safeJob.attemptCount ?? safeJob.lease?.attemptNumber ?? 0)}
          />
          <DetailField label="Requested" value={formatTimestamp(safeJob.requestedAt)} />
          <DetailField label="Last update" value={formatTimestamp(safeJob.updatedAt)} />
        </dl>
      </section>

      <details className="pivot-compute-jobs__detail-disclosure">
        <summary>Identifiers &amp; versions</summary>
        <dl className="pivot-compute-jobs__detail-grid">
          <DetailField label="Job id" value={safeJob.externalJobId} mono />
          <DetailField label="City" value={safeJob.cityKey || '—'} mono />
          <DetailField label="Schedule occurrence" value={resolveScheduleOccurrenceId(safeJob)} mono />
          <DetailField label="Context version" value={safeJob.contextVersion || '—'} mono />
          <DetailField label="Contract version" value={safeJob.contractVersion || '—'} mono />
          <DetailField label="Implementation" value={safeJob.implementationRevision || '—'} mono />
        </dl>
      </details>

      <details className="pivot-compute-jobs__detail-disclosure">
        <summary>Request options</summary>
        <pre className="pivot-compute-jobs__json">{JSON.stringify(safeJob.options || {}, null, 2)}</pre>
      </details>

      {resultSummary ? (
        <section className="pivot-compute-jobs__detail-section" aria-label="Stored result summary">
          <h3 className="pivot-compute-jobs__detail-heading">Result summary</h3>
          <dl className="pivot-compute-jobs__detail-grid">
            <DetailField label="Mode" value={resultSummary.mode || '—'} />
            <DetailField label="Submitted" value={formatTimestamp(resultSummary.submittedAt)} />
            <DetailField
              label="Idempotency key"
              value={resultSummary.resultIdempotencyKey || '—'}
              mono
            />
            <DetailField
              label="Embedded payload"
              value={resultSummary.hasEmbeddedResult ? 'Present (not shown)' : 'Not stored inline'}
            />
            <DetailField label="Payload size" value={formatBytes(resultSummary.embeddedByteSize)} />
            {Object.entries(resultSummary.embeddedSummary || {}).map(([key, value]) => (
              <DetailField key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value)} />
            ))}
          </dl>
        </section>
      ) : null}

      {safeJob.applicationAudit && !isCarousel ? (
        <section className="pivot-compute-jobs__detail-section" aria-label="Application audit">
          <h3 className="pivot-compute-jobs__detail-heading">Application audit</h3>
          {safeJob.applicationAudit.outcome === 'partial' ? (
            <p className="pivot-compute-review__blocked">
              Some production writes succeeded before the apply failed. This job requires review again.
            </p>
          ) : null}
          {safeJob.applicationAudit.outcome === 'rejected' ? (
            <p className="pivot-compute-review__blocked">
              Preflight rejected this apply before any production writes.
            </p>
          ) : null}
          <dl className="pivot-compute-jobs__detail-grid">
            <DetailField label="Outcome" value={safeJob.applicationAudit.outcome || '—'} />
            <DetailField label="Applied by" value={safeJob.applicationAudit.appliedBy || '—'} />
            <DetailField label="Applied at" value={formatTimestamp(safeJob.applicationAudit.appliedAt)} />
            <DetailField label="Records created" value={String(safeJob.applicationAudit.summary?.creates ?? 0)} />
            <DetailField label="Records updated" value={String(safeJob.applicationAudit.summary?.updates ?? 0)} />
          </dl>
        </section>
      ) : null}

      <section className="pivot-compute-jobs__detail-section" aria-label="Attempts">
        <h3 className="pivot-compute-jobs__detail-heading">Attempts</h3>
        {visibleAttempts.length === 0 ? (
          <p className="pivot-lab__empty">No attempts recorded yet.</p>
        ) : (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table pivot-compute-jobs__attempts-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Status</th>
                  <th scope="col">Worker</th>
                  <th scope="col">Started</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Failure</th>
                </tr>
              </thead>
              <tbody>
                {visibleAttempts.map((attempt) => {
                  const safeAttempt = redactSensitiveFields(attempt);
                  return (
                    <tr key={`${safeAttempt.attemptNumber}-${safeAttempt.id || safeAttempt.startedAt}`}>
                      <td>{safeAttempt.attemptNumber}</td>
                      <td><AttemptStatusPill status={safeAttempt.status} /></td>
                      <td className="pivot-compute-jobs__mono">{safeAttempt.workerId || '—'}</td>
                      <td>{formatTimestamp(safeAttempt.startedAt || safeAttempt.leasedAt)}</td>
                      <td>{formatTimestamp(safeAttempt.finishedAt)}</td>
                      <td>{formatFailure(safeAttempt.failure, { maxLength: 120 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {Array.isArray(attempts) && attempts.length > MAX_ATTEMPTS_SHOWN ? (
          <p className="pivot-lab__section-hint">
            Showing first {MAX_ATTEMPTS_SHOWN} of {attempts.length} attempts.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function PivotComputeJobs({
  tenantKey = null,
  cityDisplayName,
  scope = 'tenant',
  pageIndex = PIVOT_TENANT_COMPUTE_JOBS_PAGE,
  tenants = [],
}) {
  const isFleet = scope === 'fleet';
  const [searchParams, setSearchParams] = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailJob, setDetailJob] = useState(null);
  const [detailAttempts, setDetailAttempts] = useState([]);

  const statusFilter = searchParams.get('computeStatus') || 'all';
  const kindFilter = searchParams.get('computeKind') || 'all';
  const selectedJobId = searchParams.get('computeJobId') || '';

  const listParams = useMemo(() => {
    const params = {
      limit: 50,
    };
    if (!isFleet && tenantKey) params.cityKey = tenantKey;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (kindFilter !== 'all') params.kind = kindFilter;
    return params;
  }, [isFleet, tenantKey, statusFilter, kindFilter]);

  const {
    data: listResponse,
    loading: listLoading,
    error: listError,
    refetch: refetchList,
  } = useFetch('/admin/pivot/compute-jobs', {
    params: listParams,
    cache: NO_FETCH_CACHE,
  });

  const jobs = useMemo(() => listResponse?.jobs || [], [listResponse?.jobs]);
  const shouldPollList = hasActiveComputeJobs(jobs);

  const updateSearchParam = useCallback((key, value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value == null || value === '' || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      if (next.get('page') !== String(pageIndex)) {
        next.set('page', String(pageIndex));
      }
      return next;
    }, { replace: true });
  }, [pageIndex, setSearchParams]);

  const selectJob = useCallback((externalJobId) => {
    updateSearchParam('computeJobId', externalJobId);
  }, [updateSearchParam]);

  const clearSelection = useCallback(() => {
    updateSearchParam('computeJobId', null);
  }, [updateSearchParam]);

  const resetFilters = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('computeStatus');
      next.delete('computeKind');
      next.set('page', String(pageIndex));
      return next;
    }, { replace: true });
  }, [pageIndex, setSearchParams]);

  const loadDetail = useCallback(async ({ silent = false } = {}) => {
    if (!selectedJobId) {
      setDetailJob(null);
      setDetailAttempts([]);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }

    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(selectedJobId)}`,
    );

    if (error) {
      setDetailError(typeof error === 'string' ? error : 'Could not load compute job detail.');
      setDetailJob(null);
      setDetailAttempts([]);
      setDetailLoading(false);
      return;
    }

    setDetailJob(data?.job || null);
    setDetailAttempts(Array.isArray(data?.attempts) ? data.attempts : []);
    setDetailError(null);
    setDetailLoading(false);
  }, [selectedJobId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!shouldPollList) return undefined;
    const timer = window.setInterval(() => {
      refetchList({ silent: true });
    }, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [shouldPollList, refetchList]);

  useEffect(() => {
    if (!selectedJobId || !isActiveComputeJob(detailJob)) return undefined;
    const timer = window.setInterval(() => {
      loadDetail({ silent: true });
    }, DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedJobId, detailJob, loadDetail]);

  const jobSummary = useMemo(() => jobs.reduce((summary, job) => {
    if (isActiveComputeJob(job)) summary.active += 1;
    if (job.status === 'review-required') summary.review += 1;
    if (job.status === 'retryable' || job.status === 'failed') summary.recovery += 1;
    if (job.status === 'completed') summary.completed += 1;
    return summary;
  }, { active: 0, review: 0, recovery: 0, completed: 0 }), [jobs]);

  const hasFilters = statusFilter !== 'all' || kindFilter !== 'all';

  return (
    <PivotTenantPage
      title="Compute jobs"
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      subtitle={isFleet
        ? 'Monitor offloaded discovery, curation refresh, and carousel export work across every city.'
        : 'Offloaded discovery, curation refresh, and carousel export work for this city.'}
      className="pivot-compute-jobs"
    >
      <section className="pivot-compute-jobs__summary" aria-label="Compute job health">
        <SummaryCard label="Active" value={jobSummary.active} hint="Queued or processing" tone="info" />
        <SummaryCard label="Review" value={jobSummary.review} hint="Ready for a decision" tone="warn" />
        <SummaryCard label="Recovery" value={jobSummary.recovery} hint="Retry or investigate" tone="danger" />
        <SummaryCard label="Completed" value={jobSummary.completed} hint="Finished in this view" tone="success" />
      </section>

      <ComputeWakeDiagnostic />

      <section className="pivot-compute-jobs__composer pivot-lab__panel" aria-label="Start a compute run">
        {isFleet ? (
          <FleetComputeJobCreateForm
            tenants={tenants}
            onCreated={(job) => {
              refetchList({ silent: true });
              if (job?.externalJobId) selectJob(job.externalJobId);
            }}
          />
        ) : (
          <ComputeJobCreateForm
            tenantKey={tenantKey}
            onCreated={(job) => {
              refetchList({ silent: true });
              if (job?.externalJobId) selectJob(job.externalJobId);
            }}
          />
        )}
      </section>

      <section className="pivot-compute-jobs__activity" aria-labelledby="compute-jobs-list">
        <div className="pivot-compute-jobs__activity-head">
          <div>
            <span className="pivot-compute-jobs__eyebrow">Operations queue</span>
            <h2 id="compute-jobs-list" className="pivot-compute-jobs__activity-title">Recent activity</h2>
            <p className="pivot-lab__section-hint">
              {jobs.length} job{jobs.length === 1 ? '' : 's'}{hasFilters ? ' matching filters' : ' in the latest window'}
              {shouldPollList ? ' · Live updates on' : ''}
            </p>
          </div>
          <div className="pivot-compute-jobs__filters" aria-label="Job filters">
            <label className="pivot-compute-jobs__filter pivot-compute-jobs__filter--inline">
              <span>Status</span>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => updateSearchParam('computeStatus', event.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="pivot-compute-jobs__filter pivot-compute-jobs__filter--inline">
              <span>Kind</span>
              <select
                aria-label="Filter by kind"
                value={kindFilter}
                onChange={(event) => updateSearchParam('computeKind', event.target.value)}
              >
                {KIND_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {hasFilters ? (
              <button
                type="button"
                className="pivot-compute-jobs__reset-filters"
                onClick={resetFilters}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        <div className="pivot-compute-jobs__workspace">
          <div className="pivot-compute-jobs__queue" aria-label="Compute jobs">
            {listError ? (
              <p className="pivot-lab__error pivot-compute-jobs__state" role="alert">{listError}</p>
            ) : null}

            {listLoading && jobs.length === 0 ? (
              <p className="pivot-lab__empty pivot-compute-jobs__state">Loading compute jobs…</p>
            ) : null}

            {!listLoading && jobs.length === 0 && !listError ? (
              <div className="pivot-compute-jobs__state">
                <strong>No jobs in this view</strong>
                <p className="pivot-lab__empty">No compute jobs match these filters.</p>
              </div>
            ) : null}

            {jobs.length > 0 ? (
              <ul className="pivot-compute-jobs__queue-list">
                {jobs.map((job) => (
                  <ComputeJobListItem
                    key={job.externalJobId}
                    job={job}
                    isSelected={job.externalJobId === selectedJobId}
                    nowMs={nowMs}
                    showCity={isFleet}
                    onSelect={() => selectJob(job.externalJobId)}
                  />
                ))}
              </ul>
            ) : null}
          </div>

          <aside className="pivot-compute-jobs__inspector" aria-labelledby="compute-job-detail-heading">
            <div className="pivot-compute-jobs__inspector-head">
              <div>
                <span className="pivot-compute-jobs__eyebrow">Inspector</span>
                <h2 id="compute-job-detail-heading" className="pivot-compute-jobs__inspector-title">
                  {selectedJobId ? 'Job detail' : 'Select a job'}
                </h2>
                {selectedJobId ? (
                  <p className="pivot-compute-jobs__inspector-id pivot-compute-jobs__mono">
                    {selectedJobId}
                  </p>
                ) : null}
              </div>
              {selectedJobId ? (
                <button
                  type="button"
                  className="pivot-compute-jobs__close"
                  onClick={clearSelection}
                  aria-label="Clear selection"
                  title="Close inspector"
                >
                  ×
                </button>
              ) : null}
            </div>

            {selectedJobId ? (
              <>
                <ComputeJobDetail
                  job={detailJob}
                  attempts={detailAttempts}
                  loading={detailLoading}
                  error={detailError}
                  nowMs={nowMs}
                  tenantKey={isFleet ? detailJob?.tenantKey || detailJob?.cityKey : tenantKey}
                />
                <ComputeJobDetailActions
                  job={detailJob}
                  tenantKey={isFleet ? detailJob?.tenantKey || detailJob?.cityKey : tenantKey}
                  onJobUpdated={(updatedJob) => {
                    if (updatedJob?.externalJobId === selectedJobId) {
                      setDetailJob(updatedJob);
                      setDetailError(null);
                    }
                    refetchList({ silent: true });
                  }}
                />
              </>
            ) : (
              <div className="pivot-compute-jobs__inspector-empty">
                <span className="pivot-compute-jobs__inspector-glyph" aria-hidden="true">↗</span>
                <strong>Choose a run to inspect</strong>
                <p>Open a job to see its execution history, recovery guidance, result state, and available actions.</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="pivot-compute-jobs__privacy-note" aria-label="Security note">
        <span aria-hidden="true">●</span>
        Worker credentials and private diagnostics are redacted from this workspace.
      </section>

      {!isFleet ? (
        <PivotComputeJobReview
          tenantKey={tenantKey}
          onSubmitted={() => refetchList({ silent: true })}
          onApplied={() => {
            refetchList({ silent: true });
            if (selectedJobId) loadDetail({ silent: true });
          }}
        />
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotComputeJobs;
