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
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
  getPivotCrewWeekJudgement,
  isJudgementWindowOpen,
  getTopCandidateEventIds,
  loadLockedCrewPicksForUser,
} = require('../../services/pivotCrewJudgementService');
const { getWeekRecap } = require('../../services/pivotIntentService');
const { PIVOT_CREW_CONFIG_DEFAULTS } = require('../../utilities/pivotCrewConfig');

describe('pivotCrewJudgementService (Task 2.3)', () => {
  const batchWeek = '2026-W30';
  const tenantKey = 'nyc';

  describe('pure helpers', () => {
    it('getTopCandidateEventIds returns top two for split votes', () => {
      const eventOne = new mongoose.Types.ObjectId().toString();
      const eventTwo = new mongoose.Types.ObjectId().toString();

      expect(
        getTopCandidateEventIds({
          judgementStatus: 'split',
          voteBreakdown: [
            { eventId: eventOne },
            { eventId: eventTwo },
            { eventId: new mongoose.Types.ObjectId() },
          ],
        }),
      ).toEqual([eventOne, eventTwo]);
    });

    it('isJudgementWindowOpen respects endsAt timestamp', () => {
      const endsAt = '2026-07-24T20:00:00.000Z';
      expect(isJudgementWindowOpen(endsAt, new Date('2026-07-24T19:00:00.000Z'))).toBe(true);
      expect(isJudgementWindowOpen(endsAt, new Date('2026-07-24T21:00:00.000Z'))).toBe(false);
    });
  });

  describe('confirm / swap / judgement APIs', () => {
    let mongo;
    let req;
    let ownerId;
    let memberBId;
    let memberCId;
    let outsiderId;
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
      outsiderId = new mongoose.Types.ObjectId();
      eventOneId = new mongoose.Types.ObjectId();
      eventTwoId = new mongoose.Types.ObjectId();

      const { User, PivotCrew, PivotCrewMembership, PivotCrewWeekState, Event } = getModels(
        { db: mongo.connection, school: tenantKey },
        'User',
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'Event',
      );

      await User.create([
        { _id: ownerId, name: 'Owner', email: 'owner@test.com', username: 'owner_test' },
        { _id: memberBId, name: 'Member B', email: 'b@test.com', username: 'member_b' },
        { _id: memberCId, name: 'Member C', email: 'c@test.com', username: 'member_c' },
        { _id: outsiderId, name: 'Outsider', email: 'out@test.com', username: 'outsider' },
      ]);

      const crew = await PivotCrew.create({
        name: 'Judgement Crew',
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

      await PivotCrewWeekState.create({
        crewId,
        batchWeek,
        tenantKey,
        swipeProgress: {
          activeMemberCount: 3,
          swipedCount: 3,
          invitedCount: 0,
          participationRate: 1,
          quorumMet: true,
        },
        proposedEventId: eventTwoId,
        proposedScore: 2.5,
        voteBreakdown: [
          {
            eventId: eventTwoId,
            score: 2.5,
            interestedCount: 1,
            registeredCount: 1,
            memberVotes: [
              { userId: memberBId, status: 'registered' },
              { userId: memberCId, status: 'interested' },
            ],
          },
          {
            eventId: eventOneId,
            score: 1.5,
            interestedCount: 0,
            registeredCount: 1,
            memberVotes: [{ userId: ownerId, status: 'registered' }],
          },
        ],
        judgementStatus: 'proposed',
        aggregatedAt: new Date('2026-07-21T12:00:00.000Z'),
      });

      req = {
        db: mongo.connection,
        school: tenantKey,
        globalDb: mongo.connection,
        user: { userId: ownerId.toString() },
      };

      jest.spyOn(require('../../services/tenantConfigService'), 'getTenantByKey').mockResolvedValue({
        tenantKey,
        pivotPilot: true,
        pivotCrewConfig: PIVOT_CREW_CONFIG_DEFAULTS,
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
      );
      await models.PivotCrew.syncIndexes();
      await models.PivotCrewMembership.syncIndexes();
      await models.PivotCrewWeekState.syncIndexes();
    });

    afterAll(async () => {
      await mongo.cleanup();
    });

    it('GET judgement returns proposed event and vote breakdown', async () => {
      const result = await getPivotCrewWeekJudgement(req, {
        crewId: crewId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.data.crewName).toBe('Judgement Crew');
      expect(result.data.proposedEvent.id).toBe(eventTwoId.toString());
      expect(result.data.runnerUp.id).toBe(eventOneId.toString());
      expect(result.data.voteBreakdown).toHaveLength(2);
      expect(result.data.voteBreakdown[0].memberVotes[0].displayLabel).toBe('Member B');
      expect(result.data.judgementWindowOpen).toBe(true);
    });

    it('confirm locks the proposed pick', async () => {
      const result = await confirmPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        eventId: eventTwoId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.data.judgementStatus).toBe('confirmed');
      expect(result.data.event.id).toBe(eventTwoId.toString());

      const { PivotCrewWeekState } = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrewWeekState',
      );
      const stored = await PivotCrewWeekState.findOne({ crewId, batchWeek }).lean();
      expect(stored.judgementStatus).toBe('confirmed');
    });

    it('rejects confirm after judgement window closes with 409', async () => {
      const result = await confirmPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        eventId: eventTwoId.toString(),
        batchWeek,
        now: new Date('2026-07-25T00:00:00.000Z'),
      });

      expect(result.status).toBe(409);
      expect(result.code).toBe('JUDGEMENT_WINDOW_CLOSED');
    });

    it('swap chooses runner-up among top candidates', async () => {
      const result = await swapPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.data.judgementStatus).toBe('swapped');
      expect(result.data.event.id).toBe(eventOneId.toString());
    });

    it('rejects swap when candidate is not in top breakdown', async () => {
      const { PivotCrewWeekState } = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrewWeekState',
      );
      await PivotCrewWeekState.updateOne(
        { crewId, batchWeek },
        {
          $set: {
            judgementStatus: 'split',
            proposedEventId: null,
            voteBreakdown: [
              {
                eventId: eventOneId,
                score: 1.5,
                interestedCount: 0,
                registeredCount: 1,
                memberVotes: [{ userId: ownerId, status: 'registered' }],
              },
            ],
          },
        },
      );

      const result = await swapPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.status).toBe(400);
      expect(result.code).toBe('SWAP_NOT_AVAILABLE');
    });

    it('split confirm accepts either top candidate', async () => {
      const { PivotCrewWeekState } = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrewWeekState',
      );
      await PivotCrewWeekState.updateOne(
        { crewId, batchWeek },
        {
          $set: {
            judgementStatus: 'split',
            proposedEventId: null,
            voteBreakdown: [
              {
                eventId: eventOneId,
                score: 1.5,
                interestedCount: 0,
                registeredCount: 1,
                memberVotes: [{ userId: ownerId, status: 'registered' }],
              },
              {
                eventId: eventTwoId,
                score: 1.5,
                interestedCount: 0,
                registeredCount: 1,
                memberVotes: [{ userId: memberBId, status: 'registered' }],
              },
            ],
          },
        },
      );

      const result = await confirmPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        eventId: eventOneId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.data.judgementStatus).toBe('confirmed');
      expect(result.data.event.id).toBe(eventOneId.toString());
    });

    it('loadLockedCrewPicksForUser surfaces confirmed picks for recap', async () => {
      await confirmPivotCrewWeekPick(req, {
        crewId: crewId.toString(),
        eventId: eventTwoId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      const crewPicks = await loadLockedCrewPicksForUser(req, batchWeek);

      expect(crewPicks).toHaveLength(1);
      expect(crewPicks[0].crewName).toBe('Judgement Crew');
      expect(crewPicks[0].event.id).toBe(eventTwoId.toString());
      expect(crewPicks[0].judgementStatus).toBe('confirmed');
    });
  });
});
