const { randomUUID } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('./ensurePivotComputeJobIndexes');
const {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  validateExecutionResult,
  validateJobRequest,
} = require('../utilities/pivotAdminComputeJobContract');
const {
  ACTIVE_LEASE_STATUSES,
  assertComputeJobTransition,
  resolveResultSubmissionStatus,
} = require('../utilities/pivotComputeJobTransitions');
const { MAX_EMBEDDED_RESULT_BYTES } = require('../schemas/pivotComputeJob');

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_PROGRESS_COUNTER_KEYS = 20;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function scheduleMaybeAutoApplyComputeJob(req, externalJobId) {
  const handle = setImmediate(() => {
    // Jest still observes the timer; skip the engine so submit tests do not
    // race apply or open a second connectionsManager stack.
    if (process.env.NODE_ENV === 'test') return;
    try {
      const { maybeAutoApplyComputeJob } = require('./pivotComputeAutoApplyService'); // eslint-disable-line global-require
      Promise.resolve(maybeAutoApplyComputeJob(req, externalJobId)).catch(() => undefined);
    } catch (_) {
      // Deferred auto-apply must never change the stored submit outcome.
    }
  });
  if (handle && typeof handle.unref === 'function') handle.unref();
}

function notifyTypeForTerminalJob(job, nextStatus) {
  if (job?.kind === 'carousel-export' && nextStatus === 'completed') return 'carousel-complete';
  if (nextStatus === 'review-required') return 'review-required';
  if (nextStatus === 'failed') return 'failed';
  return null;
}

function notifyComputeJobAdminsBestEffort(req, { job, type, tenant, policy } = {}) {
  if (!job || !type) return;
  // Submit/apply unit tests must not open Resend or mutate notification audit.
  if (process.env.NODE_ENV === 'test') return;
  try {
    const { notifyAdminsOnComputeJob } = require('./pivotComputeAdminNotifyService'); // eslint-disable-line global-require
    Promise.resolve(notifyAdminsOnComputeJob(req, { job, type, tenant, policy })).catch(() => undefined);
  } catch (_) {
    // Email is best-effort and must never fail the job.
  }
}

function boundedCounters(rawCounters = {}) {
  const counters = new Map();
  for (const [key, value] of Object.entries(rawCounters || {})) {
    const normalizedKey = trimString(key);
    if (!normalizedKey || typeof value !== 'number' || !Number.isFinite(value)) continue;
    counters.set(normalizedKey.slice(0, 64), value);
    if (counters.size >= MAX_PROGRESS_COUNTER_KEYS) break;
  }
  return counters;
}

function cloneAuditList(value) {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => (
    item && typeof item.toObject === 'function' ? item.toObject() : { ...item }
  ));
}

function serializeApplicationAudit(audit, { includeApplyManifest = true } = {}) {
  if (!audit) return null;
  const value = typeof audit.toObject === 'function' ? audit.toObject() : { ...audit };
  if (includeApplyManifest) return value;
  const { rows, ...rest } = value;
  return rest;
}

