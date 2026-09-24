/**
 * Read-only Layer C adapter: PivotComputeJob (+ latest attempt) → meridian
 * job run list/detail shape. Does not enqueue, mutate, or copy Relay schedule
 * metadata. Existing `/admin/pivot/compute-jobs` APIs stay authoritative.
 */
const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const {
  listComputeJobs,
  listComputeJobAttempts,
  findJobByExternalId,
} = require('./pivotComputeJobStore');
const { COMPUTE_JOB_STATUSES } = require('../utilities/pivotComputeJobTransitions');
const { computeJobInspectorHref } = require('../utilities/pivotAdminHrefs');

const COMPUTE_RUN_ID_PREFIX = 'compute:';
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

const COMPUTE_TO_MERIDIAN_STATUS = Object.freeze({
  pending: 'pending',
  leased: 'running',
  running: 'running',
  applying: 'running',
  'review-required': 'preview',
  retryable: 'retry_wait',
  completed: 'succeeded',
  failed: 'failed',
  cancelled: 'failed',
  expired: 'failed',
});

const COMPUTE_ATTEMPT_TO_MERIDIAN_STATUS = Object.freeze({
  leased: 'running',
  running: 'running',
  completed: 'succeeded',
  failed: 'failed',
  expired: 'failed',
  cancelled: 'failed',
});

function adapterError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function parseLimit(value, fallback = DEFAULT_LIST_LIMIT) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw adapterError('limit must be a number', 'INVALID_LIMIT');
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIST_LIMIT);
}

function mapComputeStatusToMeridian(status) {
  return COMPUTE_TO_MERIDIAN_STATUS[status] || 'pending';
}

function mapComputeAttemptStatusToMeridian(status) {
  return COMPUTE_ATTEMPT_TO_MERIDIAN_STATUS[status] || 'running';
}

function computeRunId(externalJobId) {
  return `${COMPUTE_RUN_ID_PREFIX}${String(externalJobId || '').trim()}`;
}

function parseComputeRunId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  if (raw.startsWith(COMPUTE_RUN_ID_PREFIX)) {
    return raw.slice(COMPUTE_RUN_ID_PREFIX.length);
  }
  return raw;
}

function lastErrorFromCompute(job, attempt = null) {
  const failure = attempt?.failure || job?.failure;
  if (!failure || typeof failure !== 'object') return null;
  const code = failure.code ? String(failure.code) : '';
  const message = failure.message ? String(failure.message) : '';
  const combined = [code, message].filter(Boolean).join(': ');
  return combined ? combined.slice(0, 1000) : null;
}

function summaryFromCompute(job) {
  const progress = job?.progress;
  const resultSummary = job?.result?.embeddedSummary
    || job?.result?.embedded?.summary
    || job?.result?.summary
    || null;
  const message = typeof resultSummary === 'string'
    ? resultSummary
    : (progress?.message || progress?.phase || null);
  return {
    attempted: 0,
    accepted: 0,
    failed: job?.status === 'failed' ? 1 : 0,
    skipped: 0,
    recipientOverflowCount: 0,
    message: message ? String(message).slice(0, 1000) : null,
  };
}

function originPayload(job) {
  const origin = job?.origin && typeof job.origin === 'object' ? job.origin : {};
  return {
    kind: job?.kind || null,
    originType: origin.type || null,
    requestedBy: origin.requestedBy || null,
    contextVersion: job?.contextVersion || null,
    readOnly: true,
  };
}

function adaptComputeAttemptToMeridian(attempt) {
  if (!attempt) return null;
  const error = lastErrorFromCompute(null, attempt);
  return {
    id: attempt.id ? String(attempt.id) : null,
    runId: computeRunId(attempt.externalJobId),
    attemptNumber: attempt.attemptNumber,
    status: mapComputeAttemptStatusToMeridian(attempt.status),
    computeStatus: attempt.status || null,
    error,
    startedAt: attempt.startedAt || attempt.leasedAt || null,
    finishedAt: attempt.finishedAt || null,
    createdAt: attempt.createdAt || null,
  };
}

function adaptComputeJobToRun(job, latestAttempt = null) {
  if (!job) return null;
  const tenantKey = String(job.tenantKey || job.cityKey || '').trim().toLowerCase();
  const externalJobId = job.externalJobId || '';
  const inspectorHref = computeJobInspectorHref(tenantKey, externalJobId);
  return {
    id: computeRunId(externalJobId),
    runKey: externalJobId,
    category: 'compute_surface',
    type: job.kind || 'compute',
    tenantKey,
    status: mapComputeStatusToMeridian(job.status),
    computeStatus: job.status || null,
    scheduledFor: job.requestedAt || job.createdAt || null,
    nextAttemptAt: job.status === 'retryable' ? (job.updatedAt || null) : null,
    attemptCount: job.attemptCount || latestAttempt?.attemptNumber || 0,
    maxAttempts: null,
    payload: originPayload(job),
    summary: summaryFromCompute(job),
    lastError: lastErrorFromCompute(job, latestAttempt),
    failureAlertSentAt: null,
    pivotDropPushRunId: null,
    claimedAt: job.leasedAt || null,
    startedAt: job.startedAt || latestAttempt?.startedAt || null,
    finishedAt: job.completedAt || latestAttempt?.finishedAt || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    source: 'compute',
    readOnly: true,
    inspectorHref,
    externalJobId,
  };
}

