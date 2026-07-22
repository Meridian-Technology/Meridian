const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotCrewSchema = require('../../schemas/pivotCrew');
const pivotCrewMembershipSchema = require('../../schemas/pivotCrewMembership');
const pivotCrewWeekStateSchema = require('../../schemas/pivotCrewWeekState');
const pivotEventIntentSchema = require('../../schemas/pivotEventIntent');
const eventSchema = require('../../events/schemas/event');
const userSchema = require('../../schemas/user');
const getModels = require('../../services/getModelService');
const {
  aggregateCrewWeekState,
  recomputeCrewWeekState,
  getPivotCrewWeekProgress,
  invalidateCrewWeekProgressCache,
  resetCrewWeekProgressCacheForTests,
  computeJudgementWindowEndsAt,
} = require('../../services/pivotCrewWeekStateService');
const { PIVOT_CREW_CONFIG_DEFAULTS } = require('../../utilities/pivotCrewConfig');

describe('pivotCrewWeekStateService (Task 2.1)', () => {
  const batchWeek = '2026-W30';
  const tenantKey = 'nyc';
  const crewConfig = PIVOT_CREW_CONFIG_DEFAULTS;

  describe('aggregateCrewWeekState (hand-calculated fixtures)', () => {
    const userA = new mongoose.Types.ObjectId().toString();
    const userB = new mongoose.Types.ObjectId().toString();
    const userC = new mongoose.Types.ObjectId().toString();
    const eventOne = new mongoose.Types.ObjectId().toString();
    const eventTwo = new mongoose.Types.ObjectId().toString();

    function activeMembership(userId) {
      return { status: 'active', userId: new mongoose.Types.ObjectId(userId) };
    }

    it('proposes weighted_majority winner when quorum is met', () => {
      const memberships = [
        activeMembership(userA),
        activeMembership(userB),
        activeMembership(userC),
        { status: 'invited', userId: null },
      ];
      const intents = [
        { userId: userA, eventId: eventOne, status: 'interested', batchWeek },
        { userId: userB, eventId: eventOne, status: 'registered', batchWeek },
      ];

      const result = aggregateCrewWeekState({
        memberships,
        intents,
        eventStartById: new Map([
          [eventOne, Date.parse('2026-07-25T20:00:00.000Z')],
        ]),
        crewConfig,
      });

      expect(result.swipeProgress.activeMemberCount).toBe(3);
      expect(result.swipeProgress.swipedCount).toBe(2);
      expect(result.swipeProgress.invitedCount).toBe(1);
      expect(result.swipeProgress.participationRate).toBeCloseTo(2 / 3, 5);
      expect(result.swipeProgress.quorumMet).toBe(true);
      expect(result.judgementStatus).toBe('proposed');
      expect(result.proposedEventId).toBe(eventOne);
      expect(result.proposedScore).toBeCloseTo(1 + 1.5, 5);
      expect(result.voteBreakdown[0].interestedCount).toBe(1);
      expect(result.voteBreakdown[0].registeredCount).toBe(1);
    });

    it('excludes invited placeholders from quorum participation', () => {
      const memberships = [
        activeMembership(userA),
        { status: 'invited', userId: null },
        { status: 'invited', userId: null },
        { status: 'invited', userId: null },
      ];
      const intents = [
        { userId: userA, eventId: eventOne, status: 'interested', batchWeek },
      ];

      const result = aggregateCrewWeekState({
        memberships,
        intents,
        crewConfig,
      });

      expect(result.swipeProgress.activeMemberCount).toBe(1);
      expect(result.swipeProgress.invitedCount).toBe(3);
      expect(result.swipeProgress.quorumMet).toBe(false);
      expect(result.judgementStatus).toBe('awaiting_quorum');
      expect(result.proposedEventId).toBeNull();
    });

    it('requires minActiveMembers even when swipe participation is high', () => {
      const memberships = [activeMembership(userA)];
      const intents = [
        { userId: userA, eventId: eventOne, status: 'registered', batchWeek },
      ];

      const result = aggregateCrewWeekState({
        memberships,
        intents,
        crewConfig,
      });

      expect(result.swipeProgress.participationRate).toBe(1);
      expect(result.swipeProgress.quorumMet).toBe(false);
      expect(result.judgementStatus).toBe('awaiting_quorum');
    });

    it('returns split with top two candidates and no auto-resolution', () => {
      const passedEventId = new mongoose.Types.ObjectId().toString();
      const memberships = [
        activeMembership(userA),
        activeMembership(userB),
        activeMembership(userC),
      ];
      const intents = [
        { userId: userA, eventId: eventOne, status: 'registered', batchWeek },
        { userId: userB, eventId: eventTwo, status: 'registered', batchWeek },
        { userId: userC, eventId: passedEventId, status: 'passed', batchWeek },
      ];
      const sharedStart = Date.parse('2026-07-25T20:00:00.000Z');

      const result = aggregateCrewWeekState({
        memberships,
        intents,
        eventStartById: new Map([
          [eventOne, sharedStart],
          [eventTwo, sharedStart],
        ]),
        crewConfig,
      });

      expect(result.swipeProgress.quorumMet).toBe(true);
      expect(result.judgementStatus).toBe('split');
      expect(result.proposedEventId).toBeNull();
      expect(result.proposedScore).toBeNull();
      expect(result.voteBreakdown).toHaveLength(2);
      expect(result.voteBreakdown.map((row) => row.eventId).sort()).toEqual(
        [eventOne, eventTwo].sort(),
      );
      expect(result.voteBreakdown.every((row) => row.score === 1.5)).toBe(true);
    });

    it('breaks ties with earliest event start before declaring split', () => {
      const memberships = [
        activeMembership(userA),
        activeMembership(userB),
        activeMembership(userC),
      ];
      const intents = [
        { userId: userA, eventId: eventOne, status: 'registered', batchWeek },
        { userId: userB, eventId: eventTwo, status: 'registered', batchWeek },
        { userId: userC, eventId: eventTwo, status: 'interested', batchWeek },
      ];

      const result = aggregateCrewWeekState({
        memberships,
        intents,
        eventStartById: new Map([
          [eventOne, Date.parse('2026-07-24T20:00:00.000Z')],
          [eventTwo, Date.parse('2026-07-25T20:00:00.000Z')],
        ]),
        crewConfig,
      });

      expect(result.judgementStatus).toBe('proposed');
      expect(result.proposedEventId).toBe(eventTwo);
      expect(result.proposedScore).toBeCloseTo(2.5, 5);
    });
  });

  describe('recomputeCrewWeekState (integration)', () => {
    let mongo;
    let req;
    let ownerId;
    let memberBId;
    let memberCId;
    let eventOneId;
    let eventTwoId;
    let crewId;

    beforeAll(async () => {
      mongo = await createMongoMemoryConnection();
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
      getOrCreateModel(mongo.connection, 'Event', eventSchema, 'events');
      getOrCreateModel(mongo.connection, 'User', userSchema, 'users');

      const models = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'PivotEventIntent',
        'Event',
      );
      await models.PivotCrew.syncIndexes();
      await models.PivotCrewMembership.syncIndexes();
      await models.PivotCrewWeekState.syncIndexes();
      await models.PivotEventIntent.syncIndexes();
    });

    beforeEach(async () => {
      ownerId = new mongoose.Types.ObjectId();
      memberBId = new mongoose.Types.ObjectId();
      memberCId = new mongoose.Types.ObjectId();
      eventOneId = new mongoose.Types.ObjectId();
      eventTwoId = new mongoose.Types.ObjectId();

      const { User, PivotCrew, PivotCrewMembership, Event, PivotEventIntent } = getModels(
        { db: mongo.connection, school: tenantKey },
        'User',
        'PivotCrew',
        'PivotCrewMembership',
        'Event',
        'PivotEventIntent',
      );

      await User.create([
        { _id: ownerId, name: 'Owner', email: 'owner@test.com', username: 'owner_test' },
        { _id: memberBId, name: 'Member B', email: 'b@test.com', username: 'member_b' },
        { _id: memberCId, name: 'Member C', email: 'c@test.com', username: 'member_c' },
      ]);

      const crew = await PivotCrew.create({
        name: 'Aggregation Crew',
        createdBy: ownerId,
        tenantKey,
        shareInviteToken: PivotCrewMembership.generateInviteToken(),
      });
      crewId = crew._id;

      const now = new Date();
      await PivotCrewMembership.create([
        {
          crewId,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'owner',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: memberBId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: memberCId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: null,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'invited',
          role: 'member',
          invitedAt: now,
        },
      ]);

      await Event.create([
        {
          _id: eventOneId,
          name: 'Event One',
          description: 'First event',
          type: 'social',
          location: 'Venue One',
          start_time: new Date('2026-07-24T20:00:00.000Z'),
          end_time: new Date('2026-07-24T23:00:00.000Z'),
          status: 'not-applicable',
          visibility: 'public',
          expectedAttendance: 50,
          hostingType: 'Org',
          hostingId: ownerId,
          customFields: { pivot: { batchWeek, ingestStatus: 'published' } },
        },
        {
          _id: eventTwoId,
          name: 'Event Two',
          description: 'Second event',
          type: 'social',
          location: 'Venue Two',
          start_time: new Date('2026-07-25T20:00:00.000Z'),
          end_time: new Date('2026-07-25T23:00:00.000Z'),
          status: 'not-applicable',
          visibility: 'public',
          expectedAttendance: 50,
          hostingType: 'Org',
          hostingId: ownerId,
          customFields: { pivot: { batchWeek, ingestStatus: 'published' } },
        },
      ]);

      await PivotEventIntent.create([
        {
          userId: ownerId,
          eventId: eventOneId,
          batchWeek,
          status: 'registered',
        },
        {
          userId: memberBId,
          eventId: eventTwoId,
          batchWeek,
          status: 'registered',
        },
        {
          userId: memberCId,
          eventId: eventTwoId,
          batchWeek,
          status: 'interested',
        },
      ]);

      req = {
        db: mongo.connection,
        school: tenantKey,
        globalDb: mongo.connection,
      };

      jest.spyOn(require('../../services/tenantConfigService'), 'getTenantByKey').mockResolvedValue({
        tenantKey,
        pivotPilot: true,
      });
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await mongo.reset();
      const models = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'PivotEventIntent',
      );
      await models.PivotCrew.syncIndexes();
      await models.PivotCrewMembership.syncIndexes();
      await models.PivotCrewWeekState.syncIndexes();
      await models.PivotEventIntent.syncIndexes();
    });

    afterAll(async () => {
      await mongo.cleanup();
    });

    it('persists aggregated week state keyed by crewId and batchWeek', async () => {
      const result = await recomputeCrewWeekState(req, { crewId: crewId.toString(), batchWeek });

      expect(result.data.crewId.toString()).toBe(crewId.toString());
      expect(result.data.batchWeek).toBe(batchWeek);
      expect(result.data.swipeProgress.activeMemberCount).toBe(3);
      expect(result.data.swipeProgress.swipedCount).toBe(3);
      expect(result.data.swipeProgress.invitedCount).toBe(1);
      expect(result.data.swipeProgress.quorumMet).toBe(true);
      expect(result.data.judgementStatus).toBe('proposed');
      expect(result.data.proposedEventId.toString()).toBe(eventTwoId.toString());
      expect(result.data.proposedScore).toBeCloseTo(2.5, 5);
    });

    it('preserves locked picks on recompute when judgement is confirmed', async () => {
      const { PivotCrewWeekState } = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrewWeekState',
      );

      await PivotCrewWeekState.create({
        crewId,
        batchWeek,
        tenantKey,
        swipeProgress: {
          activeMemberCount: 3,
          swipedCount: 3,
          invitedCount: 1,
          participationRate: 1,
          quorumMet: true,
        },
        proposedEventId: eventOneId,
        proposedScore: 1.5,
        voteBreakdown: [
          {
            eventId: eventOneId,
            score: 1.5,
            interestedCount: 0,
            registeredCount: 1,
            memberVotes: [{ userId: ownerId, status: 'registered' }],
          },
        ],
        judgementStatus: 'confirmed',
        aggregatedAt: new Date(),
      });

      const result = await recomputeCrewWeekState(req, { crewId: crewId.toString(), batchWeek });

      expect(result.data.judgementStatus).toBe('confirmed');
      expect(result.data.proposedEventId.toString()).toBe(eventOneId.toString());
      expect(result.data.swipeProgress.swipedCount).toBe(3);
    });
  });

  describe('getPivotCrewWeekProgress (Task 2.2)', () => {
    let mongo;
    let req;
    let ownerId;
    let memberBId;
    let memberCId;
    let eventOneId;
    let eventTwoId;
    let crewId;

    beforeAll(async () => {
      mongo = await createMongoMemoryConnection();
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
      getOrCreateModel(mongo.connection, 'Event', eventSchema, 'events');
      getOrCreateModel(mongo.connection, 'User', userSchema, 'users');

      const models = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'PivotEventIntent',
        'Event',
      );
      await models.PivotCrew.syncIndexes();
      await models.PivotCrewMembership.syncIndexes();
      await models.PivotCrewWeekState.syncIndexes();
      await models.PivotEventIntent.syncIndexes();
    });

    beforeEach(async () => {
      resetCrewWeekProgressCacheForTests();
      ownerId = new mongoose.Types.ObjectId();
      memberBId = new mongoose.Types.ObjectId();
      memberCId = new mongoose.Types.ObjectId();
      eventOneId = new mongoose.Types.ObjectId();
      eventTwoId = new mongoose.Types.ObjectId();

      const { User, PivotCrew, PivotCrewMembership, Event, PivotEventIntent } = getModels(
        { db: mongo.connection, school: tenantKey },
        'User',
        'PivotCrew',
        'PivotCrewMembership',
        'Event',
        'PivotEventIntent',
      );

      await User.create([
        { _id: ownerId, name: 'Owner', email: 'owner@test.com', username: 'owner_test' },
        { _id: memberBId, name: 'Member B', email: 'b@test.com', username: 'member_b' },
        { _id: memberCId, name: 'Member C', email: 'c@test.com', username: 'member_c' },
      ]);

      const crew = await PivotCrew.create({
        name: 'Week Progress Crew',
        createdBy: ownerId,
        tenantKey,
        shareInviteToken: PivotCrewMembership.generateInviteToken(),
      });
      crewId = crew._id;

      const now = new Date();
      await PivotCrewMembership.create([
        {
          crewId,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'owner',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: memberBId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: memberCId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId,
          userId: null,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'invited',
          role: 'member',
          invitedAt: now,
        },
      ]);

      await Event.create([
        {
          _id: eventOneId,
          name: 'Event One',
          description: 'First event',
          type: 'social',
          location: 'Venue One',
          start_time: new Date('2026-07-24T20:00:00.000Z'),
          end_time: new Date('2026-07-24T23:00:00.000Z'),
          status: 'not-applicable',
          visibility: 'public',
          expectedAttendance: 50,
          hostingType: 'Org',
          hostingId: ownerId,
          customFields: {
            pivot: {
              batchWeek,
              ingestStatus: 'published',
              host: { name: 'Venue One' },
            },
          },
        },
        {
          _id: eventTwoId,
          name: 'Event Two',
          description: 'Second event',
          type: 'social',
          location: 'Venue Two',
          start_time: new Date('2026-07-25T20:00:00.000Z'),
          end_time: new Date('2026-07-25T23:00:00.000Z'),
          status: 'not-applicable',
          visibility: 'public',
          expectedAttendance: 50,
          hostingType: 'Org',
          hostingId: ownerId,
          customFields: {
            pivot: {
              batchWeek,
              ingestStatus: 'published',
              host: { name: 'Venue Two' },
            },
          },
        },
      ]);

      await PivotEventIntent.create([
        {
          userId: ownerId,
          eventId: eventOneId,
          batchWeek,
          status: 'registered',
        },
        {
          userId: memberBId,
          eventId: eventTwoId,
          batchWeek,
          status: 'registered',
        },
        {
          userId: memberCId,
          eventId: eventTwoId,
          batchWeek,
          status: 'interested',
        },
      ]);

      req = {
        db: mongo.connection,
        school: tenantKey,
        globalDb: mongo.connection,
        user: { userId: ownerId.toString() },
      };

      jest.spyOn(require('../../services/tenantConfigService'), 'getTenantByKey').mockResolvedValue({
        tenantKey,
        pivotPilot: true,
      });
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      resetCrewWeekProgressCacheForTests();
      await mongo.reset();
      const models = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'PivotEventIntent',
      );
      await models.PivotCrew.syncIndexes();
      await models.PivotCrewMembership.syncIndexes();
      await models.PivotCrewWeekState.syncIndexes();
      await models.PivotEventIntent.syncIndexes();
    });

    afterAll(async () => {
      await mongo.cleanup();
    });

    it('returns crew week progress with proposed event and runner-up', async () => {
      const result = await getPivotCrewWeekProgress(req, { batchWeek });

      expect(result.data.batchWeek).toBe(batchWeek);
      expect(result.data.crews).toHaveLength(1);
      expect(result.data.crews[0]).toMatchObject({
        crewId: crewId.toString(),
        name: 'Week Progress Crew',
        swipedCount: 3,
        activeCount: 3,
        invitedCount: 1,
        quorumMet: true,
        judgementStatus: 'proposed',
      });
      expect(result.data.crews[0].proposedEvent.id).toBe(eventTwoId.toString());
      expect(result.data.crews[0].runnerUp.id).toBe(eventOneId.toString());
      expect(result.data.crews[0].judgementWindowEndsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('serves cached responses for 30s and invalidates after intent write', async () => {
      const first = await getPivotCrewWeekProgress(req, { batchWeek });
      expect(first.cacheHit).toBe(false);

      const second = await getPivotCrewWeekProgress(req, { batchWeek });
      expect(second.cacheHit).toBe(true);
      expect(second.data).toEqual(first.data);

      invalidateCrewWeekProgressCache(tenantKey, ownerId.toString(), batchWeek);

      const third = await getPivotCrewWeekProgress(req, { batchWeek });
      expect(third.cacheHit).toBe(false);
    });

    it('computes judgementWindowEndsAt with min hours after quorum', () => {
      const quorumMetAt = new Date('2026-07-21T18:00:00.000Z');
      const endsAt = computeJudgementWindowEndsAt({
        candidateEventStarts: [Date.parse('2026-07-25T20:00:00.000Z')],
        quorumMetAt,
        crewConfig: PIVOT_CREW_CONFIG_DEFAULTS,
      });

      expect(endsAt).toBe(new Date('2026-07-24T20:00:00.000Z').toISOString());
    });
  });
});
