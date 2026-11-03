const { buildDiscoveryQueries } = require('../constants/pivotDiscoverySeeds');
const { nullRecorder } = require('./pivotDiscoveryRunRecorder');
const { executeCitySourceDiscoveryCore } = require('./pivotSourceDiscoveryService');
const {
  createProposalCollector,
  createArtifactDiscoverySinks,
} = require('./pivotDiscoverySinks');
const {
  CONTRACT_VERSION,
  validateContextSnapshot,
  validateExecutionResult,
  collectForbiddenImportableViolations,
  isStaleContextPreview,
} = require('../utilities/pivotAdminComputeJobContract');
const { resolveImplementationRevision, isoTimestamp } = require('../utilities/pivotComputeContextVersion');

const DISCOVERY_RESULT_LIMITS = Object.freeze({
  maxSources: 100,
  maxCurationJobs: 100,
  maxEvents: 2000,
});

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function contextSnapshotToTenant(contextSnapshot) {
  return {
    tenantKey: contextSnapshot.cityKey,
    name: contextSnapshot.tenant.name,
    location: contextSnapshot.tenant.location,
    pivotDropTimezone: contextSnapshot.tenant.timezone,
    pivotDiscovery: {
      flow: contextSnapshot.discovery.flow,
      lumaSlug: contextSnapshot.discovery.lumaSlug,
      partifulSlug: contextSnapshot.discovery.partifulSlug,
    },
  };
}

function discoveryConfigFromContext(contextSnapshot) {
  return {
    ...contextSnapshot.discovery,
    skipNativeHostsInSearch: contextSnapshot.discovery.runNative,
  };
}

function sortProposals(collector) {
  collector.sources.sort((left, right) => left.host.localeCompare(right.host));
  collector.curationJobs.sort((left, right) => {
    const leftKey = `${left.provider}:${left.url || ''}:${left.label}`;
    const rightKey = `${right.provider}:${right.url || ''}:${right.label}`;
    return leftKey.localeCompare(rightKey);
  });
  collector.events.sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
}

function buildDiscoveryExecutionResult({
  contextSnapshot,
  jobId,
  scheduleOccurrenceId,
  idempotencyKey,
  implementationRevision,
  completedAt,
  outcome,
  collector,
  summary,
  failure,
}) {
  sortProposals(collector);
  return {
    contractVersion: CONTRACT_VERSION,
    jobId,
    scheduleOccurrenceId: scheduleOccurrenceId ?? null,
    kind: 'city-source-discovery',
    cityKey: contextSnapshot.cityKey,
    implementationRevision,
    basedOnContextVersion: contextSnapshot.contextVersion,
    completedAt,
    outcome,
    idempotencyKey,
    ...(failure ? { failure } : {}),
    proposals: {
      sources: collector.sources.slice(0, DISCOVERY_RESULT_LIMITS.maxSources),
      curationJobs: collector.curationJobs.slice(0, DISCOVERY_RESULT_LIMITS.maxCurationJobs),
      events: collector.events.slice(0, DISCOVERY_RESULT_LIMITS.maxEvents),
    },
    summary,
  };
}

function summarizeArtifactRun(coreData, collector) {
  const qualified = collector.sources.filter((row) => row.status === 'qualified').length;
  const rejected = collector.sources.filter((row) => row.status === 'rejected').length;
  return {
    searched: coreData?.calls?.searches || 0,
    qualified,
    rejected,
    eventsProposed: collector.events.length,
  };
}

function createProgressRecorder(baseRecorder) {
  if (!baseRecorder) return nullRecorder();
  return {
    runId: baseRecorder.runId || null,
    enabled: baseRecorder.enabled !== false,
    step: (...args) => baseRecorder.step?.(...args),
    setPhase: (...args) => baseRecorder.setPhase?.(...args),
    bumpCounters: (...args) => baseRecorder.bumpCounters?.(...args),
    finish: (...args) => baseRecorder.finish?.(...args),
    flush: (...args) => baseRecorder.flush?.(...args),
  };
}

/**
 * Run city-source-discovery against a portable context snapshot and return
 * importable proposals without mutating authoritative production data.
 */
