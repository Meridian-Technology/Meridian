const {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  validateJobRequest,
  validateExecutionResult,
} = require('../utilities/pivotAdminComputeJobContract');
const {
  COMPUTE_JOB_STATUSES,
  canTransitionComputeJob,
} = require('../utilities/pivotComputeJobTransitions');
const { MAX_OPTIONS_BYTES } = require('../schemas/pivotComputeJob');
const {
  serializeJob,
  createComputeJob,
  findJobByExternalId,
  listComputeJobs,
  listComputeJobAttempts,
  cancelComputeJob,
  retryComputeJob,
  createManualUploadReviewJob,
} = require('./pivotComputeJobStore');
const { notifyComputeWorkerWake } = require('./pivotComputeWakeService');
const { logPivot } = require('../utilities/pivotLogger');
const {
  buildExportPrefix,
  assertObjectKeyBelongsToPrefix,
  createPresignedGetUrl,
} = require('./pivotExportArtifactStorage');

const ARTIFACTS_EXPIRED_MESSAGE = [
  'Export record available. Files expired after the retention period.',
  'Run another export to regenerate them.',
].join(' ');

const MAX_LIST_LIMIT = 100;
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
  const options = Object.fromEntries(Object.entries(rawOptions).slice(0, MAX_OPTIONS_KEYS));
  if (Buffer.byteLength(JSON.stringify(options), 'utf8') > MAX_OPTIONS_BYTES) {
    throw serviceError(`Job options exceed ${MAX_OPTIONS_BYTES} bytes`, 'COMPUTE_JOB_OPTIONS_TOO_LARGE', 413);
  }
  return options;
}