function serializeJob(doc, { includeApplyManifest = true } = {}) {
  if (!doc) return null;
  const value = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(value._id),
    externalJobId: value.externalJobId,
    tenantKey: value.tenantKey,
    cityKey: value.cityKey,
    kind: value.kind,
    contractVersion: value.contractVersion,
    implementationRevision: value.implementationRevision ?? null,
    contextVersion: value.contextVersion,
    status: value.status,
    origin: value.origin,
    options: value.options ?? {},
    createIdempotencyKey: value.createIdempotencyKey,
    scheduleOccurrenceId: value.scheduleOccurrenceId ?? null,
    attemptCount: value.attemptCount ?? 0,
    cancelRequested: Boolean(value.cancelRequested),
    lease: value.lease
      ? {
        token: value.lease.token,
        workerId: value.lease.workerId,
        attemptNumber: value.lease.attemptNumber,
        attemptId: String(value.lease.attemptId),
        expiresAt: value.lease.expiresAt,
        capability: value.lease.capability ?? null,
      }
      : null,
    progress: value.progress
      ? {
        phase: value.progress.phase ?? null,
        message: value.progress.message ?? null,
        counters: value.progress.counters instanceof Map
          ? Object.fromEntries(value.progress.counters.entries())
          : (value.progress.counters ?? {}),
        updatedAt: value.progress.updatedAt ?? null,
      }
      : null,
    result: value.result ?? null,
    exportArtifacts: value.exportArtifacts
      ? {
        attemptId: String(value.exportArtifacts.attemptId),
        attemptNumber: value.exportArtifacts.attemptNumber,
        prefix: value.exportArtifacts.prefix,
        grantId: value.exportArtifacts.grantId,
        finalizedAt: value.exportArtifacts.finalizedAt,
        expiresAt: value.exportArtifacts.expiresAt ?? null,
        expired: Boolean(value.exportArtifacts.expired),
        cleanedAt: value.exportArtifacts.cleanedAt ?? null,
        artifacts: (value.exportArtifacts.artifacts || []).map((artifact) => ({
          logicalName: artifact.logicalName,
          artifactId: artifact.artifactId,
          mimeType: artifact.mimeType,
          byteCount: artifact.byteCount,
          sha256: artifact.sha256,
          slideNumber: artifact.slideNumber ?? null,
          objectKey: artifact.objectKey,
        })),
      }
      : null,
    applicationAudit: serializeApplicationAudit(value.applicationAudit, { includeApplyManifest }),
    autoApply: value.autoApply ?? null,
    failure: value.failure ?? null,
    requestedAt: value.requestedAt,
    leasedAt: value.leasedAt ?? null,
    startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null,
    expiresAt: value.expiresAt ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function serializeAttempt(doc) {
  if (!doc) return null;
  const value = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(value._id),
    computeJobId: String(value.computeJobId),
    externalJobId: value.externalJobId,
    attemptNumber: value.attemptNumber,
    status: value.status,
    workerId: value.workerId,
    leaseToken: value.leaseToken,
    leasedAt: value.leasedAt,
    startedAt: value.startedAt ?? null,
    finishedAt: value.finishedAt ?? null,
    lastHeartbeatAt: value.lastHeartbeatAt ?? null,
    leaseExpiresAt: value.leaseExpiresAt,
    capability: value.capability ?? null,
    resultIdempotencyKey: value.resultIdempotencyKey ?? null,
    artifactUploads: value.artifactUploads
      ? {
        grantId: value.artifactUploads.grantId ?? null,
        prefix: value.artifactUploads.prefix ?? null,
        slideCount: value.artifactUploads.slideCount ?? null,
        initializedAt: value.artifactUploads.initializedAt ?? null,
        finalizedAt: value.artifactUploads.finalizedAt ?? null,
        cleanedAt: value.artifactUploads.cleanedAt ?? null,
        artifacts: (value.artifactUploads.artifacts || []).map((artifact) => ({
          artifactId: artifact.artifactId,
          logicalName: artifact.logicalName,
          objectKey: artifact.objectKey,
          mimeType: artifact.mimeType,
          byteCount: artifact.byteCount,
          sha256: artifact.sha256,
          slideNumber: artifact.slideNumber ?? null,
          status: artifact.status,
          verifiedAt: artifact.verifiedAt ?? null,
        })),
      }
      : null,
    terminalOutcome: value.terminalOutcome ?? null,
    failure: value.failure ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function assertKnownContractVersion(contractVersion) {
  if (contractVersion !== CONTRACT_VERSION) {
    const error = new Error(`Unsupported compute contract version: ${contractVersion}`);
    error.code = 'UNSUPPORTED_COMPUTE_CONTRACT_VERSION';
    throw error;
  }
}

function assertKnownKind(kind) {
  if (!COMPUTE_JOB_KINDS.includes(kind)) {
    const error = new Error(`Unsupported compute job kind: ${kind}`);
    error.code = 'UNSUPPORTED_COMPUTE_JOB_KIND';
    throw error;
  }
}

function validateCreateInput(input) {
  const externalJobId = trimString(input.externalJobId || input.jobId);
  const cityKey = trimString(input.cityKey).toLowerCase();
  const kind = trimString(input.kind);
  const contractVersion = trimString(input.contractVersion || CONTRACT_VERSION);
  const contextVersion = trimString(input.contextVersion);
  const createIdempotencyKey = trimString(input.createIdempotencyKey || input.idempotencyKey);
  const requestedAt = input.requestedAt ? new Date(input.requestedAt) : new Date();
  const origin = input.origin || {};
  const originType = trimString(origin.type);

  if (!externalJobId || !cityKey || !kind || !contextVersion || !createIdempotencyKey) {
    const error = new Error('Compute job create input is incomplete');
    error.code = 'INVALID_COMPUTE_JOB_CREATE_INPUT';
    throw error;
  }
  if (!['admin', 'schedule', 'manual-upload'].includes(originType)) {
    const error = new Error(`Unsupported compute job origin: ${originType}`);
    error.code = 'INVALID_COMPUTE_JOB_ORIGIN';
    throw error;
  }

  assertKnownContractVersion(contractVersion);
  assertKnownKind(kind);

  const scheduleOccurrenceId = trimString(
    input.scheduleOccurrenceId ?? origin.scheduleOccurrenceId,
  ) || null;

  return {
    externalJobId,
    tenantKey: cityKey,
    cityKey,
    kind,
    contractVersion,
    implementationRevision: trimString(input.implementationRevision) || null,
    contextVersion,
    origin: {
      type: originType,
      scheduleId: trimString(origin.scheduleId) || null,
      scheduleOccurrenceId,
      requestedBy: trimString(origin.requestedBy) || null,
    },
    options: input.options ?? {},
    createIdempotencyKey,
    scheduleOccurrenceId,
    requestedAt,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  };
}

function assertLeaseMatches(job, { leaseToken, workerId } = {}) {
  const token = trimString(leaseToken);
  const worker = trimString(workerId);
  if (!job?.lease || !token || job.lease.token !== token) {
    const error = new Error('Compute job lease token mismatch');
    error.code = 'COMPUTE_JOB_LEASE_MISMATCH';
    throw error;
  }
  if (worker && job.lease.workerId !== worker) {
    const error = new Error('Compute job worker mismatch');
    error.code = 'COMPUTE_JOB_WORKER_MISMATCH';
    throw error;
  }
}

function assertLeaseActive(job, now = new Date()) {
  assertLeaseMatches(job, { leaseToken: job?.lease?.token });
  if (!ACTIVE_LEASE_STATUSES.includes(job.status)) {
    const error = new Error(`Compute job is not lease-active: ${job.status}`);
    error.code = 'COMPUTE_JOB_NOT_LEASE_ACTIVE';
    throw error;
  }
  if (job.lease.expiresAt <= now) {
    const error = new Error('Compute job lease expired');
    error.code = 'COMPUTE_JOB_LEASE_EXPIRED';
    throw error;
  }
}

function normalizeStoredResult(resultInput, now = new Date()) {
  const validation = validateExecutionResult(resultInput);
  if (!validation.valid) {
    const error = new Error(`Invalid compute execution result: ${validation.errors.join(', ')}`);
    error.code = 'INVALID_COMPUTE_EXECUTION_RESULT';
    throw error;
  }

  const serialized = JSON.stringify(resultInput);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EMBEDDED_RESULT_BYTES) {
    const error = new Error(`Embedded compute result exceeds ${MAX_EMBEDDED_RESULT_BYTES} bytes`);
    error.code = 'COMPUTE_RESULT_TOO_LARGE';
    throw error;
  }

  return {
    mode: 'embedded',
    embedded: resultInput,
    artifactRef: null,
    resultIdempotencyKey: trimString(resultInput.idempotencyKey),
    submittedAt: now,
    contractVersion: CONTRACT_VERSION,
  };
}

function assertResultBinding(job, result) {
  if (job.kind !== 'carousel-export' && result.kind !== 'carousel-export') return;
  const mismatches = [];
  if (result.jobId !== job.externalJobId) mismatches.push('jobId');
  if (result.kind !== job.kind) mismatches.push('kind');
  if (result.cityKey !== job.cityKey) mismatches.push('cityKey');
  const expectedAttemptId = String(job.lease?.attemptId || job.result?.embedded?.attemptId || '');
  if (result.tenantKey !== job.tenantKey) mismatches.push('tenantKey');
  if (result.deckId !== job.options?.deckId) mismatches.push('deckId');
  if (result.renderedDeckRevision !== job.options?.deckRevision) mismatches.push('renderedDeckRevision');
  if (result.attemptId !== expectedAttemptId) mismatches.push('attemptId');
  if (result.basedOnContextVersion !== job.contextVersion) mismatches.push('basedOnContextVersion');
  if (mismatches.length) {
    const error = new Error(`Compute result does not match its job binding: ${mismatches.join(', ')}`);
    error.code = 'COMPUTE_RESULT_BINDING_MISMATCH';
    throw error;
  }
}

async function getModels(req) {
  await ensurePivotComputeJobIndexes(req);
  return getGlobalModels(req, 'PivotComputeJob', 'PivotComputeJobAttempt');
}

async function findJobByExternalId(req, externalJobId) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  return serializeJob(job);
}

