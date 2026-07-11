jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotAdminOverviewService', () => ({
  aggregateTenantOverview: jest.fn(),
  buildFunnelStages: jest.requireActual('../../services/pivotAdminOverviewService')
    .buildFunnelStages,
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { aggregateTenantOverview } = require('../../services/pivotAdminOverviewService');
const {
  parseFunnelSteps,
  resolveFunnelEventName,
  getJourneyOverview,
  getJourneyFunnel,
  getUserJourneyHistory,
  wipeUserWeekIntents,
  searchJourneyUsers,
  WIPE_CONFIRM_TOKEN,
  median,
} = require('../../services/pivotTenantJourneyService');

const TENANT = { tenantKey: 'nyc', location: 'New York City', name: 'NYC' };
const BATCH_WEEK = '2026-W28';
const USER_A = '507f191e810c19729de860eb';
const USER_B = '507f191e810c19729de860ec';
const EVENT_A = '665a1b2c3d4e5f6789012345';

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: {
      email: 'ops@meridian.app',
      globalUserId: '507f191e810c19729de860ea',
    },
    ...overrides,
  };
}

function chainFind(docs) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  };
}

describe('parseFunnelSteps / resolveFunnelEventName', () => {
  it('maps plan aliases to real pivot event names', () => {
    expect(resolveFunnelEventName('deck_open')).toBe('pivot_card_view');
    expect(resolveFunnelEventName('card_interested')).toBe('pivot_card_interested');
    expect(resolveFunnelEventName('external_open')).toBe('pivot_external_open');
    expect(resolveFunnelEventName('registered')).toBe('pivot_confirm_registered');
  });

  it('defaults to deck_open → registered steps', () => {
    const result = parseFunnelSteps();
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.event)).toEqual([
      'pivot_card_view',
      'pivot_card_interested',
      'pivot_external_open',
      'pivot_confirm_registered',
    ]);
  });

  it('rejects unknown steps', () => {
    expect(parseFunnelSteps('nope').code).toBe('INVALID_STEPS');
  });
});

describe('median', () => {
  it('returns null for empty and median for odd/even', () => {
    expect(median([])).toBeNull();
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('getJourneyOverview', () => {
  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();
    aggregateTenantOverview.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    aggregateTenantOverview.mockResolvedValue({
      tenantKey: 'nyc',
      cityDisplayName: 'New York City',
      activeUsers: 10,
      swipeCount: 40,
      interestedCount: 8,
      registeredCount: 4,
      externalOpenUsers: 6,
    });
    getModels.mockReturnValue({
      AnalyticsEvent: {
        aggregate: jest.fn().mockResolvedValue([
          { _id: USER_A, cardsSeen: 2 },
          { _id: USER_B, cardsSeen: 8 },
        ]),
      },
    });
  });

  it('returns compact KPIs and conversion rates for one tenant', async () => {
    const result = await getJourneyOverview(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.tenantKey).toBe('nyc');
    expect(result.data.batchWeek).toBe(BATCH_WEEK);
    expect(result.data.kpis.activeUsers).toBe(10);
    expect(result.data.kpis.medianCardsSeen).toBe(5);
    expect(result.data.kpis.interestedCount).toBe(12);
    expect(result.data.funnel.map((s) => s.key)).toEqual([
      'swipes',
      'interested',
      'openers',
      'going',
    ]);
    expect(result.data.conversionRates.interestRate).toBe(0.3);
  });

  it('returns 404 for unknown tenant', async () => {
    resolvePivotTenant.mockResolvedValue({
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    const result = await getJourneyOverview(mockReq(), {
      tenantKey: 'missing',
      batchWeek: BATCH_WEEK,
    });
    expect(result.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('getJourneyFunnel', () => {
  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();
    aggregateTenantOverview.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    aggregateTenantOverview.mockResolvedValue({
      tenantKey: 'nyc',
      cityDisplayName: 'New York City',
      activeUsers: 5,
      swipeCount: 20,
      interestedCount: 6,
      registeredCount: 2,
      externalOpenUsers: 3,
    });
  });

  it('returns pivot-named analytics steps for the city', async () => {
    getModels.mockReturnValue({
      AnalyticsEvent: {
        aggregate: jest.fn().mockResolvedValue([
          {
            _id: USER_A,
            stream: [
              'pivot_card_view',
              'pivot_card_interested',
              'pivot_external_open',
              'pivot_confirm_registered',
            ],
          },
          {
            _id: USER_B,
            stream: ['pivot_card_view', 'pivot_card_interested'],
          },
        ]),
      },
    });

    const result = await getJourneyFunnel(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.steps.map((s) => s.event)).toEqual([
      'pivot_card_view',
      'pivot_card_interested',
      'pivot_external_open',
      'pivot_confirm_registered',
    ]);
    expect(result.data.steps[0].count).toBe(2);
    expect(result.data.steps[1].count).toBe(2);
    expect(result.data.steps[2].count).toBe(1);
    expect(result.data.steps[3].count).toBe(1);
    expect(result.data.intentFunnel).toHaveLength(4);
  });
});

describe('getUserJourneyHistory', () => {
  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
  });

  it('returns intents for a week with event enrichment', async () => {
    const User = {
      findById: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: USER_A,
          name: 'Ada',
          username: 'ada',
          picture: null,
        }),
      })),
    };
    const PivotEventIntent = {
      find: jest.fn(() =>
        chainFind([
          {
            eventId: EVENT_A,
            batchWeek: BATCH_WEEK,
            status: 'interested',
            timeSlotId: null,
            externalOpenAt: null,
            externalOpenCount: 0,
            updatedAt: new Date('2026-07-08T12:00:00.000Z'),
            createdAt: new Date('2026-07-08T12:00:00.000Z'),
          },
        ]),
      ),
    };
    const Event = {
      find: jest.fn(() =>
        chainFind([
          {
            _id: EVENT_A,
            name: 'Rooftop Jazz',
            start_time: new Date('2026-07-10T23:00:00.000Z'),
            customFields: { pivot: { batchWeek: BATCH_WEEK, ingestStatus: 'published' } },
          },
        ]),
      ),
    };
    const AnalyticsEvent = {
      find: jest.fn(() => chainFind([])),
    };
    getModels.mockReturnValue({ User, PivotEventIntent, Event, AnalyticsEvent });

    const result = await getUserJourneyHistory(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.user.name).toBe('Ada');
    expect(result.data.intents).toHaveLength(1);
    expect(result.data.intents[0]).toMatchObject({
      eventId: EVENT_A,
      eventName: 'Rooftop Jazz',
      status: 'interested',
      batchWeek: BATCH_WEEK,
    });
    expect(PivotEventIntent.find).toHaveBeenCalledWith({
      userId: expect.anything(),
      batchWeek: BATCH_WEEK,
    });
  });
});