function maskLeaseToken(token) {
  const normalized = trimString(token);
  if (!normalized) return null;
  if (normalized.length <= 8) return '…';
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function serializeAdminJob(job, { includeEmbeddedResult = false } = {}) {
  if (!job) return null;
  const serialized = serializeJob(job);
  if (serialized.lease) {
    serialized.lease = {
      ...serialized.lease,
      token: maskLeaseToken(serialized.lease.token),
    };
  }
  if (!includeEmbeddedResult && serialized.result?.embedded) {
    const embedded = serialized.result.embedded;
    const embeddedByteSize = Buffer.byteLength(JSON.stringify(embedded), 'utf8');
    serialized.result = {
      mode: serialized.result.mode,
      artifactRef: serialized.result.artifactRef ?? null,
      resultIdempotencyKey: serialized.result.resultIdempotencyKey,
      submittedAt: serialized.result.submittedAt,
      contractVersion: serialized.result.contractVersion,
      hasEmbeddedResult: true,
      embeddedByteSize,
      embeddedSummary: embedded.summary ?? null,
      ...(serialized.kind === 'carousel-export' ? {
        renderedDeckRevision: embedded.renderedDeckRevision ?? null,
        slideCount: embedded.slideCount ?? null,
        renderDurationMs: embedded.renderDurationMs ?? null,
      } : {}),
    };
  }
  return serialized;
}

function validateAdminJobRequest(requestInput) {
  const validation = validateJobRequest(requestInput);
  if (!validation.valid) {
    throw serviceError(
      `Invalid compute job request: ${validation.errors.join(', ')}`,
      'INVALID_COMPUTE_JOB_REQUEST',
    );
  }
  const request = requestInput;
  if (trimString(request.contractVersion) !== CONTRACT_VERSION) {
    throw serviceError(
      `Unsupported compute contract version: ${request.contractVersion}`,
      'UNSUPPORTED_COMPUTE_CONTRACT_VERSION',
    );
  }
  if (!COMPUTE_JOB_KINDS.includes(request.kind)) {
    throw serviceError(`Unsupported compute job kind: ${request.kind}`, 'UNSUPPORTED_COMPUTE_JOB_KIND');
  }
  return request;
}

function validateManualSubmitResult(resultInput) {
  const validation = validateExecutionResult(resultInput);
  if (!validation.valid) {
    throw serviceError(
      `Invalid compute execution result: ${validation.errors.join(', ')}`,
      'INVALID_COMPUTE_EXECUTION_RESULT',
    );
  }
  if (trimString(resultInput.contractVersion) !== CONTRACT_VERSION) {
    throw serviceError(
      `Unsupported compute contract version: ${resultInput.contractVersion}`,
      'UNSUPPORTED_COMPUTE_CONTRACT_VERSION',
    );
  }
  if (resultInput.kind === 'carousel-export') {
    throw serviceError(
      'Carousel export results must be submitted by the worker that owns the attempt',
      'CAROUSEL_MANUAL_SUBMIT_UNSUPPORTED',
      409,
    );
  }
  if (resultInput.outcome !== 'completed') {
    throw serviceError('Manual submit requires a completed compute result', 'MANUAL_SUBMIT_NOT_COMPLETED');
  }
  return resultInput;
}

function jobRequestToCreateInput(request, actor) {
  return {
    externalJobId: request.jobId,
    kind: request.kind,
    cityKey: request.cityKey,
    contractVersion: request.contractVersion,
    contextVersion: request.contextVersion,
    implementationRevision: request.implementationRevision ?? null,
    createIdempotencyKey: request.idempotencyKey,
    scheduleOccurrenceId: request.scheduleOccurrenceId ?? null,
    requestedAt: request.requestedAt,
    origin: {
      type: 'admin',
      requestedBy: trimString(actor) || null,
      scheduleOccurrenceId: request.scheduleOccurrenceId ?? null,
    },
    options: boundedOptions(request.options),
  };
}

async function wakePendingComputeJob(job, notifyWake) {
  if (!job || job.status !== 'pending') return { status: 'not-requested' };
  try {
    const wake = await notifyWake({ externalJobId: job.externalJobId });
    return wake && typeof wake === 'object' ? wake : { status: 'unknown' };
  } catch (error) {
    // Wake is only a latency hint. The durable pending job and periodic worker
    // reconciliation remain authoritative when delivery or injected seams fail.
    logPivot('warn', 'compute worker wake threw unexpectedly', {
      code: error?.code || 'COMPUTE_WAKE_FAILED',
      message: error?.message || String(error),
    });
    return {
      status: 'failed',
      code: error?.code || 'COMPUTE_WAKE_FAILED',
    };
  }
}

async function bindCarouselExportRevision(req, request) {
  if (request.kind !== 'carousel-export') return request;
  const { deckRevision } = require('./pivotCarouselExportService');
  const getGlobalModels = require('./getGlobalModelService');
  const deckId = trimString(request.options?.deckId).toLowerCase();
  const tenantKey = trimString(request.cityKey).toLowerCase();
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const deck = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey })
    .select('updatedAt')
    .lean();
  if (!deck) {
    throw serviceError('Carousel deck not found', 'DECK_NOT_FOUND', 404);
  }
  const revision = deckRevision(deck);
  if (!revision) {
    throw serviceError('Carousel deck is missing a revision', 'DECK_REVISION_INVALID');
  }
  return {
    ...request,
    options: {
      ...request.options,
      deckId,
      deckRevision: revision,
    },
  };
}

async function createAdminComputeJob(req, {
  request: requestInput,
  actor = null,
  now = new Date(),
  notifyWake = notifyComputeWorkerWake,
} = {}) {
  const request = await bindCarouselExportRevision(req, validateAdminJobRequest(requestInput));
  const payload = jobRequestToCreateInput(request, actor);
  const { job, created } = await createComputeJob(req, {
    ...payload,
    requestedAt: payload.requestedAt || now.toISOString(),
  });
  const wake = await wakePendingComputeJob(job, notifyWake);
  return { job: serializeAdminJob(job), created, wake };
}