async function findJobByCreateIdempotencyKey(req, createIdempotencyKey) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOne({
    createIdempotencyKey: trimString(createIdempotencyKey),
  });
  return serializeJob(job);
}

async function createComputeJob(req, input) {
  const payload = validateCreateInput(input);
  const { PivotComputeJob } = await getModels(req);

  const existing = await PivotComputeJob.findOne({
    createIdempotencyKey: payload.createIdempotencyKey,
  });
  if (existing) {
    return { job: serializeJob(existing), created: false };
  }

  try {
    const created = await PivotComputeJob.create({
      ...payload,
      status: 'pending',
      attemptCount: 0,
      cancelRequested: false,
      lease: null,
      progress: null,
      result: null,
      applicationAudit: null,
      failure: null,
    });
    return { job: serializeJob(created), created: true };
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await PivotComputeJob.findOne({
        $or: [
          { createIdempotencyKey: payload.createIdempotencyKey },
          { externalJobId: payload.externalJobId },
          ...(payload.scheduleOccurrenceId
            ? [{ scheduleOccurrenceId: payload.scheduleOccurrenceId }]
            : []),
        ],
      });
      if (duplicate) {
        return { job: serializeJob(duplicate), created: false };
      }
    }
    throw error;
  }
}

function normalizeLeaseCapability(capability) {
  if (!capability || typeof capability !== 'object') return null;
  return {
    contractVersion: trimString(capability.contractVersion || CONTRACT_VERSION),
    implementationRevision: trimString(capability.implementationRevision),
    supportedContractVersions: [...new Set(
      (capability.supportedContractVersions || [])
        .map((value) => trimString(value))
        .filter(Boolean),
    )],
    supportedKinds: [...new Set(
      (capability.supportedKinds || [])
        .map((value) => trimString(value))
        .filter(Boolean),
    )],
  };
}

function isJobCompatibleWithCapability(job, capability) {
  const normalized = normalizeLeaseCapability(capability);
  if (!normalized?.implementationRevision) return false;
  if (!normalized.supportedContractVersions.includes(job.contractVersion)) return false;
  if (!normalized.supportedKinds.includes(job.kind)) return false;
  return true;
}

