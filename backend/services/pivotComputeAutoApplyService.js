/**
 * Trusted compute jobs are applied exactly once after a fresh preview.  This
 * is intentionally an event-driven service; startup reconciliation belongs in
 * the caller rather than a periodic cron job.
 */
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { resolvePivotComputeApplyPolicy } = require('../utilities/pivotComputeApplyPolicy');
const { logPivot } = require('../utilities/pivotLogger');
const {
  previewStoredComputeJob,
  applyStoredComputeJob,
} = require('./pivotComputeResultApplyService');

const AUTO_APPLY_ACTOR = 'system:auto-apply';
const MAX_AUTO_APPLY_ATTEMPTS = 3;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeExternalJobId(value) {
  return trimString(typeof value === 'object' && value ? value.externalJobId : value);
}

function policySkipCode(job, policy) {
  if (!job || job.status !== 'review-required' || !job.result?.embedded) return 'JOB_NOT_REVIEWABLE';
  if (job.kind === 'carousel-export') return 'CAROUSEL_EXPORT_EXCLUDED';
  if (!policy.trusted) return 'TENANT_NOT_TRUSTED';
  if (job.kind === 'city-curation-refresh' && !policy.autoApplyRefresh) return 'REFRESH_NOT_ENABLED';
  if (job.kind === 'city-source-discovery' && !policy.autoApplyDiscovery) return 'DISCOVERY_NOT_ENABLED';
  if (!['city-curation-refresh', 'city-source-discovery'].includes(job.kind)) return 'KIND_NOT_ALLOWED';
  if (!policy.autoApplyOrigins.includes(job.origin?.type)) return 'ORIGIN_NOT_ALLOWED';
  return null;
}

function guardrailSkipCode(preview, policy) {
  const rows = preview?.rows || [];
  const eventCreates = rows.filter((row) => row.entityType === 'event' && row.action === 'create').length;
  const sourceCreates = rows.filter((row) => row.entityType === 'source' && row.action === 'create').length;
  if (policy.maxEventCreates != null && eventCreates > policy.maxEventCreates) return 'MAX_EVENT_CREATES_EXCEEDED';
  if (policy.maxNewSources != null && sourceCreates > policy.maxNewSources) return 'MAX_NEW_SOURCES_EXCEEDED';
  return null;
}

function isTransientError(error) {
  if (error?.retryable) return true;
  return new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'MONGOOSE_SERVER_SELECTION_ERROR'])
    .has(error?.code);
}

async function buildFreshServerContext(tenantKey) {
  const normalizedTenantKey = trimString(tenantKey).toLowerCase();
  const globalDb = await connectToGlobalDatabase();
  const db = normalizedTenantKey ? await connectToDatabase(normalizedTenantKey) : null;
  return { globalDb, db, school: normalizedTenantKey, user: { email: AUTO_APPLY_ACTOR } };
}

async function updateAutoApply(req, externalJobId, values) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  await PivotComputeJob.updateOne(
    { externalJobId: trimString(externalJobId) },
    { $set: Object.fromEntries(Object.entries(values).map(([key, value]) => [`autoApply.${key}`, value])) },
  );
}

function queueReviewRequiredEmail(req, externalJobId) {
  setImmediate(() => {
    try {
      // Phase 4 is optional while this service is rolled out independently.
      const notifier = require('./pivotComputeAdminNotifyService'); // eslint-disable-line global-require
      const notify = notifier.notifyAdminsOnComputeJobReviewRequired || notifier.notifyAdminsOnComputeJob;
      if (typeof notify === 'function') {
        Promise.resolve(notify(req, { externalJobId })).catch(() => undefined);
      }
    } catch (_) { /* email must never affect auto-apply */ }
  });
}

async function claimAutoApply(req, externalJobId, now) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  return PivotComputeJob.findOneAndUpdate(
    {
      externalJobId: trimString(externalJobId),
      status: 'review-required',
      kind: { $ne: 'carousel-export' },
      'result.embedded': { $ne: null },
      'autoApply.outcome': { $ne: 'applying' },
    },
    {
      $set: {
        'autoApply.lastAttemptAt': now,
        'autoApply.outcome': 'applying',
        'autoApply.skipCode': null,
        'autoApply.message': null,
      },
      $inc: { 'autoApply.attemptCount': 1 },
    },
    { new: true },
  ).lean();
}

