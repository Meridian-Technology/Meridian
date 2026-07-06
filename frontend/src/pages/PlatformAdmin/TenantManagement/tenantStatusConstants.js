export const TENANT_STATUS_OPTIONS = [
  { value: 'coming_soon', label: 'Coming soon', meta: 'School picker only; subdomain not live', icon: 'mdi:clock-outline' },
  { value: 'active', label: 'Active', meta: 'Live on subdomain and school picker', icon: 'mdi:check-circle-outline' },
  { value: 'maintenance', label: 'Maintenance', meta: 'Blocked with optional user message', icon: 'mdi:wrench-outline' },
  { value: 'hidden', label: 'Hidden', meta: 'Omitted from picker; direct URL may work', icon: 'mdi:eye-off-outline' },
];

export function statusLabel(value) {
  if (!value) return 'Unknown';
  return TENANT_STATUS_OPTIONS.find((o) => o.value === value)?.label || String(value).replace(/_/g, ' ');
}

export function getSoftWarnings(tenant, nextStatus) {
  if (!tenant || !nextStatus) return [];
  const warnings = [];
  const checklistComplete = tenant.provisioningComplete === true;

  if (nextStatus === 'active' && !checklistComplete) {
    warnings.push('Setup checklist is not complete. You can still go live, but users may hit incomplete configuration.');
  }
  if (nextStatus === 'active' && tenant.status === 'coming_soon' && checklistComplete) {
    warnings.push('DNS should be in place before traffic hits this subdomain.');
  }
  if (nextStatus === 'hidden' && tenant.status === 'active') {
    warnings.push('Hidden tenants are removed from the school picker but remain reachable by direct URL.');
  }
  return warnings;
}