async function claimNextPendingJob(req, {
  externalJobId,
  kind,
  cityKey,
  workerId,
  capability = null,
  leaseMs = DEFAULT_LEASE_MS,
  now = new Date(),
} = {}) {
  const normalizedKind = trimString(kind);
  const normalizedExternalJobId = trimString(externalJobId);
  const normalizedCityKey = trimString(cityKey).toLowerCase();
  const normalizedWorkerId = trimString(workerId);
  const normalizedCapability = normalizeLeaseCapability(capability);
  if (normalizedKind) assertKnownKind(normalizedKind);
  if (!normalizedWorkerId) {
    const error = new Error('workerId is required to claim a compute job');
    error.code = 'INVALID_COMPUTE_JOB_CLAIM';
    throw error;
  }
  if (normalizedKind && normalizedCapability && !isJobCompatibleWithCapability({ kind: normalizedKind, contractVersion: CONTRACT_VERSION }, normalizedCapability)) {
    const error = new Error('Worker capability is incompatible with requested compute job kind');
    error.code = 'COMPUTE_WORKER_CAPABILITY_INCOMPATIBLE';
    throw error;
  }

  // Claim is the authoritative recovery point. A worker disappearing must not
  // strand work in leased/running forever waiting for a separate cron process.
  await reclaimExpiredComputeJobLeases(req, { now, limit: 50 });

  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const leaseToken = randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await PivotComputeJob.findOne({
      status: 'pending',
      kind: normalizedKind || {
        $in: normalizedCapability?.supportedKinds?.length
          ? normalizedCapability.supportedKinds
          : COMPUTE_JOB_KINDS,
      },
      ...(normalizedExternalJobId ? { externalJobId: normalizedExternalJobId } : {}),
      ...(normalizedCapability
        ? { contractVersion: { $in: normalizedCapability.supportedContractVersions } }
        : {}),
      ...(normalizedCityKey ? { cityKey: normalizedCityKey } : {}),
      cancelRequested: { $ne: true },
    }).sort({ requestedAt: 1, createdAt: 1 });

    if (!candidate) {
      return { job: null, attempt: null };
    }
    if (normalizedCapability && !isJobCompatibleWithCapability(candidate, normalizedCapability)) {
      continue;
    }

    const attemptNumber = (candidate.attemptCount || 0) + 1;
    let createdAttempt;
    try {
      createdAttempt = await PivotComputeJobAttempt.create({
        computeJobId: candidate._id,
        externalJobId: candidate.externalJobId,
        attemptNumber,
        status: 'leased',
        workerId: normalizedWorkerId,
        leaseToken,
        leasedAt: now,
        leaseExpiresAt,
        lastHeartbeatAt: now,
        capability: normalizedCapability || undefined,
      });
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }

    const updated = await PivotComputeJob.findOneAndUpdate(
      {
        _id: candidate._id,
        status: 'pending',
        cancelRequested: { $ne: true },
      },
      {
        $set: {
          status: 'leased',
          attemptCount: attemptNumber,
          leasedAt: now,
          ...(normalizedCapability?.implementationRevision
            ? { implementationRevision: normalizedCapability.implementationRevision }
            : {}),
          lease: {
            token: leaseToken,
            workerId: normalizedWorkerId,
            attemptNumber,
            attemptId: createdAttempt._id,
            expiresAt: leaseExpiresAt,
            capability: normalizedCapability || undefined,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      await PivotComputeJobAttempt.deleteOne({ _id: createdAttempt._id }).catch(() => undefined);
      continue;
    }

    return {
      job: serializeJob(updated),
      attempt: serializeAttempt(createdAttempt),
    };
  }

  return { job: null, attempt: null };
}

async function startComputeJob(req, {
  externalJobId,
  leaseToken,
  workerId,
  now = new Date(),
} = {}) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  assertLeaseMatches(job, { leaseToken, workerId });
  assertComputeJobTransition(job.status, 'running');
  if (job.status !== 'leased') {
    const error = new Error(`Compute job must be leased before start: ${job.status}`);
    error.code = 'COMPUTE_JOB_INVALID_START_STATE';
    throw error;
  }
  assertLeaseActive(job, now);

  job.status = 'running';
  job.startedAt = now;
  await job.save();

  await PivotComputeJobAttempt.updateOne(
    { _id: job.lease.attemptId, status: 'leased' },
    {
      $set: {
        status: 'running',
        startedAt: now,
        lastHeartbeatAt: now,
      },
    },
  );

  return serializeJob(job);
}

async function heartbeatComputeJobLease(req, {
  externalJobId,
  leaseToken,
  workerId,
  leaseMs = DEFAULT_LEASE_MS,
  now = new Date(),
} = {}) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  assertLeaseMatches(job, { leaseToken, workerId });
  assertLeaseActive(job, now);

  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  job.lease.expiresAt = leaseExpiresAt;
  job.markModified('lease');
  await job.save();

  await PivotComputeJobAttempt.updateOne(
    { _id: job.lease.attemptId },
    {
      $set: {
        leaseExpiresAt,
        lastHeartbeatAt: now,
      },
    },
  );

  return serializeJob(job);
}

