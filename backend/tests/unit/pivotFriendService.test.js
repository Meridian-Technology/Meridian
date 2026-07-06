jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/notificationService', () => ({
  withModels: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const NotificationService = require('../../services/notificationService');
const {
  searchPivotFriends,
  sendPivotFriendRequest,
  listPivotFriends,
  listPivotFriendRequests,
  acceptPivotFriendRequest,
  declinePivotFriendRequest,
  SEARCH_RESULT_LIMIT,
  MIN_QUERY_LENGTH,
} = require('../../services/pivotFriendService');

const userId = '507f191e810c19729de860eb';
const req = { user: { userId }, school: 'nyc' };

const aliceId = '507f191e810c19729de860ec';
const bobId = '507f191e810c19729de860ed';
const carolId = '507f191e810c19729de860ee';

function mockUserFind(users) {
  return {
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(users),
  };
}

function mockFriendshipFind(friendships) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(friendships),
  };
}

describe('searchPivotFriends', () => {
  let User;
  let Friendship;

  beforeEach(() => {
    User = { find: jest.fn() };
    Friendship = { find: jest.fn() };
    getModels.mockReturnValue({ User, Friendship });
  });

  it('returns empty users for queries shorter than the minimum length', async () => {
    const result = await searchPivotFriends(req, { q: 'a' });

    expect(result.data).toEqual({ users: [] });
    expect(User.find).not.toHaveBeenCalled();
  });

  it('returns empty users for blank queries', async () => {
    const result = await searchPivotFriends(req, { q: '   ' });

    expect(result.data).toEqual({ users: [] });
    expect(User.find).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const result = await searchPivotFriends({}, { q: 'alice' });

    expect(result.status).toBe(401);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('finds users by display name in the current tenant', async () => {
    User.find.mockReturnValue(
      mockUserFind([
        {
          _id: aliceId,
          name: 'Alice Nguyen',
          picture: 'https://example.com/alice.jpg',
        },
      ]),
    );
    Friendship.find.mockReturnValue(mockFriendshipFind([]));

    const result = await searchPivotFriends(req, { q: 'alice' });

    expect(User.find).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $ne: userId },
        $or: expect.arrayContaining([
          { name: { $regex: /alice/i } },
          { username: { $regex: /alice/i } },
        ]),
      }),
    );
    expect(result.data.users).toEqual([
      {
        id: aliceId,
        name: 'Alice Nguyen',
        picture: 'https://example.com/alice.jpg',
        friendshipStatus: 'none',
      },
    ]);
  });

  it('excludes the requesting user from results', async () => {
    User.find.mockReturnValue(mockUserFind([]));
    Friendship.find.mockReturnValue(mockFriendshipFind([]));

    await searchPivotFriends(req, { q: 'me' });

    expect(User.find).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $ne: userId },
      }),
    );
  });

  it('includes username when present and matches friendship status values', async () => {
    User.find.mockReturnValue(
      mockUserFind([
        { _id: aliceId, name: 'Alice Anderson', picture: null, username: 'alice_n' },
        { _id: bobId, name: 'Bob Anderson', picture: null },
        { _id: carolId, name: 'Carol Anderson', picture: null, username: 'carol_p' },
      ]),
    );
    Friendship.find.mockReturnValue(
      mockFriendshipFind([
        {
          requester: userId,
          recipient: aliceId,
          status: 'accepted',
        },
        {
          requester: bobId,
          recipient: userId,
          status: 'pending',
        },
        {
          requester: userId,
          recipient: carolId,
          status: 'pending',
        },
      ]),
    );

    const result = await searchPivotFriends(req, { q: 'an' });

    expect(result.data.users).toEqual([
      {
        id: aliceId,
        name: 'Alice Anderson',
        picture: null,
        username: 'alice_n',
        friendshipStatus: 'accepted',
      },
      {
        id: bobId,
        name: 'Bob Anderson',
        picture: null,
        friendshipStatus: 'pending_incoming',
      },
      {
        id: carolId,
        name: 'Carol Anderson',
        picture: null,
        username: 'carol_p',
        friendshipStatus: 'pending_outgoing',
      },
    ]);
  });

  it('caps search results', async () => {
    User.find.mockReturnValue(mockUserFind([]));
    Friendship.find.mockReturnValue(mockFriendshipFind([]));

    await searchPivotFriends(req, { q: 'ab' });

    expect(User.find.mock.results[0].value.limit).toHaveBeenCalledWith(SEARCH_RESULT_LIMIT);
  });

  it('exports the minimum query length constant', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});

describe('sendPivotFriendRequest', () => {
  let User;
  let Friendship;
  let createSystemNotification;
  let saveFriendship;

  beforeEach(() => {
    saveFriendship = jest.fn();
    User = {
      findById: jest.fn(),
    };
    Friendship = jest.fn(function FriendshipDoc(data) {
      Object.assign(this, data);
      this.save = saveFriendship;
    });
    Friendship.findOne = jest.fn();
    createSystemNotification = jest.fn().mockResolvedValue(undefined);
    NotificationService.withModels.mockReturnValue({ createSystemNotification });
    getModels.mockReturnValue({ User, Friendship, Notification: {} });
  });

  it('requires authentication', async () => {
    const result = await sendPivotFriendRequest({}, { userId: aliceId });
    expect(result.status).toBe(401);
  });

  it('rejects invalid user ids', async () => {
    const result = await sendPivotFriendRequest(req, { userId: 'nope' });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_USER_ID');
  });

  it('creates a pending friendship and notification', async () => {
    User.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: aliceId, name: 'Alice' }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: userId, name: 'You' }),
      });
    Friendship.findOne.mockResolvedValue(null);
    const savedFriendship = {
      _id: '665a1b2c3d4e5f6789012345',
      requester: userId,
      recipient: aliceId,
      status: 'pending',
    };
    saveFriendship.mockResolvedValue(savedFriendship);

    const result = await sendPivotFriendRequest(req, { userId: aliceId });

    expect(result.data).toEqual({
      friendshipId: savedFriendship._id,
      friendshipStatus: 'pending_outgoing',
    });
    expect(createSystemNotification).toHaveBeenCalledWith(
      aliceId,
      'User',
      'friend_request',
      expect.objectContaining({
        senderName: 'You',
        sender: userId,
      }),
    );
  });

  it('rejects duplicate pending requests', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: aliceId, name: 'Alice' }),
    });
    Friendship.findOne.mockResolvedValue({ status: 'pending' });

    const result = await sendPivotFriendRequest(req, { userId: aliceId });
    expect(result.status).toBe(400);
    expect(result.code).toBe('REQUEST_PENDING');
  });
});

describe('listPivotFriends', () => {
  it('requires authentication', async () => {
    const result = await listPivotFriends({});
    expect(result.status).toBe(401);
  });
});

describe('listPivotFriendRequests', () => {
  it('requires authentication', async () => {
    const result = await listPivotFriendRequests({});
    expect(result.status).toBe(401);
  });
});

describe('acceptPivotFriendRequest', () => {
  it('rejects invalid friendship ids', async () => {
    const result = await acceptPivotFriendRequest(req, 'bad-id');
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_FRIENDSHIP_ID');
  });
});

describe('declinePivotFriendRequest', () => {
  it('rejects invalid friendship ids', async () => {
    const result = await declinePivotFriendRequest(req, 'bad-id');
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_FRIENDSHIP_ID');
  });
});
