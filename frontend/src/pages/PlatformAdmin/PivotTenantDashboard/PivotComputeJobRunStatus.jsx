import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { ComputeJobDetailActions } from './ComputeJobActions';
import {
  ACTIVE_COMPUTE_JOB_STATUSES,
  DEVELOPMENT_COMPUTE_WORKER_ID,
  formatComputeJobKind,
  formatTimestamp,
  resolveWorkerId,
} from './pivotComputeJobsFormat';
import './PivotComputeJobs.scss';

const NO_FETCH_CACHE = { enabled: false };
const POLL_MS = 2500;

const CLAIMED_STATUSES = new Set(['leased', 'running', 'review-required', 'applying', 'completed']);
const RUN_STATUSES = new Set(['running', 'review-required', 'applying', 'completed']);
const FINISHED_STATUSES = new Set(['review-required', 'applying', 'completed']);
const FAILURE_STATUSES = new Set(['retryable', 'failed', 'cancelled', 'expired']);

function stepState(done, active, failed = false) {
  if (failed) return 'error';
  if (done) return 'done';
  return active ? 'active' : 'waiting';
}

function StatusStep({ state, title, detail }) {
  const icon = state === 'done'
    ? 'mdi:check'
    : state === 'error'
      ? 'mdi:alert-outline'
      : state === 'active'
        ? 'mdi:loading'
        : 'mdi:circle-outline';
  return (
    <li className={`pivot-compute-run__step is-${state}`}>
      <span className="pivot-compute-run__step-icon" aria-hidden="true">
        <Icon icon={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </li>
  );
}

export function useTenantComputeJob({ tenantKey, kind, onFinished }) {
  const [job, setJob] = useState(null);
  const [wake, setWake] = useState(null);
  const previousStatusRef = useRef(null);
  const finishedJobIdsRef = useRef(new Set());

  const listUrl = tenantKey ? '/admin/pivot/compute-jobs' : null;
  const listParams = useMemo(() => ({ cityKey: tenantKey, kind, limit: 1 }), [kind, tenantKey]);
  const { data: listResponse, refetch: refetchList } = useFetch(listUrl, {
    params: listParams,
    cache: NO_FETCH_CACHE,
  });
  const listedJob = Array.isArray(listResponse?.jobs) ? listResponse.jobs[0] : null;

  useEffect(() => {
    setJob(null);
    setWake(null);
    previousStatusRef.current = null;
  }, [kind, tenantKey]);

  useEffect(() => {
    if (!listedJob) return;
    setJob((current) => {
      if (!current) return listedJob;
      if (current.externalJobId === listedJob.externalJobId) return { ...current, ...listedJob };
      const currentTime = Date.parse(current.requestedAt || current.createdAt || 0);
      const listedTime = Date.parse(listedJob.requestedAt || listedJob.createdAt || 0);
      return listedTime > currentTime ? listedJob : current;
    });
  }, [listedJob]);

  const externalJobId = job?.externalJobId || '';
  const detailUrl = externalJobId
    ? `/admin/pivot/compute-jobs/${encodeURIComponent(externalJobId)}`
    : null;
  const {
    data: detailResponse,
    error,
    refetch: refetchDetail,
  } = useFetch(detailUrl, { cache: NO_FETCH_CACHE });

  useEffect(() => {
    if (detailResponse?.job?.externalJobId === externalJobId) {
      setJob((current) => ({ ...current, ...detailResponse.job }));
    }
  }, [detailResponse, externalJobId]);

  const active = Boolean(job?.status && ACTIVE_COMPUTE_JOB_STATUSES.includes(job.status));

  useEffect(() => {
    if (!externalJobId || !active) return undefined;
    const timer = setInterval(refetchDetail, POLL_MS);
    return () => clearInterval(timer);
  }, [active, externalJobId, refetchDetail]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = job?.status || null;
    if (!job?.externalJobId || !previousStatus) return;
    const wasActive = ACTIVE_COMPUTE_JOB_STATUSES.includes(previousStatus);
    if (!wasActive || active || finishedJobIdsRef.current.has(job.externalJobId)) return;
    finishedJobIdsRef.current.add(job.externalJobId);
    onFinished?.(job);
  }, [active, job, onFinished]);

  const trackCreated = useCallback((payload) => {
    if (!payload?.job) return;
    setJob(payload.job);
    setWake(payload.wake || { status: 'unknown' });
    previousStatusRef.current = payload.job.status || 'pending';
    refetchList();
  }, [refetchList]);

  const updateJob = useCallback((nextJob) => {
    if (nextJob?.externalJobId) setJob((current) => ({ ...current, ...nextJob }));
  }, []);

  return {
    job,
    wake,
    active,
    error,
    trackCreated,
    updateJob,
    refetch: externalJobId ? refetchDetail : refetchList,
  };
}