async function recordComputeJobProgress(req, {
  externalJobId,
  leaseToken,
  workerId,
  phase,
  message,
  counters,
  now = new Date(),
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  assertLeaseMatches(job, { leaseToken, workerId });
  if (job.status !== 'running') {
    const error = new Error(`Compute job progress requires running status: ${job.status}`);
    error.code = 'COMPUTE_JOB_NOT_RUNNING';
    throw error;
  }
  assertLeaseActive(job, now);

  job.progress = {
    phase: trimString(phase) || null,
    message: trimString(message) || null,
    counters: boundedCounters(counters),
    updatedAt: now,
  };
  await job.save();
  return serializeJob(job);
}

async function submitComputeJobResult(req, {
  externalJobId,
  leaseToken,
  workerId,
  result,
  retryable = false,
  requiresReview = true,
  failureDetails = [],
  now = new Date(),
} = {}) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  const storedResult = result ? normalizeStoredResult(result, now) : null;
  assertResultBinding(job, result);
  if (job.kind === 'carousel-export') {
    const { assertCompletedResultMatchesVerifiedArtifacts } = require('./pivotCarouselArtifactTransportService');
    assertCompletedResultMatchesVerifiedArtifacts(job, result);
  }
  if (
    storedResult
    && job.result
    && job.result.resultIdempotencyKey === storedResult.resultIdempotencyKey
  ) {
    return serializeJob(job);
  }

  assertLeaseMatches(job, { leaseToken, workerId });
  if (job.status !== 'running') {
    const error = new Error(`Compute job result requires running status: ${job.status}`);
    error.code = 'COMPUTE_JOB_NOT_RUNNING';
    throw error;
  }
  assertLeaseActive(job, now);

  const nextStatus = resolveResultSubmissionStatus({
    outcome: result.outcome,
    retryable,
    requiresReview: job.kind === 'carousel-export' ? false : requiresReview,
  });
  assertComputeJobTransition(job.status, nextStatus);

  const attemptId = job.lease.attemptId;
  const attemptFailure = result.outcome === 'failed'
    ? {
      code: trimString(result.failure?.code) || 'EXECUTION_FAILED',
      message: trimString(result.failure?.message) || 'Compute execution failed',
      ...(failureDetails.length ? { details: failureDetails } : {}),
      retryable: Boolean(retryable),
    }
    : null;
  const attemptStatus = result.outcome === 'failed'
    ? 'failed'
    : result.outcome === 'cancelled'
      ? 'cancelled'
      : 'completed';

  const attemptNumber = job.lease?.attemptNumber ?? job.exportArtifacts?.attemptNumber ?? null;
  job.status = nextStatus;
  job.result = storedResult;
  job.completedAt = now;
  job.lease = null;
  job.failure = attemptFailure;
  await job.save();

  await PivotComputeJobAttempt.updateOne(
    { _id: attemptId },
    {
      $set: {
        status: attemptStatus,
        finishedAt: now,
        resultIdempotencyKey: storedResult.resultIdempotencyKey,
        terminalOutcome: result.outcome,
        failure: attemptFailure,
      },
    },
  );

  if (job.kind === 'carousel-export' && result.outcome !== 'completed' && attemptNumber) {
    await cleanupCarouselAttemptBestEffort(req, {
      tenantKey: job.tenantKey,
      externalJobId: job.externalJobId,
      attemptNumber,
      attemptId,
    });
  }

  const serialized = serializeJob(await PivotComputeJob.findById(job._id));
  const notifyType = notifyTypeForTerminalJob(serialized, nextStatus);
  if (notifyType) {
    notifyComputeJobAdminsBestEffort(req, { job: serialized, type: notifyType });
  }
  if (nextStatus === 'review-required') {
    scheduleMaybeAutoApplyComputeJob(req, serialized.externalJobId);
  }
  return serialized;
}

async function cancelComputeJob(req, {
  externalJobId,
  actor = null,
  now = new Date(),
} = {}) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  if (job.status === 'cancelled') {
    return serializeJob(job);
  }

  if (ACTIVE_LEASE_STATUSES.includes(job.status) && job.lease) {
    // Retain the active lease until the worker observes the request and submits
    // a cancelled result. Clearing it here makes the observation endpoint
    // reject the only worker that can stop the provider work.
    job.cancelRequested = true;
    if (actor && job.origin) {
      job.origin.requestedBy = trimString(actor) || job.origin.requestedBy;
    }
    await job.save();
    return serializeJob(job);
  }

  assertComputeJobTransition(job.status, 'cancelled');

  const attemptId = job.lease?.attemptId ?? null;
  const attemptNumber = job.lease?.attemptNumber ?? null;
  job.cancelRequested = true;
  job.status = 'cancelled';
  job.completedAt = now;
  job.lease = null;
  job.failure = {
    code: 'CANCELLED',
    message: 'Compute job cancelled',
    retryable: false,
  };
  if (actor && job.origin) {
    job.origin.requestedBy = trimString(actor) || job.origin.requestedBy;
  }
  await job.save();

  if (attemptId) {
    await PivotComputeJobAttempt.updateOne(
      { _id: attemptId, finishedAt: null },
      {
        $set: {
          status: 'cancelled',
          finishedAt: now,
          failure: job.failure,
        },
      },
    );
  }

  if (job.kind === 'carousel-export' && attemptNumber) {
    await cleanupCarouselAttemptBestEffort(req, {
      tenantKey: job.tenantKey,
      externalJobId: job.externalJobId,
      attemptNumber,
      attemptId,
    });
  }

  return serializeJob(job);
}

