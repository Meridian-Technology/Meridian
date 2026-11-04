const { CONTRACT_VERSION } = require('../utilities/pivotAdminComputeJobContract');
const { normalizeWorkerCapabilityPayload } = require('./pivotComputeWorkerAuth');
const {
  assertLeaseBinding,
  createWorkerContextAuthorizer,
  buildJobObservation,
  buildLeaseBinding,
} = require('./pivotComputeLease');
const {
  createComputeJob,
  findJobByExternalId,
  updateComputeJobContextVersion,
  claimNextPendingJob,
  startComputeJob,
  heartbeatComputeJobLease,
  recordComputeJobProgress,
  submitComputeJobResult,
  listComputeJobAttempts,
  normalizeLeaseCapability,
} = require('./pivotComputeJobStore');

const MAX_REQUEST_FIELD_LENGTH = 256;
const MAX_OPTIONS_KEYS = 20;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serviceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function rejectUnknownFields(body, allowedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw serviceError('Request body must be a JSON object', 'INVALID_REQUEST_BODY');
  }
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) {
      throw serviceError(`Unknown request field: ${key}`, 'UNKNOWN_REQUEST_FIELD');
    }
  }
}

function boundedOptions(rawOptions = {}) {
  if (!rawOptions || typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
    return {};
  }
  const entries = Object.entries(rawOptions).slice(0, MAX_OPTIONS_KEYS);
  return Object.fromEntries(entries);
}

function normalizeCapabilityForLease(capabilityPayload, workerId) {
  const capability = normalizeWorkerCapabilityPayload(capabilityPayload, workerId);
  return normalizeLeaseCapability({
    contractVersion: capability.contractVersion,
    implementationRevision: capability.implementationRevision,
    supportedContractVersions: capability.supportedContractVersions,
    supportedKinds: capability.supportedKinds,
  });
}

async function buildAuthorizedContext(req, job, workerId) {
  const authorize = createWorkerContextAuthorizer({
    workerId,
    externalJobId: job.externalJobId,
    cityKey: job.cityKey,
    kind: job.kind,
    scheduleOccurrenceId: job.scheduleOccurrenceId,
  });
  const jobOptions = boundedOptions(job.options);
  const contextOptions = {
    ...jobOptions,
    cityKey: job.cityKey,
    jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId,
    authorize,
    // Discovery configuration is intentionally portable. The snapshot builder
    // resolves these request-time overrides against the tenant defaults.
    discoveryOverrides: jobOptions,
  };

  if (job.kind === 'city-source-discovery') {
    const { buildCityDiscoveryContextSnapshot } = require('./pivotOffloadedDiscoveryContextService');
    const result = await buildCityDiscoveryContextSnapshot(req, contextOptions);
    if (result?.error) throw serviceError(result.error, result.code || 'DISCOVERY_CONTEXT_FAILED', result.status || 500);
    return result.data.snapshot;
  }
  if (job.kind === 'city-curation-refresh') {
    const { buildCityCurationRefreshContextSnapshot } = require('./pivotOffloadedCurationRefreshContextService');
    const result = await buildCityCurationRefreshContextSnapshot(req, contextOptions);
    if (result?.error) throw serviceError(result.error, result.code || 'REFRESH_CONTEXT_FAILED', result.status || 500);
    return result.data.snapshot;
  }
  if (job.kind === 'carousel-export') {
    const { buildCarouselExportContextSnapshot } = require('./pivotCarouselComputeContextService');
    const result = await buildCarouselExportContextSnapshot(req, { job });
    if (result?.error) throw serviceError(result.error, result.code || 'CAROUSEL_CONTEXT_FAILED', result.status || 500);
    return result.data.snapshot;
  }
  if (job.kind === 'carousel-compose') {
    const { buildCarouselComposeContextSnapshot } = require('./pivotCarouselComposeContextService');
    const result = await buildCarouselComposeContextSnapshot(req, { job });
    if (result?.error) throw serviceError(result.error, result.code || 'COMPOSE_CONTEXT_FAILED', result.status || 500);
    return result.data.snapshot;
  }
  throw serviceError(`Unsupported compute job kind: ${job.kind}`, 'UNSUPPORTED_COMPUTE_JOB_KIND');
}

