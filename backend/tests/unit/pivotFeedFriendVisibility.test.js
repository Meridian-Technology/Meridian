jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotSafetyService', () => ({
  getHiddenUserIdSet: jest.fn().mockResolvedValue(new Set()),
}));

const getModels = require('../../services/getModelService');
const { loadFriendSocial } = require('../../services/pivotFeedService');

const me = '64a000000000000000000001';
const open = '64a000000000000000000002';
const quiet = '64a000000000000000000003';
const eventId = '65a000000000000000000001';

function q(value) {
  const chain = { select: () => chain, lean: () => Promise.resolve(value) };
  return chain;
}

describe('loadFriendSocial plan visibility', () => {
  it('leaves friends who share plans with nobody out of event face piles and counts', async () => {
    getModels.mockReturnValue({
      Friendship: {
        find: () =>
          q([
            { requester: me, recipient: open },
            { requester: quiet, recipient: me },
          ]),
      },
      PivotEventIntent: {
        find: (query) =>
          query.userId === me
            ? q([])
            : q([
                { eventId, userId: open, status: 'registered' },
                { eventId, userId: quiet, status: 'registered' },
              ]),
      },
      User: {
        find: () =>
          q([
            { _id: open, name: 'Open' },
            { _id: quiet, name: 'Quiet', pivotPlanVisibility: 'nobody' },
          ]),
      },
    });

    const { socialByEvent } = await loadFriendSocial({ school: 'boston' }, me, [eventId]);
    const social = socialByEvent.get(eventId);

    expect(social.friendsGoing.map((friend) => friend.name)).toEqual(['Open']);
    expect(social.friendRegisteredCount).toBe(1);
  });
});