async function retryComputeJob(req, {
  externalJobId,
  contextVersion = null,
  now = new Date(),
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  if (job.status === 'pending') {
    return serializeJob(job);
  }

  assertComputeJobTransition(job.status, 'pending');

  const previousExport = job.exportArtifacts;
  job.status = 'pending';
  job.lease = null;
  job.progress = null;
  job.failure = null;
  job.result = null;
  job.exportArtifacts = null;
  job.applicationAudit = null;
  job.cancelRequested = false;
  job.leasedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  if (contextVersion) {
    job.contextVersion = trimString(contextVersion);
  }
  job.requestedAt = now;
  await job.save();
  if (job.kind === 'carousel-export' && previousExport?.attemptNumber && !previousExport.expired) {
    await cleanupCarouselAttemptBestEffort(req, {
      tenantKey: job.tenantKey,
      externalJobId: job.externalJobId,
      attemptNumber: previousExport.attemptNumber,
      attemptId: previousExport.attemptId,
    });
  }
  return serializeJob(job);
}

async function expireComputeJobLease(req, {
  externalJobId,
  releaseToPending = false,
  now = new Date(),
} = {}) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  if (!ACTIVE_LEASE_STATUSES.includes(job.status)) {
    return serializeJob(job);
  }
  if (job.lease?.expiresAt && job.lease.expiresAt > now) {
    const error = new Error('Compute job lease has not expired yet');
    error.code = 'COMPUTE_JOB_LEASE_NOT_EXPIRED';
    throw error;
  }

  const nextStatus = job.cancelRequested
    ? 'cancelled'
    : releaseToPending ? 'pending' : 'expired';
  if (nextStatus === 'pending' && job.status === 'running') {
    // An expired running lease is an interrupted attempt. The public graph
    // goes running → retryable → pending; reclaim collapses that into one write
    // so a disappeared worker does not strand the job or fail the next claim.
    assertComputeJobTransition(job.status, 'retryable');
    assertComputeJobTransition('retryable', 'pending');
  } else {
    assertComputeJobTransition(job.status, nextStatus);
  }

  const attemptId = job.lease?.attemptId ?? null;
  const attemptNumber = job.lease?.attemptNumber ?? null;
  const failure = nextStatus === 'pending'
    ? null
    : {
      code: nextStatus === 'cancelled' ? 'CANCELLED' : 'LEASE_EXPIRED',
      message: nextStatus === 'cancelled' ? 'Compute job cancelled' : 'Compute job lease expired',
      retryable: nextStatus !== 'cancelled',
    };
  const updates = {
    status: nextStatus,
    lease: null,
  };
  if (nextStatus !== 'pending') {
    updates.completedAt = now;
    updates.failure = failure;
  } else {
    updates.leasedAt = null;
    updates.startedAt = null;
    updates.failure = null;
  }
  const updated = await PivotComputeJob.findOneAndUpdate(
    {
      _id: job._id,
      status: job.status,
      'lease.token': job.lease.token,
      'lease.expiresAt': { $lte: now },
    },
    { $set: updates },
    { new: true },
  );
  if (!updated) {
    const current = await PivotComputeJob.findById(job._id);
    if (current) return serializeJob(current);
    throw new Error('Compute job disappeared during lease expiry');
  }

  if (attemptId) {
    await PivotComputeJobAttempt.updateOne(
      { _id: attemptId, finishedAt: null },
      {
        $set: {
          status: nextStatus === 'cancelled' ? 'cancelled' : 'expired',
          finishedAt: now,
          failure: failure ?? {
            code: 'LEASE_EXPIRED',
            message: 'Compute job lease expired',
            retryable: true,
          },
        },
      },
    );
  }

  if (updated.kind === 'carousel-export' && attemptNumber) {
    await cleanupCarouselAttemptBestEffort(req, {
      tenantKey: updated.tenantKey,
      externalJobId: updated.externalJobId,
      attemptNumber,
      attemptId,
    });
  }

  return serializeJob(updated);
}

async function reclaimExpiredComputeJobLeases(req, {
  now = new Date(),
  limit = 50,
} = {}) {
  const expired = await listExpiredLeaseJobs(req, { now, limit });
  const reclaimed = [];
  for (const job of expired) {
    try {
      reclaimed.push(await expireComputeJobLease(req, {
        externalJobId: job.externalJobId,
        releaseToPending: true,
        now,
      }));
    } catch {
      // One stranded job must not block claiming other pending work.
    }
  }
  try {
    const { cleanupExpiredCarouselExports } = require('./pivotCarouselArtifactTransportService');
    await cleanupExpiredCarouselExports(req, { now, limit });
  } catch {
    // Retention cleanup is best-effort and must not block lease recovery.
  }
  return reclaimed;
}

async function cleanupCarouselAttemptBestEffort(req, input) {
  try {
    const { cleanupCarouselAttemptPrefix } = require('./pivotCarouselArtifactTransportService');
    await cleanupCarouselAttemptPrefix(req, input);
  } catch {
    // Object-storage cleanup must not roll back an already-recorded terminal job.
  }
}

const APPLY_STALE_MS = 10 * 60 * 1000;

