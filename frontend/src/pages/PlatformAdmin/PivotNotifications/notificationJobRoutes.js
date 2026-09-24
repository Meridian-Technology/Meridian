export const PIVOT_TENANT_NOTIFICATIONS_PAGE = 9;
/** Fleet shell: appended after Analytics so existing ?page= bookmarks stay put. */
export const PIVOT_FLEET_NOTIFICATIONS_PAGE = 5;
export const PIVOT_TENANT_COMPUTE_JOBS_PAGE = 10;
export const JOB_RUN_ID_QUERY = 'jobRunId';

export function notificationJobRunHref({
  tenantKey,
  runId,
  batchWeek,
  page = PIVOT_TENANT_NOTIFICATIONS_PAGE,
} = {}) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (runId) params.set(JOB_RUN_ID_QUERY, String(runId));
  if (batchWeek) params.set('batchWeek', String(batchWeek));
  const fleetShell = Number(page) === PIVOT_FLEET_NOTIFICATIONS_PAGE;
  const path = fleetShell || !key
    ? '/platform-admin/pivot'
    : `/platform-admin/pivot/${encodeURIComponent(key)}`;
  return `${path}?${params.toString()}`;
}

export function computeJobInspectorHref({
  tenantKey,
  externalJobId,
  page = PIVOT_TENANT_COMPUTE_JOBS_PAGE,
} = {}) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const params = new URLSearchParams({ page: String(page) });
  if (externalJobId) params.set('computeJobId', String(externalJobId));
  return `/platform-admin/pivot/${encodeURIComponent(key)}?${params.toString()}`;
}

