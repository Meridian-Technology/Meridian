const getGlobalModels = require('./getGlobalModelService');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { getMergedTenants, getTenantByKey, upsertStoredTenantRow } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const {
  validateThirtyMinuteCron,
  floorToThirtyMinuteBucket,
  cronMatchesBucket,
} = require('../utilities/meridianNotificationCron');
const { getMeridianJobHandler } = require('./meridianJobRegistry');
const { ensureMeridianJobHandlersLoaded } = require('./meridianJobHandlers');
const { enqueueMeridianJob } = require('./meridianJobEnqueueService');
const { isPivotCrewNudgeCronDisabled } = require('./pivotCrewNudgeService');
const {
  DEFINITION_KEY_PATTERN,
  MAX_TRIGGER_CONFIG_BYTES,
} = require('../schemas/meridianNotificationDefinition');
const {
  cloneTriggerConfig,
  optionalCopy,
  normalizeOverrideRow,
  normalizeMeridianNotificationOverrides,
  validateMeridianNotificationOverridesPatch,
} = require('../utilities/meridianNotificationOverrides');

const OVERRIDEABLE_FIELDS = Object.freeze([
  'enabled',
  'scheduleCron',
  'copyTitleKey',
  'copyBodyKey',
  'copyTitleFallback',
  'copyBodyFallback',
  'triggerConfig',
]);

function definitionAdminError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function leanDoc(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return doc;
}

function normalizeDefinitionKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTenantKey(value) {
  if (value == null || value === '') return '';
  return String(value).trim().toLowerCase();
}

function boundedByteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function serializeMeridianNotificationDefinition(doc, overrideMeta = null) {
  const row = leanDoc(doc);
  if (!row) return null;
  return {
    id: row._id ? String(row._id) : null,
    definitionKey: row.definitionKey,
    handlerKey: row.handlerKey,
    tenantKey: row.tenantKey || null,
    enabled: row.enabled !== false,
    scheduleCron: row.scheduleCron,
    copyTitleKey: row.copyTitleKey || null,
    copyBodyKey: row.copyBodyKey || null,
    copyTitleFallback: row.copyTitleFallback || null,
    copyBodyFallback: row.copyBodyFallback || null,
    triggerConfig: cloneTriggerConfig(row.triggerConfig),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    overrideApplied: Boolean(overrideMeta?.applied),
    overriddenFields: overrideMeta?.fields || [],
  };
}

function mergeDefinitionWithOverride(definition, override) {
  if (!override) {
    return { definition: { ...definition }, applied: false, fields: [] };
  }
  const merged = { ...definition };
  const fields = [];
  OVERRIDEABLE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(override, field) && override[field] !== undefined) {
      merged[field] = field === 'triggerConfig'
        ? cloneTriggerConfig(override[field])
        : override[field];
      fields.push(field);
    }
  });
  return { definition: merged, applied: fields.length > 0, fields };
}

function overrideForDefinition(tenant, definitionKey) {
  const rows = Array.isArray(tenant?.meridianNotificationOverrides)
    ? tenant.meridianNotificationOverrides
    : [];
  return rows.find((row) => row?.definitionKey === definitionKey) || null;
}

function resolveDefinitionForTenant(definition, tenant) {
  const override = tenant ? overrideForDefinition(tenant, definition.definitionKey) : null;
  return mergeDefinitionWithOverride(definition, override);
}

async function getDefinitionModel(req) {
  const jobReq = await resolveJobReq(req);
  const { MeridianNotificationDefinition } = getGlobalModels(jobReq, 'MeridianNotificationDefinition');
  return { jobReq, MeridianNotificationDefinition };
}

function assertHandlerExists(handlerKey) {
  ensureMeridianJobHandlersLoaded();
  const key = String(handlerKey || '').trim();
  if (!key) {
    throw definitionAdminError('handlerKey is required', 'HANDLER_KEY_REQUIRED');
  }
  if (!getMeridianJobHandler(key)) {
    throw definitionAdminError(
      `Unknown meridian job handler: ${key}`,
      'UNKNOWN_HANDLER',
    );
  }
  return key;
}

