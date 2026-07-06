export function isPivotTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}
