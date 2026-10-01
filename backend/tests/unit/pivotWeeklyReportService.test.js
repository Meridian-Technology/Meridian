jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/resendClient', () => ({ getResend: jest.fn() }));
jest.mock('../../services/pivotComputeAdminNotifyService', () => ({
  resolveAdminEmails: jest.fn(),
}));
jest.mock('../../services/pivotGrowthOverviewService', () => ({
  getFleetGrowthOverview: jest.fn(),
  getTenantGrowthOverview: jest.fn(),
}));
jest.mock('../../services/pivotLandingService', () => ({
  getFleetLaunchStats: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getResend } = require('../../services/resendClient');
const { resolveAdminEmails } = require('../../services/pivotComputeAdminNotifyService');
const {
  getFleetGrowthOverview,
  getTenantGrowthOverview,
} = require('../../services/pivotGrowthOverviewService');
const { getFleetLaunchStats } = require('../../services/pivotLandingService');
const {
  buildWeeklyReport,
  buildWeeklyReportHtml,
  resolveRequesterEmail,
  sendWeeklyReport,
} = require('../../services/pivotWeeklyReportService');

const NOW = new Date('2026-10-04T15:00:00Z'); // Sunday

function headline(overrides = {}) {
  return {
    weeklyActive: { value: 12, previous: 10 },
    newMembers: { value: 4, previous: 5, referredShare: 0.25 },
    activation: { value: 0.8, previous: 0.75 },
    week1Retention: { value: 0.4, previous: 0.5 },
    quickRatio: { value: 1.5, previous: 1 },
    planRate: { value: 0.5, previous: 0.5 },
    ...overrides,
  };
}

function stubData() {
  getFleetGrowthOverview.mockResolvedValue({
    data: {
      lastCompleteWeek: '2026-W39',
      totalMembers: 34,
      preLaunchMembers: 2,
      headline: headline(),
      series: [{ week: '2026-W39', startDate: '2026-09-24' }],
      growthAccounting: [
        { week: '2026-W39', active: 12, new: 3, retained: 8, resurrected: 1, churned: 6 },
      ],
      retention: {
        opened: {
          average: [0, 1, 2, 3, 4, 5].map((offset) => ({ offset, rate: 1 - offset * 0.1 })),
        },
      },
      cities: [
        { tenantKey: 'nyc', cityDisplayName: 'New York City', launchDate: '2026-09-10' },
        { tenantKey: 'sf', cityDisplayName: 'San <Francisco>', launchDate: null },
        { tenantKey: 'la', cityDisplayName: 'Los Angeles', launchDate: '2026-11-01' },
      ],
      failedCities: [{ tenantKey: 'chi', cityDisplayName: 'Chicago' }],
    },
  });
  getTenantGrowthOverview.mockImplementation((_req, { tenantKey }) => {
    if (tenantKey === 'sf') return Promise.reject(new Error('down'));
    if (tenantKey === 'la') {
      return Promise.resolve({ data: { headline: headline(), launch: { started: false } } });
    }
    return Promise.resolve({ data: { headline: headline(), launch: { started: true } } });
  });
  getFleetLaunchStats.mockResolvedValue({
    data: {
      totals: { views: 300, uniqueVisitors: 200, waitlistSignups: 20, storeClicks: 15 },
      cities: [{ tenantKey: 'nyc', views: 250, waitlistSignups: 18, storeClicks: 12 }],
    },
  });
}

describe('pivotWeeklyReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubData();
  });

  it('reports the last complete drop week across cities', async () => {
    const report = await buildWeeklyReport({ globalDb: {} }, { now: NOW });

    expect(getFleetGrowthOverview).toHaveBeenCalledWith(expect.any(Object), { now: NOW });
    expect(getFleetLaunchStats).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ from: '2026-09-24', to: '2026-09-30' }),
    );
    expect(report.subject).toBe('Just Go weekly report · Sep 24 – Sep 30');
    expect(report.tiles.map((tile) => [tile.label, tile.value, tile.delta])).toEqual([
      ['Weekly actives', '12', '▲ 20%'],
      ['New members', '4', '▼ 20%'],
      ['Activation', '80%', '▲ 5 pts'],
      ['Week-1 retention', '40%', '▼ 10 pts'],
      ['Quick ratio', '1.50', '▲ 0.50'],
      ['Plan rate', '50%', 'flat'],
    ]);
    expect(report.retentionAverage).toHaveLength(5);
    expect(report.cities).toEqual([
      expect.objectContaining({ tenantKey: 'nyc', weeklyActive: 12, landingViews: 250, waitlistSignups: 18 }),
      expect.objectContaining({ tenantKey: 'sf', error: 'down' }),
      expect.objectContaining({ tenantKey: 'la', notStarted: true }),
    ]);
  });

  it('escapes names and notes missing cities in the HTML', async () => {
    const html = buildWeeklyReportHtml(await buildWeeklyReport({ globalDb: {} }, { now: NOW }));

    expect(html).toContain('San &lt;Francisco&gt;');
    expect(html).not.toContain('San <Francisco>');
    expect(html).toContain('Missing from these numbers: Chicago');
    expect(html).toContain('2 people who joined before their city');
    expect(html).toContain('Counting starts at launch');
    expect(html).toContain('/platform-admin/pivot?page=2');
  });

  it('sends to every platform admin by default', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email_1' } });
    getResend.mockReturnValue({ emails: { send } });
    resolveAdminEmails.mockResolvedValue(['a@meridian.study', 'b@meridian.study']);

    const result = await sendWeeklyReport({ globalDb: {} }, { now: NOW });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Just Go <support@meridian.study>',
      to: ['a@meridian.study', 'b@meridian.study'],
      subject: 'Just Go weekly report · Sep 24 – Sep 30',
      html: expect.stringContaining('Drop week Sep 24 – Sep 30'),
      text: expect.stringContaining('Weekly actives: 12 (▲ 20%)'),
    }));
    expect(result.data).toMatchObject({ sent: true, emailId: 'email_1', recipients: ['a@meridian.study', 'b@meridian.study'] });
  });

  it('sends only to explicit recipients, normalized', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email_2' } });
    getResend.mockReturnValue({ emails: { send } });

    await sendWeeklyReport({ globalDb: {} }, { now: NOW, to: [' Me@Example.com ', 'me@example.com', 'nope'] });

    expect(resolveAdminEmails).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['me@example.com'] }));
  });

  it('builds without sending on a dry run', async () => {
    const send = jest.fn();
    getResend.mockReturnValue({ emails: { send } });
    resolveAdminEmails.mockResolvedValue(['a@meridian.study']);

    const result = await sendWeeklyReport({ globalDb: {} }, { now: NOW, dryRun: true });

    expect(send).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ sent: false, recipients: ['a@meridian.study'] });
    expect(result.data.html).toContain('<!doctype html>');
  });

  it('reports missing recipients, email configuration, and provider errors', async () => {
    resolveAdminEmails.mockResolvedValue([]);
    expect(await sendWeeklyReport({ globalDb: {} }, { now: NOW })).toMatchObject({ code: 'NO_RECIPIENTS' });
    expect(getFleetGrowthOverview).not.toHaveBeenCalled();

    resolveAdminEmails.mockResolvedValue(['a@meridian.study']);
    getResend.mockReturnValue(null);
    expect(await sendWeeklyReport({ globalDb: {} }, { now: NOW })).toMatchObject({
      code: 'EMAIL_UNAVAILABLE',
      status: 503,
    });

    getResend.mockReturnValue({
      emails: { send: jest.fn().mockResolvedValue({ error: { message: 'domain not verified' } }) },
    });
    expect(await sendWeeklyReport({ globalDb: {} }, { now: NOW })).toMatchObject({
      code: 'SEND_FAILED',
      error: 'domain not verified',
    });
  });

  it('looks up the signed-in admin email', async () => {
    const findById = jest.fn(() => ({
      select: () => ({ lean: () => Promise.resolve({ email: 'Admin@Meridian.Study' }) }),
    }));
    getGlobalModels.mockReturnValue({ GlobalUser: { findById } });

    expect(await resolveRequesterEmail({ user: { globalUserId: 'g1' } })).toBe('admin@meridian.study');
    expect(findById).toHaveBeenCalledWith('g1');
    expect(await resolveRequesterEmail({ user: {} })).toBeNull();
  });
});
