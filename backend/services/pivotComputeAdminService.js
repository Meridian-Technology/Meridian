const {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  validateJobRequest,
  validateExecutionResult,
  validateContextSnapshot,
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
  beginComputeJobApply,
  completeComputeJobApply,
} = require('./pivotComputeJobStore');
const { notifyComputeWorkerWake } = require('./pivotComputeWakeService');
const { scheduleDevelopmentComputeJob } = require('./pivotComputeDevRunner');
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

function serializeAdminJob(job, { includeEmbeddedResult = false, includeApplyManifest = true } = {}) {
  if (!job) return null;
  const serialized = serializeJob(job, { includeApplyManifest });
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
  if (resultInput.kind === 'carousel-compose') {
    throw serviceError('Compose results require their worker-served context.', 'COMPOSE_MANUAL_SUBMIT_UNSUPPORTED', 409);
  }
  if (resultInput.kind === 'carousel-revise') {
    throw serviceError('Revise results require their worker-served context.', 'REVISE_MANUAL_SUBMIT_UNSUPPORTED', 409);
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
  const deck = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey }).lean();
  if (!deck) {
    throw serviceError('Carousel deck not found', 'DECK_NOT_FOUND', 404);
  }
  const revision = deckRevision(deck);
  if (!revision) {
    throw serviceError('Carousel deck is missing a revision', 'DECK_REVISION_INVALID');
  }
  if ((deck.schemaVersion || 1) === 2) {
    const { pinExportRevision } = require('./pivotCarouselRevisionService');
    const pin = await pinExportRevision(req, deck, revision);
    if (pin.error) throw serviceError(pin.error, pin.code || 'EXPORT_PIN_FAILED', pin.status || 422);
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

function wakeOrScheduleLocal(job, notifyWake, scheduleLocal) {
  if (scheduleLocal(job)) return Promise.resolve({ status: 'local' });
  return wakePendingComputeJob(job, notifyWake);
}

async function createAdminComputeJob(req, {
  request: requestInput,
  actor = null,
  now = new Date(),
  notifyWake = notifyComputeWorkerWake,
  scheduleLocal = scheduleDevelopmentComputeJob,
} = {}) {
  const request = await bindCarouselExportRevision(req, validateAdminJobRequest(requestInput));
  const payload = jobRequestToCreateInput(request, actor);
  const { job, created } = await createComputeJob(req, {
    ...payload,
    requestedAt: payload.requestedAt || now.toISOString(),
  });
  const wake = await wakeOrScheduleLocal(job, notifyWake, scheduleLocal);
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
    jobs: listed.jobs.map((job) => serializeAdminJob(job, { includeApplyManifest: false })),
    nextCursor: listed.nextCursor,
  };
}

