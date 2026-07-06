const TENANT_STATUSES = new Set(['active', 'coming_soon', 'maintenance', 'hidden']);
const TENANT_TYPES = new Set(['campus', 'pivot']);

function normalizePivotDropOverrides(rows = []) {
  if (!Array.isArray(rows)) return undefined;

  const normalized = rows
    .map((row) => {
      const batchWeek = String(row?.batchWeek || '').trim();
      if (!/^\d{4}-W\d{2}$/.test(batchWeek)) return null;
      const dayOfWeek = Number(row?.dayOfWeek);
      const hour = Number(row?.hour);
      if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
      const minuteRaw = row?.minute;
      const minute =
        minuteRaw === undefined || minuteRaw === null
          ? 0
          : Number(minuteRaw);
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
      return { batchWeek, dayOfWeek, hour, minute };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizePivotDropFields(row = {}, target = {}) {
  if (row.pivotDropTimezone !== undefined && row.pivotDropTimezone !== null) {
    const timezone = String(row.pivotDropTimezone).trim();
    if (timezone) target.pivotDropTimezone = timezone;
  }
  if (row.pivotDropDayOfWeek !== undefined && row.pivotDropDayOfWeek !== null) {
    const dayOfWeek = Number(row.pivotDropDayOfWeek);
    if (Number.isFinite(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
      target.pivotDropDayOfWeek = dayOfWeek;
    }
  }
  if (row.pivotDropHour !== undefined && row.pivotDropHour !== null) {
    const hour = Number(row.pivotDropHour);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      target.pivotDropHour = hour;
    }
  }
  if (row.pivotDropMinute !== undefined && row.pivotDropMinute !== null) {
    const minute = Number(row.pivotDropMinute);
    if (Number.isFinite(minute) && minute >= 0 && minute <= 59) {
      target.pivotDropMinute = minute;
    }
  }
  const overrides = normalizePivotDropOverrides(row.pivotDropOverrides);
  if (overrides) {
    target.pivotDropOverrides = overrides;
  }
  return target;
}

const DEFAULT_TENANTS = [
  {
    tenantKey: 'rpi',
    name: 'Rensselaer Polytechnic Institute',
    subdomain: 'rpi',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
    tenantType: 'campus',
    pivotPilot: false,
  },
  {
    tenantKey: 'tvcog',
    name: 'Center of Gravity',
    subdomain: 'tvcog',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
    tenantType: 'campus',
    pivotPilot: false,
  },
];

function normalizeTenantRow(row = {}) {
  const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
  if (!tenantKey || tenantKey === 'www') return null;

  const status = TENANT_STATUSES.has(row?.status) ? row.status : 'active';
  const tenantType = TENANT_TYPES.has(row?.tenantType) ? row.tenantType : 'campus';

  return {
    tenantKey,
    name: String(row?.name || tenantKey).trim(),
    subdomain: String(row?.subdomain || tenantKey).trim().toLowerCase(),
    location: String(row?.location || '').trim(),
    status,
    statusMessage: String(row?.statusMessage || '').trim().slice(0, 240),
    tenantType,
    pivotPilot: row?.pivotPilot === true || tenantType === 'pivot',
    mongoUri: String(row?.mongoUri || '').trim() || undefined,
    mongoDatabaseName: String(row?.mongoDatabaseName || '').trim() || undefined,
    pivotCatalogOrgId: String(row?.pivotCatalogOrgId || '').trim() || undefined,
    provisioningConfirmations: {
      dns: row?.provisioningConfirmations?.dns === true,
      cors: row?.provisioningConfirmations?.cors === true,
      pickerVerified: row?.provisioningConfirmations?.pickerVerified === true,
    },
  };

  return normalizePivotDropFields(row, normalized);
}

function normalizeTenantRows(rows = []) {
  return rows.map(normalizeTenantRow).filter(Boolean);
}

/** Persisted overrides may be sparse (only changed fields). Do not fill missing keys. */
function normalizeTenantOverride(row = {}) {
  const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
  if (!tenantKey || tenantKey === 'www') return null;

  const out = { tenantKey };

  if (row.name !== undefined && row.name !== null) {
    out.name = String(row.name).trim();
  }
  if (row.subdomain !== undefined && row.subdomain !== null) {
    out.subdomain = String(row.subdomain).trim().toLowerCase();
  }
  if (row.location !== undefined && row.location !== null) {
    out.location = String(row.location).trim();
  }
  if (row.status !== undefined && TENANT_STATUSES.has(row.status)) {
    out.status = row.status;
  }
  if (row.statusMessage !== undefined && row.statusMessage !== null) {
    out.statusMessage = String(row.statusMessage).trim().slice(0, 240);
  }
  if (row.tenantType !== undefined && TENANT_TYPES.has(row.tenantType)) {
    out.tenantType = row.tenantType;
  }
  if (row.pivotPilot !== undefined) {
    out.pivotPilot = row.pivotPilot === true;
  }
  if (row.mongoUri !== undefined && row.mongoUri !== null) {
    const uri = String(row.mongoUri).trim();
    if (uri) out.mongoUri = uri;
  }
  if (row.mongoDatabaseName !== undefined && row.mongoDatabaseName !== null) {
    const dbName = String(row.mongoDatabaseName).trim();
    if (dbName) out.mongoDatabaseName = dbName.toLowerCase();
  }
  if (row.pivotCatalogOrgId !== undefined && row.pivotCatalogOrgId !== null) {
    const orgId = String(row.pivotCatalogOrgId).trim();
    if (orgId) out.pivotCatalogOrgId = orgId;
  }
  if (row.provisioningConfirmations && typeof row.provisioningConfirmations === 'object') {
    const pc = {};
    if (row.provisioningConfirmations.dns !== undefined) {
      pc.dns = row.provisioningConfirmations.dns === true;
    }
    if (row.provisioningConfirmations.cors !== undefined) {
      pc.cors = row.provisioningConfirmations.cors === true;
    }
    if (row.provisioningConfirmations.pickerVerified !== undefined) {
      pc.pickerVerified = row.provisioningConfirmations.pickerVerified === true;
    }
    if (Object.keys(pc).length > 0) {
      out.provisioningConfirmations = pc;
    }
  }

  normalizePivotDropFields(row, out);

  return Object.keys(out).length > 1 ? out : null;
}

function normalizeTenantOverrides(rows = []) {
  return rows.map(normalizeTenantOverride).filter(Boolean);
}

function mergeSparseTenantOverrides(existing = {}, delta = {}) {
  const merged = { ...existing, ...delta, tenantKey: delta.tenantKey || existing.tenantKey };
  if (existing.provisioningConfirmations || delta.provisioningConfirmations) {
    merged.provisioningConfirmations = {
      ...(existing.provisioningConfirmations || {}),
      ...(delta.provisioningConfirmations || {}),
    };
  }
  return merged;
}

function mergeTenantRows(baseRows = [], overrideRows = []) {
  const merged = new Map();
  normalizeTenantRows(baseRows).forEach((row) => merged.set(row.tenantKey, row));
  normalizeTenantOverrides(overrideRows).forEach((row) => {
    const base = merged.get(row.tenantKey) || {};
    const { provisioningConfirmations: pcPatch, ...rest } = row;
    const next = { ...base, ...rest };
    if (pcPatch) {
      next.provisioningConfirmations = {
        dns: false,
        cors: false,
        pickerVerified: false,
        ...(base.provisioningConfirmations || {}),
        ...pcPatch,
      };
    }
    merged.set(row.tenantKey, next);
  });
  return Array.from(merged.values());
}

module.exports = {
  TENANT_STATUSES,
  TENANT_TYPES,
  DEFAULT_TENANTS,
  normalizePivotDropOverrides,
  normalizePivotDropFields,
  normalizeTenantRow,
  normalizeTenantRows,
  normalizeTenantOverride,
  normalizeTenantOverrides,
  mergeSparseTenantOverrides,
  mergeTenantRows,
};
