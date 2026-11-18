const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const analyticsEventSchema = require('../../events/schemas/analyticsEvent');
const eventAnalyticsSchema = require('../../events/schemas/eventAnalytics');
const eventQRSchema = require('../../events/schemas/eventQR');
const { analyticsHash, keyDigest } = require('../../utilities/analyticsHash');
const {
  scrubAnalyticsIdentifiers,
  checkEventAnalyticsIndex,
} = require('../../services/analyticsPrivacyMigration');
const { anonymousVisitorKey } = require('../../services/eventViewService');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('analyticsPrivacyMigration', () => {
  const originalSecret = process.env.ANALYTICS_HASH_SECRET;
  let mongo;
  let models;

  beforeAll(async () => {
    process.env.ANALYTICS_HASH_SECRET = 'test-analytics-secret';
    mongo = await createMongoMemoryConnection();
    models = {
      AnalyticsEvent: getOrCreateModel(mongo.connection, 'AnalyticsEvent', analyticsEventSchema, 'analytics_events'),
      EventAnalytics: getOrCreateModel(mongo.connection, 'EventAnalytics', eventAnalyticsSchema, 'eventAnalytics'),
      EventQR: getOrCreateModel(mongo.connection, 'EventQR', eventQRSchema, 'event_qrs'),
    };
  });

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    else process.env.ANALYTICS_HASH_SECRET = originalSecret;
    await mongo.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  function analyticsEvent(overrides = {}) {
    return {
      schema_version: 1,
      event_id: crypto.randomUUID(),
      event: 'screen_view',
      ts: new Date('2026-09-01T00:00:00Z'),
      received_at: new Date('2026-09-01T00:00:00Z'),
      anonymous_id: 'anon-1',
      session_id: 'session-1',
      platform: 'web',
      app: 'justgo',
      app_version: '1.0.0',
      build: '1',
      env: 'prod',
      ...overrides,
    };
  }

  it('converts old IP hashes into what ingestion now writes for the same IP', async () => {
    const ip = '203.0.113.7';
    await models.AnalyticsEvent.collection.insertMany([
      analyticsEvent({ ip_hash: sha256(ip) }),
      analyticsEvent({ ip_hash: analyticsHash('198.51.100.2') }),
      analyticsEvent({ ip_hash: null }),
    ]);

    const counts = await scrubAnalyticsIdentifiers(models);

    expect(counts.ipHashes).toBe(1);
    const hashes = (await models.AnalyticsEvent.find().lean()).map((doc) => doc.ip_hash);
    expect(hashes).toEqual(expect.arrayContaining([
      analyticsHash(ip), analyticsHash('198.51.100.2'), null,
    ]));
  });

  it('rekeys QR scan visitor ids so repeat scans keep matching', async () => {
    const legacy = sha256('203.0.113.7Mozilla').slice(0, 32);
    await models.AnalyticsEvent.collection.insertMany([
      analyticsEvent({ event: 'event_qr_scan', anonymous_id: legacy }),
      analyticsEvent({ event: 'screen_view', anonymous_id: 'web-visitor-uuid' }),
    ]);
    await models.EventQR.collection.insertOne({
      eventId: new mongoose.Types.ObjectId(),
      shortId: 'abc',
      scanHistory: [{ timestamp: new Date(), anonymousId: legacy }],
    });

    await scrubAnalyticsIdentifiers(models);

    const qrEvent = await models.AnalyticsEvent.findOne({ event: 'event_qr_scan' }).lean();
    const webEvent = await models.AnalyticsEvent.findOne({ event: 'screen_view' }).lean();
    const qr = await models.EventQR.collection.findOne({ shortId: 'abc' });
    expect(qrEvent.anonymous_id).toBe(keyDigest(legacy));
    expect(webEvent.anonymous_id).toBe('web-visitor-uuid');
    expect(qr.scanHistory[0].anonymousId).toBe(keyDigest(legacy));
  });

  it('removes raw IPs and user agents from view history and rekeys visitor ids', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const rawVisitor = '203.0.113.7-Mozilla/5.0 (iPhone)';
    await models.EventAnalytics.collection.insertOne({
      eventId,
      anonymousViews: 2,
      viewHistory: [
        {
          _id: new mongoose.Types.ObjectId(),
          isAnonymous: true,
          anonymousId: rawVisitor,
          timestamp: new Date('2026-09-01T00:00:00Z'),
          ipAddress: '203.0.113.7',
          userAgent: 'Mozilla/5.0 (iPhone)',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          isAnonymous: false,
          userId: new mongoose.Types.ObjectId(),
          anonymousId: null,
          timestamp: new Date('2026-09-02T00:00:00Z'),
          ipAddress: '198.51.100.2',
          userAgent: 'Safari',
        },
      ],
    });

    const counts = await scrubAnalyticsIdentifiers(models);

    expect(counts.viewHistoryDocs).toBe(1);
    expect(counts.viewHistoryEntries).toBe(2);
    const doc = await models.EventAnalytics.collection.findOne({ eventId });
    expect(JSON.stringify(doc)).not.toMatch(/203\.0\.113\.7|198\.51\.100\.2|Mozilla|Safari/);
    expect(doc.viewHistory).toHaveLength(2);
    expect(doc.anonymousViews).toBe(2);

    // The same visitor arriving now produces the migrated id.
    const req = { ip: '203.0.113.7', headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } };
    expect(doc.viewHistory[0].anonymousId).toBe(anonymousVisitorKey(req));
  });

  it('is a no-op the second time and in dry-run', async () => {
    await models.AnalyticsEvent.collection.insertOne(analyticsEvent({ ip_hash: sha256('203.0.113.7') }));

    const dry = await scrubAnalyticsIdentifiers(models, { dryRun: true });
    expect(dry.ipHashes).toBe(1);
    expect((await models.AnalyticsEvent.findOne().lean()).ip_hash).toBe(sha256('203.0.113.7'));

    await scrubAnalyticsIdentifiers(models);
    const second = await scrubAnalyticsIdentifiers(models);
    expect(second.ipHashes).toBe(0);
  });

  it('refuses to run without a hash key', async () => {
    const saved = { secret: process.env.ANALYTICS_HASH_SECRET, jwt: process.env.JWT_SECRET };
    delete process.env.ANALYTICS_HASH_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(scrubAnalyticsIdentifiers(models)).rejects.toThrow(/ANALYTICS_HASH_SECRET/);
    } finally {
      process.env.ANALYTICS_HASH_SECRET = saved.secret;
      if (saved.jwt !== undefined) process.env.JWT_SECRET = saved.jwt;
    }
  });

  it('reports an eventId index that is not unique', async () => {
    await models.EventAnalytics.syncIndexes();
    expect(await checkEventAnalyticsIndex(models.EventAnalytics)).toEqual({ ok: true });

    await models.EventAnalytics.collection.dropIndex('eventId_1');
    await models.EventAnalytics.collection.createIndex({ eventId: 1 });
    const eventId = new mongoose.Types.ObjectId();
    await models.EventAnalytics.collection.insertMany([{ eventId }, { eventId }]);

    expect(await checkEventAnalyticsIndex(models.EventAnalytics)).toEqual({
      ok: false, hasIndex: true, duplicateEventIds: 1,
    });
  });

  it('works on a connection that is still opening, like a freshly opened city database', async () => {
    const seed = mongo.connection.useDb('city_opening');
    await seed.collection('analytics_events').insertOne(analyticsEvent({ ip_hash: sha256('203.0.113.7') }));

    const opening = mongoose.createConnection(mongo.mongoServer.getUri('city_opening'));
    try {
      const cityModels = {
        AnalyticsEvent: getOrCreateModel(opening, 'AnalyticsEvent', analyticsEventSchema, 'analytics_events'),
        EventAnalytics: getOrCreateModel(opening, 'EventAnalytics', eventAnalyticsSchema, 'eventAnalytics'),
        EventQR: getOrCreateModel(opening, 'EventQR', eventQRSchema, 'event_qrs'),
      };

      const counts = await scrubAnalyticsIdentifiers(cityModels);
      expect(counts.ipHashes).toBe(1);
      expect(await checkEventAnalyticsIndex(cityModels.EventAnalytics)).toMatchObject({ ok: true });
    } finally {
      await opening.close();
      await seed.dropDatabase();
    }
  });
});
