jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotSafetyService', () => ({
  getHiddenUserIdSet: jest.fn(),
  areUsersBlocked: jest.fn(),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn().mockResolvedValue(null),
  getMergedTenants: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/pivotFriendService', () => ({
  ...jest.requireActual('../../services/pivotFriendService'),
  getPivotCohortSuggestions: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getHiddenUserIdSet } = require('../../services/pivotSafetyService');
const { getPivotCohortSuggestions } = require('../../services/pivotFriendService');
const { PIVOT_FEED_INGEST_STATUS } = require('../../utilities/pivotIngestStatus');
const { getPivotSocialWeek } = require('../../services/pivotSocialService');

const me = '64a000000000000000000001';
const maya = '64a000000000000000000002';
const sam = '64a000000000000000000003';
const quiet = '64a000000000000000000004';
const jo = '64a000000000000000000005';
const blocked = '64a000000000000000000006';
const eventA = '65a000000000000000000001';
const eventB = '65a000000000000000000002';
const pastEvent = '65a000000000000000000003';

const now = new Date('2026-10-08T12:00:00Z');

function q(value) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    lean: () => Promise.resolve(value),
  };
  return chain;
}

function event(id, name, start) {
  return {
    _id: id,
    name,
    start_time: new Date(start),
    end_time: null,
    customFields: { pivot: { ingestStatus: PIVOT_FEED_INGEST_STATUS, host: { name: 'Host' } } },
  };
}

const users = {
  [maya]: { _id: maya, name: 'Maya', picture: 'm.jpg' },
  [sam]: { _id: sam, name: 'Sam' },
  [quiet]: { _id: quiet, name: 'Quiet', pivotPlanVisibility: 'nobody' },
  [jo]: { _id: jo, name: 'Jo' },
};

