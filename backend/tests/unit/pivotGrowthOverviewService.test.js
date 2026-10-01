jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: jest.fn((tenant) => tenant?.tenantType === 'pivot'),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const {
  getTenantGrowthOverview,
  getFleetGrowthOverview,
} = require('../../services/pivotGrowthOverviewService');

function lean(rows) {
  return { lean: () => Promise.resolve(rows) };
}

describe('pivotGrowthOverviewService', () => {
  const membershipFind = jest.fn();
  const redemptionDistinct = jest.fn();
  const snapshotFind = jest.fn();
  const intentAggregate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({ name: 'nyc-db' });
    getGlobalModels.mockReturnValue({
      TenantMembership: { find: membershipFind },
      PivotReferralRedemption: { distinct: redemptionDistinct },
    });
    getModels.mockReturnValue({
      PivotDeckSnapshot: { find: snapshotFind },
      PivotEventIntent: { aggregate: intentAggregate },
    });
  });

  it('loads members, referrals, deck opens, and intents for the city', async () => {
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'nyc', location: 'New York City', pivotDropDayOfWeek: 4 },
    });
    membershipFind.mockReturnValue(
      lean([
        { tenantUserId: 'a', globalUserId: 'ga', createdAt: new Date('2026-09-17T12:00:00Z') },
        { tenantUserId: 'b', globalUserId: 'gb', createdAt: new Date('2026-09-17T13:00:00Z') },
      ]),
    );
    redemptionDistinct.mockResolvedValue(['ga']);
    snapshotFind.mockReturnValue(lean([{ userId: 'a', batchWeek: '2026-W38' }]));
    intentAggregate.mockResolvedValue([
      { _id: { userId: 'b', week: '2026-W38' }, plans: 1, ticketOpens: 1 },
    ]);

    const result = await getTenantGrowthOverview(
      { globalDb: {} },
      { tenantKey: 'nyc', now: new Date('2026-09-24T12:00:00Z') },
    );

    expect(connectToDatabase).toHaveBeenCalledWith('nyc');
    expect(membershipFind).toHaveBeenCalledWith({ tenantKey: 'nyc' }, expect.any(Object));
    expect(redemptionDistinct).toHaveBeenCalledWith('globalUserId', {
      globalUserId: { $in: ['ga', 'gb'] },
    });

    const { data } = result;
    expect(data).toMatchObject({
      tenantKey: 'nyc',
      cityDisplayName: 'New York City',
      currentWeek: '2026-W39',
      lastCompleteWeek: '2026-W38',
      totalMembers: 2,
    });
    expect(data.headline.weeklyActive.value).toBe(2);
    expect(data.headline.newMembers).toMatchObject({ value: 2, referredShare: 0.5 });
    expect(data.headline.planRate.value).toBe(0.5);
    const w38 = data.series.find((row) => row.week === '2026-W38');
    expect(w38).toMatchObject({ planners: 1, plansSaved: 1, ticketOpeners: 1 });
    expect(data.retention.opened.cohorts.at(-2)).toMatchObject({ week: '2026-W38', size: 2 });
  });

  it('passes tenant resolution errors through', async () => {
    resolvePivotTenant.mockResolvedValue({ error: 'Pivot tenant not found.', status: 404 });

    const result = await getTenantGrowthOverview({ globalDb: {} }, { tenantKey: 'nowhere' });

    expect(result).toEqual({ error: 'Pivot tenant not found.', status: 404 });
    expect(membershipFind).not.toHaveBeenCalled();
  });

  it('counts a person once across cities, joining in their earliest city week', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      // Monday drops: Sep 21 12:00Z falls in the W39 cycle (Mon Sep 21 – Sun Sep 27).
      { tenantKey: 'sf', tenantType: 'pivot', location: 'San Francisco', pivotDropTimezone: 'UTC', pivotDropDayOfWeek: 1, pivotDropHour: 9 },
      { tenantKey: 'rpi', tenantType: 'campus' },
    ]);
    const memberships = {
      nyc: [
        { tenantUserId: 'n1', globalUserId: 'g1', createdAt: new Date('2026-09-17T12:00:00Z') },
        { tenantUserId: 'n2', globalUserId: 'g2', createdAt: new Date('2026-09-18T12:00:00Z') },
      ],
      sf: [
        { tenantUserId: 's1', globalUserId: 'g1', createdAt: new Date('2026-09-21T12:00:00Z') },
        { tenantUserId: 's3', globalUserId: 'g3', createdAt: new Date('2026-09-21T12:00:00Z') },
      ],
    };
    membershipFind.mockImplementation(({ tenantKey }) => lean(memberships[tenantKey]));
    redemptionDistinct.mockResolvedValue(['g3']);
    connectToDatabase.mockImplementation((tenantKey) => Promise.resolve({ tenantKey }));
    const snapshots = {
      nyc: [{ userId: 'n1', batchWeek: '2026-W38' }, { userId: 'n2', batchWeek: '2026-W38' }],
      sf: [{ userId: 's1', batchWeek: '2026-W38' }, { userId: 's3', batchWeek: '2026-W39' }],
    };
    getModels.mockImplementation(({ db }) => ({
      PivotDeckSnapshot: { find: () => lean(snapshots[db.tenantKey]) },
      PivotEventIntent: { aggregate: () => Promise.resolve([]) },
    }));

    const { data } = await getFleetGrowthOverview(
      { globalDb: {} },
      { now: new Date('2026-10-01T12:00:00Z') },
    );

    expect(data).toMatchObject({ scope: 'fleet', cityDisplayName: 'All cities', failedCities: [] });
    expect(data.cities.map((city) => city.tenantKey)).toEqual(['nyc', 'sf']);
    // g1 is in both cities: one person, joined in nyc's W38; g3 joined sf's W39.
    expect(data.totalMembers).toBe(3);
    const w38 = data.series.find((row) => row.week === '2026-W38');
    expect(w38).toMatchObject({ newMembers: 2, weeklyActive: 2 });
    const w39 = data.series.find((row) => row.week === '2026-W39');
    expect(w39).toMatchObject({ newMembers: 1, referredMembers: 1, weeklyActive: 1 });
  });

  it('lists a city that fails to load instead of dropping it silently', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City' },
      { tenantKey: 'sf', tenantType: 'pivot', location: 'San Francisco' },
    ]);
    membershipFind.mockImplementation(({ tenantKey }) => lean(
      tenantKey === 'nyc'
        ? [{ tenantUserId: 'n1', globalUserId: 'g1', createdAt: new Date('2026-09-17T12:00:00Z') }]
        : [],
    ));
    redemptionDistinct.mockResolvedValue([]);
    connectToDatabase.mockImplementation((tenantKey) => (
      tenantKey === 'sf' ? Promise.reject(new Error('down')) : Promise.resolve({ tenantKey })
    ));
    getModels.mockReturnValue({
      PivotDeckSnapshot: { find: () => lean([]) },
      PivotEventIntent: { aggregate: () => Promise.resolve([]) },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { data } = await getFleetGrowthOverview({ globalDb: {} }, { now: new Date('2026-10-01T12:00:00Z') });

    expect(data.cities.map((city) => city.tenantKey)).toEqual(['nyc']);
    expect(data.failedCities).toEqual([{ tenantKey: 'sf', cityDisplayName: 'San Francisco' }]);
    expect(data.totalMembers).toBe(1);
    errorSpy.mockRestore();
  });

  it('applies each city\'s launch date before merging all cities', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York City', pivotLaunchDate: '2026-09-24' },
      { tenantKey: 'sf', tenantType: 'pivot', location: 'San Francisco' },
    ]);
    const memberships = {
      nyc: [
        { tenantUserId: 'n1', globalUserId: 'g1', createdAt: new Date('2026-09-17T12:00:00Z') },
        { tenantUserId: 'n2', globalUserId: 'g2', createdAt: new Date('2026-09-25T12:00:00Z') },
      ],
      sf: [{ tenantUserId: 's1', globalUserId: 'g3', createdAt: new Date('2026-09-17T12:00:00Z') }],
    };
    membershipFind.mockImplementation(({ tenantKey }) => lean(memberships[tenantKey]));
    redemptionDistinct.mockResolvedValue([]);
    connectToDatabase.mockImplementation((tenantKey) => Promise.resolve({ tenantKey }));
    const snapshots = {
      nyc: [{ userId: 'n1', batchWeek: '2026-W38' }, { userId: 'n2', batchWeek: '2026-W39' }],
      sf: [{ userId: 's1', batchWeek: '2026-W38' }],
    };
    getModels.mockImplementation(({ db }) => ({
      PivotDeckSnapshot: { find: () => lean(snapshots[db.tenantKey]) },
      PivotEventIntent: { aggregate: () => Promise.resolve([]) },
    }));

    const { data } = await getFleetGrowthOverview(
      { globalDb: {} },
      { now: new Date('2026-10-01T12:00:00Z') },
    );

    // nyc launched in W39: its W38 joiner and W38 opens don't count; sf has no
    // launch date, so the fleet window is not trimmed.
    expect(data.launch).toBeNull();
    expect(data.preLaunchMembers).toBe(1);
    expect(data.totalMembers).toBe(2);
    expect(data.cities.map((city) => city.launchDate)).toEqual(['2026-09-24', null]);
    expect(data.series.find((row) => row.week === '2026-W38')).toMatchObject({ weeklyActive: 1 });
    expect(data.series.find((row) => row.week === '2026-W39')).toMatchObject({ weeklyActive: 1 });
  });

  it('starts a city overview at its launch week', async () => {
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'nyc', location: 'New York City', pivotLaunchDate: '2026-09-24' },
    });
    membershipFind.mockReturnValue(lean([
      { tenantUserId: 'a', globalUserId: 'ga', createdAt: new Date('2026-09-17T12:00:00Z') },
    ]));
    redemptionDistinct.mockResolvedValue([]);
    snapshotFind.mockReturnValue(lean([]));
    intentAggregate.mockResolvedValue([]);

    const { data } = await getTenantGrowthOverview(
      { globalDb: {} },
      { tenantKey: 'nyc', now: new Date('2026-10-01T12:00:00Z') },
    );

    expect(data.launchDate).toBe('2026-09-24');
    expect(data.launch).toEqual({ week: '2026-W39', startDate: '2026-09-24', started: true });
    expect(data.preLaunchMembers).toBe(1);
    expect(data.series.map((row) => row.week)).toEqual(['2026-W39', '2026-W40']);
  });
});
