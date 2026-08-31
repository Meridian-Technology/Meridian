jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  getHiddenUserIdSet,
  areUsersBlocked,
  blockPivotUser,
  unblockPivotUser,
  listBlockedPivotUsers,
  reportPivotUser,
  listPivotSafetyTargets,
} = require('../../services/pivotSafetyService');

const userId = '507f191e810c19729de860eb';
const aliceId = '507f191e810c19729de860ec';
const bobId = '507f191e810c19729de860ed';
const req = { user: { userId }, school: 'nyc' };

function mockFind(docs) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  };
}

function mockFindById(doc) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(doc),
  };
}

describe('pivotSafetyService', () => {
  let User;
  let Friendship;
  let PivotUserBlock;
  let PivotSafetyReport;
  let PivotCrewMembership;

  beforeEach(() => {
    User = {
      findById: jest.fn(),
      find: jest.fn(),
    };
    Friendship = {
      find: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    PivotUserBlock = {
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    PivotSafetyReport = {
      create: jest.fn(),
    };
    PivotCrewMembership = {
      find: jest.fn(),
    };

    const models = {
      User,
      Friendship,
      PivotUserBlock,
      PivotSafetyReport,
      PivotCrewMembership,
    };
    getModels.mockImplementation((_req, ...names) =>
      names.reduce((acc, name) => {
        acc[name] = models[name];
        return acc;
      }, {}),
    );
  });

  describe('getHiddenUserIdSet', () => {
    it('returns people blocked in either direction', async () => {
      PivotUserBlock.find.mockReturnValue(
        mockFind([
          { blockerId: userId, blockedId: aliceId },
          { blockerId: bobId, blockedId: userId },
        ]),
      );

      const hidden = await getHiddenUserIdSet(req);
      expect(hidden).toEqual(new Set([aliceId, bobId]));
    });

    it('returns empty when the block model is unavailable', async () => {
      getModels.mockReturnValue({});
      const hidden = await getHiddenUserIdSet(req);
      expect(hidden.size).toBe(0);
    });
  });

  describe('areUsersBlocked', () => {
    it('is true when either user blocked the other', async () => {
      PivotUserBlock.findOne.mockReturnValue(mockFindById({ _id: 'block1' }));
      expect(await areUsersBlocked(req, userId, aliceId)).toBe(true);
    });

    it('is false when no block exists', async () => {
      PivotUserBlock.findOne.mockReturnValue(mockFindById(null));
      expect(await areUsersBlocked(req, userId, aliceId)).toBe(false);
    });
  });

  describe('blockPivotUser', () => {
    it('requires authentication', async () => {
      const result = await blockPivotUser({}, { userId: aliceId });
      expect(result.status).toBe(401);
    });

    it('rejects self-block', async () => {
      const result = await blockPivotUser(req, { userId });
      expect(result.code).toBe('SELF_BLOCK');
    });

    it('upserts a block and removes friendships', async () => {
      User.findById.mockReturnValue(mockFindById({ _id: aliceId }));

      const result = await blockPivotUser(req, { userId: aliceId });

      expect(result.data).toEqual({ userId: aliceId, blocked: true });
      expect(PivotUserBlock.updateOne).toHaveBeenCalledWith(
        { blockerId: userId, blockedId: aliceId },
        expect.objectContaining({
          $setOnInsert: { blockerId: userId, blockedId: aliceId },
        }),
        { upsert: true },
      );
      expect(Friendship.deleteMany).toHaveBeenCalled();
    });
  });

  describe('unblockPivotUser', () => {
    it('deletes the block row', async () => {
      const result = await unblockPivotUser(req, { userId: aliceId });
      expect(result.data).toEqual({ userId: aliceId, blocked: false });
      expect(PivotUserBlock.deleteOne).toHaveBeenCalledWith({
        blockerId: userId,
        blockedId: aliceId,
      });
    });
  });

  describe('reportPivotUser', () => {
    it('rejects an invalid reason', async () => {
      const result = await reportPivotUser(req, { userId: aliceId, reason: 'nope' });
      expect(result.code).toBe('INVALID_REASON');
    });

    it('stores a report', async () => {
      User.findById.mockReturnValue(mockFindById({ _id: aliceId }));
      PivotSafetyReport.create.mockResolvedValue({ _id: '507f191e810c19729de860ff' });

      const result = await reportPivotUser(req, {
        userId: aliceId,
        reason: 'harassment',
        notes: 'left a threatening message',
      });

      expect(result.data.reason).toBe('harassment');
      expect(PivotSafetyReport.create).toHaveBeenCalledWith({
        reporterId: userId,
        targetUserId: aliceId,
        reason: 'harassment',
        notes: 'left a threatening message',
      });
    });
  });

  describe('listBlockedPivotUsers', () => {
    it('returns blocked profiles newest first', async () => {
      PivotUserBlock.find.mockReturnValue(
        mockFind([{ blockedId: aliceId }, { blockedId: bobId }]),
      );
      User.find.mockReturnValue(
        mockFind([
          { _id: { toString: () => bobId }, name: 'Bob', picture: null },
          { _id: { toString: () => aliceId }, name: 'Alice', picture: null },
        ]),
      );

      const result = await listBlockedPivotUsers(req);
      expect(result.data.users.map((row) => row.name)).toEqual(['Alice', 'Bob']);
    });
  });

  describe('listPivotSafetyTargets', () => {
    it('includes friends and crew members, excluding hidden users', async () => {
      PivotUserBlock.find.mockReturnValue(mockFind([{ blockerId: userId, blockedId: bobId }]));
      Friendship.find.mockReturnValue(
        mockFind([{ requester: userId, recipient: aliceId }]),
      );
      PivotCrewMembership.find
        .mockReturnValueOnce(mockFind([{ crewId: 'crew1' }]))
        .mockReturnValueOnce(
          mockFind([
            { userId },
            { userId: aliceId },
            { userId: bobId },
          ]),
        );
      User.find.mockReturnValue(
        mockFind([{ _id: { toString: () => aliceId }, name: 'Alice', picture: null }]),
      );

      const result = await listPivotSafetyTargets(req);
      expect(result.data.users).toEqual([
        expect.objectContaining({ id: aliceId, name: 'Alice', source: 'friend' }),
      ]);
    });
  });
});