async function executeOffloadedCitySourceDiscovery(options = {}) {
  const contextSnapshot = options.contextSnapshot;
  if (!contextSnapshot || contextSnapshot.kind !== 'city-source-discovery') {
    return {
      error: 'A city-source-discovery context snapshot is required.',
      status: 400,
      code: 'INVALID_DISCOVERY_CONTEXT',
    };
  }

  const contextValidation = validateContextSnapshot(contextSnapshot);
  if (!contextValidation.valid) {
    return {
      error: 'Discovery context snapshot failed contract validation.',
      status: 400,
      code: 'INVALID_DISCOVERY_CONTEXT',
      details: contextValidation.errors,
    };
  }

  if (
    options.expectedContextVersion &&
    isStaleContextPreview(
      { basedOnContextVersion: options.expectedContextVersion },
      contextSnapshot.contextVersion,
    )
  ) {
    return {
      error: 'Discovery context snapshot is stale.',
      status: 409,
      code: 'DISCOVERY_CONTEXT_STALE',
    };
  }

  const jobId = trimString(options.jobId);
  const idempotencyKey = trimString(options.idempotencyKey);
  if (!jobId || !idempotencyKey) {
    return {
      error: 'jobId and idempotencyKey are required.',
      status: 400,
      code: 'DISCOVERY_JOB_ID_REQUIRED',
    };
  }

  const workerCapabilities = options.workerCapabilities || contextSnapshot.providerCapabilities || {};
  if (contextSnapshot.discovery.runFirecrawl && workerCapabilities.firecrawlConfigured === false) {
    return {
      error: 'Generic-site discovery requires Firecrawl, which is not configured.',
      status: 503,
      code: 'SITE_SCRAPE_NOT_CONFIGURED',
    };
  }

  const tenant = contextSnapshotToTenant(contextSnapshot);
  const discovery = discoveryConfigFromContext(contextSnapshot);
  const runOptions = options.runOptions || {};
  const city = trimString(contextSnapshot.tenant.name) || contextSnapshot.cityKey;
  const queries = buildDiscoveryQueries({
    city,
    tags: runOptions.tags,
    maxQueries: runOptions.maxQueries,
  });

  if (!queries.length && discovery.runFirecrawl) {
    return {
      error: 'Unable to build discovery queries for this city.',
      status: 400,
      code: 'NO_DISCOVERY_QUERIES',
    };
  }

  const collector = createProposalCollector();
  const sinks = createArtifactDiscoverySinks(contextSnapshot, collector);
  const knownHosts = await sinks.loadKnownHosts(contextSnapshot.cityKey, runOptions.recheckRejected);
  const recorder = createProgressRecorder(options.progressRecorder);
  const completedAt = isoTimestamp(options.now) || new Date().toISOString();
  const implementationRevision = options.implementationRevision || resolveImplementationRevision();

  const coreResult = await executeCitySourceDiscoveryCore(
    options.req || null,
    {
      tenant,
      discovery,
      queries,
      sinks,
      knownHosts,
      recorder,
      shouldCancel: options.shouldCancel,
      options: {
        tenantKey: contextSnapshot.cityKey,
        tags: runOptions.tags,
        maxQueries: runOptions.maxQueries,
        maxCandidates: runOptions.maxCandidates,
        minEvents: runOptions.minEvents,
        createJobs: runOptions.createJobs !== false,
        recheckRejected: runOptions.recheckRejected === true,
        ingestEvents: runOptions.ingestEvents !== false,
        chainNativeJobs: false,
        record: false,
        now: options.now,
        providers: options.providers,
        resultsPerQuery: runOptions.resultsPerQuery,
        actor: options.actor || null,
      },
    },
  );

  // Only an abort fails the run. A single timed-out map or scrape is recorded in
  // failures, but the rest of the run's proposals are still good.
  const outcome = coreResult.data?.aborted?.code === 'CANCELLED'
    ? 'cancelled'
    : (coreResult.data?.aborted ? 'failed' : 'completed');

  const result = buildDiscoveryExecutionResult({
    contextSnapshot,
    jobId,
    scheduleOccurrenceId: options.scheduleOccurrenceId ?? contextSnapshot.scheduleOccurrenceId ?? null,
    idempotencyKey,
    implementationRevision,
    completedAt,
    outcome,
    collector,
    summary: summarizeArtifactRun(coreResult.data, collector),
    failure: outcome === 'failed' && coreResult.data?.aborted
      ? {
        code: coreResult.data.aborted.code || 'DISCOVERY_FAILED',
        message: coreResult.data.aborted.error || 'Discovery failed.',
      }
      : undefined,
  });

  const resultValidation = validateExecutionResult(result);
  if (!resultValidation.valid) {
    return {
      error: 'Discovery execution result failed contract validation.',
      status: 500,
      code: 'DISCOVERY_RESULT_INVALID',
      details: resultValidation.errors,
      repairCandidate: result,
    };
  }

  const forbidden = collectForbiddenImportableViolations(result);
  if (forbidden.length) {
    return {
      error: 'Discovery execution result contains forbidden fields.',
      status: 500,
      code: 'DISCOVERY_RESULT_FORBIDDEN',
      details: forbidden,
      repairCandidate: result,
    };
  }

  return {
    data: {
      result,
      run: coreResult.data,
    },
  };
}

module.exports = {
  DISCOVERY_RESULT_LIMITS,
  contextSnapshotToTenant,
  buildDiscoveryExecutionResult,
  executeOffloadedCitySourceDiscovery,
};