describe('searchJourneyUsers', () => {
  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
  });

  it('searches by name and attaches intent counts for the week', async () => {
    const User = {
      find: jest.fn(() =>
        chainFind([
          { _id: USER_A, name: 'Ada Lovelace', username: 'ada', picture: null },
          { _id: USER_B, name: 'Ada Other', username: 'ada2', picture: null },
        ]),
      ),
    };
    const PivotEventIntent = {
      aggregate: jest.fn().mockResolvedValue([{ _id: USER_A, count: 3 }]),
    };
    getModels.mockReturnValue({ User, PivotEventIntent });

    const result = await searchJourneyUsers(mockReq(), {
      tenantKey: 'nyc',
      query: 'Ada',
      batchWeek: BATCH_WEEK,
    });

    expect(result.data.mode).toBe('search');
    expect(result.data.users[0].userId).toBe(USER_A);
    expect(result.data.users[0].intentCount).toBe(3);
    expect(result.data.users[1].intentCount).toBe(0);
  });

  it('lists most active users when query is empty', async () => {
    const User = {
      find: jest.fn(() =>
        chainFind([
          { _id: USER_B, name: 'Bob', username: 'bob', picture: null },
          { _id: USER_A, name: 'Ada', username: 'ada', picture: null },
        ]),
      ),
    };
    const PivotEventIntent = {
      aggregate: jest
        .fn()
        .mockResolvedValue([
          { _id: USER_A, count: 5 },
          { _id: USER_B, count: 2 },
        ]),
    };
    getModels.mockReturnValue({ User, PivotEventIntent });

    const result = await searchJourneyUsers(mockReq(), {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
    });

    expect(result.data.mode).toBe('active');
    expect(result.data.users).toEqual([
      {
        userId: USER_A,
        name: 'Ada',
        username: 'ada',
        picture: null,
        intentCount: 5,
      },
      {
        userId: USER_B,
        name: 'Bob',
        username: 'bob',
        picture: null,
        intentCount: 2,
      },
    ]);
    expect(PivotEventIntent.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        { $match: { batchWeek: BATCH_WEEK } },
        { $sort: { count: -1 } },
      ]),
    );
  });
});

describe('wipeUserWeekIntents', () => {
  beforeEach(() => {
    getModels.mockReset();
    connectToDatabase.mockReset();
    resolvePivotTenant.mockReset();

    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
  });

  it('requires confirm token', async () => {
    const result = await wipeUserWeekIntents(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
      confirm: 'nope',
    });
    expect(result.status).toBe(400);
    expect(result.code).toBe('CONFIRM_REQUIRED');
  });

  it('deletes only that user+week intents', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
    getModels.mockReturnValue({
      User: { exists: jest.fn().mockResolvedValue(true) },
      PivotEventIntent: { deleteMany },
    });

    const result = await wipeUserWeekIntents(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
      confirm: WIPE_CONFIRM_TOKEN,
    });

    expect(result.data).toEqual({
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
      deletedCount: 2,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      userId: expect.anything(),
      batchWeek: BATCH_WEEK,
    });
    expect(String(deleteMany.mock.calls[0][0].userId)).toBe(USER_A);
  });

  it('does not touch other users or weeks (filter isolation)', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    getModels.mockReturnValue({
      User: { exists: jest.fn().mockResolvedValue(true) },
      PivotEventIntent: { deleteMany },
    });

    await wipeUserWeekIntents(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
      confirm: 'WIPE',
    });

    const filter = deleteMany.mock.calls[0][0];
    expect(Object.keys(filter).sort()).toEqual(['batchWeek', 'userId']);
    expect(String(filter.userId)).toBe(USER_A);
    expect(filter.batchWeek).toBe(BATCH_WEEK);
    expect(filter.userId).not.toEqual(expect.objectContaining({ $in: expect.anything() }));
  });

  it('returns 404 when user is missing', async () => {
    getModels.mockReturnValue({
      User: { exists: jest.fn().mockResolvedValue(false) },
      PivotEventIntent: { deleteMany: jest.fn() },
    });

    const result = await wipeUserWeekIntents(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_A,
      batchWeek: BATCH_WEEK,
      confirm: 'WIPE',
    });
    expect(result.code).toBe('USER_NOT_FOUND');
  });
});
