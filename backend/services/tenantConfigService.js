const { randomBytes } = require('crypto');
const bcrypt = require('bcrypt');
const getGlobalModels = require('./getGlobalModelService');
const {
  DEFAULT_TENANTS,
  normalizeTenantRow,
  normalizeTenantRows,
  normalizeTenantOverrides,
  mergeSparseTenantOverrides,
  mergeTenantRows,
  normalizePivotDropFields,
  normalizePivotDropOverrides,
} = require('../constants/defaultTenants');
const { PIVOT_DROP_PILOT_DEFAULTS } = require('../utilities/pivotDropSchedule');
const {
  connectToDatabase,
  setTenantUriCache,
  deriveMongoUriForTenant,
} = require('../connectionsManager');

const CONFIG_KEY = 'default';
const BASE_DOMAIN = process.env.MERIDIAN_BASE_DOMAIN || 'meridian.study';

const MANUAL_STEP_IDS = {
  DNS: 'dns',
  MONGO_ENV: 'mongo_env',
  PIVOT_CATALOG: 'pivot_catalog',
  VERIFY_PICKER: 'verify_picker',
};

function buildManualSteps(tenant, context = {}) {
  const subdomain = tenant.subdomain || tenant.tenantKey;
  const isPivot = tenant.pivotPilot === true || tenant.tenantType === 'pivot';
  const envVarName = `MONGO_URI_${tenant.tenantKey.toUpperCase()}`;
  const confirmations = tenant.provisioningConfirmations || {};

  return [
    {
      id: MANUAL_STEP_IDS.DNS,
      title: 'DNS subdomain',
      description: `Point ${subdomain}.${BASE_DOMAIN} to your app load balancer / hosting (CNAME or A record).`,
      automated: false,
      completed: confirmations.dns === true,
      command: `CNAME ${subdomain}.${BASE_DOMAIN} → <your-app-host>`,
    },
    {
      id: MANUAL_STEP_IDS.MONGO_ENV,
      title: 'Optional deploy env var',
      description: `For deployments that prefer env-based DB routing, set ${envVarName}. Dynamic mongoUri in TenantConfig takes precedence when env is unset.`,
      automated: false,
      completed: Boolean(process.env[envVarName]) || Boolean(tenant.mongoUri),
      command: `${envVarName}=mongodb://.../${tenant.mongoDatabaseName || tenant.tenantKey}`,
    },
    {
      id: MANUAL_STEP_IDS.PIVOT_CATALOG,
      title: 'Pivot Catalog org',
      description: isPivot
        ? 'Internal org used as technical host for imported Pivot events. Hidden from org discovery.'
        : 'Not required for campus tenants.',
      automated: isPivot,
      completed: !isPivot || Boolean(tenant.pivotCatalogOrgId),
      optional: !isPivot,
      orgId: tenant.pivotCatalogOrgId || null,
    },
    {
      id: MANUAL_STEP_IDS.VERIFY_PICKER,
      title: 'Verify school picker',
      description:
        'Confirm the tenant appears correctly on /select-school (status can still be coming soon while you verify). Activate the subdomain when you are ready to go live.',
      automated: false,
      completed: confirmations.pickerVerified === true,
      requiresActiveStatus: tenant.status !== 'active',
    },
  ];
}

function toStoredTenantRow(tenant) {
  const isDefault = DEFAULT_TENANTS.some((base) => base.tenantKey === tenant.tenantKey);
  const payload = {
    tenantKey: tenant.tenantKey,
    name: tenant.name,
    subdomain: tenant.subdomain,
    location: tenant.location,
    status: tenant.status,
    statusMessage: tenant.statusMessage,
    tenantType: tenant.tenantType,
    pivotPilot: tenant.pivotPilot,
    mongoUri: tenant.mongoUri,
    mongoDatabaseName: tenant.mongoDatabaseName,
    pivotCatalogOrgId: tenant.pivotCatalogOrgId,
    pivotDropTimezone: tenant.pivotDropTimezone,
    pivotDropDayOfWeek: tenant.pivotDropDayOfWeek,
    pivotDropHour: tenant.pivotDropHour,
    pivotDropMinute: tenant.pivotDropMinute,
    pivotDropPushTitle: tenant.pivotDropPushTitle,
    pivotDropPushBody: tenant.pivotDropPushBody,
    pivotDropOverrides: tenant.pivotDropOverrides,
    provisioningConfirmations: tenant.provisioningConfirmations,
  };
  if (isDefault) {
    const base = DEFAULT_TENANTS.find((row) => row.tenantKey === tenant.tenantKey);
    const defaultConfirmations = { dns: false, cors: false, pickerVerified: false };
    const override = { tenantKey: tenant.tenantKey };
    Object.keys(payload).forEach((key) => {
      if (key === 'tenantKey') return;
      if (key === 'provisioningConfirmations') {
        const payloadPc = payload.provisioningConfirmations || defaultConfirmations;
        if (JSON.stringify(payloadPc) !== JSON.stringify(defaultConfirmations)) {
          override.provisioningConfirmations = payload.provisioningConfirmations;
        }
        return;
      }
      if (JSON.stringify(payload[key]) !== JSON.stringify(base?.[key])) {
        override[key] = payload[key];
      }
    });
    return Object.keys(override).length > 1 ? override : null;
  }
  return payload;
}