async function maybeAutoApplyComputeJob(req, externalJobId, { now = new Date() } = {}) {
  const normalizedExternalJobId = normalizeExternalJobId(externalJobId);
  if (!normalizedExternalJobId) {
    return { attempted: false, outcome: 'skipped', skipCode: 'COMPUTE_JOB_ID_REQUIRED' };
  }
  const seed = await buildFreshServerContext();
  // The external id is globally unique, so resolve the job before choosing its
  // tenant database. This also means a submit hook may pass a worker request.
  const { PivotComputeJob } = getGlobalModels(seed, 'PivotComputeJob');
  const initial = await PivotComputeJob.findOne({ externalJobId: normalizedExternalJobId }).lean();
  if (!initial) return { attempted: false, outcome: 'skipped', skipCode: 'COMPUTE_JOB_NOT_FOUND' };

  const tenantKey = trimString(initial.tenantKey || initial.cityKey).toLowerCase();
  const freshReq = tenantKey === trimString(seed.school).toLowerCase()
    ? seed
    : await buildFreshServerContext(tenantKey);
  const tenant = await getTenantByKey(freshReq, tenantKey, { exact: true });
  const policy = resolvePivotComputeApplyPolicy(tenant);
  const denied = policySkipCode(initial, policy);
  if (denied) {
    // Record why this otherwise reviewable job was deliberately left alone.
    // This does not claim the job, so changing the tenant policy can retry it.
    if (initial.status === 'review-required' && initial.kind !== 'carousel-export') {
      await updateAutoApply(freshReq, normalizedExternalJobId, {
        lastAttemptAt: now, outcome: 'skipped', skipCode: denied,
        message: 'Tenant auto-apply policy does not permit this job.',
      });
    }
    return { attempted: false, outcome: 'skipped', skipCode: denied, policy };
  }

  const claimed = await claimAutoApply(freshReq, normalizedExternalJobId, now);
  if (!claimed) return { attempted: false, outcome: 'skipped', skipCode: 'AUTO_APPLY_IN_FLIGHT', policy };

  for (let attempt = 1; attempt <= MAX_AUTO_APPLY_ATTEMPTS; attempt += 1) {
    try {
      const { preview } = await previewStoredComputeJob(freshReq, normalizedExternalJobId, { now: new Date() });
      const blocked = !preview.applyAllowed ? 'PREVIEW_BLOCKED' : guardrailSkipCode(preview, policy);
      if (blocked) {
        await updateAutoApply(freshReq, normalizedExternalJobId, {
          outcome: 'skipped', skipCode: blocked,
          message: blocked === 'PREVIEW_BLOCKED'
            ? (preview.blockingReasons || []).map((reason) => reason.code).join(', ') || 'Preview is not applyable.'
            : 'Configured auto-apply guardrail would be exceeded.',
        });
        queueReviewRequiredEmail(freshReq, normalizedExternalJobId);
        return { attempted: true, outcome: 'skipped', skipCode: blocked, preview, policy };
      }
      const applied = await applyStoredComputeJob(freshReq, normalizedExternalJobId, {
        tenantKey,
        actor: AUTO_APPLY_ACTOR,
        idempotencyKey: `auto:apply:${normalizedExternalJobId}`,
        preview,
        now: new Date(),
      });
      await updateAutoApply(freshReq, normalizedExternalJobId, {
        outcome: 'applied', skipCode: null,
        message: applied.async ? 'Apply accepted for background completion.' : 'Applied automatically.',
      });
      return { attempted: true, outcome: 'applied', async: Boolean(applied.async), result: applied, policy };
    } catch (error) {
      if (attempt < MAX_AUTO_APPLY_ATTEMPTS && isTransientError(error)) continue;
      const skipCode = error?.code || 'AUTO_APPLY_FAILED';
      await updateAutoApply(freshReq, normalizedExternalJobId, {
        outcome: 'failed', skipCode, message: trimString(error?.message) || 'Automatic apply failed.',
      });
      queueReviewRequiredEmail(freshReq, normalizedExternalJobId);
      logPivot('warn', 'pivot compute auto-apply failed', { externalJobId: normalizedExternalJobId, tenantKey, code: skipCode });
      return { attempted: true, outcome: 'failed', skipCode, error, policy };
    }
  }
  return { attempted: true, outcome: 'failed', skipCode: 'AUTO_APPLY_FAILED', policy };
}

module.exports = {
  AUTO_APPLY_ACTOR,
  MAX_AUTO_APPLY_ATTEMPTS,
  buildFreshServerContext,
  guardrailSkipCode,
  isTransientError,
  normalizeExternalJobId,
  maybeAutoApplyComputeJob,
};
