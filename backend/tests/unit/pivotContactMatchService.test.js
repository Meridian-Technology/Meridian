jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/getGlobalModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { hashContactEmail } = require('../../utilities/pivotContactHash');
const {
  matchPivotContacts,
  syncUserContactHashes,
  MAX_HASHES_PER_REQUEST,
} = require('../../services/pivotContactMatchService');

const userId = '507f191e810c19729de860eb';
const globalUserId = '507f191e810c19729de860ea';
const friendGlobalId = '507f191e810c19729de860ef';
const friendTenantId = '507f191e810c19729de860ec';

const req = {
  user: { userId, globalUserId },
  school: 'brooklyn',
};

describe('pivotContactMatchService', () => {
  let User;
  let Friendship;
  let GlobalUser;
  let PivotContactHash;
  let TenantMembership;

  beforeEach(() => {
    User = { find: jest.fn() };
    Friendship = { find: jest.fn() };
    GlobalUser = { findById: jest.fn() };
    PivotContactHash = {
      updateOne: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    TenantMembership = { find: jest.fn() };

    getModels.mockReturnValue({ User, Friendship });
    getGlobalModels.mockReturnValue({ GlobalUser, PivotContactHash, TenantMembership });
  });

  describe('syncUserContactHashes', () => {
    it('upserts a hashed email for the current global user', async () => {
      GlobalUser.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ email: 'me@example.com' }),
      });

      const result = await syncUserContactHashes(req);

      expect(result.synced).toBe(true);
      expect(PivotContactHash.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          identifierType: 'email',
          hash: hashContactEmail('me@example.com'),
        }),
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            identifierType: 'email',
            hash: hashContactEmail('me@example.com'),
          }),
        }),
        { upsert: true },
      );
    });
  });

  describe('matchPivotContacts', () => {
    it('requires authentication', async () => {
      const result = await matchPivotContacts({}, { hashes: [] });
      expect(result.status).toBe(401);
    });

    it('rejects oversized hash batches', async () => {
      const hashes = Array.from({ length: MAX_HASHES_PER_REQUEST + 1 }, (_, index) => ({
        type: 'email',
        hash: hashContactEmail(`user${index}@example.com`),
      }));

      const result = await matchPivotContacts(req, { hashes });
      expect(result.code).toBe('TOO_MANY_HASHES');
    });

    it('returns matched tenant users excluding existing friends', async () => {
      const targetHash = hashContactEmail('friend@example.com');

      GlobalUser.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ email: 'me@example.com' }),
      });

      PivotContactHash.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            globalUserId: friendGlobalId,
            identifierType: 'email',
            hash: targetHash,
          },
        ]),
      });

      TenantMembership.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            globalUserId: friendGlobalId,
            tenantUserId: friendTenantId,
          },
        ]),
      });

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: friendTenantId,
            name: 'Friend User',
            picture: null,
          },
        ]),
      });

      Friendship.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await matchPivotContacts(req, {
        hashes: [{ type: 'email', hash: targetHash }],
      });

      expect(result.data.users).toEqual([
        {
          id: friendTenantId,
          name: 'Friend User',
          picture: null,
          friendshipStatus: 'none',
        },
      ]);
      expect(result.data.matchedHashCount).toBe(1);
    });

    it('hashes raw identifiers server-side without persisting them', async () => {
      GlobalUser.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ email: 'me@example.com' }),
      });

      PivotContactHash.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await matchPivotContacts(req, {
        identifiers: [{ type: 'email', value: 'friend@example.com' }],
      });

      expect(PivotContactHash.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ identifierType: 'email', hash: hashContactEmail('friend@example.com') }],
        }),
      );
      expect(result.data.submittedHashCount).toBe(1);
    });
  });
});