async function reclaimStaleComputeJobApply(req, job, now = new Date()) {
  const audit = job?.applicationAudit || {};
  if (job?.status !== 'applying' || audit.appliedAt) return false;
  const anchor = job.updatedAt || job.leasedAt || job.startedAt;
  if (!anchor) return false;
  const ageMs = now.getTime() - new Date(anchor).getTime();
  if (ageMs < APPLY_STALE_MS) return false;
  job.status = 'review-required';
  await job.save();
  return true;
}

async function beginComputeJobApply(req, {
  externalJobId,
  actor,
  previewId = null,
  idempotencyKey,
  now = new Date(),
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  const normalizedExternalJobId = trimString(externalJobId);
  const normalizedKey = trimString(idempotencyKey);
  const applicationAudit = {
    previewId: trimString(previewId) || null,
    idempotencyKey: normalizedKey,
    appliedAt: null,
    appliedBy: trimString(actor) || null,
    summary: {
      creates: 0,
      updates: 0,
      unchanged: 0,
      conflicts: 0,
      stale: 0,
      rejected: 0,
    },
  };
  const job = await PivotComputeJob.findOneAndUpdate(
    { externalJobId: normalizedExternalJobId, status: 'review-required', result: { $ne: null } },
    { $set: { status: 'applying', applicationAudit } },
    { new: true },
  );
  if (job) return serializeJob(job);

  const existing = await PivotComputeJob.findOne({ externalJobId: normalizedExternalJobId });
  if (!existing) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }
  if (!existing.result) {
    const error = new Error('Compute job has no stored result to apply');
    error.code = 'COMPUTE_JOB_RESULT_MISSING';
    throw error;
  }
  if (existing.status === 'applying' && await reclaimStaleComputeJobApply(req, existing, now)) {
    const retried = await PivotComputeJob.findOneAndUpdate(
      { externalJobId: normalizedExternalJobId, status: 'review-required', result: { $ne: null } },
      { $set: { status: 'applying', applicationAudit } },
      { new: true },
    );
    if (retried) return serializeJob(retried);
  }
  const error = new Error(`Compute job apply cannot start from status: ${existing.status}`);
  error.code = existing.status === 'applying' ? 'COMPUTE_JOB_APPLY_IN_PROGRESS' : 'ILLEGAL_COMPUTE_JOB_TRANSITION';
  throw error;
}

async function updateComputeJobApplyProgress(req, {
  externalJobId,
  summary = {},
  now = new Date(),
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  await PivotComputeJob.findOneAndUpdate(
    {
      externalJobId: trimString(externalJobId),
      status: 'applying',
    },
    {
      $set: {
        updatedAt: now,
        'applicationAudit.summary': {
          creates: Number(summary.creates) || 0,
          updates: Number(summary.updates) || 0,
          unchanged: Number(summary.unchanged) || 0,
          conflicts: Number(summary.conflicts) || 0,
          stale: Number(summary.stale) || 0,
          rejected: Number(summary.rejected) || 0,
          skipped: Number(summary.skipped) || 0,
        },
      },
    },
  );
}

async function completeComputeJobApply(req, {
  externalJobId,
  actor,
  idempotencyKey,
  summary = {},
  outcome = 'completed',
  errorCode = null,
  errorMessage = null,
  previewDrift = false,
  manifest = null,
  recordAppliedAt = true,
  now = new Date(),
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }

  const normalizedKey = trimString(idempotencyKey);
  if (
    job.status === 'completed'
    && job.applicationAudit?.idempotencyKey === normalizedKey
  ) {
    return serializeJob(job);
  }

  if (job.status !== 'applying') {
    const error = new Error(`Compute job apply requires applying status: ${job.status}`);
    error.code = 'COMPUTE_JOB_NOT_APPLYING';
    throw error;
  }

  const nextStatus = outcome === 'completed' ? 'completed' : 'review-required';
  assertComputeJobTransition(job.status, nextStatus);

  job.status = nextStatus;
  const existingAudit = job.applicationAudit || {};
  const nextBuckets = cloneAuditList(manifest?.buckets ?? existingAudit.buckets);
  const nextRows = cloneAuditList(manifest?.rows ?? existingAudit.rows);
  const applicationAudit = {
    previewId: existingAudit.previewId ?? null,
    idempotencyKey: normalizedKey,
    appliedAt: recordAppliedAt ? now : null,
    appliedBy: trimString(actor) || existingAudit.appliedBy || null,
    outcome,
    errorCode: trimString(errorCode) || null,
    errorMessage: trimString(errorMessage) || null,
    previewDrift: Boolean(previewDrift),
    rowOverflowCount: Number(manifest?.rowOverflowCount ?? existingAudit.rowOverflowCount) || 0,
    manifestGeneratedAt: manifest?.manifestGeneratedAt ?? existingAudit.manifestGeneratedAt ?? null,
    summary: {
      creates: Number(summary.creates) || 0,
      updates: Number(summary.updates) || 0,
      unchanged: Number(summary.unchanged) || 0,
      conflicts: Number(summary.conflicts) || 0,
      stale: Number(summary.stale) || 0,
      rejected: Number(summary.rejected) || 0,
      skipped: Number(summary.skipped) || 0,
    },
  };
  if (nextBuckets) applicationAudit.buckets = nextBuckets;
  if (nextRows) applicationAudit.rows = nextRows;
  job.set('applicationAudit', applicationAudit);
  if (nextStatus === 'completed') {
    job.completedAt = now;
  }
  await job.save();
  return serializeJob(job);
}

async function listComputeJobAttempts(req, externalJobId) {
  const { PivotComputeJob, PivotComputeJobAttempt } = await getModels(req);
  const job = await PivotComputeJob.findOne({ externalJobId: trimString(externalJobId) });
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }
  const attempts = await PivotComputeJobAttempt
    .find({ computeJobId: job._id })
    .sort({ attemptNumber: 1 });
  return attempts.map(serializeAttempt);
}