async function registerScheduleOccurrence(req, {
  workerId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, [
    'jobId',
    'scheduleOccurrenceId',
    'scheduleId',
    'kind',
    'cityKey',
    'contractVersion',
    'idempotencyKey',
    'options',
    'capability',
  ]);

  const capability = normalizeCapabilityForLease(body.capability, workerId);
  const externalJobId = trimString(body.jobId);
  const scheduleOccurrenceId = trimString(body.scheduleOccurrenceId);
  const scheduleId = trimString(body.scheduleId);
  const kind = trimString(body.kind);
  const cityKey = trimString(body.cityKey).toLowerCase();
  const contractVersion = trimString(body.contractVersion || CONTRACT_VERSION);
  const createIdempotencyKey = trimString(body.idempotencyKey);

  if (!externalJobId || !scheduleOccurrenceId || !scheduleId || !kind || !cityKey || !createIdempotencyKey) {
    throw serviceError('Schedule occurrence registration is incomplete', 'INVALID_SCHEDULE_OCCURRENCE');
  }
  if (contractVersion !== CONTRACT_VERSION) {
    throw serviceError(`Unsupported contract version: ${contractVersion}`, 'UNSUPPORTED_COMPUTE_CONTRACT_VERSION', 400);
  }
  if (!capability.supportedKinds.includes(kind)) {
    throw serviceError('Worker capability does not support requested kind', 'COMPUTE_WORKER_CAPABILITY_INCOMPATIBLE', 409);
  }

  const { job, created } = await createComputeJob(req, {
    externalJobId,
    kind,
    cityKey,
    contractVersion,
    contextVersion: 'ctx:pending',
    implementationRevision: capability.implementationRevision,
    createIdempotencyKey,
    scheduleOccurrenceId,
    requestedAt: now.toISOString(),
    origin: {
      type: 'schedule',
      scheduleId,
      scheduleOccurrenceId,
    },
    options: boundedOptions(body.options),
  });

  const claim = await claimNextPendingJob(req, {
    externalJobId: job.externalJobId,
    kind: job.kind,
    cityKey: job.cityKey,
    workerId,
    capability: body.capability,
    now,
  });

  if (!claim.job) {
    throw serviceError(
      'Schedule occurrence could not be leased to the registering worker',
      'SCHEDULE_OCCURRENCE_LEASE_UNAVAILABLE',
      409,
    );
  }
  const context = await buildAuthorizedContext(req, claim.job, workerId);
  const updatedJob = await updateComputeJobContextVersion(req, claim.job.externalJobId, context.contextVersion,
    claim.job.kind === 'carousel-compose' ? { composeContext: context, leaseToken: claim.job.lease.token } : {});

  return {
    created,
    job: updatedJob,
    context,
    attempt: claim.attempt,
    lease: buildLeaseBinding(claim.job, claim.attempt),
  };
}

async function claimCompatibleJob(req, {
  workerId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['kind', 'cityKey', 'capability', 'leaseMs']);
  const kind = trimString(body.kind);
  const cityKey = trimString(body.cityKey).toLowerCase() || null;
  normalizeCapabilityForLease(body.capability, workerId);

  const claim = await claimNextPendingJob(req, {
    kind,
    cityKey,
    workerId,
    capability: body.capability,
    leaseMs: Number(body.leaseMs) || undefined,
    now,
  });

  if (!claim.job) {
    return { job: null, attempt: null, lease: null };
  }

  return {
    job: claim.job,
    attempt: claim.attempt,
    lease: buildLeaseBinding(claim.job, claim.attempt),
  };
}

async function fetchJobContext(req, {
  workerId,
  externalJobId,
  leaseToken,
  now = new Date(),
}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  assertLeaseBinding({ job, workerId, leaseToken, requireActive: true, now });
  const context = await buildAuthorizedContext(req, job, workerId);
  const updatedJob = await updateComputeJobContextVersion(req, job.externalJobId, context.contextVersion,
    job.kind === 'carousel-compose' ? { composeContext: context, leaseToken } : {});
  return { job: updatedJob, context };
}

async function startLeasedJob(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability']);
  const leaseToken = trimString(body.leaseToken);
  normalizeCapabilityForLease(body.capability, workerId);
  const job = await startComputeJob(req, {
    externalJobId,
    leaseToken,
    workerId,
    now,
  });
  return { job, lease: buildLeaseBinding(job) };
}

async function renewJobLease(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability', 'leaseMs', 'progress']);
  const leaseToken = trimString(body.leaseToken);
  normalizeCapabilityForLease(body.capability, workerId);
  let job = await heartbeatComputeJobLease(req, {
    externalJobId,
    leaseToken,
    workerId,
    leaseMs: Number(body.leaseMs) || undefined,
    now,
  });
  if (body.progress && typeof body.progress === 'object') {
    job = await recordComputeJobProgress(req, {
      externalJobId,
      leaseToken,
      workerId,
      phase: body.progress.phase,
      message: body.progress.message,
      counters: body.progress.counters,
      now,
    });
  }
  return { job, lease: buildLeaseBinding(job) };
}

async function observeJobCancellation(req, {
  workerId,
  externalJobId,
  leaseToken,
}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  assertLeaseBinding({
    job,
    workerId,
    leaseToken,
    requireActive: false,
  });
  return buildJobObservation(job);
}

