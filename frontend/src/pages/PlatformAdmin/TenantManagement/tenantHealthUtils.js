export function isTenantHealthOk(health) {
  if (!health) return false;
  return health.ok === true || health.ok === 1;
}

export function formatTenantHealthMessage(health) {
  if (isTenantHealthOk(health)) {
    const ms = health.latencyMs != null ? ` · ${health.latencyMs}ms` : '';
    return `Database connected${ms}`;
  }
  return health?.error || 'Database unreachable';
}
