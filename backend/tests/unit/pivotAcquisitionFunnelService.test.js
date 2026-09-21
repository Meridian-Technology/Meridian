jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
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
  INSTALL_EVENTS,
  DECK_EVENTS,
  rateOrNull,
} = require('../../services/pivotAcquisitionFunnelService');

const TENANT = { tenantKey: 'nyc', location: 'New York City', name: 'NYC', pivotPilot: true };
const USER_A = '507f191e810c19729de860eb';
const MONTH = '2026-09';

function mockReq() {
  return { globalDb: { id: 'platform' } };
}

function facetResult(unique, events) {
  return [
    {
      unique: unique ? [{ count: unique }] : [],
      events: events ? [{ count: events }] : [],
    },
  ];
}

function mockLandingAndMembership({ landingAggregate, cityUserIds = [USER_A] }) {
  getGlobalModels.mockImplementation((_req, name) => {
    if (name === 'JustGoLandingEvent') {
      return { JustGoLandingEvent: { aggregate: landingAggregate } };
    }
    if (name === 'TenantMembership') {
      return {
        TenantMembership: { distinct: jest.fn().mockResolvedValue(cityUserIds) },
      };
    }
    return {};
  });
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

  it('scopes city events to the UTC month and first deck swipe per person', async () => {
    const landingAggregate = jest
      .fn()
      .mockResolvedValueOnce(facetResult(100, 140))
      .mockResolvedValueOnce(facetResult(40, 55));
    const analyticsAggregate = jest
      .fn()
      .mockResolvedValueOnce(facetResult(25, 80))
      .mockResolvedValueOnce(facetResult(18, 18))
      .mockResolvedValueOnce([{ count: 12 }]);

    mockLandingAndMembership({ landingAggregate });
    getModels.mockReturnValue({
      AnalyticsEvent: { aggregate: analyticsAggregate },
    });

    const result = await getAcquisitionFunnel(mockReq(), {
      tenantKey: 'nyc',
      month: MONTH,
    });
    const { start, end } = parseAcquisitionMonth(MONTH);

    expect(result.data.month).toBe(MONTH);
    expect(result.data.range.label).toBe('September 2026');
    expect(result.data.stages.map((s) => s.key)).toEqual(
      ACQUISITION_STAGES.map((s) => s.key),
    );
    expect(result.data.stages.map((s) => s.unique)).toEqual([100, 40, 25, 18, 12]);
    expect(result.data.stages[4].events).toBe(12);
    expect(landingAggregate.mock.calls[0][0][0].$match).toEqual({
      type: 'view',
      tenantKey: 'nyc',
      createdAt: { $gte: start, $lt: end },
    });
    expect(analyticsAggregate.mock.calls[0][0][0].$match.event.$in).toEqual(INSTALL_EVENTS);
    expect(analyticsAggregate.mock.calls[0][0][0].$match.ts).toEqual({ $gte: start, $lt: end });

    const deckPipeline = analyticsAggregate.mock.calls[2][0];
    expect(deckPipeline[0].$match.event.$in).toEqual(DECK_EVENTS);
    expect(deckPipeline[0].$match.ts).toBeUndefined();
    expect(deckPipeline[1].$group.firstTs).toEqual({ $min: '$ts' });
    expect(deckPipeline[2].$match.firstTs).toEqual({ $gte: start, $lt: end });
  });

  it('aggregates fleet landing including unattributed views', async () => {
    const landingAggregate = jest
      .fn()
      .mockResolvedValueOnce(facetResult(200, 300))
      .mockResolvedValueOnce(facetResult(50, 60));
    const analyticsAggregate = jest
      .fn()
      .mockResolvedValueOnce(facetResult(80, 200))
      .mockResolvedValueOnce(facetResult(40, 40))
      .mockResolvedValueOnce([{ count: 30 }]);

    mockLandingAndMembership({ landingAggregate });
    getModels.mockReturnValue({
      AnalyticsEvent: { aggregate: analyticsAggregate },
    });

    const result = await getAcquisitionFunnel(mockReq(), {
      scope: 'fleet',
      month: MONTH,
    });

    expect(resolvePivotTenant).not.toHaveBeenCalled();
    expect(result.data.scope).toBe('fleet');
    expect(result.data.stages[0].unique).toBe(200);
    expect(landingAggregate.mock.calls[0][0][0].$match.$or).toEqual([
      { tenantKey: { $in: ['nyc'] } },
      { tenantKey: null },
    ]);
  });
});
