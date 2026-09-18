const { computeJobInspectorHref } = require('../../utilities/pivotAdminHrefs');

describe('computeJobInspectorHref', () => {
  it('targets the compute jobs page and encodes the external job id', () => {
    expect(computeJobInspectorHref('New York/NYC', 'job:refresh 1')).toBe(
      '/platform-admin/pivot/New%20York%2FNYC?page=10&computeJobId=job%3Arefresh+1',
    );
  });
});
