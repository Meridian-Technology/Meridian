const { computeJobInspectorHref, notificationJobRunHref } = require('../../utilities/pivotAdminHrefs');

describe('computeJobInspectorHref', () => {
  it('targets the compute jobs page and encodes the external job id', () => {
    expect(computeJobInspectorHref('New York/NYC', 'job:refresh 1')).toBe(
      '/platform-admin/pivot/New%20York%2FNYC?page=10&computeJobId=job%3Arefresh+1',
    );
  });
});

describe('notificationJobRunHref', () => {
  it('targets city Notifications run detail with jobRunId and batchWeek', () => {
    expect(notificationJobRunHref('SF', '507f191e810c19729de860ea', '2026-W38')).toBe(
      '/platform-admin/pivot/SF?page=9&jobRunId=507f191e810c19729de860ea&batchWeek=2026-W38',
    );
  });
});
