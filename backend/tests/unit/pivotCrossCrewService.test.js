const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotCrewSchema = require('../../schemas/pivotCrew');
const pivotCrewMembershipSchema = require('../../schemas/pivotCrewMembership');
const pivotCrewWeekStateSchema = require('../../schemas/pivotCrewWeekState');
const friendshipSchema = require('../../schemas/friendship');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  memberQualifiesForCrossCrewOverlap,
  crewQualifiesForCrossCrewOverlap,
  detectCrossCrewOverlapEventIds,
  getCrossCrewOverlapByEventId,
} = require('../../services/pivotCrossCrewService');
const { PIVOT_CREW_CONFIG_DEFAULTS } = require('../../utilities/pivotCrewConfig');

describe('pivotCrossCrewService (Task 4.1)', () => {
  const batchWeek = '2026-W30';
  const tenantKey = 'nyc';

  describe('pure helpers', () => {
    it('memberQualifiesForCrossCrewOverlap accepts direct friendship', () => {
      const userFriendIds = new Set(['member-a', 'friend-x']);
      expect(
        memberQualifiesForCrossCrewOverlap({
          userFriendIds,
          memberFriendIds: new Set(['friend-y']),
          memberId: 'member-a',
          minSharedFriends: 1,
        }),
      ).toBe(true);
    });

    it('memberQualifiesForCrossCrewOverlap accepts enough mutual friends', () => {
      const userFriendIds = new Set(['friend-x', 'friend-y']);
      expect(
        memberQualifiesForCrossCrewOverlap({
          userFriendIds,
          memberFriendIds: new Set(['friend-x', 'friend-z']),
          memberId: 'member-a',
          minSharedFriends: 1,
        }),
      ).toBe(true);
    });

    it('memberQualifiesForCrossCrewOverlap rejects when graph does not connect', () => {
      const userFriendIds = new Set(['friend-x']);
      expect(
        memberQualifiesForCrossCrewOverlap({
          userFriendIds,
          memberFriendIds: new Set(['friend-y']),
          memberId: 'member-a',
          minSharedFriends: 1,
        }),
      ).toBe(false);
    });

    it('crewQualifiesForCrossCrewOverlap passes when any member qualifies', () => {
      const userFriendIds = new Set(['member-b']);
      const friendIdsByMemberId = new Map([
        ['member-a', new Set(['friend-x'])],
        ['member-b', new Set(['friend-y'])],
      ]);

      expect(
        crewQualifiesForCrossCrewOverlap({
          memberIds: ['member-a', 'member-b'],
          friendIdsByMemberId,
          userFriendIds,
          minSharedFriends: 1,
        }),
      ).toBe(true);
    });
  });

  describe('detectCrossCrewOverlapEventIds', () => {
    let mongo;
    let viewerId;
    let friendInOtherCrewId;
    let strangerId;
    let userCrewId;
    let otherCrewId;
    let overlapEventId;
    let unrelatedEventId;

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
      getOrCreateModel(mongo.connection, 'Friendship', friendshipSchema, 'friendships');

      viewerId = new mongoose.Types.ObjectId();
      friendInOtherCrewId = new mongoose.Types.ObjectId();
      strangerId = new mongoose.Types.ObjectId();
      userCrewId = new mongoose.Types.ObjectId();
      otherCrewId = new mongoose.Types.ObjectId();
      overlapEventId = new mongoose.Types.ObjectId();
      unrelatedEventId = new mongoose.Types.ObjectId();

      const req = { db: mongo.connection, school: tenantKey, user: { userId: viewerId.toString() } };
      const {
        PivotCrew,
        PivotCrewMembership,
        PivotCrewWeekState,
        Friendship,
      } = getModels(
        req,
        'PivotCrew',
        'PivotCrewMembership',
        'PivotCrewWeekState',
        'Friendship',
      );

      await PivotCrew.insertMany([
        {
          _id: userCrewId,
          name: 'My Crew',
          createdBy: viewerId,
          tenantKey,
          shareInviteToken: PivotCrewMembership.generateInviteToken(),
        },
        {
          _id: otherCrewId,
          name: 'Other Crew',
          createdBy: friendInOtherCrewId,
          tenantKey,
          shareInviteToken: PivotCrewMembership.generateInviteToken(),
        },
      ]);

      await PivotCrewMembership.insertMany([
        {
          crewId: userCrewId,
          userId: viewerId,
          inviteToken: 'token-viewer',
          status: 'active',
          role: 'owner',
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
        {
          crewId: otherCrewId,
          userId: friendInOtherCrewId,
          inviteToken: 'token-friend',
          status: 'active',
          role: 'owner',
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
        {
          crewId: otherCrewId,
          userId: strangerId,
          inviteToken: 'token-stranger',
          status: 'active',
          role: 'member',
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      ]);

      await PivotCrewWeekState.insertMany([
        {
          crewId: otherCrewId,
          batchWeek,
          tenantKey,
          swipeProgress: {
            activeMemberCount: 2,
            swipedCount: 2,
            invitedCount: 0,
            participationRate: 1,
            quorumMet: true,
          },
          proposedEventId: overlapEventId,
          proposedScore: 2,
          voteBreakdown: [],
          judgementStatus: 'confirmed',
          aggregatedAt: new Date(),
        },
        {
          crewId: userCrewId,
          batchWeek,
          tenantKey,
          swipeProgress: {
            activeMemberCount: 1,
            swipedCount: 1,
            invitedCount: 0,
            participationRate: 1,
            quorumMet: true,
          },
          proposedEventId: unrelatedEventId,
          proposedScore: 1,
          voteBreakdown: [],
          judgementStatus: 'confirmed',
          aggregatedAt: new Date(),
        },
      ]);

      await Friendship.create({
        requester: viewerId,
        recipient: friendInOtherCrewId,
        status: 'accepted',
      });
    });

    beforeEach(() => {
      getTenantByKey.mockReset();
      getTenantByKey.mockResolvedValue({
        pivotCrewConfig: PIVOT_CREW_CONFIG_DEFAULTS,
      });
    });

    afterAll(async () => {
      await mongo.cleanup();
    });

    function buildReq(userId = viewerId) {
      return {
        db: mongo.connection,
        school: tenantKey,
        user: { userId: userId.toString() },
      };
    }

    it('returns overlap when another crew has a locked pick and friend graph connects', async () => {
      const overlapIds = await detectCrossCrewOverlapEventIds(buildReq(), batchWeek);

      expect([...overlapIds]).toEqual([overlapEventId.toString()]);
    });

    it('returns no overlap when crossCrew.enabled is false', async () => {
      getTenantByKey.mockResolvedValue({
        pivotCrewConfig: {
          ...PIVOT_CREW_CONFIG_DEFAULTS,
          crossCrew: {
            ...PIVOT_CREW_CONFIG_DEFAULTS.crossCrew,
            enabled: false,
          },
        },
      });

      const overlapIds = await detectCrossCrewOverlapEventIds(buildReq(), batchWeek);

      expect([...overlapIds]).toEqual([]);
    });

    it('returns no overlap when friend graph does not connect to the other crew', async () => {
      const isolatedUserId = new mongoose.Types.ObjectId();
      const req = buildReq(isolatedUserId);

      const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
      await PivotCrewMembership.create({
        crewId: userCrewId,
        userId: isolatedUserId,
        inviteToken: 'token-isolated',
        status: 'active',
        role: 'member',
        invitedAt: new Date(),
        joinedAt: new Date(),
      });

      const overlapIds = await detectCrossCrewOverlapEventIds(req, batchWeek);

      expect([...overlapIds]).toEqual([]);
    });

    it('surfaces overlap for a user in only one crew when they know a member of another crew', async () => {
      const overlapIds = await detectCrossCrewOverlapEventIds(buildReq(), batchWeek);

      expect([...overlapIds]).toContain(overlapEventId.toString());
      expect([...overlapIds]).not.toContain(unrelatedEventId.toString());
    });

    it('getCrossCrewOverlapByEventId filters to requested event ids', async () => {
      const result = await getCrossCrewOverlapByEventId(buildReq(), {
        batchWeek,
        eventIds: [overlapEventId.toString(), unrelatedEventId.toString()],
      });

      expect(result.data.get(overlapEventId.toString())).toEqual({
        surfaceCopyKey: 'another_crew_going',
      });
      expect(result.data.has(unrelatedEventId.toString())).toBe(false);
    });

    it('getCrossCrewOverlapByEventId returns empty map when feature disabled', async () => {
      getTenantByKey.mockResolvedValue({
        pivotCrewConfig: {
          ...PIVOT_CREW_CONFIG_DEFAULTS,
          crossCrew: {
            ...PIVOT_CREW_CONFIG_DEFAULTS.crossCrew,
            enabled: false,
          },
        },
      });

      const result = await getCrossCrewOverlapByEventId(buildReq(), {
        batchWeek,
        eventIds: [overlapEventId.toString()],
      });

      expect(result.data.size).toBe(0);
    });
  });
});