async function updateComputeJobContextVersion(req, externalJobId, contextVersion) {
  const { PivotComputeJob } = await getModels(req);
  const job = await PivotComputeJob.findOneAndUpdate(
    { externalJobId: trimString(externalJobId) },
    { $set: { contextVersion: trimString(contextVersion) } },
    { new: true },
  );
  if (!job) {
    const error = new Error('Compute job not found');
    error.code = 'COMPUTE_JOB_NOT_FOUND';
    throw error;
  }
  return serializeJob(job);
}

async function listExpiredLeaseJobs(req, { now = new Date(), limit = 50 } = {}) {
  const { PivotComputeJob } = await getModels(req);
  const jobs = await PivotComputeJob.find({
    status: { $in: ACTIVE_LEASE_STATUSES },
    'lease.expiresAt': { $lte: now },
  })
    .sort({ 'lease.expiresAt': 1 })
    .limit(limit);
  return jobs.map(serializeJob);
}

const MAX_LIST_LIMIT = 100;

async function listComputeJobs(req, {
  cityKey = null,
  status = null,
  kind = null,
  limit = 50,
  cursor = null,
} = {}) {
  const { PivotComputeJob } = await getModels(req);
  const query = {};
  const normalizedCityKey = trimString(cityKey).toLowerCase();
  const normalizedStatus = trimString(status);
  const normalizedKind = trimString(kind);
  if (normalizedCityKey) query.cityKey = normalizedCityKey;
  if (normalizedStatus) query.status = normalizedStatus;
  if (normalizedKind) query.kind = normalizedKind;
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      query.createdAt = { $lt: cursorDate };
    }
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIST_LIMIT);
  const rows = await PivotComputeJob.find(query)
    .sort({ createdAt: -1 })
    .limit(normalizedLimit + 1);

  const hasMore = rows.length > normalizedLimit;
  const jobs = rows.slice(0, normalizedLimit).map(serializeJob);
  return {
    jobs,
    nextCursor: hasMore ? jobs[jobs.length - 1].createdAt : null,
  };
}

async function createManualUploadReviewJob(req, {
  result,
  actor = null,
  now = new Date(),
} = {}) {
  const storedResult = normalizeStoredResult(result, now);
  const externalJobId = trimString(result.jobId);
  const { PivotComputeJob } = await getModels(req);

  const duplicate = await PivotComputeJob.findOne({
    externalJobId,
    'result.resultIdempotencyKey': storedResult.resultIdempotencyKey,
  });
  if (duplicate) {
    return { job: serializeJob(duplicate), created: false, duplicate: true };
  }

  const existing = await PivotComputeJob.findOne({ externalJobId });
  if (existing) {
    const error = new Error('Compute job already exists with a different submitted result');
    error.code = 'COMPUTE_JOB_RESULT_CONFLICT';
    throw error;
  }

  const payload = validateCreateInput({
    externalJobId,
    jobId: externalJobId,
    kind: result.kind,
    cityKey: result.cityKey,
    contractVersion: result.contractVersion,
    contextVersion: result.basedOnContextVersion,
    implementationRevision: result.implementationRevision,
    createIdempotencyKey: storedResult.resultIdempotencyKey,
    requestedAt: result.completedAt || now.toISOString(),
    origin: {
      type: 'manual-upload',
      requestedBy: trimString(actor) || null,
    },
    options: {},
  });

  const created = await PivotComputeJob.create({
    ...payload,
    status: 'review-required',
    attemptCount: 0,
    cancelRequested: false,
    lease: null,
    progress: null,
    result: storedResult,
    applicationAudit: null,
    failure: null,
    completedAt: now,
  });

  const serialized = serializeJob(created);
  notifyComputeJobAdminsBestEffort(req, { job: serialized, type: 'review-required' });
  return { job: serialized, created: true, duplicate: false };
}

module.exports = {
  DEFAULT_LEASE_MS,
  serializeJob,
  serializeAttempt,
  validateCreateInput,
  normalizeLeaseCapability,
  isJobCompatibleWithCapability,
  createComputeJob,
  findJobByExternalId,
  findJobByCreateIdempotencyKey,
  updateComputeJobContextVersion,
  claimNextPendingJob,
  startComputeJob,
  heartbeatComputeJobLease,
  recordComputeJobProgress,
  submitComputeJobResult,
  cancelComputeJob,
  retryComputeJob,
  expireComputeJobLease,
  reclaimExpiredComputeJobLeases,
  beginComputeJobApply,
  updateComputeJobApplyProgress,
  completeComputeJobApply,
  listComputeJobAttempts,
  listExpiredLeaseJobs,
  listComputeJobs,
  createManualUploadReviewJob,
  validateJobRequest,
};
