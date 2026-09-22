import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PivotWeeklyDropPage from '../PivotWeeklyDrop/PivotWeeklyDropPage';
import PivotJobRunDetail from './PivotJobRunDetail';
import { JOB_RUN_ID_QUERY, PIVOT_TENANT_NOTIFICATIONS_PAGE } from './notificationJobRoutes';

/**
 * Tenant Notifications panel. v1 absorbs weekly drop send, dry-run, schedule,
 * and run history. `?jobRunId=` opens run detail (attempts + deliveries).
 */
function PivotNotificationsPage({ tenantKey, tenant }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobRunId = searchParams.get(JOB_RUN_ID_QUERY) || '';
  const batchWeek = searchParams.get('batchWeek') || '';

  const closeDetail = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(JOB_RUN_ID_QUERY);
      next.set('page', String(PIVOT_TENANT_NOTIFICATIONS_PAGE));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  if (jobRunId) {
    return (
      <PivotJobRunDetail
        tenantKey={tenantKey}
        runId={jobRunId}
        batchWeek={batchWeek}
        onBack={closeDetail}
      />
    );
  }

  return (
    <PivotWeeklyDropPage
      tenantKey={tenantKey}
      tenant={tenant}
      notificationsPanel
    />
  );
}

export default PivotNotificationsPage;
