/**
 * Pure deep-link builders for platform-admin Pivot surfaces.
 *
 * These live in utilities rather than alongside their original callers because
 * several services that must not depend on each other need the same links:
 * pivotTenantInsightsService, pivotBatchReadinessService, and
 * pivotCreatorAdminNotifyService (which pivotAdminOverviewService requires).
 * Keep this module dependency-free.
 */

function curationHref(tenantKey, batchWeek, filter) {
  const params = new URLSearchParams({ page: '1', batchWeek });
  if (filter) params.set('filter', filter);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

function journeysHref(tenantKey, batchWeek) {
  const params = new URLSearchParams({ page: '2', batchWeek });
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

module.exports = {
  curationHref,
  journeysHref,
};
