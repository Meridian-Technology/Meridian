import { notificationJobRunHref, computeJobInspectorHref, PIVOT_FLEET_NOTIFICATIONS_PAGE } from './notificationJobRoutes';

describe('notificationJobRunHref', () => {
  it('keeps fleet Notifications appended at page 5', () => {
    expect(PIVOT_FLEET_NOTIFICATIONS_PAGE).toBe(5);
  });

  it('includes page, jobRunId, and batchWeek', () => {
    expect(
      notificationJobRunHref({
        tenantKey: 'SF',
        runId: '507f191e810c19729de860ea',
        batchWeek: '2026-W38',
      }),
    ).toBe(
      '/platform-admin/pivot/sf?page=9&jobRunId=507f191e810c19729de860ea&batchWeek=2026-W38',
    );
  });

  it('targets city Compute jobs inspect with encoded job id', () => {
    expect(
      computeJobInspectorHref({
        tenantKey: 'SF',
        externalJobId: 'job:refresh-nyc-1',
      }),
    ).toBe('/platform-admin/pivot/sf?page=10&computeJobId=job%3Arefresh-nyc-1');
  });
});
