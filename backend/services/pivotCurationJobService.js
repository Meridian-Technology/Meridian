const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeUrl } = require('./pivotIngestPreviewService');
const {
  CURATION_PROVIDERS,
  BATCH_WEEK_STRATEGIES,
} = require('../schemas/pivotCurationJob');

function actorFromReq(req) {
  return req?.user?.email || req?.user?.globalUserId || req?.user?.userId || null;
}

function serializeCurationJob(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  return {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    label: row.label,
    url: row.url || null,
    provider: row.provider,
    defaultBatchWeekStrategy: row.defaultBatchWeekStrategy || 'next-drop',
    defaultTags: Array.isArray(row.defaultTags) ? row.defaultTags : [],
    enabled: row.enabled !== false,
    lastRunAt: row.lastRunAt || null,
    lastRunStatus: row.lastRunStatus || null,
    lastRunStats: row.lastRunStats || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function normalizeTags(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    return { error: 'defaultTags must be an array of strings.', status: 400, code: 'INVALID_TAGS' };
  }
  return raw.map((tag) => String(tag || '').trim()).filter(Boolean);
}

function normalizeProvider(raw) {
  const provider = String(raw || '').trim().toLowerCase();
  if (!CURATION_PROVIDERS.includes(provider)) {
    return {
      error: `provider must be one of: ${CURATION_PROVIDERS.join(', ')}.`,
      status: 400,
      code: 'INVALID_PROVIDER',
    };
  }
  return { provider };
}

function normalizeStrategy(raw, { required = false } = {}) {
  if (raw == null || raw === '') {
    if (required) {
      return {
        error: `defaultBatchWeekStrategy must be one of: ${BATCH_WEEK_STRATEGIES.join(', ')}.`,
        status: 400,
        code: 'INVALID_STRATEGY',
      };
    }
    return { strategy: undefined };
  }
  const strategy = String(raw).trim().toLowerCase();
  if (!BATCH_WEEK_STRATEGIES.includes(strategy)) {
    return {
      error: `defaultBatchWeekStrategy must be one of: ${BATCH_WEEK_STRATEGIES.join(', ')}.`,
      status: 400,
      code: 'INVALID_STRATEGY',
    };
  }
  return { strategy };
}

/**
 * Validate URL + provider pairing.
 * - partiful/luma: require allowlisted host URL; provider must match detected host.
 * - manual-json: URL optional; if present must be http(s) (no Partiful/Luma host requirement).
 */
function validateJobUrlAndProvider({ url, provider }) {
  const providerResult = normalizeProvider(provider);
  if (providerResult.error) return providerResult;
  const { provider: normalizedProvider } = providerResult;

  if (normalizedProvider === 'manual-json') {
    const trimmed = url == null ? '' : String(url).trim();
    if (!trimmed) {
      return { url: null, provider: normalizedProvider };
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { error: 'Invalid URL.', status: 400, code: 'INVALID_URL' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: 'Only HTTP(S) URLs are supported.', status: 400, code: 'INVALID_URL' };
    }
    return { url: parsed.toString(), provider: normalizedProvider };
  }

  const normalized = normalizeUrl(url);
  if (normalized.error) {
    return {
      error: normalized.error,
      status: normalized.status || 400,
      code: normalized.code || 'INVALID_URL',
    };
  }
  if (normalized.provider && normalized.provider !== normalizedProvider) {
    return {
      error: `URL host is ${normalized.provider}, but provider was set to ${normalizedProvider}.`,
      status: 400,
      code: 'PROVIDER_MISMATCH',
    };
  }
  return { url: normalized.url, provider: normalizedProvider };
}

function parseJobId(jobId) {
  const id = String(jobId || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { error: 'Invalid curation job id.', status: 400, code: 'INVALID_JOB_ID' };
  }
  return { jobId: id };
}

async function listCurationJobs(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const docs = await PivotCurationJob.find({ tenantKey }).sort({ createdAt: -1 }).lean();

  return {
    data: {
      tenantKey,
      jobs: docs.map(serializeCurationJob),
    },
  };
}

async function createCurationJob(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const label = String(options.label || '').trim();
  if (!label) {
    return { error: 'label is required.', status: 400, code: 'LABEL_REQUIRED' };
  }

  const providerInput =
    options.provider ||
    (options.url ? undefined : 'manual-json');

  let provider = providerInput;
  if (!provider && options.url) {
    const detected = normalizeUrl(options.url);
    if (detected.error) {
      return {
        error: detected.error,
        status: detected.status || 400,
        code: detected.code || 'INVALID_URL',
      };
    }
    provider = detected.provider;
  }
  if (!provider) {
    return {
      error: `provider must be one of: ${CURATION_PROVIDERS.join(', ')}.`,
      status: 400,
      code: 'INVALID_PROVIDER',
    };
  }

  const urlResult = validateJobUrlAndProvider({ url: options.url, provider });
  if (urlResult.error) return urlResult;

  const strategyResult = normalizeStrategy(
    options.defaultBatchWeekStrategy ?? 'next-drop',
    { required: true },
  );
  if (strategyResult.error) return strategyResult;

  const tagsResult = normalizeTags(options.defaultTags);
  if (tagsResult.error) return tagsResult;

  const enabled = options.enabled === undefined ? true : Boolean(options.enabled);

  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const doc = await PivotCurationJob.create({
    tenantKey,
    label,
    url: urlResult.url,
    provider: urlResult.provider,
    defaultBatchWeekStrategy: strategyResult.strategy,
    defaultTags: tagsResult,
    enabled,
    createdBy: actorFromReq(req),
  });

  return { data: { job: serializeCurationJob(doc) } };
}

async function updateCurationJob(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const idResult = parseJobId(options.jobId);
  if (idResult.error) return idResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const doc = await PivotCurationJob.findOne({ _id: idResult.jobId, tenantKey });
  if (!doc) {
    return { error: 'Curation job not found.', status: 404, code: 'JOB_NOT_FOUND' };
  }

  if (options.label !== undefined) {
    const label = String(options.label || '').trim();
    if (!label) {
      return { error: 'label cannot be empty.', status: 400, code: 'LABEL_REQUIRED' };
    }
    doc.label = label;
  }

  const nextProvider = options.provider !== undefined ? options.provider : doc.provider;
  const nextUrl = options.url !== undefined ? options.url : doc.url;
  if (options.provider !== undefined || options.url !== undefined) {
    const urlResult = validateJobUrlAndProvider({ url: nextUrl, provider: nextProvider });
    if (urlResult.error) return urlResult;
    doc.url = urlResult.url;
    doc.provider = urlResult.provider;
  }

  if (options.defaultBatchWeekStrategy !== undefined) {
    const strategyResult = normalizeStrategy(options.defaultBatchWeekStrategy, { required: true });
    if (strategyResult.error) return strategyResult;
    doc.defaultBatchWeekStrategy = strategyResult.strategy;
  }

  if (options.defaultTags !== undefined) {
    const tagsResult = normalizeTags(options.defaultTags);
    if (tagsResult.error) return tagsResult;
    doc.defaultTags = tagsResult;
  }

  if (options.enabled !== undefined) {
    doc.enabled = Boolean(options.enabled);
  }

  await doc.save();
  return { data: { job: serializeCurationJob(doc) } };
}

/**
 * Delete is idempotent: missing jobs still return success for the tenant scope.
 */
async function deleteCurationJob(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const idResult = parseJobId(options.jobId);
  if (idResult.error) return idResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const doc = await PivotCurationJob.findOneAndDelete({
    _id: idResult.jobId,
    tenantKey,
  });

  return {
    data: {
      tenantKey,
      jobId: idResult.jobId,
      deleted: Boolean(doc),
    },
  };
}

module.exports = {
  listCurationJobs,
  createCurationJob,
  updateCurationJob,
  deleteCurationJob,
  serializeCurationJob,
  validateJobUrlAndProvider,
};