async function getStoredTenantRows(req) {
  const doc = await loadTenantConfigDoc(req);
  return doc?.tenants || [];
}

async function upsertStoredTenantRow(req, tenant, updatedBy = null) {
  const delta = toStoredTenantRow(tenant);
  const stored = await getStoredTenantRows(req);
  const existingStored = stored.find((row) => row.tenantKey === tenant.tenantKey);
  const without = stored.filter((row) => row.tenantKey !== tenant.tenantKey);

  let nextRow = null;
  if (delta && existingStored) {
    nextRow = mergeSparseTenantOverrides(existingStored, delta);
  } else {
    nextRow = delta;
  }

  const next = nextRow ? [...without, nextRow] : without;
  await saveTenantRows(req, next, updatedBy);
  return getTenantByKey(req, tenant.tenantKey);
}

async function loadTenantConfigDoc(req) {
  const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
  return TenantConfig.findOne({ configKey: CONFIG_KEY }).lean();
}

async function getMergedTenants(req) {
  const doc = await loadTenantConfigDoc(req);
  return mergeTenantRows(DEFAULT_TENANTS, doc?.tenants || []);
}

async function getTenantByKey(req, tenantKeyOrSubdomain, options = {}) {
  const key = String(tenantKeyOrSubdomain || '').trim().toLowerCase();
  if (!key) return null;
  const tenants = await getMergedTenants(req);
  if (options.exact) {
    return tenants.find((row) => row.tenantKey === key) || null;
  }
  return (
    tenants.find((row) => row.tenantKey === key) ||
    tenants.find((row) => (row.subdomain || row.tenantKey) === key) ||
    null
  );
}

async function syncTenantUriCache(req) {
  const tenants = await getMergedTenants(req);
  const cache = {};
  tenants.forEach((tenant) => {
    const uri = deriveMongoUriForTenant(tenant.tenantKey, tenant);
    if (!uri) return;
    cache[tenant.tenantKey] = uri;
    const subdomain = String(tenant.subdomain || tenant.tenantKey).trim().toLowerCase();
    if (subdomain && subdomain !== tenant.tenantKey) {
      cache[subdomain] = uri;
    }
  });
  setTenantUriCache(cache);
  return cache;
}