describe('getPivotSocialWeek', () => {
  let models;

  beforeEach(() => {
    jest.clearAllMocks();
    getHiddenUserIdSet.mockResolvedValue(new Set([blocked]));
    getPivotCohortSuggestions.mockResolvedValue({ data: { users: [] } });
    getGlobalModels.mockReturnValue({
      PivotUserInviteAcceptance: {
        find: () => q([{ inviteeGlobalUserId: 'g-sam', createdAt: new Date('2026-10-07T10:00:00Z') }]),
      },
      TenantMembership: { find: () => q([{ globalUserId: 'g-sam', tenantUserId: sam }]) },
    });

    const friendships = [
      // my friends
      { requester: me, recipient: maya, status: 'accepted' },
      { requester: sam, recipient: me, status: 'accepted' },
      { requester: me, recipient: quiet, status: 'accepted' },
      { requester: me, recipient: blocked, status: 'accepted' },
    ];
    const friendsOfFriends = [
      { requester: maya, recipient: jo },
      { requester: jo, recipient: sam },
      { requester: maya, recipient: me },
      { requester: sam, recipient: blocked },
    ];

    models = {
      Friendship: {
        find: jest.fn((query) => {
          if (query.status === 'accepted' && query.$or?.[0]?.requester === me) return q(friendships);
          if (query.status === 'accepted') return q(friendsOfFriends);
          return q([]); // no pending rows with suggestions
        }),
      },
      User: {
        findById: () => q({ pivotPlanVisibility: 'circles' }),
        find: jest.fn((query) => q(query._id.$in.map((id) => users[String(id)]).filter(Boolean))),
      },
      PivotEventIntent: {
        find: jest.fn((query) => {
          if (query.userId === me) return q([{ eventId: eventA, status: 'interested' }]);
          return q([
            { eventId: eventA, userId: maya, status: 'registered', updatedAt: new Date('2026-10-08T09:00:00Z') },
            { eventId: eventA, userId: sam, status: 'interested', updatedAt: new Date('2026-10-06T09:00:00Z') },
            { eventId: eventB, userId: sam, status: 'interested', updatedAt: new Date('2026-10-07T12:00:00Z') },
            { eventId: pastEvent, userId: maya, status: 'registered', updatedAt: new Date('2026-10-05T09:00:00Z') },
          ]);
        }),
      },
      Event: {
        find: jest.fn((query) => {
          if (query.status) {
            return q([
              event(eventB, 'Poetry night', '2026-10-09T20:00:00Z'),
              event(eventA, 'Night market', '2026-10-10T19:00:00Z'),
              event(pastEvent, 'Monday jazz', '2026-10-05T19:00:00Z'),
            ]);
          }
          return q([{ _id: eventB, name: 'Poetry night' }]);
        }),
      },
      PivotCrewMembership: { distinct: jest.fn(async () => ['crew-1']) },
      PivotCrew: { find: () => q([{ _id: 'crew-1', name: 'roommates' }]) },
      PivotCrewWeekState: {
        find: () => q([{ crewId: 'crew-1', proposedEventId: eventB, updatedAt: new Date('2026-10-08T11:00:00Z') }]),
      },
    };
    getModels.mockImplementation(() => models);
  });

  const req = {
    school: 'boston',
    globalDb: {},
    user: { userId: me, globalUserId: '64b000000000000000000001' },
  };

  it('ranks upcoming friend plans by friends going, hides nobody-visible friends and past events', async () => {
    const { data } = await getPivotSocialWeek(req, { batchWeek: '2026-W41', now });

    expect(data.batchWeek).toBe('2026-W41');
    expect(data.friendCount).toBe(3);
    expect(data.planVisibility).toBe('circles');
    expect(data.friendPlans.map((plan) => plan.name)).toEqual(['Night market', 'Poetry night']);
    expect(data.friendPlans[0]).toMatchObject({
      userIntent: 'interested',
      friendsGoingCount: 1,
      friendsInterestedCount: 2,
    });
    expect(data.friendPlans[0].friendsGoing.map((f) => f.name)).toEqual(['Maya']);

    const intentQuery = models.PivotEventIntent.find.mock.calls[0][0];
    expect(intentQuery.userId.$in.map(String).sort()).toEqual([maya, sam].sort());
  });

  it('merges friend plans, invite joins, and circle picks newest first', async () => {
    const { data } = await getPivotSocialWeek(req, { batchWeek: '2026-W41', now });

    expect(data.activity.map((row) => row.type)).toEqual([
      'circle_pick',
      'friend_going',
      'friend_interested',
      'invite_joined',
      'friend_interested',
    ]);
    expect(data.activity[0]).toMatchObject({
      crew: { name: 'roommates' },
      event: { name: 'Poetry night' },
    });
    expect(data.activity[3].actor.name).toBe('Sam');
    expect(data.activity.some((row) => row.event?.name === 'Monday jazz')).toBe(false);
  });

  it('suggests friends of friends by mutual count, skipping me, friends, and blocked users', async () => {
    const { data } = await getPivotSocialWeek(req, { batchWeek: '2026-W41', now });

    expect(data.suggestions).toEqual([
      {
        id: jo,
        name: 'Jo',
        picture: null,
        friendshipStatus: 'none',
        mutualCount: 2,
        reason: 'mutual',
      },
    ]);
    expect(getPivotCohortSuggestions).not.toHaveBeenCalled();
  });

  it('falls back to cohort-mates when there are no friends yet', async () => {
    models.Friendship.find = jest.fn(() => q([]));
    getPivotCohortSuggestions.mockResolvedValue({
      data: { users: [{ id: jo, name: 'Jo', picture: null, friendshipStatus: 'none' }] },
    });

    const { data } = await getPivotSocialWeek(req, { batchWeek: '2026-W41', now });

    expect(data.friendCount).toBe(0);
    expect(data.friendPlans).toEqual([]);
    expect(data.suggestions).toEqual([
      { id: jo, name: 'Jo', picture: null, friendshipStatus: 'none', mutualCount: 0, reason: 'cohort' },
    ]);
  });

  it('defaults to the live drop week', async () => {
    const { data } = await getPivotSocialWeek(req, { now });
    expect(data.batchWeek).toMatch(/^2026-W4[01]$/);
  });

  it('validates the week and requires sign-in', async () => {
    expect((await getPivotSocialWeek(req, { batchWeek: 'next week' })).status).toBe(400);
    expect((await getPivotSocialWeek({ school: 'boston' })).status).toBe(401);
  });
});