function buildDefinitionFields(body = {}, { partial = false } = {}) {
  const fields = {};

  if (!partial || body.definitionKey !== undefined) {
    const definitionKey = normalizeDefinitionKey(body.definitionKey);
    if (!DEFINITION_KEY_PATTERN.test(definitionKey)) {
      throw definitionAdminError(
        'definitionKey must be 2–128 chars, start with a letter, and use lowercase letters, digits, or underscore',
        'INVALID_DEFINITION_KEY',
      );
    }
    fields.definitionKey = definitionKey;
  }

  if (!partial || body.handlerKey !== undefined) {
    fields.handlerKey = assertHandlerExists(body.handlerKey);
  }

  if (!partial || body.tenantKey !== undefined) {
    fields.tenantKey = normalizeTenantKey(body.tenantKey);
  }

  if (!partial || body.enabled !== undefined) {
    fields.enabled = body.enabled !== false;
  }

  if (!partial || body.scheduleCron !== undefined) {
    const cron = validateThirtyMinuteCron(body.scheduleCron);
    if (cron.error) {
      throw definitionAdminError(cron.error, 'INVALID_SCHEDULE_CRON');
    }
    fields.scheduleCron = cron.normalized;
  }

  if (!partial || body.copyTitleKey !== undefined) {
    fields.copyTitleKey = optionalCopy(body.copyTitleKey);
  }
  if (!partial || body.copyBodyKey !== undefined) {
    fields.copyBodyKey = optionalCopy(body.copyBodyKey);
  }
  if (!partial || body.copyTitleFallback !== undefined) {
    fields.copyTitleFallback = optionalCopy(body.copyTitleFallback);
  }
  if (!partial || body.copyBodyFallback !== undefined) {
    fields.copyBodyFallback = optionalCopy(body.copyBodyFallback);
  }
  if (!partial || body.triggerConfig !== undefined) {
    const config = cloneTriggerConfig(body.triggerConfig);
    if (boundedByteLength(config) > MAX_TRIGGER_CONFIG_BYTES) {
      throw definitionAdminError(
        `triggerConfig exceeds ${MAX_TRIGGER_CONFIG_BYTES} bytes`,
        'TRIGGER_CONFIG_TOO_LARGE',
      );
    }
    fields.triggerConfig = config;
  }

  return fields;
}

async function createMeridianNotificationDefinition(req, body = {}) {
  const { MeridianNotificationDefinition } = await getDefinitionModel(req);
  const fields = buildDefinitionFields(body, { partial: false });
  try {
    const doc = await MeridianNotificationDefinition.create(fields);
    return serializeMeridianNotificationDefinition(doc);
  } catch (error) {
    if (error?.code === 11000) {
      throw definitionAdminError(
        'A definition with this definitionKey already exists for this tenant',
        'DEFINITION_EXISTS',
        409,
      );
    }
    throw error;
  }
}

async function findDefinitionDoc(MeridianNotificationDefinition, idOrKey, tenantKey = '') {
  const raw = String(idOrKey || '').trim();
  if (!raw) return null;
  if (/^[a-f0-9]{24}$/i.test(raw)) {
    return MeridianNotificationDefinition.findById(raw);
  }
  const query = { definitionKey: normalizeDefinitionKey(raw) };
  const scoped = normalizeTenantKey(tenantKey);
  if (scoped) query.tenantKey = scoped;
  const matches = await MeridianNotificationDefinition.find(query).sort({ tenantKey: 1 });
  if (matches.length === 1) return matches[0];
  if (scoped) return matches.find((row) => row.tenantKey === scoped) || null;
  return matches.find((row) => !row.tenantKey) || matches[0] || null;
}

async function getMeridianNotificationDefinition(req, idOrKey, { tenantKey = null } = {}) {
  const { jobReq, MeridianNotificationDefinition } = await getDefinitionModel(req);
  const doc = await findDefinitionDoc(MeridianNotificationDefinition, idOrKey, tenantKey);
  if (!doc) {
    throw definitionAdminError('Notification definition not found', 'DEFINITION_NOT_FOUND', 404);
  }
  const lean = leanDoc(doc);
  if (tenantKey) {
    const tenant = await getTenantByKey(jobReq, tenantKey);
    const resolved = resolveDefinitionForTenant(lean, tenant);
    return serializeMeridianNotificationDefinition(resolved.definition, resolved);
  }
  return serializeMeridianNotificationDefinition(lean);
}

async function listMeridianNotificationDefinitions(req, {
  tenantKey = null,
  includeDisabled = true,
} = {}) {
  const { jobReq, MeridianNotificationDefinition } = await getDefinitionModel(req);
  const query = {};
  const scoped = normalizeTenantKey(tenantKey);
  if (scoped) {
    query.$or = [{ tenantKey: '' }, { tenantKey: scoped }];
  }

  const rows = await MeridianNotificationDefinition.find(query)
    .sort({ definitionKey: 1, tenantKey: 1 })
    .lean();

  const tenant = scoped ? await getTenantByKey(jobReq, scoped) : null;
  return rows
    .map((row) => {
      const resolved = tenant ? resolveDefinitionForTenant(row, tenant) : { definition: row, applied: false, fields: [] };
      if (!includeDisabled && resolved.definition.enabled === false) return null;
      return serializeMeridianNotificationDefinition(resolved.definition, resolved);
    })
    .filter(Boolean);
}

async function updateMeridianNotificationDefinition(req, idOrKey, body = {}) {
  const { MeridianNotificationDefinition } = await getDefinitionModel(req);
  const doc = await findDefinitionDoc(MeridianNotificationDefinition, idOrKey, body.lookupTenantKey);
  if (!doc) {
    throw definitionAdminError('Notification definition not found', 'DEFINITION_NOT_FOUND', 404);
  }
  const fields = buildDefinitionFields(body, { partial: true });
  Object.assign(doc, fields);
  try {
    await doc.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw definitionAdminError(
        'A definition with this definitionKey already exists for this tenant',
        'DEFINITION_EXISTS',
        409,
      );
    }
    throw error;
  }
  return serializeMeridianNotificationDefinition(doc);
}