async function listAdminComputeJobs(req, {
  cityKey = null,
  status = null,
  kind = null,
  limit = 50,
  cursor = null,
} = {}) {
  const normalizedStatus = trimString(status);
  if (normalizedStatus && !COMPUTE_JOB_STATUSES.includes(normalizedStatus)) {
    throw serviceError(`Unsupported compute job status filter: ${normalizedStatus}`, 'INVALID_STATUS_FILTER');
  }
  const normalizedKind = trimString(kind);
  if (normalizedKind && !COMPUTE_JOB_KINDS.includes(normalizedKind)) {
    throw serviceError(`Unsupported compute job kind filter: ${normalizedKind}`, 'INVALID_KIND_FILTER');
  }

  const listed = await listComputeJobs(req, {
    cityKey,
    status: normalizedStatus || null,
    kind: normalizedKind || null,
    limit: Math.min(Math.max(Number(limit) || 50, 1), MAX_LIST_LIMIT),
    cursor,
  });
  return {
    jobs: listed.jobs.map((job) => serializeAdminJob(job)),
    nextCursor: listed.nextCursor,
  };
}

async function getAdminComputeJob(req, externalJobId, { includeAttempts = true } = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  const payload = {
    // Preview has a dedicated endpoint; avoid transferring multi-megabyte result
    // payloads just to render operational metadata.
    job: serializeAdminJob(job),
  };
  if (includeAttempts) {
    payload.attempts = (await listComputeJobAttempts(req, externalJobId)).map((attempt) => ({
      ...attempt,
      leaseToken: maskLeaseToken(attempt.leaseToken),
    }));
  }
  return payload;
}

async function submitManualComputeResult(req, {
  result: resultInput,
  actor = null,
  now = new Date(),
} = {}) {
  const result = validateManualSubmitResult(resultInput);
  const submitted = await createManualUploadReviewJob(req, {
    result,
    actor,
    now,
  });
  return {
    job: serializeAdminJob(submitted.job),
    created: submitted.created,
    duplicate: submitted.duplicate,
  };
}

