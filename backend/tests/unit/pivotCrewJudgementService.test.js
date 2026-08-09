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
  castPivotCrewWeekBallot,
  getPivotCrewWeekJudgement,
  isJudgementWindowOpen,
  getTopCandidateEventIds,
  loadLockedCrewPicksForUser,
} = require('../../services/pivotCrewJudgementService');
const { recomputeCrewWeekState } = require('../../services/pivotCrewWeekStateService');
const { PIVOT_CREW_CONFIG_DEFAULTS } = require('../../utilities/pivotCrewConfig');

describe('pivotCrewJudgementService (Borda ballot)', () => {
  const batchWeek = '2026-W30';
  const tenantKey = 'nyc';

  describe('pure helpers', () => {
    it('getTopCandidateEventIds prefers shortlistEventIds when present', () => {
      const shortlist = [
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
      ];

      expect(
        getTopCandidateEventIds({
          shortlistEventIds: shortlist,
          voteBreakdown: [
            { eventId: new mongoose.Types.ObjectId() },
            { eventId: new mongoose.Types.ObjectId() },
          ],
        }),
      ).toEqual(shortlist);
    });

    it('getTopCandidateEventIds falls back to top five voteBreakdown ids', () => {
      const eventOne = new mongoose.Types.ObjectId().toString();
      const eventTwo = new mongoose.Types.ObjectId().toString();
      const eventThree = new mongoose.Types.ObjectId().toString();
      const eventFour = new mongoose.Types.ObjectId().toString();
      const eventFive = new mongoose.Types.ObjectId().toString();
      const eventSix = new mongoose.Types.ObjectId().toString();

      expect(
        getTopCandidateEventIds({
          judgementStatus: 'balloting',
          voteBreakdown: [
            { eventId: eventOne },
            { eventId: eventTwo },
            { eventId: eventThree },
            { eventId: eventFour },
            { eventId: eventFive },
            { eventId: eventSix },
          ],
        }),
      ).toEqual([eventOne, eventTwo, eventThree, eventFour, eventFive]);
    });

    it('isJudgementWindowOpen respects endsAt timestamp', () => {
      const endsAt = '2026-07-24T20:00:00.000Z';
      expect(isJudgementWindowOpen(endsAt, new Date('2026-07-24T19:00:00.000Z'))).toBe(true);
      expect(isJudgementWindowOpen(endsAt, new Date('2026-07-24T21:00:00.000Z'))).toBe(false);
    });
  });

  describe('cast ballot / judgement APIs', () => {
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

    async function openBalloting() {
      const result = await recomputeCrewWeekState(req, {
        crewId: crewId.toString(),
        batchWeek,
      });
      expect(result.data.judgementStatus).toBe('balloting');
      expect(result.data.shortlistEventIds.map(String)).toEqual([
        eventTwoId.toString(),
        eventOneId.toString(),
      ]);
      return result.data;
    }

    function memberReq(userId) {
      return {
        ...req,
        user: { userId: userId.toString() },
      };
    }

    it('recompute opens balloting; all members balloting locks Borda winner', async () => {
      await openBalloting();

      const ballotNow = new Date('2026-07-21T18:00:00.000Z');
      const rankingWinnerFirst = [eventTwoId.toString(), eventOneId.toString()];

      const first = await castPivotCrewWeekBallot(memberReq(ownerId), {
        crewId: crewId.toString(),
        ranking: rankingWinnerFirst,
        batchWeek,
        now: ballotNow,
      });
      expect(first.data.judgementStatus).toBe('balloting');
      expect(first.data.ballot.ballotedCount).toBe(1);
      expect(first.data.ballot.viewerHasBalloted).toBe(true);

      await castPivotCrewWeekBallot(memberReq(memberBId), {
        crewId: crewId.toString(),
        ranking: rankingWinnerFirst,
        batchWeek,
        now: new Date('2026-07-21T18:05:00.000Z'),
      });

      const locked = await castPivotCrewWeekBallot(memberReq(memberCId), {
        crewId: crewId.toString(),
        ranking: rankingWinnerFirst,
        batchWeek,
        now: new Date('2026-07-21T18:10:00.000Z'),
      });

      expect(locked.data.judgementStatus).toBe('confirmed');
      expect(locked.data.locked).toBe(true);
      expect(locked.data.proposedEvent.id).toBe(eventTwoId.toString());
      expect(locked.data.ballot.ballotedCount).toBe(3);

      const { PivotCrewWeekState } = getModels(
        { db: mongo.connection, school: tenantKey },
        'PivotCrewWeekState',
      );
      const stored = await PivotCrewWeekState.findOne({ crewId, batchWeek }).lean();
      expect(stored.judgementStatus).toBe('confirmed');
      expect(stored.proposedEventId.toString()).toBe(eventTwoId.toString());
      expect(stored.memberBallots).toHaveLength(3);
    });

    it('rejects duplicate ballot with 409', async () => {
      await openBalloting();

      const ranking = [eventTwoId.toString(), eventOneId.toString()];
      await castPivotCrewWeekBallot(req, {
        crewId: crewId.toString(),
        ranking,
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      const duplicate = await castPivotCrewWeekBallot(req, {
        crewId: crewId.toString(),
        ranking,
        batchWeek,
        now: new Date('2026-07-21T18:01:00.000Z'),
      });

      expect(duplicate.status).toBe(409);
      expect(duplicate.code).toBe('BALLOT_ALREADY_CAST');
    });

    it('rejects invalid ranking with 400', async () => {
      await openBalloting();

      const result = await castPivotCrewWeekBallot(req, {
        crewId: crewId.toString(),
        ranking: [new mongoose.Types.ObjectId().toString()],
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      expect(result.status).toBe(400);
      expect(result.code).toBe('RANKING_INVALID');
    });

    it('GET judgement returns ballot fields while balloting', async () => {
      await openBalloting();

      await castPivotCrewWeekBallot(req, {
        crewId: crewId.toString(),
        ranking: [eventTwoId.toString(), eventOneId.toString()],
        batchWeek,
        now: new Date('2026-07-21T18:00:00.000Z'),
      });

      const result = await getPivotCrewWeekJudgement(req, {
        crewId: crewId.toString(),
        batchWeek,
        now: new Date('2026-07-21T18:30:00.000Z'),
      });

      expect(result.data.crewName).toBe('Judgement Crew');
      expect(result.data.judgementStatus).toBe('balloting');
      expect(result.data.shortlistEventIds).toEqual([
        eventTwoId.toString(),
        eventOneId.toString(),
      ]);
      expect(result.data.ballot).toMatchObject({
        shortlistEventIds: [eventTwoId.toString(), eventOneId.toString()],
        ballotedCount: 1,
        activeCount: 3,
        viewerHasBalloted: true,
        canBallot: false,
      });
      expect(result.data.ballot.viewerRanking).toEqual([
        eventTwoId.toString(),
        eventOneId.toString(),
      ]);
      expect(result.data.ballot.endsAt).toBeTruthy();
      expect(result.data.judgementWindowOpen).toBe(true);
    });

    it('loadLockedCrewPicksForUser surfaces confirmed picks after ballot lock', async () => {
      await openBalloting();

      const ranking = [eventTwoId.toString(), eventOneId.toString()];
      const ballotNow = new Date('2026-07-21T18:00:00.000Z');

      await castPivotCrewWeekBallot(memberReq(ownerId), {
        crewId: crewId.toString(),
        ranking,
        batchWeek,
        now: ballotNow,
      });
      await castPivotCrewWeekBallot(memberReq(memberBId), {
        crewId: crewId.toString(),
        ranking,
        batchWeek,
        now: ballotNow,
      });
      await castPivotCrewWeekBallot(memberReq(memberCId), {
        crewId: crewId.toString(),
        ranking,
        batchWeek,
        now: ballotNow,
      });

      const crewPicks = await loadLockedCrewPicksForUser(req, batchWeek);

      expect(crewPicks).toHaveLength(1);
      expect(crewPicks[0].crewName).toBe('Judgement Crew');
      expect(crewPicks[0].event.id).toBe(eventTwoId.toString());
      expect(crewPicks[0].judgementStatus).toBe('confirmed');
    });
  });
});
