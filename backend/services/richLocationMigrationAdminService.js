const { randomUUID } = require('crypto');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { runLocationBackfill } = require('./pivotLocationBackfillService');
const { resolveRichLocationControls } = require('../utilities/justGoRichLocationControls');
const { isGoogleLocationConfigured } = require('./googleLocationService');

const LEASE_MS = 10 * 60 * 1000;
const MAX_UI_BATCH_SIZE = 50;
const MAX_UI_INTERVAL_MS = 5_000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function migrationUiEnabled(env = process.env) {
  return env.ENABLE_RICH_LOCATION_MIGRATION_UI === 'true';
}

function actorFrom(req) {
  return trimString(req.user?.email)
    || trimString(req.user?.globalUserId)
    || trimString(req.user?.userId)
    || 'platform-admin';
}

function publicRun(run) {
  if (!run) return null;
  return {
    scope: run.scope,
    status: run.status,
    catalogAsOf: run.catalogAsOf || null,
    checkpoint: run.checkpoint || null,
    cumulativeCounts: run.cumulativeCounts || null,
    lastBatch: run.lastBatch || null,
    updatedAt: run.updatedAt || null,
  };
}

function publicLease(lease) {
  if (!lease) return null;
  return {
    scope: lease.scope,
    actor: lease.actor || null,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
  };
}

async function tenantModels(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  return {
    db,
    ...getModels(
      { db },
      'Event',
      'PivotLocationBackfillRun',
      'PivotLocationMigrationLease',
    ),
  };
}

async function getRichLocationMigrationStatus({ tenant }) {
  const { Event, PivotLocationBackfillRun, PivotLocationMigrationLease } =
    await tenantModels(tenant.tenantKey);
  const now = new Date();
  const [runs, leases, needsReview] = await Promise.all([
    PivotLocationBackfillRun.find({ tenantKey: tenant.tenantKey }).lean(),
    PivotLocationMigrationLease.find({
      tenantKey: tenant.tenantKey,
      expiresAt: { $gt: now },
    }).lean(),
    Event.countDocuments({
      isDeleted: { $ne: true },
      'customFields.pivot.locationReview.status': 'needs_review',
    }),
  ]);
  const byScope = Object.fromEntries(runs.map((run) => [run.scope, publicRun(run)]));
  const leasesByScope = Object.fromEntries(
    leases.map((lease) => [lease.scope, publicLease(lease)]),
  );
  return {
    tenantKey: tenant.tenantKey,
    constraints: tenant.richLocationConstraints || null,
    controls: resolveRichLocationControls(tenant),
    configuredControls: tenant.richLocationControls || null,
    providerConfigured: isGoogleLocationConfigured(),
    needsReview,
    runs: {
      live: byScope.live || null,
      historical: byScope.historical || null,
    },
    leases: {
      live: leasesByScope.live || null,
      historical: leasesByScope.historical || null,
    },
  };
}

async function acquireLease(Model, options) {
  const now = new Date();
  await Model.deleteOne({
    tenantKey: options.tenantKey,
    scope: options.scope,
    expiresAt: { $lte: now },
  });
  const leaseId = randomUUID();
  try {
    await Model.create({
      tenantKey: options.tenantKey,
      scope: options.scope,
      leaseId,
      actor: options.actor,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + LEASE_MS),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('A rich-location migration batch is already running.');
      conflict.code = 'RICH_LOCATION_MIGRATION_LOCKED';
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
  return leaseId;
}

function uiNumber(value, fallback, min, max, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${field} must be between ${min} and ${max}.`);
    error.code = 'RICH_LOCATION_MIGRATION_OPTIONS_INVALID';
    error.status = 400;
    throw error;
  }
  return number;
}

async function runRichLocationMigrationBatch(req, { tenant, input = {} }) {
  const apply = input.apply === true;
  if (apply && trimString(input.confirmTenantKey).toLowerCase() !== tenant.tenantKey) {
    const error = new Error(`Type "${tenant.tenantKey}" to confirm an applied batch.`);
    error.code = 'RICH_LOCATION_MIGRATION_CONFIRMATION_REQUIRED';
    error.status = 400;
    throw error;
  }
  const scope = trimString(input.scope || 'live').toLowerCase();
  if (!['live', 'historical'].includes(scope)) {
    const error = new Error('scope must be live or historical.');
    error.code = 'RICH_LOCATION_MIGRATION_SCOPE_INVALID';
    error.status = 400;
    throw error;
  }
  const batchSize = Math.floor(uiNumber(
    input.batchSize,
    25,
    1,
    MAX_UI_BATCH_SIZE,
    'batchSize',
  ));
  const maxProviderOperations = Math.floor(uiNumber(
    input.maxProviderOperations,
    batchSize,
    0,
    batchSize,
    'maxProviderOperations',
  ));
  const minIntervalMs = Math.floor(uiNumber(
    input.minIntervalMs,
    100,
    0,
    MAX_UI_INTERVAL_MS,
    'minIntervalMs',
  ));
  const autoApplyConfidence = uiNumber(
    input.autoApplyConfidence,
    0.9,
    0,
    1,
    'autoApplyConfidence',
  );
  const reviewConfidence = uiNumber(
    input.reviewConfidence,
    0.6,
    0,
    autoApplyConfidence,
    'reviewConfidence',
  );

  const { db, PivotLocationMigrationLease } = await tenantModels(tenant.tenantKey);
  const leaseId = await acquireLease(PivotLocationMigrationLease, {
    tenantKey: tenant.tenantKey,
    scope,
    actor: actorFrom(req),
  });
  try {
    return await runLocationBackfill({
      db,
      tenantKey: tenant.tenantKey,
      tenant,
      scope,
      liveCatalogStable: input.confirmLiveStable === true,
      dryRun: !apply,
      batchSize,
      minIntervalMs,
      autoApplyConfidence,
      reviewConfidence,
      maxProviderOperations,
      asOf: input.asOf,
    });
  } catch (error) {
    if (error?.code || /^Location backfill/.test(error?.message || '')) {
      error.status = error.status || 400;
    }
    throw error;
  } finally {
    try {
      await PivotLocationMigrationLease.deleteOne({ leaseId });
    } catch (error) {
      console.error('Unable to release rich-location migration lease:', error.message);
    }
  }
}

module.exports = {
  migrationUiEnabled,
  getRichLocationMigrationStatus,
  runRichLocationMigrationBatch,
  acquireLease,
  publicRun,
  constants: { LEASE_MS, MAX_UI_BATCH_SIZE, MAX_UI_INTERVAL_MS },
};
