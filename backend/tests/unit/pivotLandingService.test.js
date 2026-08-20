jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  getMergedTenants: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey, getMergedTenants } = require('../../services/tenantConfigService');
const { recordLandingEvent, getLandingConfig } = require('../../services/pivotLandingService');

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

