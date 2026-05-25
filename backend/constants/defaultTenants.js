const TENANT_STATUSES = new Set(['active', 'coming_soon', 'maintenance', 'hidden']);
const TENANT_TYPES = new Set(['campus', 'pivot']);

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
}

function normalizeTenantRows(rows = []) {
  return rows.map(normalizeTenantRow).filter(Boolean);
}

function mergeTenantRows(baseRows = [], overrideRows = []) {
  const merged = new Map();
  normalizeTenantRows(baseRows).forEach((row) => merged.set(row.tenantKey, row));
  normalizeTenantRows(overrideRows).forEach((row) => {
    const base = merged.get(row.tenantKey) || {};
    merged.set(row.tenantKey, { ...base, ...row });
  });
  return Array.from(merged.values());
}

module.exports = {
  TENANT_STATUSES,
  TENANT_TYPES,
  DEFAULT_TENANTS,
  normalizeTenantRow,
  normalizeTenantRows,
  mergeTenantRows,
};