async function submitTerminalJobResult(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability', 'result', 'retryable', 'requiresReview']);
  const leaseToken = trimString(body.leaseToken);
  normalizeCapabilityForLease(body.capability, workerId);
  const job = await submitComputeJobResult(req, {
    externalJobId,
    leaseToken,
    workerId,
    result: body.result,
    retryable: Boolean(body.retryable),
    requiresReview: body.requiresReview !== false,
    now,
  });
  if (job.kind === 'carousel-compose' && job.result?.embedded?.outcome === 'completed') {
    const { applyCarouselComposeJob } = require('./pivotComputeAdminService');
    return applyCarouselComposeJob(req, externalJobId, { tenantKey: job.tenantKey, actor: `worker:${workerId}`, now });
  }
  return { job };
}

async function initializeJobArtifactUploads(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability', 'grantToken', 'slideCount', 'artifacts']);
  const leaseToken = trimString(body.leaseToken);
  normalizeCapabilityForLease(body.capability, workerId);
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  assertLeaseBinding({ job, workerId, leaseToken, requireActive: true, now });
  const { initializeCarouselArtifactUploads } = require('./pivotCarouselArtifactTransportService');
  return initializeCarouselArtifactUploads(req, {
    job,
    grantToken: body.grantToken,
    slideCount: body.slideCount,
    artifacts: body.artifacts,
    now,
  });
}

async function finalizeJobArtifactUploads(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability', 'grantToken', 'artifacts']);
  const leaseToken = trimString(body.leaseToken);
  normalizeCapabilityForLease(body.capability, workerId);
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  assertLeaseBinding({ job, workerId, leaseToken, requireActive: true, now });
  const { finalizeCarouselArtifactUploads } = require('./pivotCarouselArtifactTransportService');
  return finalizeCarouselArtifactUploads(req, {
    job,
    grantToken: body.grantToken,
    artifacts: body.artifacts,
    now,
  });
}

async function reportRetryableJobFailure(req, {
  workerId,
  externalJobId,
  body,
  now = new Date(),
}) {
  rejectUnknownFields(body, ['leaseToken', 'capability', 'idempotencyKey', 'failure', 'basedOnContextVersion']);
  const leaseToken = trimString(body.leaseToken);
  const capability = normalizeCapabilityForLease(body.capability, workerId);
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  assertLeaseBinding({ job, workerId, leaseToken, capability, requireActive: true, now });

  const idempotencyKey = trimString(body.idempotencyKey);
  const failure = body.failure || {};
  const code = trimString(failure.code) || 'WORKER_RETRYABLE_FAILURE';
  const message = trimString(failure.message) || 'Compute worker reported a retryable failure';
  const details = Array.isArray(failure.details)
    ? failure.details
      .map((entry) => trimString(entry).replace(/[\u0000-\u001F]/g, ' ').slice(0, 240))
      .filter(Boolean)
      .slice(0, 12)
    : [];
  if (!idempotencyKey) {
    throw serviceError('Retryable failure idempotencyKey is required', 'INVALID_RETRYABLE_FAILURE');
  }

  const emptyProposals = job.kind === 'city-curation-refresh'
    ? { jobOutcomes: [], events: [] }
    : { sources: [], curationJobs: [], events: [] };
  const summary = job.kind === 'city-curation-refresh'
    ? { jobsRun: 0, jobsFailed: 1, eventsProposed: 0, eventsRefreshed: 0 }
    : { searched: 0, qualified: 0, rejected: 0, eventsProposed: 0 };

  const result = job.kind === 'carousel-export' ? {
    contractVersion: CONTRACT_VERSION,
    jobId: job.externalJobId,
    scheduleOccurrenceId: null,
    kind: job.kind,
    tenantKey: job.tenantKey,
    cityKey: job.cityKey,
    deckId: job.options?.deckId,
    attemptId: String(job.lease?.attemptId || ''),
    implementationRevision: capability.implementationRevision,
    basedOnContextVersion: trimString(body.basedOnContextVersion || job.contextVersion),
    completedAt: now.toISOString(),
    outcome: 'failed',
    idempotencyKey,
    renderedDeckRevision: job.options?.deckRevision,
    slideCount: 0,
    renderDurationMs: 0,
    artifacts: [],
    warnings: [],
    failure: { code: code.slice(0, MAX_REQUEST_FIELD_LENGTH), message: message.slice(0, 1000) },
  } : {
    contractVersion: CONTRACT_VERSION,
    jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId ?? null,
    kind: job.kind,
    cityKey: job.cityKey,
    implementationRevision: capability.implementationRevision,
    basedOnContextVersion: trimString(body.basedOnContextVersion || job.contextVersion),
    completedAt: now.toISOString(),
    outcome: 'failed',
    idempotencyKey,
    failure: { code: code.slice(0, MAX_REQUEST_FIELD_LENGTH), message: message.slice(0, 1000) },
    proposals: emptyProposals,
    summary,
  };

  const updated = await submitComputeJobResult(req, {
    externalJobId,
    leaseToken,
    workerId,
    result,
    retryable: true,
    requiresReview: false,
    failureDetails: details,
    now,
  });
  return { job: updated };
}

