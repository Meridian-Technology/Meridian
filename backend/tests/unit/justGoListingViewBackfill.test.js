const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const analyticsEventSchema = require('../../events/schemas/analyticsEvent');
const eventAnalyticsSchema = require('../../events/schemas/eventAnalytics');
const { analyticsHash } = require('../../utilities/analyticsHash');
const {
  BACKFILL_SOURCE,
  createListingViewBackfill,
  createTenantResolver,
} = require('../../services/justGoListingViewBackfill');
const { recordJustGoListingView } = require('../../services/eventViewService');

describe('justGoListingViewBackfill', () => {
  const originalSecret = process.env.ANALYTICS_HASH_SECRET;
  let mongo;
  let AnalyticsEvent;
  let EventAnalytics;

  beforeAll(async () => {
    process.env.ANALYTICS_HASH_SECRET = 'test-analytics-secret';
    mongo = await createMongoMemoryConnection();
    AnalyticsEvent = getOrCreateModel(mongo.connection, 'AnalyticsEvent', analyticsEventSchema, 'analytics_events');
    EventAnalytics = getOrCreateModel(mongo.connection, 'EventAnalytics', eventAnalyticsSchema, 'eventAnalytics');
    await EventAnalytics.init();
  });

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    else process.env.ANALYTICS_HASH_SECRET = originalSecret;
    await mongo.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  function viewEvent(eventId, overrides = {}) {
    return {
      schema_version: 1,
      event_id: crypto.randomUUID(),
      event: 'justgo_public_event_view',
      ts: new Date('2026-09-01T00:00:00Z'),
      received_at: new Date('2026-09-01T00:00:00Z'),
      anonymous_id: 'visitor-1234-abcd',
      session_id: 'session-1',
      platform: 'web',
      app: 'meridian',
      app_version: '1.0.0',
      build: '1',
      env: 'prod',
      properties: { event_id: String(eventId), source: 'direct', platform: 'ios' },
      ...overrides,
    };
  }

  async function runBackfill(overrides = {}) {
    const backfill = createListingViewBackfill({
      resolveTenant: async () => 'oakland',
      eventAnalyticsFor: async () => EventAnalytics,
      ...overrides,
    });
    await backfill.replay(AnalyticsEvent);
    await backfill.finish();
    return backfill.counts;
  }

  function liveView(eventId, ip = '203.0.113.7') {
    return recordJustGoListingView(
      { ip, headers: { 'user-agent': 'Mozilla/5.0' } },
      { tenantKey: 'oakland', eventId, visitorId: 'visitor-live-0001' },
      { connectToDatabase: async () => mongo.connection },
    );
  }

  it('credits each analytics view to the listing once, oldest first', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertMany([
      viewEvent(eventId, { ts: new Date('2026-09-03T00:00:00Z') }),
      viewEvent(eventId, { ts: new Date('2026-09-01T00:00:00Z') }),
      viewEvent(eventId, { anonymous_id: 'visitor-other-9999', ts: new Date('2026-09-02T00:00:00Z') }),
    ]);

    const first = await runBackfill();
    const second = await runBackfill();

    expect(first).toMatchObject({ scanned: 3, recorded: 3, alreadyRecorded: 0, byTenant: { oakland: 3 } });
    expect(second).toMatchObject({ scanned: 3, recorded: 0, alreadyBackfilled: 3 });
    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(3);
    expect(doc.uniqueAnonymousViews).toBe(2);
    expect(doc.viewHistory.map((entry) => entry.timestamp.toISOString())).toEqual([
      '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z',
    ]);
    expect(doc.viewHistory.every((entry) => entry.source === BACKFILL_SOURCE)).toBe(true);
    expect(doc.viewHistory[0].anonymousId).toBe(analyticsHash('visitor-1234-abcd'));
  });

  it('treats a backfilled visitor as already seen when they return on the live page', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertOne(viewEvent(eventId));
    await runBackfill();

    await recordJustGoListingView(
      { ip: '203.0.113.7', headers: { 'user-agent': 'Mozilla/5.0' } },
      { tenantKey: 'oakland', eventId, visitorId: 'visitor-1234-abcd' },
      { connectToDatabase: async () => mongo.connection },
    );

    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(2);
    expect(doc.uniqueAnonymousViews).toBe(1);
  });

  it('skips malformed ids, unresolved events, other environments and other event names', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertMany([
      viewEvent(eventId, { properties: { event_id: 'not-an-id' } }),
      viewEvent(eventId),
      viewEvent(eventId, { env: 'dev' }),
      viewEvent(eventId, { event: 'justgo_public_event_app_store_click' }),
    ]);

    const counts = await runBackfill({ resolveTenant: async () => null });

    expect(counts).toMatchObject({ scanned: 2, invalidEventId: 1, unresolved: 1, recorded: 0 });
    expect(await EventAnalytics.countDocuments()).toBe(0);
  });

  it('writes nothing in dry-run', async () => {
    await AnalyticsEvent.collection.insertOne(viewEvent(new mongoose.Types.ObjectId()));

    const counts = await runBackfill({ dryRun: true });

    expect(counts).toMatchObject({ scanned: 1, recorded: 0, byTenant: { oakland: 1 } });
    expect(await EventAnalytics.countDocuments()).toBe(0);
  });

  it('resolves an event to the single city that has it, and caches the answer', async () => {
    const eventId = String(new mongoose.Types.ObjectId());
    const has = { exists: jest.fn().mockResolvedValue({ _id: eventId }) };
    const lacks = { exists: jest.fn().mockResolvedValue(null) };

    const resolve = createTenantResolver([
      { tenantKey: 'oakland', Event: has },
      { tenantKey: 'nyc', Event: lacks },
    ]);
    expect(await resolve(eventId)).toBe('oakland');
    expect(await resolve(eventId)).toBe('oakland');
    expect(has.exists).toHaveBeenCalledTimes(1);

    const ambiguous = createTenantResolver([
      { tenantKey: 'oakland', Event: has },
      { tenantKey: 'sf', Event: has },
    ]);
    expect(await ambiguous(eventId)).toBeNull();
  });

  it('does not replay views the live page already recorded', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertOne(viewEvent(eventId, {
      ts: new Date('2026-09-01T00:00:00Z'), received_at: new Date('2026-09-01T00:00:30Z'),
    }));
    await liveView(eventId);
    // The same page view also sends the analytics event, delivered after the live write.
    await AnalyticsEvent.collection.insertOne(viewEvent(eventId, {
      ts: new Date(), received_at: new Date(Date.now() + 1000),
    }));

    const counts = await runBackfill();

    expect(counts).toMatchObject({ recorded: 1, afterLiveViews: 1 });
    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(2);
  });

  it('judges the cutoff by server receipt time, not a skewed device clock', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await liveView(eventId);
    await AnalyticsEvent.collection.insertOne(viewEvent(eventId, {
      ts: new Date('2026-01-01T00:00:00Z'), received_at: new Date(Date.now() + 1000),
    }));

    const counts = await runBackfill();

    expect(counts).toMatchObject({ recorded: 0, afterLiveViews: 1 });
  });

  it('stays idempotent after capped history has dropped the replayed entries', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertMany([viewEvent(eventId), viewEvent(eventId)]);
    await runBackfill();
    await EventAnalytics.collection.updateOne({ eventId }, { $set: { viewHistory: [] } });

    const again = await runBackfill();

    expect(again).toMatchObject({ recorded: 0, alreadyBackfilled: 2 });
    expect((await EventAnalytics.findOne({ eventId }).lean()).anonymousViews).toBe(2);
  });

  it('leaves the markers alone in dry-run and honours --before', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await AnalyticsEvent.collection.insertMany([
      viewEvent(eventId, { received_at: new Date('2026-09-01T00:00:00Z') }),
      viewEvent(eventId, { received_at: new Date('2026-09-10T00:00:00Z') }),
    ]);

    const counts = await runBackfill({ before: new Date('2026-09-05T00:00:00Z') });

    expect(counts).toMatchObject({ recorded: 1, afterCutoff: 1 });
    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.viewsBackfilledThrough.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
