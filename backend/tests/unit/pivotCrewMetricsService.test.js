const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotCrewSchema = require('../../schemas/pivotCrew');
const pivotCrewMembershipSchema = require('../../schemas/pivotCrewMembership');
const pivotCrewWeekStateSchema = require('../../schemas/pivotCrewWeekState');
const pivotEventIntentSchema = require('../../schemas/pivotEventIntent');
const userSchema = require('../../schemas/user');
const analyticsEventSchema = require('../../events/schemas/analyticsEvent');
const getModels = require('../../services/getModelService');
const connectionsManager = require('../../connectionsManager');
const {
  aggregateTenantCrewMetrics,
  buildCrewVsPrevWeek,
} = require('../../services/pivotCrewMetricsService');

describe('pivotCrewMetricsService (Task 6.2)', () => {
  const batchWeek = '2026-W30';
  const tenantKey = 'nyc';
  const tenant = {
    tenantKey,
    name: 'New York',
    location: 'New York',
  };

  let mongo;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    jest.spyOn(connectionsManager, 'connectToDatabase').mockResolvedValue(mongo.connection);

    getOrCreateModel(mongo.connection, 'User', userSchema, 'users');
    getOrCreateModel(mongo.connection, 'PivotCrew', pivotCrewSchema, 'pivotCrews');
    getOrCreateModel(
      mongo.connection,
      'PivotCrewMembership',
      pivotCrewMembershipSchema,
      'pivotCrewMemberships',
    );
    getOrCreateModel(
      mongo.connection,
      'PivotCrewWeekState',
      pivotCrewWeekStateSchema,
      'pivotCrewWeekStates',
    );
    getOrCreateModel(
      mongo.connection,
      'PivotEventIntent',
      pivotEventIntentSchema,
      'pivotEventIntents',
    );
    getOrCreateModel(
      mongo.connection,
      'AnalyticsEvent',
      analyticsEventSchema,
      'analytics_events',
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await mongo.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  it('computes crew funnel metrics for a batch week', async () => {
    const {
      User,
      PivotCrew,
      PivotCrewMembership,
      PivotCrewWeekState,
      PivotEventIntent,
      AnalyticsEvent,
    } = getModels(
      { db: mongo.connection, school: tenantKey },
      'User',
      'PivotCrew',
      'PivotCrewMembership',
      'PivotCrewWeekState',
      'PivotEventIntent',
      'AnalyticsEvent',
    );

    const userA = await User.create({ name: 'A', email: 'a@test.com', username: 'user_a' });
    const userB = await User.create({ name: 'B', email: 'b@test.com', username: 'user_b' });
    const userC = await User.create({ name: 'C', email: 'c@test.com', username: 'user_c' });
    const crew = await PivotCrew.create({
      name: 'Friday crew',
      createdBy: userA._id,
      tenantKey,
      shareInviteToken: 'share-token-1',
    });

    await PivotEventIntent.create([
      {
        userId: userA._id,
        batchWeek,
        status: 'interested',
        eventId: new mongoose.Types.ObjectId(),
      },
      {
        userId: userB._id,
        batchWeek,
        status: 'passed',
        eventId: new mongoose.Types.ObjectId(),
      },
      {
        userId: userC._id,
        batchWeek,
        status: 'interested',
        eventId: new mongoose.Types.ObjectId(),
      },
    ]);

    await PivotCrewMembership.create([
      {
        crewId: crew._id,
        userId: userA._id,
        inviteToken: 'token-a',
        status: 'active',
        role: 'owner',
        invitedAt: new Date('2026-07-20T12:00:00.000Z'),
        joinedAt: new Date('2026-07-20T12:00:00.000Z'),
      },
      {
        crewId: crew._id,
        userId: userB._id,
        inviteToken: 'token-b',
        status: 'active',
        role: 'member',
        invitedAt: new Date('2026-07-21T12:00:00.000Z'),
        joinedAt: new Date('2026-07-22T12:00:00.000Z'),
      },
      {
        crewId: crew._id,
        userId: null,
        inviteToken: 'token-invited',
        status: 'invited',
        role: 'member',
        invitedAt: new Date('2026-07-23T12:00:00.000Z'),
      },
    ]);

    await PivotCrewWeekState.create({
      crewId: crew._id,
      batchWeek,
      tenantKey,
      swipeProgress: {
        activeMemberCount: 2,
        swipedCount: 2,
        invitedCount: 1,
        participationRate: 1,
        quorumMet: true,
      },
      voteBreakdown: [],
      judgementStatus: 'confirmed',
      aggregatedAt: new Date('2026-07-24T12:00:00.000Z'),
    });

    await AnalyticsEvent.create([
      {
        event_id: 'cross-crew-view-1',
        event: 'pivot_cross_crew_surface_view',
        ts: new Date('2026-07-23T18:00:00.000Z'),
        anonymous_id: 'anon-1',
        session_id: 'sess-1',
        platform: 'ios',
        app_version: '1.0.0',
        build: '1',
        env: 'dev',
        properties: { batchWeek },
      },
      {
        event_id: 'cross-crew-view-2',
        event: 'pivot_cross_crew_surface_view',
        ts: new Date('2026-07-24T18:00:00.000Z'),
        anonymous_id: 'anon-2',
        session_id: 'sess-2',
        platform: 'ios',
        app_version: '1.0.0',
        build: '1',
        env: 'dev',
        properties: { batchWeek },
      },
    ]);

    const result = await aggregateTenantCrewMetrics({}, tenant, batchWeek);

    expect(result.kpis.crewCreationRate.usersWithCrew).toBe(2);
    expect(result.kpis.crewCreationRate.wau).toBe(3);
    expect(result.kpis.crewCreationRate.rate).toBeCloseTo(2 / 3, 3);
    expect(result.kpis.quorumHitRate.quorumMet).toBe(1);
    expect(result.kpis.quorumHitRate.activeCrews).toBe(1);
    expect(result.kpis.quorumHitRate.rate).toBe(1);
    expect(result.kpis.judgementConfirmRate.confirmed).toBe(1);
    expect(result.kpis.judgementConfirmRate.proposed).toBe(1);
    expect(result.kpis.invitedJoinRate.sent).toBe(2);
    expect(result.kpis.invitedJoinRate.resolved).toBe(1);
    expect(result.kpis.crossCrewSurfaces.views).toBe(2);
    expect(result.totalCrews).toBe(1);
  });

  it('builds week-over-week deltas for crew rates', () => {
    const current = {
      kpis: {
        crewCreationRate: { rate: 0.5 },
        quorumHitRate: { rate: 0.8 },
        judgementConfirmRate: { rate: 0.6 },
        invitedJoinRate: { rate: 0.25 },
        crossCrewSurfaces: { views: 10, clicks: 0 },
      },
    };
    const previous = {
      kpis: {
        crewCreationRate: { rate: 0.4 },
        quorumHitRate: { rate: 0.5 },
        judgementConfirmRate: { rate: 0.5 },
        invitedJoinRate: { rate: 0.2 },
        crossCrewSurfaces: { views: 6, clicks: 0 },
      },
    };

    const deltas = buildCrewVsPrevWeek(current, previous);
    expect(deltas.crewCreationRate.delta).toBeCloseTo(0.1, 3);
    expect(deltas.crossCrewViews.delta).toBe(4);
  });
});