async function listJobAttempts(req, { workerId, externalJobId, leaseToken }) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  if (job.lease) {
    assertLeaseBinding({ job, workerId, leaseToken, requireActive: false });
  }
  const attempts = await listComputeJobAttempts(req, externalJobId);
  return { attempts };
}

const STATUS_BY_CODE = Object.freeze({
  COMPUTE_JOB_NOT_FOUND: 404,
  COMPUTE_JOB_LEASE_MISMATCH: 403,
  COMPUTE_JOB_WORKER_MISMATCH: 403,
  COMPUTE_JOB_ATTEMPT_LEASE_MISMATCH: 403,
  COMPUTE_JOB_LEASE_CAPABILITY_MISMATCH: 403,
  COMPUTE_JOB_LEASE_EXPIRED: 409,
  COMPUTE_JOB_LEASE_INACTIVE: 409,
  COMPUTE_JOB_NOT_RUNNING: 409,
  COMPUTE_JOB_NOT_LEASE_ACTIVE: 409,
  COMPUTE_WORKER_CAPABILITY_INCOMPATIBLE: 409,
  UNSUPPORTED_COMPUTE_CONTRACT_VERSION: 400,
  INVALID_WORKER_CAPABILITY: 400,
  WORKER_CAPABILITY_ID_MISMATCH: 403,
  UNKNOWN_REQUEST_FIELD: 400,
  INVALID_REQUEST_BODY: 400,
  INVALID_SCHEDULE_OCCURRENCE: 400,
  INVALID_RETRYABLE_FAILURE: 400,
  INVALID_COMPUTE_EXECUTION_RESULT: 400,
  COMPUTE_RESULT_BINDING_MISMATCH: 409,
  COMPUTE_RESULT_TOO_LARGE: 413,
  ARTIFACT_GRANT_REQUIRED: 400,
  INVALID_ARTIFACT_UPLOADS: 400,
  ARTIFACT_GRANT_INVALID: 401,
  ARTIFACT_GRANT_WRONG_PURPOSE: 403,
  ARTIFACT_GRANT_BINDING_MISMATCH: 403,
  ARTIFACT_KIND_UNSUPPORTED: 409,
  UNAPPROVED_EXPORT_FILENAME: 400,
  UNAPPROVED_EXPORT_CONTENT_TYPE: 400,
  DUPLICATE_EXPORT_FILENAME: 400,
  ARTIFACT_SIZE_INVALID: 400,
  ARTIFACT_CHECKSUM_INVALID: 400,
  ARTIFACT_COUNT_INVALID: 400,
  ARTIFACT_TOTAL_SIZE_INVALID: 400,
  ARTIFACTS_NOT_INITIALIZED: 409,
  ARTIFACT_NOT_INITIALIZED: 409,
  ARTIFACTS_ALREADY_FINALIZED: 409,
  ARTIFACT_ALREADY_VERIFIED: 409,
  ARTIFACT_ID_MISMATCH: 409,
  ARTIFACT_UPLOAD_MISMATCH: 409,
  ARTIFACT_MANIFEST_MISMATCH: 409,
  ARTIFACT_ATTEMPT_MISMATCH: 409,
  ARTIFACT_SIZE_MISMATCH: 409,
  ARTIFACT_CONTENT_TYPE_MISMATCH: 409,
  ARTIFACT_CHECKSUM_MISMATCH: 409,
  EXPORT_OBJECT_NOT_FOUND: 409,
  EXPORT_OBJECT_PREFIX_MISMATCH: 409,
  CAROUSEL_ARTIFACTS_NOT_FINALIZED: 409,
  CAROUSEL_EXPORT_STORAGE_UNCONFIGURED: 503,
  CAROUSEL_SLIDE_COUNT_INVALID: 422,
});

function handleWorkerServiceError(res, error) {
  const status = error.status || STATUS_BY_CODE[error.code] || 500;
  return res.status(status).json({
    error: error.message || 'Compute worker request failed',
    code: error.code || 'COMPUTE_WORKER_ERROR',
  });
}

module.exports = {
  registerScheduleOccurrence,
  claimCompatibleJob,
  fetchJobContext,
  startLeasedJob,
  renewJobLease,
  observeJobCancellation,
  submitTerminalJobResult,
  reportRetryableJobFailure,
  initializeJobArtifactUploads,
  finalizeJobArtifactUploads,
  listJobAttempts,
  handleWorkerServiceError,
};
