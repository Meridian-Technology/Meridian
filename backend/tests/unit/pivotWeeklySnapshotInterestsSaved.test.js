const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const getModels = require('../../services/getModelService');
const { aggregateEngagementMetrics } = require('../../services/pivotWeeklySnapshotService');
const { isoWeekToUtcRange } = require('../../utilities/pivotIsoWeek');

const BATCH_WEEK = '2026-W28';
const { start, end } = isoWeekToUtcRange(BATCH_WEEK);
const MIDWEEK = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);

// The first query on a fresh in-memory Mongo also builds every tenant model's indexes.
jest.setTimeout(120000);

describe('weekly engagement metrics, on a real Mongo', () => {
  let server;
  let db;
  const models = () => getModels({ db }, 'User', 'AnalyticsEvent');

  function analyticsEvent(event, ts) {
    return {
      schema_version: 1,
      event_id: new mongoose.Types.ObjectId().toString(),
      event,
      ts,
      received_at: ts,
      anonymous_id: 'anon-1',
      session_id: 'session-1',
      platform: 'ios',
      app: 'justgo',
      env: 'prod',
    };
  }

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    db = await mongoose.createConnection(server.getUri('pivot_nyc')).asPromise();
  }, 60000);

  afterEach(async () => {
    const { User, AnalyticsEvent } = models();
    await Promise.all([User.deleteMany({}), AnalyticsEvent.collection.deleteMany({})]);
  });

  afterAll(async () => {
    await db?.close();
    await server?.stop();
  });

  it('counts users whose interests stamp falls in the week', async () => {
    const { User } = models();
    await User.insertMany([
      { email: 'start@example.com', pivotInterestsUpdatedAt: start },
      { email: 'midweek@example.com', pivotInterestsUpdatedAt: MIDWEEK },
      { email: 'late@example.com', pivotInterestsUpdatedAt: new Date(end.getTime() - 1) },
      { email: 'last-week@example.com', pivotInterestsUpdatedAt: new Date(start.getTime() - 1) },
      { email: 'next-week@example.com', pivotInterestsUpdatedAt: end },
      { email: 'never@example.com' },
    ]);

    const metrics = await aggregateEngagementMetrics({ db }, BATCH_WEEK);

    expect(metrics.interestsSaved).toBe(3);
  });

  it('ignores interests analytics events and keeps calendar adds and invite shares', async () => {
    const { AnalyticsEvent } = models();
    // Raw inserts: this test is about what gets counted, not ingestion validation.
    await AnalyticsEvent.collection.insertMany([
      analyticsEvent('pivot_interests_updated', MIDWEEK),
      analyticsEvent('pivot_interests_onboarding_completed', MIDWEEK),
      analyticsEvent('pivot_calendar_add', MIDWEEK),
      analyticsEvent('pivot_calendar_add', MIDWEEK),
      analyticsEvent('pivot_invite_share', MIDWEEK),
      analyticsEvent('pivot_invite_copy', MIDWEEK),
      analyticsEvent('pivot_invite_share', new Date(start.getTime() - 1)),
    ]);

    const metrics = await aggregateEngagementMetrics({ db }, BATCH_WEEK);

    expect(metrics).toEqual({ calendarAdds: 2, inviteShares: 2, interestsSaved: 0 });
  });
});
