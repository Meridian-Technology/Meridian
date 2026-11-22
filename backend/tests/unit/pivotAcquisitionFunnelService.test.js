jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(async (key) => ({
    id: `db-${key}`,
    model: () => null,
  })),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: jest.fn((row) => row?.tenantType === 'pivot' || row?.pivotPilot),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const {
  getAcquisitionFunnel,
  parseAcquisitionMonth,
  ACQUISITION_STAGES,
  rateOrNull,
} = require('../../services/pivotAcquisitionFunnelService');

const TENANT = { tenantKey: 'nyc', location: 'New York City', name: 'NYC', pivotPilot: true };
const MONTH = '2026-09';

function mockReq() {
  return { globalDb: { id: 'platform', model: () => null } };
}

function facetResult(unique, events) {
  return [
    {
      unique: unique ? [{ count: unique }] : [],
      events: events ? [{ count: events }] : [],
    },
  ];
}

describe('parseAcquisitionMonth', () => {
  it('defaults to the current UTC month and builds a half-open range', () => {
    const result = parseAcquisitionMonth(undefined, new Date('2026-09-20T22:00:00.000Z'));
    expect(result.month).toBe('2026-09');
    expect(result.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(result.label).toBe('September 2026');
  });

  it('rejects invalid month strings', () => {
    expect(parseAcquisitionMonth('2026-W38').code).toBe('INVALID_MONTH');
  });
});

describe('rateOrNull', () => {
  it('returns a thousandths rate and null when the denominator is 0', () => {
    expect(rateOrNull(3, 10)).toBe(0.3);
    expect(rateOrNull(1, 0)).toBeNull();
  });
});

describe('getAcquisitionFunnel', () => {
  beforeEach(() => {
    getGlobalModels.mockReset();
    getModels.mockReset();
    resolvePivotTenant.mockReset();
    getMergedTenants.mockReset();
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    getMergedTenants.mockResolvedValue([TENANT, { tenantKey: 'rpi', tenantType: 'campus' }]);
  });

  it('rejects an invalid month before querying', async () => {
    const result = await getAcquisitionFunnel(mockReq(), {
      tenantKey: 'nyc',
      month: 'nope',
    });
    expect(result.code).toBe('INVALID_MONTH');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('keeps the landing stages when the app stages cannot be read', async () => {
    const landingAggregate = jest
      .fn()
      .mockResolvedValueOnce(facetResult(100, 140))
      .mockResolvedValueOnce(facetResult(40, 55));
    getGlobalModels.mockImplementation((_req, name) => {
      if (name === 'JustGoLandingEvent') {
        return { JustGoLandingEvent: { aggregate: landingAggregate } };
      }
      throw new Error('global db unavailable');
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getAcquisitionFunnel(mockReq(), {
      tenantKey: 'nyc',
      month: MONTH,
    });
    const { start, end } = parseAcquisitionMonth(MONTH);
    consoleError.mockRestore();

    expect(result.data.stages.map((s) => s.key)).toEqual(
      ACQUISITION_STAGES.map((s) => s.key),
    );
    expect(ACQUISITION_STAGES.map((s) => s.key)).toEqual([
      'landing',
      'store_click',
      'joined',
      'onboarding',
      'deck',
    ]);
    expect(result.data.stages.map((s) => s.unique)).toEqual([100, 40, 0, 0, 0]);
    expect(landingAggregate.mock.calls[0][0][0].$match).toEqual({
      type: 'view',
      tenantKey: 'nyc',
      createdAt: { $gte: start, $lt: end },
    });
  });
});