async function saveTenantRows(req, rows, updatedBy = null) {
  const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
  const normalized = normalizeTenantOverrides(rows);
  const doc = await TenantConfig.findOneAndUpdate(
    { configKey: CONFIG_KEY },
    { $set: { tenants: normalized, updatedBy } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  await syncTenantUriCache(req);
  return mergeTenantRows(DEFAULT_TENANTS, doc?.tenants || []);
}

function isMongoPingOk(pingResult) {
  if (!pingResult || typeof pingResult !== 'object') return false;
  return pingResult.ok === 1 || pingResult.ok === true;
}

async function pingTenantDatabase(tenantKey, tenantRow = null) {
  const started = performance.now();
  try {
    const db = await connectToDatabase(tenantKey);
    const ping = await db.db.admin().ping();
    const latencyMs = Number((performance.now() - started).toFixed(2));
    return {
      ok: isMongoPingOk(ping),
      latencyMs,
      databaseName: db.name,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      error: error.message,
      databaseName: tenantRow?.mongoDatabaseName || tenantKey,
    };
  }
}

async function ensurePivotSystemUser(reqLike) {
  const getModels = require('./getModelService');
  const { User } = getModels(reqLike, 'User');
  const email = `pivot-catalog@${reqLike.school}.internal`;
  let user = await User.findOne({ email });
  if (user) return user;

  const randomPassword = randomBytes(32).toString('hex');
  const hashed = await bcrypt.hash(randomPassword, 10);
  user = await User.create({
    email,
    name: 'Pivot Catalog System',
    username: `pivot_cat_${reqLike.school}`.slice(0, 24),
    password: hashed,
    roles: ['admin'],
    onboarded: true,
  });
  return user;
}

async function provisionPivotCatalogOrg(req, tenantKey, tenantRow) {
  const getModels = require('./getModelService');
  const db = await connectToDatabase(tenantKey);
  const reqLike = { db, school: tenantKey };
  const { Org, OrgMember } = getModels(reqLike, 'Org', 'OrgMember', 'User');
  const owner = await ensurePivotSystemUser(reqLike);

  const catalogName = `Pivot Catalog — ${tenantRow.location || tenantRow.name || tenantKey}`;
  if (tenantRow.pivotCatalogOrgId) {
    const existing = await Org.findById(tenantRow.pivotCatalogOrgId);
    if (existing && existing.isDeleted !== true) {
      return { orgId: String(existing._id), orgName: existing.org_name, created: false };
    }
  }

  let org = await Org.findOne({ org_name: catalogName, isDeleted: { $ne: true } });
  let created = false;
  if (!org) {
    org = await Org.create({
      org_name: catalogName,
      org_description: 'Internal technical host for Pivot catalog events. Not shown in Pivot consumer UI.',
      org_profile_image: '/Logo.svg',
      owner: owner._id,
      unlisted: true,
      positions: [
        {
          name: 'owner',
          displayName: 'Owner',
          permissions: ['all'],
          isDefault: false,
          canManageMembers: true,
          canManageRoles: true,
          canManageEvents: true,
          canViewAnalytics: true,
          order: 0,
          color: '#dc2626',
        },
        {
          name: 'member',
          displayName: 'Member',
          permissions: ['view_events'],
          isDefault: true,
          canManageMembers: false,
          canManageRoles: false,
          canManageEvents: false,
          canViewAnalytics: false,
          order: 1,
          color: '#6b7280',
        },
      ],
    });
    created = true;
  }

  const membership = await OrgMember.findOne({ org_id: org._id, user_id: owner._id });
  if (!membership) {
    await OrgMember.create({
      org_id: org._id,
      user_id: owner._id,
      role: 'owner',
      roles: ['owner'],
      status: 'active',
    });
  }

  return { orgId: String(org._id), orgName: org.org_name, created };
}

function serializeTenantForAdmin(tenant, extras = {}) {
  const { health, manualStepContext, ...rest } = extras;
  const manualSteps = buildManualSteps(tenant, manualStepContext || {});
  return {
    ...tenant,
    mongoUriConfigured: Boolean(tenant.mongoUri || process.env[`MONGO_URI_${tenant.tenantKey.toUpperCase()}`]),
    subdomainUrl: `https://${tenant.subdomain || tenant.tenantKey}.${BASE_DOMAIN}`,
    health: health || null,
    manualSteps,
    provisioningComplete: manualSteps.filter((step) => !step.optional).every((step) => step.completed),
    ...rest,
  };
}

function validateTenantMetadataUpdate(body = {}) {
  if (body.name !== undefined && !String(body.name).trim()) {
    return { error: 'name cannot be empty.' };
  }
  if (body.location !== undefined && !String(body.location).trim()) {
    return { error: 'location cannot be empty.' };
  }
  if (body.subdomain !== undefined) {
    const subdomain = String(body.subdomain).trim().toLowerCase();
    if (subdomain === 'www') return { error: 'subdomain "www" is reserved.' };
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(subdomain)) {
      return { error: 'subdomain must start with a letter and use lowercase alphanumeric, underscore, or hyphen.' };
    }
  }
  if (body.tenantType !== undefined && !['campus', 'pivot'].includes(body.tenantType)) {
    return { error: 'tenantType must be campus or pivot.' };
  }

  if (body.pivotDropTimezone !== undefined && !String(body.pivotDropTimezone).trim()) {
    return { error: 'pivotDropTimezone cannot be empty.' };
  }

  return { ok: true };
}

function validateNewTenantPayload(body = {}) {
  const tenantKey = String(body.tenantKey || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(tenantKey)) {
    return { error: 'tenantKey must be 2–32 chars, start with a letter, lowercase alphanumeric/underscore/hyphen.' };
  }
  if (tenantKey === 'www') return { error: 'tenantKey "www" is reserved.' };
  if (!String(body.name || '').trim()) return { error: 'name is required.' };
  if (!String(body.location || '').trim()) return { error: 'location is required (city display name).' };

  const tenantType = body.tenantType === 'pivot' ? 'pivot' : 'campus';
  const mongoDatabaseName = String(body.mongoDatabaseName || tenantKey).trim().toLowerCase();
  const mongoUri = String(body.mongoUri || '').trim() || deriveMongoUriForTenant(tenantKey, { mongoDatabaseName });

  if (!mongoUri) {
    return { error: 'Could not derive mongoUri. Provide mongoUri or set DEFAULT_MONGO_URI / MONGO_URI_RPI.' };
  }

  return {
    row: normalizeTenantRow({
      tenantKey,
      name: body.name,
      subdomain: body.subdomain || tenantKey,
      location: body.location,
      status: body.status || 'coming_soon',
      statusMessage: body.statusMessage || '',
      tenantType,
      pivotPilot: tenantType === 'pivot' || body.pivotPilot === true,
      mongoUri,
      mongoDatabaseName,
      ...(tenantType === 'pivot' ? { ...PIVOT_DROP_PILOT_DEFAULTS } : {}),
    }),
  };
}

module.exports = {
  CONFIG_KEY,
  BASE_DOMAIN,
  MANUAL_STEP_IDS,
  buildManualSteps,
  loadTenantConfigDoc,
  getMergedTenants,
  getTenantByKey,
  syncTenantUriCache,
  saveTenantRows,
  pingTenantDatabase,
  provisionPivotCatalogOrg,
  serializeTenantForAdmin,
  validateNewTenantPayload,
  validateTenantMetadataUpdate,
  upsertStoredTenantRow,
  toStoredTenantRow,
  getStoredTenantRows,
  DEFAULT_TENANTS,
  mergeTenantRows,
  normalizeTenantRows,
};
