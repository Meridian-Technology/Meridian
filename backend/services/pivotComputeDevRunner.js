/**
 * Development-only in-process runner for discovery and refresh compute jobs.
 *
 * A local API process claims the durable job, runs the same offloaded scrape
 * the Mini runs, and submits the result for review. Production never enters
 * this queue: scheduling requires NODE_ENV=development, and carousel export
 * still wakes the Mini. The Relay worker is not involved.
 */
const { CONTRACT_VERSION } = require('../utilities/pivotAdminComputeJobContract');
const { resolveImplementationRevision } = require('../utilities/pivotComputeContextVersion');
const { logPivot } = require('../utilities/pivotLogger');
const { createWorkerContextAuthorizer } = require('./pivotComputeLease');
const {
  claimNextPendingJob,
  startComputeJob,
  heartbeatComputeJobLease,
  recordComputeJobProgress,
  submitComputeJobResult,
  updateComputeJobContextVersion,
  findJobByExternalId,
} = require('./pivotComputeJobStore');

const LOCAL_WORKER_ID = 'dev-local';
const LOCAL_KINDS = new Set(['city-source-discovery', 'city-curation-refresh']);
const LOCAL_LEASE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDevelopmentComputeRunnerEnabled(env = process.env) {
  return env.NODE_ENV === 'development';
}

function localCapability() {
  return {
    contractVersion: CONTRACT_VERSION,
    implementationRevision: resolveImplementationRevision(),
    supportedContractVersions: [CONTRACT_VERSION],
    supportedKinds: [...LOCAL_KINDS],
  };
}

function localIdempotencyKey(externalJobId, scheduleOccurrenceId) {
  const occurrence = trimString(scheduleOccurrenceId);
  const match = occurrence && /^sched:([^@]+)@(.+)$/.exec(occurrence);
  if (match) {
    return `idem:sched-${match[1]}-${match[2].replace(/[:.]/g, '-')}`;
  }
  return `idem:${externalJobId}`;
}

function emptyProposals(kind) {
  if (kind === 'city-curation-refresh') return { jobOutcomes: [], events: [] };
  return { sources: [], curationJobs: [], events: [] };
}

function emptySummary(kind) {
  if (kind === 'city-curation-refresh') {
    return { jobsRun: 0, jobsFailed: 1, eventsProposed: 0, eventsRefreshed: 0 };
  }
  return { searched: 0, qualified: 0, rejected: 0, eventsProposed: 0 };
}

function failedLocalResult(job, contextVersion, error) {
  return {
    contractVersion: CONTRACT_VERSION,
    jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId ?? null,
    kind: job.kind,
    cityKey: job.cityKey,
    implementationRevision: resolveImplementationRevision(),
    basedOnContextVersion: contextVersion,
    completedAt: new Date().toISOString(),
    outcome: 'failed',
    idempotencyKey: localIdempotencyKey(job.externalJobId, job.scheduleOccurrenceId),
    failure: {
      code: trimString(error?.code).slice(0, 64) || 'LOCAL_COMPUTE_FAILED',
      message: trimString(error?.message).slice(0, 1000) || 'Local compute job failed',
    },
    proposals: emptyProposals(job.kind),
    summary: emptySummary(job.kind),
  };
}

function isLocalPendingJob(job) {
  return Boolean(
    job
    && job.status === 'pending'
    && LOCAL_KINDS.has(job.kind)
    && trimString(job.externalJobId),
  );
}

async function connectDevelopmentRequest(tenantKey) {
  const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
  const normalizedTenantKey = trimString(tenantKey).toLowerCase();
  const [globalDb, db] = await Promise.all([
    connectToGlobalDatabase(),
    normalizedTenantKey ? connectToDatabase(normalizedTenantKey) : Promise.resolve(null),
  ]);
  return {
    globalDb,
    db,
    school: normalizedTenantKey,
    user: { email: LOCAL_WORKER_ID },
  };
}

