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
jest.mock('../../services/pivotWeeklyBatchQualityService', () => ({
  getWeeklyBatchQuality: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: (tenant) => tenant.tenantType === 'pivot',
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { getResend } = require('../../services/resendClient');
const { resolveAdminEmails } = require('../../services/pivotComputeAdminNotifyService');
const {
  getFleetGrowthOverview,
  getTenantGrowthOverview,
} = require('../../services/pivotGrowthOverviewService');
const { getFleetLaunchStats } = require('../../services/pivotLandingService');
const { getWeeklyBatchQuality } = require('../../services/pivotWeeklyBatchQualityService');
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
  getMergedTenants.mockResolvedValue([
    { tenantKey: 'nyc', location: 'New York City', tenantType: 'pivot', landingMode: 'launched', pivotLaunchDate: '2026-09-10' },
    { tenantKey: 'sf', location: 'San <Francisco>', tenantType: 'pivot', landingMode: 'launched' },
    { tenantKey: 'chi', location: 'Chicago', tenantType: 'pivot', landingMode: 'launched' },
    // Switched to launched, but the launch date is still ahead.
    { tenantKey: 'la', location: 'Los Angeles', tenantType: 'pivot', landingMode: 'launched', pivotLaunchDate: '2026-11-01' },
    { tenantKey: 'den', location: 'Denver', tenantType: 'pivot', landingMode: 'waitlist' },
    { tenantKey: 'rpi', name: 'RPI', tenantType: 'campus', landingMode: 'waitlist' },
  ]);
  getFleetGrowthOverview.mockResolvedValue({
    data: {
      lastCompleteWeek: '2026-W39',
      totalMembers: 34,
      preLaunchMembers: 2,
      headline: headline(),
      series: [
        { week: '2026-W37', startDate: '2026-09-10', weeklyActive: 0, complete: true },
        { week: '2026-W38', startDate: '2026-09-17', weeklyActive: 10, planners: 4, plansSaved: 9, ticketOpeners: 2, complete: true },
        { week: '2026-W39', startDate: '2026-09-24', weeklyActive: 12, planners: 6, plansSaved: 14, ticketOpeners: 2, complete: true },
        { week: '2026-W40', startDate: '2026-10-01', weeklyActive: 3, complete: false },
      ],
      growthAccounting: [
        { week: '2026-W39', active: 12, new: 3, retained: 8, resurrected: 1, churned: 6 },
      ],
      retention: {
        opened: {
          average: [0, 1, 2, 3, 4, 5].map((offset) => ({ offset, rate: 1 - offset * 0.1, users: 10 })),
          cohorts: [
            { week: '2026-W37', size: 5, cells: [{ active: 4, complete: true }, { active: 2, complete: true }] },
            { week: '2026-W38', size: 6, cells: [{ active: 5, complete: true }, { active: 3, complete: true }] },
            { week: '2026-W39', size: 4, cells: [{ active: 3, complete: true }, { active: 0, complete: false }] },
          ],
        },
      },
      cities: [
        { tenantKey: 'nyc', cityDisplayName: 'New York City', launchDate: '2026-09-10' },
        { tenantKey: 'sf', cityDisplayName: 'San <Francisco>', launchDate: null },
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
  getWeeklyBatchQuality.mockResolvedValue({
    minReach: 5,
    cityCount: 2,
    events: 20,
    dealt: 18,
    landed: 12,
    passedByAll: 1,
    missingDetails: 0,
    swipes: 100,
    right: 30,
    going: 4,
    swipesPrevious: 80,
    rightPrevious: 20,
    rating: null,
    top: [{ eventId: '64f1234567890abcdef12345', name: 'Rooftop Cinema', city: 'New York City', right: 9, reached: 12 }],
    misses: [],
    failedCities: [],
  });
}

describe('pivotWeeklyReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubData();
  });

  it('reports the last complete drop week across cities', async () => {
    const report = await buildWeeklyReport({ globalDb: {} }, { now: NOW });

    // Only launched cities feed the numbers; campus tenants never appear.
    const launched = ['nyc', 'sf', 'chi'];
    expect(getFleetGrowthOverview).toHaveBeenCalledWith(expect.any(Object), { now: NOW, tenantKeys: launched });
    expect(getFleetLaunchStats).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ from: '2026-09-24', to: '2026-09-30', tenantKeys: launched }),
    );
    expect(report.notLaunchedCities).toEqual(['Los Angeles', 'Denver']);
    expect(report.subject).toBe('just go weekly · sep 24 – sep 30 · 12 actives');
    expect(report.preheader).toBe('12 weekly actives, up 2. 3 new, 1 back, 6 lost. 30% of swipes went right.');
    // The batch is read for the same ISO week, in every launched city that has started.
    expect(getWeeklyBatchQuality).toHaveBeenCalledWith(
      [{ tenantKey: 'nyc', name: 'New York City' }, { tenantKey: 'sf', name: 'San <Francisco>' }],
      '2026-W39',
    );
    expect(report.batch).toMatchObject({ events: 20, right: 30 });
    expect(report.batch.top[0].url).toMatch(/\/events\/64f1234567890abcdef12345$/);
    // Pre-launch zero weeks and the in-progress week are left off the trend.
    expect(report.trend.map((point) => point.value)).toEqual([10, 12]);
    // Counts behind the cohort rates; week 1 skips the cohort still in progress.
    expect(report.activation).toMatchObject({ active: 12, users: 15, cohorts: 3 });
    expect(report.week1).toMatchObject({ active: 5, users: 11, cohorts: 2 });
    expect(report.usage).toMatchObject({ planners: 6, plannersPrevious: 4, plansSaved: 14, ticketOpeners: 2 });
    expect(report.retentionAverage).toHaveLength(5);
    // Live cities first by actives; failed and not-yet-launched cities last.
    expect(report.cities).toEqual([
      expect.objectContaining({ tenantKey: 'nyc', weeklyActive: 12, weeklyActivePrevious: 10 }),
      expect.objectContaining({ tenantKey: 'sf', error: 'down' }),
    ]);
  });

  it('escapes names and notes missing cities in the HTML', async () => {
    const html = buildWeeklyReportHtml(await buildWeeklyReport({ globalDb: {} }, { now: NOW }));

    expect(html).toContain('San &lt;Francisco&gt;');
    expect(html).not.toContain('San <Francisco>');
    expect(html).toContain('Not in these numbers: Chicago');
    expect(html).toContain('2 people who joined before their city launched');
    expect(html).toContain('Launched cities only. Not counted yet: Los Angeles, Denver.');
    expect(html).toContain('12 of 15');
    expect(html).toContain('small sample');
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
      subject: 'just go weekly · sep 24 – sep 30 · 12 actives',
      html: expect.stringContaining('sep 24 – sep 30'),
      text: expect.stringContaining('12 weekly actives, up 2.'),
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
