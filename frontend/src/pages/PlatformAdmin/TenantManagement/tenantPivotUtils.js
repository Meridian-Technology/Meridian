export const DEFAULT_TENANT_KEYS = new Set(['rpi', 'tvcog']);

export function isDefaultTenantKey(tenantKey) {
  return DEFAULT_TENANT_KEYS.has(String(tenantKey || '').trim().toLowerCase());
}

export function isPivotTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}