async function buildLocalContext(req, job) {
  const authorize = createWorkerContextAuthorizer({
    workerId: LOCAL_WORKER_ID,
    externalJobId: job.externalJobId,
    cityKey: job.cityKey,
    kind: job.kind,
    scheduleOccurrenceId: job.scheduleOccurrenceId,
  });
  const jobOptions = job.options && typeof job.options === 'object' ? job.options : {};
  const contextOptions = {
    ...jobOptions,
    cityKey: job.cityKey,
    jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId,
    authorize,
    discoveryOverrides: jobOptions,
  };

  if (job.kind === 'city-source-discovery') {
    const { buildCityDiscoveryContextSnapshot } = require('./pivotOffloadedDiscoveryContextService');
    const result = await buildCityDiscoveryContextSnapshot(req, contextOptions);
    if (result?.error) {
      const error = new Error(result.error);
      error.code = result.code || 'DISCOVERY_CONTEXT_FAILED';
      throw error;
    }
    return result.data.snapshot;
  }

  const { buildCityCurationRefreshContextSnapshot } = require('./pivotOffloadedCurationRefreshContextService');
  const result = await buildCityCurationRefreshContextSnapshot(req, contextOptions);
  if (result?.error) {
    const error = new Error(result.error);
    error.code = result.code || 'REFRESH_CONTEXT_FAILED';
    throw error;
  }
  return result.data.snapshot;
}

function createProgressRecorder(req, { externalJobId, leaseToken, onActivity }) {
  function remember(entry = {}) {
    const message = [entry.title, entry.detail].filter(Boolean).join(': ').slice(0, 500);
    recordComputeJobProgress(req, {
      externalJobId,
      leaseToken,
      workerId: LOCAL_WORKER_ID,
      phase: entry.phase || entry.kind || 'running',
      message,
      counters: entry.counters,
      now: new Date(),
    }).catch(() => undefined);
    if (onActivity) onActivity();
  }

  return {
    enabled: true,
    runId: externalJobId,
    step: remember,
    setPhase: (phase) => remember({ phase }),
    bumpCounters: (counters) => remember({ counters }),
    finish: remember,
    flush: () => undefined,
  };
}

async function executeLocalJob(req, job, context, seams, recorder, shouldCancel) {
  const implementationRevision = resolveImplementationRevision();
  const shared = {
    contextSnapshot: context,
    jobId: job.externalJobId,
    idempotencyKey: localIdempotencyKey(job.externalJobId, job.scheduleOccurrenceId),
    scheduleOccurrenceId: job.scheduleOccurrenceId ?? null,
    implementationRevision,
    expectedContextVersion: context.contextVersion,
    progressRecorder: recorder,
    shouldCancel,
    workerCapabilities: {
      firecrawlConfigured: Boolean(trimString(process.env.FIRECRAWL_API_KEY)),
      nativeProviders: ['luma', 'partiful'],
    },
    runOptions: job.options || {},
  };

  if (job.kind === 'city-source-discovery') {
    const execute = seams.executeOffloadedCitySourceDiscovery
      || require('./pivotOffloadedDiscoveryService').executeOffloadedCitySourceDiscovery;
    return execute(shared);
  }

  const { previewIngestUrl } = require('./pivotIngestPreviewService');
  const execute = seams.executeOffloadedCityCurationRefresh
    || require('./pivotOffloadedCurationRefreshService').executeOffloadedCityCurationRefresh;
  return execute({
    ...shared,
    providers: {
      previewIngestUrl: (opts) => previewIngestUrl(req, opts),
    },
  });
}

async function submitLocalOutcome(req, job, leaseToken, response) {
  const result = response?.data?.result;
  if (!result) {
    const error = new Error(response?.error || 'Local compute job returned no result');
    error.code = response?.code || 'LOCAL_COMPUTE_FAILED';
    throw error;
  }

  await submitComputeJobResult(req, {
    externalJobId: job.externalJobId,
    leaseToken,
    workerId: LOCAL_WORKER_ID,
    result,
    requiresReview: result.outcome === 'completed',
    retryable: result.outcome === 'failed',
    now: new Date(),
  });
}

async function submitFailureBestEffort(req, job, leaseToken, contextVersion, error) {
  try {
    await submitComputeJobResult(req, {
      externalJobId: job.externalJobId,
      leaseToken,
      workerId: LOCAL_WORKER_ID,
      result: failedLocalResult(job, contextVersion, error),
      requiresReview: false,
      retryable: true,
      now: new Date(),
    });
  } catch (submitError) {
    logPivot('error', 'development compute job could not store its failure', {
      externalJobId: job.externalJobId,
      error: submitError.message,
    });
  }
}

/**
 * Claim one pending discovery or refresh job and run it in this process.
 * `seams` exist so tests can supply the snapshot and scrape without crawling.
 */
