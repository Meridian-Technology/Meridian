const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const eventAnalyticsSchema = require('../../events/schemas/eventAnalytics');
const userSchema = require('../../schemas/user');
const {
  MAX_VIEW_HISTORY,
  anonymousVisitorKey,
  isLikelyBot,
  organizerEventAnalytics,
  publicViewHistoryEntry,
  recordEventPageView,
  recordEventView,
  recordJustGoListingView,
} = require('../../services/eventViewService');

describe('eventViewService', () => {
  const tenantKey = 'nyc';
  const originalSecret = process.env.ANALYTICS_HASH_SECRET;
  let mongo;
  let EventAnalytics;
  let User;

  beforeAll(async () => {
    process.env.ANALYTICS_HASH_SECRET = 'test-analytics-secret';
    mongo = await createMongoMemoryConnection();
    EventAnalytics = getOrCreateModel(
      mongo.connection,
      'EventAnalytics',
      eventAnalyticsSchema,
      'eventAnalytics',
    );
    User = getOrCreateModel(mongo.connection, 'User', userSchema, 'users');
    await EventAnalytics.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    else process.env.ANALYTICS_HASH_SECRET = originalSecret;
    await mongo.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  function request(overrides = {}) {
    return {
      db: mongo.connection,
      school: tenantKey,
      ip: '203.0.113.7',
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
      ...overrides,
    };
  }

  it('counts the first anonymous view as unique and repeats as views only', async () => {
    const eventId = new mongoose.Types.ObjectId();

    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:visitor-a' });
    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:visitor-a' });
    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:visitor-b' });

    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(3);
    expect(doc.uniqueAnonymousViews).toBe(2);
    expect(doc.views).toBe(0);
    expect(doc.viewHistory).toHaveLength(3);
  });

  it('counts logged-in views against the user, not the visitor hash', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    await recordEventView(EventAnalytics, eventId, { userId });
    await recordEventView(EventAnalytics, eventId, { userId: String(userId) });

    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.views).toBe(2);
    expect(doc.uniqueViews).toBe(1);
    expect(doc.anonymousViews).toBe(0);
  });

  it('loses no increments when views arrive concurrently', async () => {
    const eventId = new mongoose.Types.ObjectId();

    await Promise.all(Array.from({ length: 20 }, (_, index) => recordEventView(
      EventAnalytics,
      eventId,
      { visitorKey: `k1:visitor-${index % 5}` },
    )));

    const docs = await EventAnalytics.find({ eventId }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].anonymousViews).toBe(20);
    expect(docs[0].uniqueAnonymousViews).toBe(5);
    expect(docs[0].viewHistory).toHaveLength(20);
  });

  it('skips a view whose sourceEventId is already recorded', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const view = { visitorKey: 'k1:visitor-a', sourceEventId: 'analytics-event-1' };

    const first = await recordEventView(EventAnalytics, eventId, view);
    const second = await recordEventView(EventAnalytics, eventId, view);

    expect(first).toEqual({ recorded: true, unique: true });
    expect(second).toEqual({ recorded: false, unique: false });
    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(1);
  });

  it('never stores a raw IP address or user agent', async () => {
    const eventId = new mongoose.Types.ObjectId();

    await recordEventPageView(request(), eventId);

    const doc = await EventAnalytics.findOne({ eventId }).lean();
    const [entry] = doc.viewHistory;
    expect(entry.anonymousId).toMatch(/^k1:/);
    expect(JSON.stringify(doc)).not.toContain('203.0.113.7');
    expect(JSON.stringify(doc)).not.toContain('iPhone');
    expect(entry.source).toBe('event_page');
  });

  it('does not count admins or bots', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const admin = await User.create({
      name: 'Admin', email: 'admin@test.com', username: 'admin_user', roles: ['admin'],
    });

    const adminView = await recordEventPageView(request({ user: { userId: admin._id } }), eventId);
    const botView = await recordEventPageView(
      request({ headers: { 'user-agent': 'facebookexternalhit/1.1' } }),
      eventId,
    );

    expect(adminView.excluded).toBe('admin');
    expect(botView.recorded).toBe(false);
    expect(await EventAnalytics.countDocuments({ eventId })).toBe(0);
  });

  it('writes Just Go listing views to the city database as anonymous', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const connectToDatabase = jest.fn().mockResolvedValue(mongo.connection);
    const deps = { connectToDatabase };

    await recordJustGoListingView(
      request(),
      { tenantKey, eventId, visitorId: 'visitor-1234-abcd' },
      deps,
    );
    await recordJustGoListingView(
      request({ ip: '198.51.100.2' }),
      { tenantKey, eventId, visitorId: 'visitor-1234-abcd' },
      deps,
    );

    expect(connectToDatabase).toHaveBeenCalledWith(tenantKey);
    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.anonymousViews).toBe(2);
    expect(doc.uniqueAnonymousViews).toBe(1);
    expect(doc.viewHistory[0].source).toBe('justgo_public');
  });

  it('hashes the visitor id when it looks like one, otherwise IP and user agent', () => {
    const req = request();
    const fromVisitor = anonymousVisitorKey(req, 'visitor-1234-abcd');
    const fromRequest = anonymousVisitorKey(req, '<script>');

    expect(fromVisitor).toMatch(/^k1:/);
    expect(fromRequest).toMatch(/^k1:/);
    expect(fromVisitor).not.toBe(fromRequest);
    expect(anonymousVisitorKey(req)).toBe(fromRequest);
  });

  it('recognises common link unfurlers and crawlers', () => {
    expect(isLikelyBot('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isLikelyBot('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
  });

  it('does not mistake phones or in-app browsers for bots', () => {
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9) AppleWebKit/537.36 Chrome/120 Mobile')).toBe(false);
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Telegram-Android/10.8.1')).toBe(false);
    expect(isLikelyBot('Mozilla/5.0 (iPhone) Mobile/15E148 WhatsApp/2.24')).toBe(false);
  });

  it('keeps only the newest view history entries', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const old = Array.from({ length: MAX_VIEW_HISTORY }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      isAnonymous: true,
      anonymousId: `k1:old-${index}`,
      timestamp: new Date('2026-01-01T00:00:00Z'),
    }));
    await EventAnalytics.collection.insertOne({ eventId, anonymousViews: old.length, viewHistory: old });

    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:new' });

    const doc = await EventAnalytics.findOne({ eventId }).lean();
    expect(doc.viewHistory).toHaveLength(MAX_VIEW_HISTORY);
    expect(doc.viewHistory[doc.viewHistory.length - 1].anonymousId).toBe('k1:new');
    expect(doc.anonymousViews).toBe(MAX_VIEW_HISTORY + 1);
  });

  it('marks the first live view but not replayed ones', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const replayedAt = new Date('2026-08-01T00:00:00Z');
    const liveAt = new Date('2026-09-01T00:00:00Z');

    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:a', timestamp: replayedAt, live: false });
    expect((await EventAnalytics.findOne({ eventId }).lean()).firstLiveViewAt).toBeUndefined();

    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:b', timestamp: liveAt });
    await recordEventView(EventAnalytics, eventId, { visitorKey: 'k1:c', timestamp: new Date('2026-09-02T00:00:00Z') });
    expect((await EventAnalytics.findOne({ eventId }).lean()).firstLiveViewAt).toEqual(liveAt);
  });

  it('strips raw IPs, user agents and visitor hashes from documents shown to organizers', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await EventAnalytics.collection.insertOne({
      eventId,
      views: 1,
      viewHistory: [{
        _id: new mongoose.Types.ObjectId(),
        isAnonymous: true,
        anonymousId: '203.0.113.7-Mozilla/5.0',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date('2026-01-01T00:00:00Z'),
      }],
    });

    const shown = organizerEventAnalytics(await EventAnalytics.findOne({ eventId }));

    expect(shown.views).toBe(1);
    expect(shown.viewHistory).toEqual([
      { userId: null, isAnonymous: true, timestamp: new Date('2026-01-01T00:00:00Z') },
    ]);
    expect(JSON.stringify(shown)).not.toMatch(/203\.0\.113\.7|Mozilla/);
    expect(organizerEventAnalytics(null)).toBeNull();
  });

  it('returns history to organizers without the visitor hash', () => {
    const timestamp = new Date();
    expect(publicViewHistoryEntry({
      userId: null, isAnonymous: true, anonymousId: 'k1:abc', timestamp, ipAddress: '203.0.113.7',
    })).toEqual({ userId: null, isAnonymous: true, timestamp });
  });
});
