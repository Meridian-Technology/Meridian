const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { resolveRunBatchWeek } = require('./pivotCurationRunService');
const { isSiteScrapeConfigured } = require('./pivotSiteScrapeService');
const { mergeExtractionHints } = require('../utilities/pivotExtractionHints');
const {
  serializeSourceIdentity,
  serializeOrganizerIdentity,
} = require('./pivotOffloadedDiscoveryContextService');
const {
  refreshContextVersion,
  recordVersion,
  resolveImplementationRevision,
  isoTimestamp,
} = require('../utilities/pivotComputeContextVersion');
const {
  CONTRACT_VERSION,
  validateContextSnapshot,
  collectForbiddenImportableViolations,
} = require('../utilities/pivotAdminComputeJobContract');

const REFRESH_CONTEXT_LIMITS = Object.freeze({
  maxJobs: 100,
  maxSources: 500,
  maxOrganizers: 1000,
  maxContextBytes: 2 * 1024 * 1024,
});

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sortedUniqueStrings(values, maxItems) {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const value = trimString(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function ensureHttpsUrl(rawUrl) {
  const url = trimString(rawUrl);
  if (!url || !/^https:\/\//i.test(url)) return null;
  return url;
}

function hostFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function serializeRefreshJobIdentity(row, linkedSourceHost = null, sourceHints = []) {
  const doc = row?.toObject ? row.toObject() : row;
  const jobId = String(doc?._id || '');
  const label = trimString(doc?.label);
  const provider = trimString(doc?.provider);
  if (!/^[0-9a-f]{24}$/.test(jobId) || !label) return null;
  if (!['partiful', 'luma', 'generic-site'].includes(provider)) return null;

  const url = ensureHttpsUrl(doc?.url);
  if (!url) return null;

  const defaultTags = sortedUniqueStrings(doc?.defaultTags, 16);
  const promptHints = provider === 'generic-site'
    ? mergeExtractionHints(doc?.extractionProfile?.promptHints || [], sourceHints) : [];
  const material = {
    id: jobId,
    label,
    url,
    provider,
    enabled: doc?.enabled !== false,
    defaultTags,
    promptHints,
    linkedSourceHost: linkedSourceHost || hostFromUrl(url),
    updatedAt: isoTimestamp(doc?.updatedAt),
  };

  return {
    recordVersion: recordVersion('job', material),
    jobId,
    label,
    url,
    provider,
    enabled: material.enabled,
    defaultTags,
    promptHints,
    linkedSourceHost: material.linkedSourceHost,
  };
}

function buildRefreshContextFingerprint({
  tenantKey,
  batchWeek,
  forceBatchWeek,
  jobs,
  sources,
  organizers,
  permittedEventFields,
}) {
  return {
    tenantKey,
    batchWeek,
    forceBatchWeek,
    jobs: jobs.map((row) => row.recordVersion).sort(),
    sources: sources.map((row) => row.recordVersion).sort(),
    organizers: organizers.map((row) => row.recordVersion).sort(),
    permittedEventFields,
  };
}

function measureContextBytes(snapshot) {
  return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
}

async function authorizeRefreshContextAccess(req, options = {}) {
  if (typeof options.authorize === 'function') {
    const authResult = await options.authorize({
      req,
      kind: 'city-curation-refresh',
      cityKey: options.cityKey,
      jobId: options.jobId,
      scheduleOccurrenceId: options.scheduleOccurrenceId ?? null,
    });
    if (authResult?.error) return authResult;
    return null;
  }

  return {
    error: 'Refresh context access requires worker authorization.',
    status: 403,
    code: 'REFRESH_CONTEXT_UNAUTHORIZED',
  };
}

async function loadRefreshContextRows(req, tenantKey, jobIds) {
  const { PivotCurationJob, PivotCitySource, PivotOrganizer } = getGlobalModels(
    req,
    'PivotCurationJob',
    'PivotCitySource',
    'PivotOrganizer',
  );
  const { activeOrganizerFilter } = require('../schemas/pivotOrganizer');

  const jobFilter = { tenantKey, enabled: { $ne: false } };
  const requested = Array.isArray(jobIds)
    ? jobIds.map((id) => trimString(id)).filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    : null;
  if (requested?.length) {
    jobFilter._id = { $in: requested };
  }

  const [jobRows, sourceRows, organizerRows] = await Promise.all([
    PivotCurationJob.find(jobFilter)
      .sort({ lastRunAt: 1, createdAt: 1 })
      .limit(REFRESH_CONTEXT_LIMITS.maxJobs + 1)
      .lean(),
    PivotCitySource.find({ tenantKey })
      .sort({ host: 1 })
      .limit(REFRESH_CONTEXT_LIMITS.maxSources + 1)
      .lean(),
    PivotOrganizer.find(activeOrganizerFilter(tenantKey))
      .sort({ normalizedName: 1 })
      .limit(REFRESH_CONTEXT_LIMITS.maxOrganizers + 1)
      .lean(),
  ]);

  return { jobRows, sourceRows, organizerRows };
}

function buildTenantSummary(tenant) {
  const cityKey = tenant.tenantKey;
  const name = trimString(tenant.name) || cityKey;
  return {
    cityKey,
    name,
    location: trimString(tenant.location) || name,
    timezone: trimString(tenant.pivotDropTimezone) || 'UTC',
  };
}

function buildProviderCapabilities() {
  return {
    firecrawlConfigured: isSiteScrapeConfigured(),
    nativeProviders: ['luma', 'partiful'],
  };
}

function isCrawlable(job) {
  return job?.provider !== 'manual-json' && Boolean(job?.url);
}

function buildPermittedEventFields(options = {}) {
  return {
    allowOrganizerLinking: options.allowOrganizerLinking !== false,
    allowLocationResolution: options.allowLocationResolution !== false,
    maxEventsPerJob: options.maxEventsPerJob ?? null,
  };
}

function sourceHostByJobId(sourceRows) {
  const map = new Map();
  for (const row of sourceRows) {
    const jobId = trimString(row.curationJobId);
    if (jobId) map.set(jobId, row.host);
  }
  return map;
}

async function buildCityCurationRefreshContextSnapshot(req, options = {}) {
  const authError = await authorizeRefreshContextAccess(req, options);
  if (authError) return authError;

  const tenantKey = trimString(options.tenantKey || options.cityKey).toLowerCase();
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const jobId = trimString(options.jobId);
  if (!jobId) {
    return {
      error: 'jobId is required.',
      status: 400,
      code: 'JOB_ID_REQUIRED',
    };
  }

  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenant = tenantResult.tenant;
  const weekResult = resolveRunBatchWeek({
    batchWeek: options.batchWeek,
    strategy: 'next-drop',
    tenant,
    now: options.now,
  });
  if (weekResult.error) return weekResult;

  const forceBatchWeek = Boolean(options.forceBatchWeek);
  const { jobRows, sourceRows, organizerRows } = await loadRefreshContextRows(
    req,
    tenantKey,
    options.jobIds,
  );

  const crawlableJobs = jobRows.filter(isCrawlable);
  if (crawlableJobs.length > REFRESH_CONTEXT_LIMITS.maxJobs) {
    return {
      error: `Refresh context exceeds job limit (${REFRESH_CONTEXT_LIMITS.maxJobs}).`,
      status: 413,
      code: 'REFRESH_CONTEXT_TOO_LARGE',
    };
  }
  if (sourceRows.length > REFRESH_CONTEXT_LIMITS.maxSources) {
    return {
      error: `Refresh context exceeds source limit (${REFRESH_CONTEXT_LIMITS.maxSources}).`,
      status: 413,
      code: 'REFRESH_CONTEXT_TOO_LARGE',
    };
  }
  if (organizerRows.length > REFRESH_CONTEXT_LIMITS.maxOrganizers) {
    return {
      error: `Refresh context exceeds organizer limit (${REFRESH_CONTEXT_LIMITS.maxOrganizers}).`,
      status: 413,
      code: 'REFRESH_CONTEXT_TOO_LARGE',
    };
  }

  const linkedHosts = sourceHostByJobId(sourceRows);
  const sourcesById = new Map(sourceRows.map((row) => [String(row._id), row]));
  const jobs = crawlableJobs
    .map((row) => serializeRefreshJobIdentity(row, linkedHosts.get(String(row._id)) || null,
      sourcesById.get(String(row.sourceId))?.promptHints || []))
    .filter(Boolean);
  const sources = sourceRows
    .map(serializeSourceIdentity)
    .filter(Boolean)
    .sort((left, right) => left.host.localeCompare(right.host));
  const organizers = organizerRows
    .map(serializeOrganizerIdentity)
    .filter(Boolean)
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName));
  const permittedEventFields = buildPermittedEventFields(options.permittedEventFields);

  const snapshotAt = isoTimestamp(options.now) || new Date().toISOString();
  const contextVersion = refreshContextVersion(
    tenantKey,
    buildRefreshContextFingerprint({
      tenantKey,
      batchWeek: weekResult.batchWeek,
      forceBatchWeek,
      jobs,
      sources,
      organizers,
      permittedEventFields,
    }),
  );

  const snapshot = {
    contractVersion: CONTRACT_VERSION,
    jobId,
    scheduleOccurrenceId: options.scheduleOccurrenceId ?? null,
    kind: 'city-curation-refresh',
    cityKey: tenantKey,
    implementationRevision: options.implementationRevision || resolveImplementationRevision(),
    contextVersion,
    snapshotAt,
    tenant: buildTenantSummary(tenant),
    batchWeek: weekResult.batchWeek,
    forceBatchWeek,
    jobs,
    sources,
    organizers,
    permittedEventFields,
    providerCapabilities: buildProviderCapabilities(),
  };

  const validation = validateContextSnapshot(snapshot);
  if (!validation.valid) {
    return {
      error: 'Refresh context snapshot failed contract validation.',
      status: 500,
      code: 'REFRESH_CONTEXT_INVALID',
      details: validation.errors,
    };
  }

  const forbidden = collectForbiddenImportableViolations(snapshot);
  if (forbidden.length) {
    return {
      error: 'Refresh context snapshot contains forbidden fields.',
      status: 500,
      code: 'REFRESH_CONTEXT_FORBIDDEN',
      details: forbidden,
    };
  }

  if (measureContextBytes(snapshot) > REFRESH_CONTEXT_LIMITS.maxContextBytes) {
    return {
      error: `Refresh context exceeds byte limit (${REFRESH_CONTEXT_LIMITS.maxContextBytes}).`,
      status: 413,
      code: 'REFRESH_CONTEXT_TOO_LARGE',
    };
  }

  return { data: { snapshot } };
}

module.exports = {
  REFRESH_CONTEXT_LIMITS,
  authorizeRefreshContextAccess,
  serializeRefreshJobIdentity,
  buildRefreshContextFingerprint,
  buildCityCurationRefreshContextSnapshot,
};