async function runDevelopmentComputeJob(entry, seams = {}) {
  const connect = seams.connect || connectDevelopmentRequest;
  const req = await connect(entry.tenantKey);
  const capability = localCapability();
  const claim = await claimNextPendingJob(req, {
    externalJobId: entry.externalJobId,
    kind: entry.kind,
    workerId: LOCAL_WORKER_ID,
    capability,
    leaseMs: LOCAL_LEASE_MS,
    now: new Date(),
  });
  if (!claim.job) return { ran: false, reason: 'not-pending' };

  const job = claim.job;
  const leaseToken = job.lease.token;
  const externalJobId = job.externalJobId;
  let contextVersion = job.contextVersion;
  let cancelRequested = false;
  let heartbeat = null;

  async function refreshCancel() {
    const current = await findJobByExternalId(req, externalJobId);
    cancelRequested = Boolean(current?.cancelRequested) || current?.status === 'cancelled';
  }

  try {
    await startComputeJob(req, {
      externalJobId,
      leaseToken,
      workerId: LOCAL_WORKER_ID,
      now: new Date(),
    });

    heartbeat = setInterval(() => {
      heartbeatComputeJobLease(req, {
        externalJobId,
        leaseToken,
        workerId: LOCAL_WORKER_ID,
        leaseMs: LOCAL_LEASE_MS,
        now: new Date(),
      }).catch(() => undefined);
      refreshCancel().catch(() => undefined);
    }, seams.heartbeatMs || HEARTBEAT_MS);
    heartbeat.unref?.();

    const buildContext = seams.buildContext || buildLocalContext;
    const context = await buildContext(req, job);
    contextVersion = context.contextVersion || contextVersion;
    await updateComputeJobContextVersion(req, externalJobId, contextVersion);

    logPivot('info', 'development compute job started', {
      externalJobId,
      kind: job.kind,
      cityKey: job.cityKey,
    });

    const recorder = createProgressRecorder(req, {
      externalJobId,
      leaseToken,
      onActivity: () => {
        refreshCancel().catch(() => undefined);
      },
    });
    const response = await executeLocalJob(
      req,
      job,
      context,
      seams,
      recorder,
      () => cancelRequested,
    );
    await submitLocalOutcome(req, job, leaseToken, response);
    logPivot('info', 'development compute job finished', {
      externalJobId,
      outcome: response?.data?.result?.outcome || null,
    });
    return { ran: true, externalJobId };
  } catch (error) {
    logPivot('error', 'development compute job failed', {
      externalJobId,
      code: error.code || null,
      error: error.message,
    });
    await submitFailureBestEffort(req, job, leaseToken, contextVersion, error);
    return { ran: true, externalJobId, failed: true };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

function createDevelopmentComputeQueue(run) {
  const waiting = [];
  const seen = new Set();
  let active = false;

  function drain() {
    if (active) return;
    const next = waiting.shift();
    if (!next) return;
    active = true;
    const handle = setImmediate(async () => {
      try {
        await run(next);
      } catch (error) {
        logPivot('error', 'development compute queue crashed', {
          externalJobId: next.externalJobId,
          error: error.message,
        });
      } finally {
        seen.delete(next.externalJobId);
        active = false;
        drain();
      }
    });
    handle.unref?.();
  }

  function enqueue(job) {
    const externalJobId = trimString(job?.externalJobId);
    if (!externalJobId || seen.has(externalJobId)) return false;
    seen.add(externalJobId);
    waiting.push(job);
    drain();
    return true;
  }

  return { enqueue };
}

const moduleQueue = createDevelopmentComputeQueue((job) => runDevelopmentComputeJob({
  externalJobId: job.externalJobId,
  tenantKey: job.cityKey || job.tenantKey,
  kind: job.kind,
}));

/**
 * Queue a pending discovery or refresh job when this process is a development
 * server. Returns true when the local runner owns the job, so the caller skips
 * the Mini wake. Returns false for every other environment and job kind.
 */
function scheduleDevelopmentComputeJob(job, options = {}) {
  const env = options.env || process.env;
  if (!isDevelopmentComputeRunnerEnabled(env) || !isLocalPendingJob(job)) return false;
  const enqueue = options.enqueue || moduleQueue.enqueue;
  enqueue(job);
  return true;
}

module.exports = {
  LOCAL_WORKER_ID,
  isDevelopmentComputeRunnerEnabled,
  scheduleDevelopmentComputeJob,
  runDevelopmentComputeJob,
  createDevelopmentComputeQueue,
  localIdempotencyKey,
};