async function cancelAdminComputeJob(req, {
  externalJobId,
  actor = null,
  now = new Date(),
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  if (job.status === 'cancelled') {
    return { job: serializeAdminJob(job), duplicate: true };
  }
  if (!canTransitionComputeJob(job.status, 'cancelled')) {
    throw serviceError(
      `Compute job cannot be cancelled from status ${job.status}`,
      'COMPUTE_JOB_NOT_CANCELLABLE',
      409,
    );
  }
  const cancelled = await cancelComputeJob(req, { externalJobId, actor, now });
  return { job: serializeAdminJob(cancelled), duplicate: false };
}

async function retryAdminComputeJob(req, {
  externalJobId,
  contextVersion = null,
  now = new Date(),
  notifyWake = notifyComputeWorkerWake,
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  if (job.status === 'pending') {
    await wakePendingComputeJob(job, notifyWake);
    return { job: serializeAdminJob(job), duplicate: true };
  }
  if (!canTransitionComputeJob(job.status, 'pending')) {
    throw serviceError(
      `Compute job cannot be retried from status ${job.status}`,
      'COMPUTE_JOB_NOT_RETRYABLE',
      409,
    );
  }
  const retried = await retryComputeJob(req, {
    externalJobId,
    contextVersion: trimString(contextVersion) || null,
    now,
  });
  await wakePendingComputeJob(retried, notifyWake);
  return { job: serializeAdminJob(retried), duplicate: false };
}

async function createAdminCarouselArtifactDownload(req, {
  externalJobId,
  artifactId,
  tenantKey = null,
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  if (job.kind !== 'carousel-export') {
    throw serviceError(
      'Artifact downloads are only available for carousel exports',
      'CAROUSEL_DOWNLOAD_UNSUPPORTED',
      409,
    );
  }
  const requestedTenant = trimString(tenantKey).toLowerCase();
  if (requestedTenant && requestedTenant !== job.tenantKey) {
    throw serviceError('Compute job does not belong to this tenant', 'COMPUTE_JOB_TENANT_MISMATCH', 409);
  }
  const exportArtifacts = job.exportArtifacts;
  if (!exportArtifacts?.artifacts?.length) {
    throw serviceError('Carousel export artifacts have not been finalized', 'CAROUSEL_ARTIFACTS_NOT_FINALIZED', 409);
  }
  if (exportArtifacts.expired) {
    throw serviceError(ARTIFACTS_EXPIRED_MESSAGE, 'CAROUSEL_EXPORT_ARTIFACTS_EXPIRED', 410);
  }

  const requestedId = trimString(artifactId);
  const artifact = exportArtifacts.artifacts.find((entry) => entry.artifactId === requestedId);
  if (!artifact) {
    throw serviceError('Carousel export artifact not found', 'CAROUSEL_ARTIFACT_NOT_FOUND', 404);
  }

  const prefix = exportArtifacts.prefix || buildExportPrefix({
    tenantKey: job.tenantKey,
    externalJobId: job.externalJobId,
    attemptNumber: exportArtifacts.attemptNumber,
  });
  assertObjectKeyBelongsToPrefix(artifact.objectKey, prefix);
  const presign = await createPresignedGetUrl({
    objectKey: artifact.objectKey,
    contentType: artifact.mimeType,
    filename: artifact.logicalName,
  });
  return {
    downloadUrl: presign.downloadUrl,
    expiresAt: presign.expiresAt,
    filename: artifact.logicalName,
    mimeType: artifact.mimeType,
    byteCount: artifact.byteCount,
    sha256: artifact.sha256,
    slideNumber: artifact.slideNumber ?? null,
    artifactId: artifact.artifactId,
  };
}

const STATUS_BY_CODE = Object.freeze({
  COMPUTE_JOB_NOT_FOUND: 404,
  COMPUTE_JOB_NOT_CANCELLABLE: 409,
  COMPUTE_JOB_NOT_RETRYABLE: 409,
  COMPUTE_JOB_RESULT_CONFLICT: 409,
  COMPUTE_JOB_ALREADY_APPLIED: 409,
  COMPUTE_JOB_APPLY_IN_PROGRESS: 409,
  ILLEGAL_COMPUTE_JOB_TRANSITION: 409,
  COMPUTE_JOB_NOT_REVIEWABLE: 409,
  COMPUTE_JOB_RESULT_MISSING: 409,
  PREVIEW_APPLY_BLOCKED: 409,
  PREVIEW_REQUIRED: 409,
  PREVIEW_STALE: 409,
  COMPUTE_APPLY_VALIDATION_FAILED: 422,
  APPLY_TENANT_REQUIRED: 400,
  COMPUTE_JOB_TENANT_MISMATCH: 409,
  INVALID_COMPUTE_JOB_REQUEST: 400,
  INVALID_COMPUTE_EXECUTION_RESULT: 400,
  INVALID_STATUS_FILTER: 400,
  INVALID_KIND_FILTER: 400,
  MANUAL_SUBMIT_NOT_COMPLETED: 400,
  UNSUPPORTED_COMPUTE_CONTRACT_VERSION: 400,
  UNSUPPORTED_COMPUTE_JOB_KIND: 400,
  COMPUTE_JOB_OPTIONS_TOO_LARGE: 413,
  COMPUTE_RESULT_TOO_LARGE: 413,
  CAROUSEL_MANUAL_SUBMIT_UNSUPPORTED: 409,
  CAROUSEL_PREVIEW_UNSUPPORTED: 409,
  CAROUSEL_APPLY_UNSUPPORTED: 409,
  CAROUSEL_DOWNLOAD_UNSUPPORTED: 409,
  CAROUSEL_ARTIFACTS_NOT_FINALIZED: 409,
  CAROUSEL_EXPORT_ARTIFACTS_EXPIRED: 410,
  CAROUSEL_ARTIFACT_NOT_FOUND: 404,
  UNKNOWN_REQUEST_FIELD: 400,
  INVALID_REQUEST_BODY: 400,
});

function handleAdminServiceError(res, error) {
  const status = error.status || STATUS_BY_CODE[error.code] || 500;
  return res.status(status).json({
    error: error.message || 'Compute job admin request failed',
    code: error.code || 'COMPUTE_JOB_ADMIN_ERROR',
    ...(error.applyResult ? { result: error.applyResult } : {}),
  });
}

module.exports = {
  MAX_LIST_LIMIT,
  rejectUnknownFields,
  boundedOptions,
  serializeAdminJob,
  createAdminComputeJob,
  listAdminComputeJobs,
  getAdminComputeJob,
  submitManualComputeResult,
  cancelAdminComputeJob,
  retryAdminComputeJob,
  createAdminCarouselArtifactDownload,
  handleAdminServiceError,
};