async function getAdminComputeJob(req, externalJobId, {
  includeAttempts = true,
  includeApplyManifest = true,
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  const payload = {
    // Preview has a dedicated endpoint; avoid transferring multi-megabyte result
    // payloads just to render operational metadata. Apply-manifest rows follow
    // the same idea: list omits them, detail can request includeApplyManifest.
    job: serializeAdminJob(job, { includeApplyManifest }),
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
  scheduleLocal = scheduleDevelopmentComputeJob,
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) {
    throw serviceError('Compute job not found', 'COMPUTE_JOB_NOT_FOUND', 404);
  }
  if (job.status === 'pending') {
    const wake = await wakeOrScheduleLocal(job, notifyWake, scheduleLocal);
    return { job: serializeAdminJob(job), duplicate: true, wake };
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
  const wake = await wakeOrScheduleLocal(retried, notifyWake, scheduleLocal);
  return { job: serializeAdminJob(retried), duplicate: false, wake };
}

function composeOutcomeIssueIds(outcome) {
  if (Array.isArray(outcome?.issueIds) && outcome.issueIds.length) return outcome.issueIds.map(String);
  return outcome?.issueId ? [String(outcome.issueId)] : [];
}

function composeOptionPayloads(result, externalJobId, { composeIssueId, composeOptionIssueId }) {
  if (result.decision !== 'compose') return [];
  if (Array.isArray(result.compositions)) {
    return result.compositions.map((composition, optionIndex) => ({
      composition,
      optionIndex,
      optionSetId: externalJobId,
      themeLabel: composition.themeLabel,
      issueId: composeOptionIssueId(externalJobId, optionIndex),
    }));
  }
  return [{ composition: result.composition, issueId: composeIssueId(externalJobId) }];
}

/** Create any missing drafts. An issue that already belongs to this job is left as it is. */
async function createMissingComposeIssues(req, { externalJobId, context, payloads, publicationAt, actor, now }) {
  const getGlobalModels = require('./getGlobalModelService');
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const { refKey, buildCompositionDocument } = require('./pivotCarouselCompositionService');
  const { resolveEditorialAccount, postedHistory, composeWindow } = require('./pivotCarouselComposeContextService');
  const { searchEditorialCatalogPage } = require('./pivotCarouselCurationQueryService');
  const existingDocs = await PivotCarouselDeck.find({ _id: { $in: payloads.map(payload => payload.issueId) } }).lean();
  const existingById = new Map(existingDocs.map(doc => [String(doc._id), doc]));
  for (const payload of payloads) {
    const existing = existingById.get(payload.issueId);
    if (existing && (existing.composeJobId !== externalJobId || String(existing.accountId) !== context.account.id)) {
      throw serviceError('Compose issue identity is already in use.', 'COMPOSE_ISSUE_CONFLICT', 409);
    }
  }
  const missing = payloads.filter(payload => !existingById.has(payload.issueId));
  if (!missing.length) return [];

  const resolved = await resolveEditorialAccount(req, context.editorialAccountKey);
  if (resolved.error) throw serviceError(resolved.error, resolved.code, resolved.status);
  if (String(resolved.account._id) !== context.account.id) throw serviceError('Editorial account changed.', 'COMPOSE_ACCOUNT_CHANGED', 409);
  const expectedWindow = composeWindow(resolved.definition, publicationAt, resolved.timezone);
  if (!expectedWindow || ['from', 'to', 'toExclusive', 'timezone'].some(field => expectedWindow[field] !== context.window[field])
    || resolved.account.ownerTenantKey !== context.account.ownerTenantKey) {
    throw serviceError('The account publication window changed.', 'COMPOSE_ACCOUNT_CHANGED', 409);
  }
  const history = await postedHistory(req, resolved.account._id);
  if (history.error) throw serviceError(history.error, history.code, history.status);
  const requested = [];
  for (const payload of missing) {
    const selected = payload.composition.selectedEventRefs;
    if (selected.some(ref => history.used.has(refKey(ref)))) {
      throw serviceError('A selected event has already been posted on this account.', 'COMPOSE_EVENT_ALREADY_POSTED', 422);
    }
    requested.push(...selected);
    if (payload.composition.cover.assetRef.kind === 'event-poster') requested.push(payload.composition.cover.assetRef.eventRef);
  }
  if (requested.some(ref => !context.candidates.some(candidate => refKey(candidate.ref) === refKey(ref)))) {
    throw serviceError('A selected event was not in the worker context.', 'COMPOSE_EVENT_INELIGIBLE', 422);
  }
  const candidates = [];
  for (const sourceTenantKey of new Set(requested.map(ref => ref.sourceTenantKey))) {
    const read = await searchEditorialCatalogPage(req, sourceTenantKey, {
      dateFrom: context.window.from, dateTo: context.window.to, dateToExclusive: context.window.toExclusive,
      timezone: context.window.timezone, sort: 'date-asc', limit: 24,
    }, { now, ingestStatuses: context.policy?.catalogIngestStatuses || ['published'],
      onlyEventIds: [...new Set(requested.filter(ref => ref.sourceTenantKey === sourceTenantKey).map(ref => ref.eventId))] });
    if (read.error || read.data.sources.some(source => source.status !== 'ok')) {
      throw serviceError('Could not recheck selected catalog events.', 'COMPOSE_CATALOG_UNAVAILABLE', 409);
    }
    candidates.push(...read.data.candidates);
  }
  const documents = missing.map(payload => ({
    payload,
    document: buildCompositionDocument(payload.composition, { ...context, lastPostedIssues: history.recent }, candidates),
  }));
  const { createGeneratedCarouselIssue } = require('./pivotCarouselIssueService');
  const written = [];
  for (const { payload, document } of documents) {
    const selected = payload.composition.selectedEventRefs;
    const created = await createGeneratedCarouselIssue({ ...req, user: { ...req.user,
      globalUserId: req.user?.globalUserId || actor } }, context.account.id, {
      name: payload.composition.cover.headline, format: context.account.format, document,
      socialCaption: payload.composition.socialCaption, sources: selected,
      curation: { refs: selected, snapshots: candidates.filter(candidate => selected.some(ref => refKey(ref) === refKey(candidate.ref))) },
    }, {
      issueId: payload.issueId, composeJobId: externalJobId, sourceTenantKeys: context.account.sourceTenantKeys,
      trendRefs: [...new Set((payload.composition.evidenceRefs || []).filter(ref => /^trend:[a-z]+:[a-z0-9-]+$/.test(ref)))].slice(0, 10),
      // The issue is born at revision 1, which is the revision the agent just wrote.
      composition: JSON.parse(JSON.stringify(payload.composition)),
      contextWindow: {
        from: context.window.from, to: context.window.to, toExclusive: context.window.toExclusive,
        timezone: context.window.timezone, mode: context.window.mode, days: context.window.days,
      },
      agentRevision: 1,
      ...(payload.optionSetId ? {
        optionSetId: payload.optionSetId, optionIndex: payload.optionIndex, themeLabel: payload.themeLabel,
      } : {}),
    });
    if (created.error) throw serviceError(created.error, created.code, created.status);
    written.push({ issueId: String(created.data.issue.id), revision: created.data.issue.revision });
  }
  return written;
}

/**
 * Render the revision an agent just wrote. The export is a separate job: a
 * failure here is logged and the draft apply still stands. The same issue
 * revision is queued at most once.
 */
async function queueWrittenRevisionExports(req, issues, { tenantKey, actor, now }) {
  if (!issues?.length) return;
  const { queueCarouselExportForIssueRevision } = require('./pivotCarouselArtifactTransportService');
  for (const issue of issues) {
    try {
      await queueCarouselExportForIssueRevision(req, {
        issueId: issue.issueId, revision: issue.revision, tenantKey, actor, now,
      });
    } catch (error) {
      logPivot('warn', 'carousel export queue failed', {
        code: error?.code || 'CAROUSEL_EXPORT_QUEUE_FAILED',
        message: error?.message || String(error),
        issueId: issue.issueId ? String(issue.issueId) : null,
        revision: issue.revision ?? null,
      });
    }
  }
}

/** Apply an editorial decision, never approve, post, or overwrite an existing issue. */
async function applyCarouselComposeJob(req, externalJobId, { tenantKey, actor = null, now = new Date() } = {}) {
  const getGlobalModels = require('./getGlobalModelService');
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  const { composeIssueId, composeOptionIssueId } = require('./pivotCarouselCompositionService');
  const stored = await PivotComputeJob.findOne({ externalJobId }).lean();
  if (!stored) throw serviceError('Compute job not found.', 'COMPUTE_JOB_NOT_FOUND', 404);
  if (stored.kind !== 'carousel-compose') throw serviceError('Expected a compose job.', 'UNSUPPORTED_COMPUTE_JOB_KIND');
  if (!trimString(tenantKey)) throw serviceError('A tenantKey is required to apply a compute job.', 'APPLY_TENANT_REQUIRED');
  if (trimString(tenantKey).toLowerCase() !== stored.tenantKey) throw serviceError('Compute job belongs to another tenant.', 'COMPUTE_JOB_TENANT_MISMATCH', 409);
  if (stored.status === 'completed' && stored.composeOutcome?.decision) {
    const issueIds = composeOutcomeIssueIds(stored.composeOutcome);
    return {
      job: serializeAdminJob(stored), duplicate: true, decision: stored.composeOutcome.decision,
      issueId: issueIds[0] || null, issueIds,
    };
  }
  const result = stored.result?.embedded;
  const validation = validateExecutionResult(result);
  if (!validation.valid) throw serviceError('The stored compose result is invalid.', 'INVALID_COMPUTE_EXECUTION_RESULT', 422);
  if (result.kind !== stored.kind || result.jobId !== stored.externalJobId || result.cityKey !== stored.cityKey
    || result.basedOnContextVersion !== stored.contextVersion
    || result.scheduleOccurrenceId !== (stored.scheduleOccurrenceId || null)
    || result.editorialAccountKey !== stored.options?.editorialAccountKey) {
    throw serviceError('Compose result does not match the job.', 'COMPOSE_RESULT_BINDING_MISMATCH', 409);
  }
  const context = stored.composeContext;
  const publication = new Date(stored.options?.proposedPublicationAt);
  if (!validateContextSnapshot(context).valid || context.kind !== stored.kind || context.jobId !== stored.externalJobId
    || context.contextVersion !== stored.contextVersion || context.editorialAccountKey !== result.editorialAccountKey
    || !Number.isFinite(publication.getTime()) || context.proposedPublicationAt !== publication.toISOString()) {
    throw serviceError('The worker-served compose context is unavailable.', 'COMPOSE_CONTEXT_MISSING', 409);
  }
  const key = `compose:apply:${composeIssueId(externalJobId)}`;
  await beginComputeJobApply(req, { externalJobId, idempotencyKey: key, actor, now });
  try {
    const payloads = composeOptionPayloads(result, externalJobId, { composeIssueId, composeOptionIssueId });
    const issueIds = payloads.map(payload => payload.issueId);
    const written = payloads.length ? await createMissingComposeIssues(req, {
      externalJobId, context, payloads, publicationAt: stored.options?.proposedPublicationAt, actor, now,
    }) : [];
    await queueWrittenRevisionExports(req, written, { tenantKey: stored.tenantKey, actor, now });
    // Durable issue ids survive a crash between issue creation and job completion.
    await PivotComputeJob.updateOne({ externalJobId, status: 'applying' }, { $set: {
      composeOutcome: {
        decision: result.decision, reason: result.reason || null,
        issueId: issueIds[0] || null, issueIds,
      },
    } });
    const job = await completeComputeJobApply(req, { externalJobId, actor, idempotencyKey: key,
      summary: { creates: issueIds.length }, now });
    return {
      job: serializeAdminJob(job), duplicate: false, decision: result.decision,
      issueId: issueIds[0] || null, issueIds,
    };
  } catch (error) {
    await completeComputeJobApply(req, { externalJobId, actor, idempotencyKey: key, outcome: 'rejected',
      errorCode: error.code || 'COMPOSE_APPLY_FAILED', errorMessage: error.message, recordAppliedAt: false, now });
    throw error;
  }
}

async function finishReviseApply(req, { externalJobId, actor, key, now, decision, reason = null, issueId, requestId, summary }) {
  const getGlobalModels = require('./getGlobalModelService');
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  await PivotComputeJob.updateOne({ externalJobId, status: 'applying' }, { $set: {
    reviseOutcome: { decision, reason, issueId, requestId },
  } });
  const job = await completeComputeJobApply(req, { externalJobId, actor, idempotencyKey: key, summary, now });
  return {
    job: serializeAdminJob(job), duplicate: false, decision,
    issueId: String(issueId), requestId: String(requestId),
  };
}

/**
 * Apply one revise result to the draft it was bound to.
 * A second apply finds the stored outcome and does not write the draft again.
 * The draft is left untouched when it moved on or was edited by hand.
 */
async function applyCarouselReviseJob(req, externalJobId, { tenantKey, actor = null, now = new Date() } = {}) {
  const getGlobalModels = require('./getGlobalModelService');
  const { PivotComputeJob, PivotCarouselDeck } = getGlobalModels(req, 'PivotComputeJob', 'PivotCarouselDeck');
  const stored = await PivotComputeJob.findOne({ externalJobId }).lean();
  if (!stored) throw serviceError('Compute job not found.', 'COMPUTE_JOB_NOT_FOUND', 404);
  if (stored.kind !== 'carousel-revise') throw serviceError('Expected a revise job.', 'UNSUPPORTED_COMPUTE_JOB_KIND');
  if (!trimString(tenantKey)) throw serviceError('A tenantKey is required to apply a compute job.', 'APPLY_TENANT_REQUIRED');
  if (trimString(tenantKey).toLowerCase() !== stored.tenantKey) throw serviceError('Compute job belongs to another tenant.', 'COMPUTE_JOB_TENANT_MISMATCH', 409);
  if (stored.status === 'completed' && stored.reviseOutcome?.decision) {
    return {
      job: serializeAdminJob(stored), duplicate: true, decision: stored.reviseOutcome.decision,
      issueId: stored.reviseOutcome.issueId ? String(stored.reviseOutcome.issueId) : null,
      requestId: stored.reviseOutcome.requestId ? String(stored.reviseOutcome.requestId) : null,
    };
  }
  const result = stored.result?.embedded;
  const validation = validateExecutionResult(result);
  if (!validation.valid) throw serviceError('The stored revise result is invalid.', 'INVALID_COMPUTE_EXECUTION_RESULT', 422);
  const issueId = String(stored.options?.issueId || '');
  const requestId = String(stored.options?.requestId || '');
  const revision = stored.options?.revision;
  if (result.kind !== stored.kind || result.jobId !== stored.externalJobId || result.cityKey !== stored.cityKey
    || result.basedOnContextVersion !== stored.contextVersion
    || result.scheduleOccurrenceId !== (stored.scheduleOccurrenceId || null)
    || result.issueId !== issueId || result.requestId !== requestId
    || !/^[0-9a-f]{24}$/.test(issueId) || !/^[0-9a-f]{24}$/.test(requestId)
    || !Number.isInteger(revision) || revision < 1) {
    throw serviceError('Revise result does not match the job.', 'REVISE_RESULT_BINDING_MISMATCH', 409);
  }
  const context = stored.reviseContext;
  if (!validateContextSnapshot(context).valid || context.kind !== stored.kind || context.jobId !== stored.externalJobId
    || context.contextVersion !== stored.contextVersion || context.issueId !== issueId || context.revision !== revision) {
    throw serviceError('The worker-served revise context is unavailable.', 'REVISE_CONTEXT_MISSING', 409);
  }
  const key = `revise:apply:${issueId}:${requestId}`;
  await beginComputeJobApply(req, { externalJobId, idempotencyKey: key, actor, now });
  try {
    const issue = await PivotCarouselDeck.findOne({ _id: issueId, accountId: context.account.id });
    if (!issue) throw serviceError('Issue not found.', 'ISSUE_NOT_FOUND', 404);
    if (result.decision === 'cannot-revise') {
      const updated = await PivotCarouselDeck.updateOne(
        { _id: issueId, 'revisionRequests._id': requestId },
        { $set: { 'revisionRequests.$.reason': result.reason } },
      );
      if (!updated.matchedCount) throw serviceError('The revision request is not on this draft.', 'REVISE_REQUEST_MISSING', 409);
      return finishReviseApply(req, {
        externalJobId, actor, key, now, decision: 'cannot-revise', reason: result.reason, issueId, requestId,
        summary: { unchanged: 1 },
      });
    }
    const currentRevision = issue.revision || 1;
    const handEdited = issue.agentRevision != null && currentRevision !== issue.agentRevision;
    if (currentRevision !== revision || handEdited || issue.reviewState === 'posted') {
      return finishReviseApply(req, {
        externalJobId, actor, key, now, decision: 'conflict', issueId, requestId, summary: { conflicts: 1 },
      });
    }
    const { refKey, buildCompositionDocument } = require('./pivotCarouselCompositionService');
    const { postedHistory } = require('./pivotCarouselComposeContextService');
    const { searchEditorialCatalogPage } = require('./pivotCarouselCurationQueryService');
    const { updateCarouselIssue } = require('./pivotCarouselIssueService');
    const selected = result.composition.selectedEventRefs;
    const history = await postedHistory(req, issue.accountId);
    if (history.error) throw serviceError(history.error, history.code, history.status);
    if (selected.some(ref => history.used.has(refKey(ref)))) {
      throw serviceError('A selected event has already been posted on this account.', 'COMPOSE_EVENT_ALREADY_POSTED', 422);
    }
    if (selected.some(ref => !context.candidates.some(candidate => refKey(candidate.ref) === refKey(ref)))) {
      throw serviceError('A selected event was not in the worker context.', 'COMPOSE_EVENT_INELIGIBLE', 422);
    }
    const candidates = [];
    for (const sourceTenantKey of new Set(selected.map(ref => ref.sourceTenantKey))) {
      const read = await searchEditorialCatalogPage(req, sourceTenantKey, {
        dateFrom: context.window.from, dateTo: context.window.to, dateToExclusive: context.window.toExclusive,
        timezone: context.window.timezone, sort: 'date-asc', limit: 24,
      }, {
        now, ingestStatuses: context.policy?.catalogIngestStatuses || ['published'],
        onlyEventIds: [...new Set(selected.filter(ref => ref.sourceTenantKey === sourceTenantKey).map(ref => ref.eventId))],
      });
      if (read.error || read.data.sources.some(source => source.status !== 'ok')) {
        throw serviceError('Could not recheck selected catalog events.', 'COMPOSE_CATALOG_UNAVAILABLE', 409);
      }
      candidates.push(...read.data.candidates);
    }
    const document = buildCompositionDocument(result.composition, { ...context, lastPostedIssues: history.recent }, candidates);
    const saved = await updateCarouselIssue({ ...req, user: { ...req.user, globalUserId: req.user?.globalUserId || actor } },
      context.account.id, issueId, {
        revision, document, socialCaption: result.composition.socialCaption, sources: selected,
        curation: {
          refs: selected,
          snapshots: candidates.filter(candidate => selected.some(ref => refKey(ref) === refKey(candidate.ref))),
        },
      }, null, {
        composition: JSON.parse(JSON.stringify(result.composition)),
        agentRevision: revision + 1,
      });
    if (saved.error) {
      if (saved.code === 'REVISION_CONFLICT') {
        return finishReviseApply(req, {
          externalJobId, actor, key, now, decision: 'conflict', issueId, requestId, summary: { conflicts: 1 },
        });
      }
      throw serviceError(saved.error, saved.code, saved.status);
    }
    await queueWrittenRevisionExports(req, [{
      issueId: String(saved.data.issue.id), revision: saved.data.issue.revision,
    }], { tenantKey: stored.tenantKey, actor, now });
    return finishReviseApply(req, {
      externalJobId, actor, key, now, decision: 'revise', issueId, requestId, summary: { updates: 1 },
    });
  } catch (error) {
    await completeComputeJobApply(req, {
      externalJobId, actor, idempotencyKey: key, outcome: 'rejected',
      errorCode: error.code || 'REVISE_APPLY_FAILED', errorMessage: error.message, recordAppliedAt: false, now,
    });
    throw error;
  }
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
  COMPOSE_MANUAL_SUBMIT_UNSUPPORTED: 409,
  REVISE_MANUAL_SUBMIT_UNSUPPORTED: 409,
  REVISE_PREVIEW_UNSUPPORTED: 409,
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
  applyCarouselComposeJob,
  applyCarouselReviseJob,
  createAdminCarouselArtifactDownload,
  handleAdminServiceError,
};
