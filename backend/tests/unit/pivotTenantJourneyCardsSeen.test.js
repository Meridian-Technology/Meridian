const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

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
  aggregateMedianCardsSeen,
  getJourneyOverview,
} = require('../../services/pivotTenantJourneyService');
const { isoWeekToUtcRange } = require('../../utilities/pivotIsoWeek');

const BATCH_WEEK = '2026-W28';

// The first query on a fresh in-memory Mongo also builds every tenant model's indexes.
jest.setTimeout(120000);

describe('median cards seen from deck impressions, on a real Mongo', () => {
  let server;
  const cities = {};
  const id = () => new mongoose.Types.ObjectId();
  const interactions = (tenantKey) =>
    getModels({ db: cities[tenantKey] }, 'PivotInteraction').PivotInteraction;
  const analyticsEvents = (tenantKey) =>
    getModels({ db: cities[tenantKey] }, 'AnalyticsEvent').AnalyticsEvent;

  function impressions(userId, eventIds, overrides = {}) {
    return eventIds.map((eventId) => ({
      userId,
      eventId,
      batchWeek: BATCH_WEEK,
      surface: 'deck',
      type: 'impression',
      ...overrides,
    }));
  }

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    for (const tenantKey of ['nyc', 'sf']) {
      cities[tenantKey] = await mongoose
        .createConnection(server.getUri(`pivot_${tenantKey}`))
        .asPromise();
    }
    connectToDatabase.mockImplementation(async (tenantKey) => cities[tenantKey]);
    resolvePivotTenant.mockImplementation(async (_req, tenantKey) => ({
      tenant: { tenantKey, location: tenantKey, name: tenantKey },
    }));
    aggregateTenantOverview.mockResolvedValue({
      cityDisplayName: 'New York City',
      activeUsers: 3,
      swipeCount: 0,
      interestedCount: 0,
      registeredCount: 0,
      externalOpenUsers: 0,
    });
  }, 60000);

  afterEach(async () => {
    await Promise.all(
      Object.keys(cities).flatMap((key) => [
        interactions(key).deleteMany({}),
        analyticsEvents(key).collection.deleteMany({}),
      ]),
    );
  });

  afterAll(async () => {
    await Promise.all(Object.values(cities).map((db) => db.close()));
    await server?.stop();
  });

  it('counts each card once per user, however many times it was shown', async () => {
    const [cardA, cardB, cardC, cardD] = [id(), id(), id(), id()];
    const [repeater, browser, skimmer] = [id(), id(), id()];

    await interactions('nyc').insertMany([
      // Five impressions of one card are one card seen.
      ...impressions(repeater, [cardA, cardA, cardA, cardA, cardA]),
      ...impressions(browser, [cardA, cardB, cardC, cardD, cardB]),
      ...impressions(skimmer, [cardA, cardB]),
    ]);

    // Per user: 1, 4, 2 distinct cards.
    expect(await aggregateMedianCardsSeen(interactions('nyc'), BATCH_WEEK)).toBe(2);
  });

  it('ignores other weeks, other surfaces and other interaction types', async () => {
    const [cardA, cardB, cardC] = [id(), id(), id()];
    const [userA, userB] = [id(), id()];

    await interactions('nyc').insertMany([
      ...impressions(userA, [cardA]),
      ...impressions(userB, [cardA, cardB, cardC]),
      ...impressions(userA, [cardB, cardC], { batchWeek: '2026-W27' }),
      ...impressions(userA, [cardB, cardC], { surface: 'explore' }),
      ...impressions(userA, [cardB, cardC], { type: 'interested' }),
      ...impressions(id(), [cardA], { type: 'dwell', ms: 1200 }),
    ]);

    expect(await aggregateMedianCardsSeen(interactions('nyc'), BATCH_WEEK)).toBe(2);
  });

  it('is null when the week has no deck impressions', async () => {
    expect(await aggregateMedianCardsSeen(interactions('nyc'), BATCH_WEEK)).toBeNull();
  });

  it('ignores pivot_card_view analytics events', async () => {
    const { start } = isoWeekToUtcRange(BATCH_WEEK);
    const ts = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const viewer = id();
    await interactions('nyc').insertMany(impressions(viewer, [id()]));
    // The old source: card views logged by the app in the same week and city.
    await analyticsEvents('nyc').collection.insertMany(
      Array.from({ length: 6 }, (_, index) => ({
        event: 'pivot_card_view',
        event_id: `card-view-${index}`,
        ts,
        user_id: String(viewer),
        properties: { batchWeek: BATCH_WEEK, eventId: String(id()) },
        app: 'justgo',
        env: 'prod',
      })),
    );

    expect(await aggregateMedianCardsSeen(interactions('nyc'), BATCH_WEEK)).toBe(1);
  });

  it('feeds the journey overview from the city database only', async () => {
    const [cardA, cardB, cardC] = [id(), id(), id()];

    await interactions('nyc').insertMany([
      ...impressions(id(), [cardA, cardA, cardA]),
      ...impressions(id(), [cardA, cardB, cardC]),
    ]);
    await interactions('sf').insertMany(
      impressions(id(), [id(), id(), id(), id(), id(), id(), id(), id()]),
    );

    const result = await getJourneyOverview({ globalDb: {} }, {
      tenantKey: 'nyc',
      batchWeek: BATCH_WEEK,
    });

    expect(connectToDatabase).toHaveBeenCalledWith('nyc');
    expect(result.data.kpis.medianCardsSeen).toBe(2);
  });
});