function computeStatusesForFilter(status) {
  const normalized = typeof status === 'string' ? status.trim() : '';
  if (!normalized) return null;
  const mapped = COMPUTE_JOB_STATUSES.filter(
    (computeStatus) => mapComputeStatusToMeridian(computeStatus) === normalized,
  );
  if (mapped.length === 1) return mapped[0];
  if (mapped.length > 1) return mapped;
  if (COMPUTE_JOB_STATUSES.includes(normalized)) return normalized;
  throw adapterError(`Unsupported job status filter: ${normalized}`, 'INVALID_STATUS_FILTER');
}

async function latestAttemptsForJobs(req, jobs) {
  const ids = (jobs || [])
    .map((job) => job.id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map();

  const jobReq = await resolveJobReq(req);
  const { PivotComputeJobAttempt } = getGlobalModels(jobReq, 'PivotComputeJobAttempt');
  const rows = await PivotComputeJobAttempt.find({ computeJobId: { $in: ids } })
    .sort({ attemptNumber: -1 })
    .lean();
  const latest = new Map();
  rows.forEach((row) => {
    const key = String(row.computeJobId);
    if (!latest.has(key)) {
      latest.set(key, {
        id: String(row._id),
        computeJobId: key,
        externalJobId: row.externalJobId,
        attemptNumber: row.attemptNumber,
        status: row.status,
        failure: row.failure || null,
        startedAt: row.startedAt || null,
        leasedAt: row.leasedAt || null,
        finishedAt: row.finishedAt || null,
        createdAt: row.createdAt || null,
      });
    }
  });
  return latest;
}

async function listAdaptedComputeJobRuns(req, {
  tenantKey = null,
  type = null,
  status = null,
  limit = DEFAULT_LIST_LIMIT,
  cursor = null,
} = {}) {
  const jobReq = await resolveJobReq(req);
  const pageSize = parseLimit(limit);
  const statusFilter = computeStatusesForFilter(status);
  const kind = typeof type === 'string' ? type.trim() : '';

  if (Array.isArray(statusFilter)) {
    const { PivotComputeJob } = getGlobalModels(jobReq, 'PivotComputeJob');
    const query = { status: { $in: statusFilter } };
    const city = typeof tenantKey === 'string' ? tenantKey.trim().toLowerCase() : '';
    if (city) query.cityKey = city;
    if (kind) query.kind = kind;
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        query.createdAt = { $lt: cursorDate };
      }
    }
    const rows = await PivotComputeJob.find(query)
      .sort({ createdAt: -1 })
      .limit(pageSize + 1)
      .lean();
    const hasMore = rows.length > pageSize;
    const jobs = rows.slice(0, pageSize).map((row) => ({
      id: String(row._id),
      ...row,
      tenantKey: row.tenantKey || row.cityKey,
    }));
    const attempts = await latestAttemptsForJobs(jobReq, jobs);
    const runs = jobs.map((job) => adaptComputeJobToRun(job, attempts.get(job.id) || null));
    return {
      runs,
      nextCursor: hasMore ? runs[runs.length - 1].createdAt : null,
    };
  }

  const listed = await listComputeJobs(jobReq, {
    cityKey: tenantKey,
    status: statusFilter,
    kind: kind || null,
    limit: pageSize,
    cursor,
  });
  const attempts = await latestAttemptsForJobs(jobReq, listed.jobs);
  return {
    runs: listed.jobs.map((job) => adaptComputeJobToRun(job, attempts.get(job.id) || null)),
    nextCursor: listed.nextCursor,
  };
}

async function getAdaptedComputeJobRun(req, id, { tenantKey = null } = {}) {
  const externalJobId = parseComputeRunId(id);
  if (!externalJobId) {
    throw adapterError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }

  const jobReq = await resolveJobReq(req);
  let job;
  try {
    job = await findJobByExternalId(jobReq, externalJobId);
  } catch (error) {
    throw adapterError(error.message || 'Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  if (!job) {
    throw adapterError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }

  const scoped = typeof tenantKey === 'string' ? tenantKey.trim().toLowerCase() : '';
  const jobTenant = String(job.tenantKey || job.cityKey || '').trim().toLowerCase();
  if (scoped && jobTenant !== scoped) {
    throw adapterError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }

  let attempts = [];
  try {
    attempts = await listComputeJobAttempts(jobReq, externalJobId);
  } catch (error) {
    attempts = [];
  }
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    run: adaptComputeJobToRun(job, latest),
    attempts: attempts.map(adaptComputeAttemptToMeridian),
    deliveries: [],
    source: 'compute',
  };
}

module.exports = {
  COMPUTE_RUN_ID_PREFIX,
  COMPUTE_TO_MERIDIAN_STATUS,
  computeRunId,
  parseComputeRunId,
  mapComputeStatusToMeridian,
  adaptComputeJobToRun,
  adaptComputeAttemptToMeridian,
  listAdaptedComputeJobRuns,
  getAdaptedComputeJobRun,
};