async function deleteMeridianNotificationDefinition(req, idOrKey) {
  const { MeridianNotificationDefinition } = await getDefinitionModel(req);
  const doc = await findDefinitionDoc(MeridianNotificationDefinition, idOrKey);
  if (!doc) {
    throw definitionAdminError('Notification definition not found', 'DEFINITION_NOT_FOUND', 404);
  }
  await doc.deleteOne();
  return { deleted: true, id: String(doc._id), definitionKey: doc.definitionKey };
}

async function upsertMeridianNotificationOverride(req, tenantKey, definitionKey, patch = {}) {
  const jobReq = await resolveJobReq(req);
  const tenant = await getTenantByKey(jobReq, tenantKey);
  if (!tenant) {
    throw definitionAdminError('Tenant not found', 'TENANT_NOT_FOUND', 404);
  }
  const key = normalizeDefinitionKey(definitionKey);
  if (!DEFINITION_KEY_PATTERN.test(key)) {
    throw definitionAdminError('Invalid definitionKey', 'INVALID_DEFINITION_KEY');
  }

  const existing = Array.isArray(tenant.meridianNotificationOverrides)
    ? tenant.meridianNotificationOverrides
    : [];
  let next;
  if (patch == null) {
    next = existing.filter((row) => row.definitionKey !== key);
  } else {
    const row = normalizeOverrideRow({ ...patch, definitionKey: key });
    if (!row) {
      throw definitionAdminError(
        'Invalid notification override (check definitionKey and 30-minute cron)',
        'INVALID_OVERRIDE',
      );
    }
    next = [...existing.filter((item) => item.definitionKey !== key), row];
  }

  await upsertStoredTenantRow(jobReq, {
    ...tenant,
    meridianNotificationOverrides: next,
  });
  const updated = await getTenantByKey(jobReq, tenant.tenantKey);
  return updated?.meridianNotificationOverrides || [];
}

function scheduleTargets(definition, tenants) {
  const scoped = normalizeTenantKey(definition.tenantKey);
  if (scoped) {
    const match = tenants.find((row) => row.tenantKey === scoped);
    return match ? [match] : [{ tenantKey: scoped, pivotDropTimezone: 'UTC' }];
  }
  return tenants.filter(isPivotTenant);
}

async function evaluateMeridianNotificationSchedules(req, { now = new Date() } = {}) {
  ensureMeridianJobHandlersLoaded();
  const { jobReq, MeridianNotificationDefinition } = await getDefinitionModel(req);
  const tenants = await getMergedTenants(jobReq);
  const definitions = await MeridianNotificationDefinition.find({}).lean();
  const enqueued = [];
  const nudgeCronDisabled = isPivotCrewNudgeCronDisabled();

  for (const raw of definitions) {
    const targets = scheduleTargets(raw, tenants);
    for (const tenant of targets) {
      const { definition, applied, fields } = resolveDefinitionForTenant(raw, tenant);
      if (definition.enabled === false) continue;
      if (
        nudgeCronDisabled
        && definition.handlerKey === 'ritual_crew_scan'
      ) {
        continue;
      }
      const handler = getMeridianJobHandler(definition.handlerKey);
      if (!handler) continue;

      const timezone = String(tenant.pivotDropTimezone || '').trim() || 'UTC';
      const bucket = floorToThirtyMinuteBucket(now, timezone);
      if (!cronMatchesBucket(definition.scheduleCron, bucket)) continue;

      const result = await enqueueMeridianJob(jobReq, {
        handlerKey: definition.handlerKey,
        tenantKey: tenant.tenantKey,
        scheduledFor: now,
        payload: {
          definitionKey: definition.definitionKey,
          copyTitleKey: definition.copyTitleKey,
          copyBodyKey: definition.copyBodyKey,
          copyTitleFallback: definition.copyTitleFallback,
          copyBodyFallback: definition.copyBodyFallback,
          triggerConfig: cloneTriggerConfig(definition.triggerConfig),
          timeBucket: bucket.timeBucket,
          timezone,
          overrideApplied: applied,
          overriddenFields: fields,
        },
      });
      enqueued.push({
        definitionKey: definition.definitionKey,
        tenantKey: tenant.tenantKey,
        handlerKey: definition.handlerKey,
        timeBucket: bucket.timeBucket,
        created: result.created,
        runId: result.run?._id ? String(result.run._id) : null,
        runKey: result.run?.runKey || null,
      });
    }
  }

  return { evaluatedAt: now, enqueued };
}

module.exports = {
  definitionAdminError,
  serializeMeridianNotificationDefinition,
  normalizeMeridianNotificationOverrides,
  validateMeridianNotificationOverridesPatch,
  resolveDefinitionForTenant,
  createMeridianNotificationDefinition,
  getMeridianNotificationDefinition,
  listMeridianNotificationDefinitions,
  updateMeridianNotificationDefinition,
  deleteMeridianNotificationDefinition,
  upsertMeridianNotificationOverride,
  evaluateMeridianNotificationSchedules,
  validateThirtyMinuteCron,
};
