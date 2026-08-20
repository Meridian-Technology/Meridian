jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  getMergedTenants: jest.fn(),
  upsertStoredTenantRow: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  getTenantByKey,
  getMergedTenants,
  upsertStoredTenantRow,
} = require('../../services/tenantConfigService');
const {
  recordLandingEvent,
  getLandingConfig,
  getTenantLaunchStats,
  getFleetLaunchStats,
  updateTenantLandingMode,
  parseLaunchRange,
  conversionRateForMode,
  CONVERSION_USES_CURRENT_MODE_NOTE,
} = require('../../services/pivotLandingService');

const NYC_TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  status: 'coming_soon',
  location: 'New York City',
};

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    get: jest.fn((header) => {
      if (header === 'host') return 'justgo.lol';
      if (header === 'user-agent') return 'JustGoTest/1.0';
      return undefined;
    }),
    ...overrides,
  };
}

function mockCreate() {
  const create = jest.fn().mockImplementation(async (doc) => ({ _id: 'evt1', ...doc }));
  getGlobalModels.mockReturnValue({ JustGoLandingEvent: { create } });
  return create;
}

describe('recordLandingEvent (Task 1.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
  });

  it('writes every view with no auth user', async () => {
    const create = mockCreate();
    const req = mockReq();

    const first = await recordLandingEvent(req, {
      type: 'view',
      visitorId: 'visitor-abc',
      path: '/',
    });
    const second = await recordLandingEvent(req, {
      type: 'view',
      visitorId: 'visitor-abc',
      path: '/',
    });

    expect(first).toEqual({ data: {} });
    expect(second).toEqual({ data: {} });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'view',
        tenantKey: null,
        host: 'justgo.lol',
        path: '/',
        source: 'direct',
        visitorId: 'visitor-abc',
        store: null,
      }),
    );
    expect(getTenantByKey).not.toHaveBeenCalled();
  });

  it('stamps a pivot city tenantKey including coming_soon', async () => {
    const create = mockCreate();

    const result = await recordLandingEvent(mockReq(), {
      type: 'view',
      tenantKey: 'NYC',
      visitorId: 'visitor-abc',
      source: 'qr',
      qr: 'Poster-A',
      path: '/nyc',
    });

    expect(result).toEqual({ data: {} });
    expect(getTenantByKey).toHaveBeenCalledWith(expect.anything(), 'nyc');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantKey: 'nyc',
        source: 'qr',
        qrName: 'Poster-A',
        path: '/nyc',
      }),
    );
  });

  it('writes a store_click with store', async () => {
    const create = mockCreate();

    const result = await recordLandingEvent(mockReq(), {
      type: 'store_click',
      visitorId: 'visitor-abc',
      store: 'ios',
      ref: 'share-1',
      source: 'share',
    });

    expect(result).toEqual({ data: {} });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'store_click',
        store: 'ios',
        source: 'share',
        refCode: 'share-1',
      }),
    );
  });

  it('rejects an invalid type', async () => {
    mockCreate();

    const result = await recordLandingEvent(mockReq(), {
      type: 'waitlist_submit',
      visitorId: 'visitor-abc',
    });

    expect(result).toEqual({
      error: 'type must be view or store_click.',
      status: 400,
      code: 'INVALID_TYPE',
    });
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('rejects a missing visitorId', async () => {
    const result = await recordLandingEvent(mockReq(), { type: 'view' });
    expect(result.code).toBe('INVALID_VISITOR_ID');
  });

  it('rejects a visitorId longer than 64 characters', async () => {
    const result = await recordLandingEvent(mockReq(), {
      type: 'view',
      visitorId: 'v'.repeat(65),
    });
    expect(result.code).toBe('INVALID_VISITOR_ID');
  });

  it('rejects an unknown tenantKey', async () => {
    getTenantByKey.mockResolvedValue(null);
    mockCreate();

    const result = await recordLandingEvent(mockReq(), {
      type: 'view',
      tenantKey: 'missing',
      visitorId: 'visitor-abc',
    });

    expect(result).toEqual({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('rejects a campus tenantKey', async () => {
    getTenantByKey.mockResolvedValue({
      tenantKey: 'rpi',
      tenantType: 'campus',
      status: 'active',
    });
    mockCreate();

    const result = await recordLandingEvent(mockReq(), {
      type: 'view',
      tenantKey: 'rpi',
      visitorId: 'visitor-abc',
    });

    expect(result.code).toBe('TENANT_NOT_FOUND');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('rejects store_click without store', async () => {
    const result = await recordLandingEvent(mockReq(), {
      type: 'store_click',
      visitorId: 'visitor-abc',
    });
    expect(result.code).toBe('INVALID_STORE');
  });
});

describe('getLandingConfig (Task 2.3)', () => {
  const campus = {
    tenantKey: 'rpi',
    tenantType: 'campus',
    status: 'active',
    location: 'Troy, NY',
    name: 'RPI',
    mongoUri: 'mongodb://secret',
  };
  const waitlistCity = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    status: 'coming_soon',
    location: 'New York City',
    name: 'New York',
    landingMode: 'waitlist',
    mongoUri: 'mongodb://nyc-secret',
    pivotDropTimezone: 'America/New_York',
  };
  const launchedCity = {
    tenantKey: 'sf',
    tenantType: 'pivot',
    status: 'active',
    location: 'San Francisco',
    name: 'San Francisco',
    landingMode: 'launched',
  };
  const hiddenCity = {
    tenantKey: 'hidden-city',
    tenantType: 'pivot',
    status: 'hidden',
    location: 'Hidden City',
    landingMode: 'waitlist',
  };
  const unsetModeCity = {
    tenantKey: 'troy',
    tenantType: 'pivot',
    status: 'coming_soon',
    location: 'Troy',
    name: 'Troy',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getMergedTenants.mockResolvedValue([
      campus,
      waitlistCity,
      launchedCity,
      hiddenCity,
      unsetModeCity,
    ]);
    getTenantByKey.mockImplementation(async (_req, key) => {
      return (
        [campus, waitlistCity, launchedCity, hiddenCity, unsetModeCity].find(
          (row) => row.tenantKey === key,
        ) || null
      );
    });
  });

  it('returns waitlist and launched cities with landingMode and no admin fields', async () => {
    const result = await getLandingConfig(mockReq());

    expect(result.data.cities).toEqual([
      {
        tenantKey: 'nyc',
        cityDisplayName: 'New York City',
        landingMode: 'waitlist',
      },
      {
        tenantKey: 'sf',
        cityDisplayName: 'San Francisco',
        landingMode: 'launched',
      },
      {
        tenantKey: 'troy',
        cityDisplayName: 'Troy',
        landingMode: 'waitlist',
      },
    ]);
    result.data.cities.forEach((city) => {
      expect(city).not.toHaveProperty('mongoUri');
      expect(city).not.toHaveProperty('status');
      expect(city).not.toHaveProperty('pivotDropTimezone');
    });
  });

  it('omits hidden tenants from the default listing', async () => {
    const result = await getLandingConfig(mockReq());
    expect(result.data.cities.map((city) => city.tenantKey)).not.toContain('hidden-city');
    expect(result.data.cities.map((city) => city.tenantKey)).not.toContain('rpi');
  });

  it('includes a scoped tenantKey even when it is hidden from the listing', async () => {
    const result = await getLandingConfig(mockReq(), { tenantKey: 'hidden-city' });
    expect(result.data.cities).toEqual(
      expect.arrayContaining([
        {
          tenantKey: 'hidden-city',
          cityDisplayName: 'Hidden City',
          landingMode: 'waitlist',
        },
      ]),
    );
  });

  it('returns TENANT_NOT_FOUND for an unknown or campus tenantKey', async () => {
    const missing = await getLandingConfig(mockReq(), { tenantKey: 'paris' });
    expect(missing).toEqual({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const campusOnly = await getLandingConfig(mockReq(), { tenantKey: 'rpi' });
    expect(campusOnly.code).toBe('TENANT_NOT_FOUND');
  });
});

function mockLaunchAggregates({ eventFacet = {}, waitlistFacet = {}, qrScanRows = [] } = {}) {
  const eventAggregate = jest.fn().mockResolvedValue([eventFacet]);
  const waitlistAggregate = jest.fn().mockResolvedValue([waitlistFacet]);
  const qrAggregate = jest.fn().mockResolvedValue(qrScanRows);
  getGlobalModels.mockReturnValue({
    JustGoLandingEvent: { aggregate: eventAggregate },
    JustGoWaitlist: { aggregate: waitlistAggregate },
    JustGoLandingQr: { aggregate: qrAggregate },
  });
  return { eventAggregate, waitlistAggregate, qrAggregate };
}

describe('launch admin metrics (Task 4.1)', () => {
  const waitlistCity = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    status: 'coming_soon',
    location: 'New York City',
    name: 'New York',
    landingMode: 'waitlist',
  };
  const launchedCity = {
    tenantKey: 'sf',
    tenantType: 'pivot',
    status: 'active',
    location: 'San Francisco',
    name: 'San Francisco',
    landingMode: 'launched',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(waitlistCity);
    getMergedTenants.mockResolvedValue([waitlistCity, launchedCity]);
    upsertStoredTenantRow.mockResolvedValue({ ...waitlistCity, landingMode: 'launched' });
  });

  it('conversionRateForMode uses current mode (waitlist signups vs launched clicks)', () => {
    const mixed = { views: 10, waitlistSignups: 2, storeClicks: 5 };
    expect(conversionRateForMode('waitlist', mixed)).toBe(0.2);
    expect(conversionRateForMode('launched', mixed)).toBe(0.5);
    expect(conversionRateForMode('waitlist', { views: 0, waitlistSignups: 4 })).toBe(0);
  });

  it('parseLaunchRange defaults to the last 28 days', () => {
    const now = new Date('2026-08-19T18:00:00.000Z');
    const range = parseLaunchRange({}, now);
    expect(range.from.toISOString()).toBe('2026-07-22T18:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-08-19T18:00:00.000Z');
  });

  it('parseLaunchRange treats date-only to as end of UTC day', () => {
    const range = parseLaunchRange({ from: '2026-08-01', to: '2026-08-02' });
    expect(range.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-08-02T23:59:59.999Z');
  });

  it('city launch KPIs use current waitlist mode even if clicks outnumber signups', async () => {
    mockLaunchAggregates({
      eventFacet: {
        byType: [
          { _id: 'view', count: 10 },
          { _id: 'store_click', count: 5 },
        ],
        uniqueVisitors: [{ count: 7 }],
        bySourceType: [
          { _id: { source: 'direct', type: 'view' }, count: 8 },
          { _id: { source: 'share', type: 'view' }, count: 2 },
          { _id: { source: 'direct', type: 'store_click' }, count: 5 },
        ],
        uniqueBySource: [
          { _id: 'direct', visitors: ['a', 'b', 'c'] },
          { _id: 'share', visitors: ['d'] },
        ],
        series: [
          {
            _id: { day: '2026-08-18', type: 'view' },
            count: 10,
            visitors: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        ],
      },
      waitlistFacet: {
        total: [{ count: 2 }],
        bySource: [{ _id: 'direct', count: 2 }],
        series: [{ _id: '2026-08-18', count: 2 }],
        lastSignup: [{ createdAt: new Date('2026-08-18T12:00:00.000Z') }],
      },
    });

    const result = await getTenantLaunchStats(mockReq(), {
      tenantKey: 'nyc',
      from: '2026-08-18',
      to: '2026-08-18',
    });

    expect(result.error).toBeUndefined();
    expect(result.data.landingMode).toBe('waitlist');
    expect(result.data.publicUrl).toMatch(/\/nyc$/);
    expect(result.data.conversionNote).toBe(CONVERSION_USES_CURRENT_MODE_NOTE);
    expect(result.data.totals).toEqual({
      views: 10,
      uniqueVisitors: 7,
      waitlistSignups: 2,
      storeClicks: 5,
      conversionRate: 0.2,
    });
    expect(result.data.sources.direct.views).toBe(8);
    expect(result.data.sources.share.views).toBe(2);
    expect(result.data.sources.qr.views).toBe(0);
    expect(result.data.qr).toEqual({ scans: 0, views: 0, byName: [] });
    expect(result.data.series).toHaveLength(1);
    expect(result.data.series[0]).toEqual({
      date: '2026-08-18',
      views: 10,
      uniqueVisitors: 7,
      waitlistSignups: 2,
      storeClicks: 0,
    });
  });

  it('city launch KPIs switch conversion to store clicks when currently launched', async () => {
    getTenantByKey.mockResolvedValue(launchedCity);
    mockLaunchAggregates({
      eventFacet: {
        byType: [
          { _id: 'view', count: 10 },
          { _id: 'store_click', count: 5 },
        ],
        uniqueVisitors: [{ count: 4 }],
        bySourceType: [],
        uniqueBySource: [],
        series: [],
      },
      waitlistFacet: {
        total: [{ count: 2 }],
        bySource: [],
        series: [],
        lastSignup: [],
      },
    });

    const result = await getTenantLaunchStats(mockReq(), {
      tenantKey: 'sf',
      from: '2026-08-01',
      to: '2026-08-19',
    });

    expect(result.data.landingMode).toBe('launched');
    expect(result.data.totals.conversionRate).toBe(0.5);
  });

  it('returns TENANT_NOT_FOUND for campus or missing cities', async () => {
    getTenantByKey.mockResolvedValue({ tenantKey: 'rpi', tenantType: 'campus' });
    const campus = await getTenantLaunchStats(mockReq(), { tenantKey: 'rpi' });
    expect(campus.code).toBe('TENANT_NOT_FOUND');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('fleet rollup uses each city current mode and does not crash when empty', async () => {
    mockLaunchAggregates({
      eventFacet: {
        byTenantType: [
          { _id: { tenantKey: 'nyc', type: 'view' }, count: 10 },
          { _id: { tenantKey: 'nyc', type: 'store_click' }, count: 1 },
          { _id: { tenantKey: 'sf', type: 'view' }, count: 20 },
          { _id: { tenantKey: 'sf', type: 'store_click' }, count: 8 },
        ],
        uniqueByTenant: [
          { _id: 'nyc', count: 6 },
          { _id: 'sf', count: 9 },
        ],
        uniqueTotal: [{ count: 14 }],
      },
      waitlistFacet: {
        byTenant: [
          { _id: 'nyc', count: 4 },
          { _id: 'sf', count: 1 },
        ],
        lastSignupByTenant: [
          { _id: 'nyc', lastSignupAt: new Date('2026-08-10T00:00:00.000Z') },
        ],
      },
    });

    const result = await getFleetLaunchStats(mockReq(), {
      from: '2026-08-01',
      to: '2026-08-19',
    });

    expect(result.data.cities.map((row) => row.tenantKey)).toEqual(['nyc', 'sf']);
    expect(result.data.cities[0]).toEqual(
      expect.objectContaining({
        tenantKey: 'nyc',
        landingMode: 'waitlist',
        views: 10,
        waitlistSignups: 4,
        storeClicks: 1,
        conversionRate: 0.4,
        lastSignupAt: '2026-08-10T00:00:00.000Z',
      }),
    );
    expect(result.data.cities[1]).toEqual(
      expect.objectContaining({
        tenantKey: 'sf',
        landingMode: 'launched',
        views: 20,
        waitlistSignups: 1,
        storeClicks: 8,
        conversionRate: 0.4,
      }),
    );
    expect(result.data.totals.views).toBe(30);
    expect(result.data.totals.uniqueVisitors).toBe(14);
    expect(result.data.totals.waitlistSignups).toBe(5);
    expect(result.data.totals.storeClicks).toBe(9);
    // nyc waitlist 4 + sf launched 8 = 12 / 30 views
    expect(result.data.totals.conversionRate).toBe(0.4);

    getMergedTenants.mockResolvedValue([]);
    const empty = await getFleetLaunchStats(mockReq());
    expect(empty.data.cities).toEqual([]);
    expect(empty.data.totals.views).toBe(0);
  });

  it('joins QR hop scans with source=qr landing views without treating scans as conversion', async () => {
    mockLaunchAggregates({
      eventFacet: {
        byType: [
          { _id: 'view', count: 10 },
          { _id: 'store_click', count: 5 },
        ],
        uniqueVisitors: [{ count: 7 }],
        bySourceType: [
          { _id: { source: 'direct', type: 'view' }, count: 6 },
          { _id: { source: 'qr', type: 'view' }, count: 4 },
          { _id: { source: 'qr', type: 'store_click' }, count: 1 },
        ],
        uniqueBySource: [
          { _id: 'direct', visitors: ['a', 'b'] },
          { _id: 'qr', visitors: ['c', 'd', 'e'] },
        ],
        byQrNameType: [
          { _id: { qrName: 'poster-night', type: 'view' }, count: 4 },
          { _id: { qrName: 'poster-night', type: 'store_click' }, count: 1 },
        ],
        uniqueByQrName: [{ _id: 'poster-night', visitors: ['c', 'd', 'e'] }],
        series: [],
      },
      waitlistFacet: {
        total: [{ count: 2 }],
        bySource: [{ _id: 'qr', count: 2 }],
        byQrName: [{ _id: 'poster-night', count: 2 }],
        series: [],
        lastSignup: [],
      },
      qrScanRows: [{ _id: 'poster-night', scans: 6 }],
    });

    const result = await getTenantLaunchStats(mockReq(), {
      tenantKey: 'nyc',
      from: '2026-08-18',
      to: '2026-08-18',
    });

    expect(result.data.totals).toEqual({
      views: 10,
      uniqueVisitors: 7,
      waitlistSignups: 2,
      storeClicks: 5,
      conversionRate: 0.2,
    });
    expect(result.data.sources.qr).toEqual(
      expect.objectContaining({
        views: 4,
        waitlistSignups: 2,
        storeClicks: 1,
      }),
    );
    expect(result.data.qr).toEqual({
      scans: 6,
      views: 4,
      byName: [
        {
          qrName: 'poster-night',
          scans: 6,
          views: 4,
          uniqueVisitors: 3,
          waitlistSignups: 2,
          storeClicks: 1,
        },
      ],
    });
  });

  it('PATCH landingMode persists waitlist or launched', async () => {
    const result = await updateTenantLandingMode(mockReq(), {
      tenantKey: 'nyc',
      landingMode: 'launched',
    });
    expect(result.data).toEqual({
      tenantKey: 'nyc',
      landingMode: 'launched',
      publicUrl: expect.stringMatching(/\/nyc$/),
    });
    expect(upsertStoredTenantRow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantKey: 'nyc', landingMode: 'launched' }),
      null,
    );

    const invalid = await updateTenantLandingMode(mockReq(), {
      tenantKey: 'nyc',
      landingMode: 'preview',
    });
    expect(invalid).toEqual({
      error: 'landingMode must be waitlist or launched.',
      status: 400,
      code: 'INVALID_LANDING_MODE',
    });
  });
});

