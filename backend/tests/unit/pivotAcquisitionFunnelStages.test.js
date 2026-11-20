const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const {
  getAcquisitionFunnel,
  parseAcquisitionMonth,
} = require('../../services/pivotAcquisitionFunnelService');

const MONTH = '2026-09';
const { start, end } = parseAcquisitionMonth(MONTH);
const MIDMONTH = new Date('2026-09-15T12:00:00.000Z');
const LAST_MONTH = new Date(start.getTime() - 1);
const BATCH_WEEK = '2026-W38';
const CITY_KEYS = ['nyc', 'sf'];

// The first query on a fresh in-memory Mongo also builds every model's indexes.
jest.setTimeout(120000);

describe('acquisition funnel app stages, on a real Mongo', () => {
  let server;
  let globalDb;
  const cities = {};
  const id = () => new mongoose.Types.ObjectId();
  const req = () => ({ globalDb });
  const cityModels = (tenantKey) =>
    getModels({ db: cities[tenantKey] }, 'User', 'PivotEventIntent');
  const stage = (result, key) => result.data.stages.find((row) => row.key === key);

  function membership(tenantKey, createdAt, status = 'active') {
    return { globalUserId: id(), tenantKey, tenantUserId: id(), status, createdAt };
  }

  function intent(userId, createdAt, status = 'interested') {
    return { userId, eventId: id(), batchWeek: BATCH_WEEK, status, createdAt, updatedAt: createdAt };
  }

  async function cityFunnel(tenantKey) {
    return getAcquisitionFunnel(req(), { tenantKey, month: MONTH });
  }

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    globalDb = await mongoose.createConnection(server.getUri('platform')).asPromise();
    for (const tenantKey of CITY_KEYS) {
      cities[tenantKey] = await mongoose
        .createConnection(server.getUri(`pivot_${tenantKey}`))
        .asPromise();
    }
    connectToDatabase.mockImplementation(async (tenantKey) => cities[tenantKey]);
    resolvePivotTenant.mockImplementation(async (_req, tenantKey) => ({
      tenant: { tenantKey, location: tenantKey, name: tenantKey, tenantType: 'pivot' },
    }));
    getMergedTenants.mockResolvedValue([
      ...CITY_KEYS.map((tenantKey) => ({ tenantKey, tenantType: 'pivot' })),
      { tenantKey: 'rpi', tenantType: 'campus' },
    ]);
  }, 60000);

  afterEach(async () => {
    const { TenantMembership, JustGoLandingEvent } = getGlobalModels(
      req(),
      'TenantMembership',
      'JustGoLandingEvent',
    );
    await Promise.all([
      TenantMembership.deleteMany({}),
      JustGoLandingEvent.collection.deleteMany({}),
      ...CITY_KEYS.flatMap((key) => {
        const { User, PivotEventIntent } = cityModels(key);
        return [User.deleteMany({}), PivotEventIntent.deleteMany({})];
      }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([globalDb, ...Object.values(cities)].map((db) => db?.close()));
    await server?.stop();
  });

  it('counts joined city from active memberships created in the month', async () => {
    const { TenantMembership } = getGlobalModels(req(), 'TenantMembership');
    // Raw inserts keep the createdAt we set.
    await TenantMembership.collection.insertMany([
      membership('nyc', start),
      membership('nyc', MIDMONTH),
      membership('nyc', MIDMONTH, 'left'),
      membership('nyc', MIDMONTH, 'invited'),
      membership('nyc', LAST_MONTH),
      membership('nyc', end),
      membership('sf', MIDMONTH),
      membership('rpi', MIDMONTH),
    ]);

    const nyc = stage(await cityFunnel('nyc'), 'joined');
    expect(nyc).toMatchObject({
      label: 'Joined city',
      unique: 2,
      events: 2,
      source: 'tenant_memberships.createdAt (status=active)',
    });
    expect(stage(await cityFunnel('sf'), 'joined').unique).toBe(1);
  });

  it('counts onboarding from users who confirmed 18+ in the month', async () => {
    const { User } = cityModels('nyc');
    await User.insertMany([
      { email: 'start@example.com', pivotAgeVerifiedAt: start },
      { email: 'mid@example.com', pivotAgeVerifiedAt: MIDMONTH },
      { email: 'last-month@example.com', pivotAgeVerifiedAt: LAST_MONTH },
      { email: 'next-month@example.com', pivotAgeVerifiedAt: end },
      { email: 'unverified@example.com' },
    ]);

    expect(stage(await cityFunnel('nyc'), 'onboarding')).toMatchObject({
      label: 'Onboarding',
      unique: 2,
      events: 2,
      source: 'users.pivotAgeVerifiedAt',
    });
  });

  it('counts first deck decision from each user\'s first intent', async () => {
    const [firstPass, firstGoing, manyThisMonth, returning, later] = [id(), id(), id(), id(), id()];
    const { PivotEventIntent } = cityModels('nyc');
    await PivotEventIntent.collection.insertMany([
      intent(firstPass, MIDMONTH, 'passed'),
      intent(firstGoing, start, 'registered'),
      intent(manyThisMonth, MIDMONTH),
      intent(manyThisMonth, new Date(MIDMONTH.getTime() + 60000), 'passed'),
      // Decided last month too, so this month's intent is not their first.
      intent(returning, LAST_MONTH),
      intent(returning, MIDMONTH),
      intent(later, end),
    ]);

    expect(stage(await cityFunnel('nyc'), 'deck')).toMatchObject({
      label: 'First deck decision',
      unique: 3,
      events: 3,
      source: 'pivotEventIntents (first createdAt per user)',
    });
  });

  it('adds the cities together for the fleet and keeps the landing stages', async () => {
    const { TenantMembership, JustGoLandingEvent } = getGlobalModels(
      req(),
      'TenantMembership',
      'JustGoLandingEvent',
    );
    const sameGlobalUser = id();
    await TenantMembership.collection.insertMany([
      // One person joining two cities counts in each.
      { ...membership('nyc', MIDMONTH), globalUserId: sameGlobalUser },
      { ...membership('sf', MIDMONTH), globalUserId: sameGlobalUser },
      membership('sf', MIDMONTH),
      membership('rpi', MIDMONTH),
    ]);
    await JustGoLandingEvent.collection.insertMany([
      { type: 'view', visitorId: 'v1', tenantKey: 'nyc', createdAt: MIDMONTH },
      { type: 'view', visitorId: 'v1', tenantKey: 'nyc', createdAt: MIDMONTH },
      { type: 'view', visitorId: 'v2', tenantKey: 'sf', createdAt: MIDMONTH },
      { type: 'view', visitorId: 'v3', tenantKey: null, createdAt: MIDMONTH },
      { type: 'store_click', visitorId: 'v1', tenantKey: 'nyc', createdAt: MIDMONTH },
    ]);
    await cityModels('nyc').User.create({ email: 'a@example.com', pivotAgeVerifiedAt: MIDMONTH });
    await cityModels('sf').User.create({ email: 'b@example.com', pivotAgeVerifiedAt: MIDMONTH });
    await cityModels('nyc').PivotEventIntent.collection.insertOne(intent(id(), MIDMONTH));
    await cityModels('sf').PivotEventIntent.collection.insertMany([
      intent(id(), MIDMONTH),
      intent(id(), MIDMONTH, 'passed'),
    ]);

    const result = await getAcquisitionFunnel(req(), { scope: 'fleet', month: MONTH });

    expect(result.data.scope).toBe('fleet');
    expect(result.data.stages.map((row) => [row.key, row.unique])).toEqual([
      ['landing', 3],
      ['store_click', 1],
      ['joined', 3],
      ['onboarding', 2],
      ['deck', 3],
    ]);
    expect(stage(result, 'landing').events).toBe(4);
    expect(stage(result, 'joined').conversionFromPrev).toBe(3);
    expect(result.data.overall).toEqual({ from: 'landing', to: 'deck', rate: 1 });
  });
});