function wakeDetail(wake) {
  if (!wake) return 'Wake delivery was not observed in this browser session.';
  if (wake.status === 'local') return 'This machine runs the scrape in process. The Mini is not woken.';
  if (wake.status === 'accepted') return 'The Mini accepted the wake request.';
  if (wake.status === 'disabled') return 'Direct wake is not configured; the Mini will collect the durable job on its next poll.';
  if (wake.status === 'failed') return 'Direct wake did not reach the Mini; the job remains queued and safe to collect on its next poll.';
  return 'The durable queue will hold the job until a Mini collects it.';
}

export function PivotComputeJobRunStatus({
  job,
  wake,
  error,
  tenantKey,
  onJobUpdated,
  className = '',
}) {
  if (!job) return null;

  const status = job.status || 'pending';
  const worker = resolveWorkerId(job);
  const local = wake?.status === 'local' || worker === DEVELOPMENT_COMPUTE_WORKER_ID;
  const claimed = CLAIMED_STATUSES.has(status) || Number(job.attemptCount) > 0 || Boolean(job.startedAt);
  const running = RUN_STATUSES.has(status) || Boolean(job.startedAt);
  const finished = FINISHED_STATUSES.has(status);
  const failed = FAILURE_STATUSES.has(status);
  const wakeAccepted = wake?.status === 'accepted';
  const wakeSettled = Boolean(wake);
  const resultReady = status === 'review-required';
  const executionTitle = local
    ? (status === 'running' ? 'Running here' : running ? 'Ran here' : 'Waiting to run')
    : status === 'running'
      ? 'Running on the Mini'
      : running
        ? 'Ran on the Mini'
        : 'Waiting to run';
  const claimedDetail = worker !== '—'
    ? `Worker ${worker} owns this attempt.`
    : job.startedAt
      ? 'The worker lease was released after execution; attempt history retains the worker identity.'
      : 'No worker lease has been recorded yet.';

  return (
    <div className={`pivot-compute-run ${failed ? 'is-error' : ''} ${className}`.trim()} role="status">
      <div className="pivot-compute-run__head">
        <div>
          <span className="pivot-compute-run__eyebrow">{local ? 'Local compute job' : 'Mini compute job'}</span>
          <h3>{formatComputeJobKind(job.kind)}</h3>
        </div>
        <span className="pivot-lab__pill">{status.replace(/-/g, ' ')}</span>
      </div>
      <ol className="pivot-compute-run__steps">
        <StatusStep
          state="done"
          title="Job created"
          detail={`Stored in the durable queue ${formatTimestamp(job.requestedAt || job.createdAt)}.`}
        />
        <StatusStep
          state={stepState(local || wakeAccepted || claimed, !claimed && !wakeSettled, wake?.status === 'failed' && !claimed)}
          title={local ? 'Local runner' : wakeAccepted ? 'Mini woken' : claimed ? 'Mini available' : 'Mini wake'}
          detail={wakeDetail(wake)}
        />
        <StatusStep
          state={stepState(claimed, !claimed && !failed, failed && !claimed)}
          title={claimed ? (local ? 'Claimed on this machine' : 'Mini collected the job') : (local ? 'Waiting for this machine' : 'Waiting for a Mini')}
          detail={claimedDetail}
        />
        <StatusStep
          state={stepState(running, claimed && !running && !failed, failed && !running)}
          title={executionTitle}
          detail={running
            ? (job.startedAt ? `Execution started ${formatTimestamp(job.startedAt)}.` : 'The worker has started execution.')
            : 'Execution begins after the worker validates the job context.'}
        />
        <StatusStep
          state={stepState(finished, running && !finished && !failed, failed)}
          title={resultReady ? 'Finished — ready for review' : finished ? 'Finished' : failed ? 'Job did not finish' : 'Waiting for result'}
          detail={failed
            ? `${job.failure?.code || 'JOB_FAILED'} · ${job.failure?.message || 'The worker did not return a reviewable result.'}`
            : resultReady
              ? 'The result is stored. Review its warnings and proposed changes before applying.'
              : finished
                ? 'This job has completed its review and apply lifecycle.'
                : 'The Curation panel will keep checking without streaming worker logs.'}
        />
      </ol>

      {error ? (
        <p className="pivot-lab__error" role="alert">
          Job status could not be refreshed: {String(error)}. The durable job is unaffected.
        </p>
      ) : null}

      {resultReady ? (
        <ComputeJobDetailActions
          job={job}
          tenantKey={tenantKey}
          onJobUpdated={onJobUpdated}
          allowManagementActions={false}
          previewButtonLabel="Open review"
        />
      ) : null}
    </div>
  );
}

export default PivotComputeJobRunStatus;
