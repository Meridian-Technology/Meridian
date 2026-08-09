jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));

const mongoose = require('mongoose');
const getGlobalModels = require('../../services/getGlobalModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  listCreatorGrants,
  grantCreator,
  revokeCreator,
  getActiveCreatorGrant,
} = require('../../services/pivotCreatorGrantService');

const GLOBAL_USER_ID = '507f191e810c19729de860ea';
const ACTOR_ID = '507f191e810c19729de860eb';
const TENANT = { tenantKey: 'brooklyn', tenantType: 'pivot' };

function makeGrantDoc(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    globalUserId: new mongoose.Types.ObjectId(GLOBAL_USER_ID),
    tenantKey: 'brooklyn',
    status: 'active',
    grantedBy: new mongoose.Types.ObjectId(ACTOR_ID),
    grantedAt: new Date('2026-08-01T12:00:00.000Z'),
    revokedBy: null,
    revokedAt: null,
    save: jest.fn(async function save() {
      return this;
    }),
    toObject() {
      const { save, toObject, ...rest } = this;
      return rest;
    },
    ...overrides,
  };
}

describe('pivotCreatorGrantService', () => {
  let PivotCreatorGrant;
  let GlobalUser;
  let req;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { globalUserId: ACTOR_ID }, globalDb: {} };

    PivotCreatorGrant = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    };
    GlobalUser = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    getGlobalModels.mockImplementation((_req, ...names) => {
      const all = { PivotCreatorGrant, GlobalUser };
      return names.reduce((acc, name) => {
        if (all[name]) acc[name] = all[name];
        return acc;
      }, {});
    });

    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
  });

  function mockFindByIdLean(value) {
    GlobalUser.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(value),
      }),
    });
  }

  function mockFindOneLean(model, value) {
    model.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(value),
      }),
      lean: jest.fn().mockResolvedValue(value),
    });
  }

  describe('getActiveCreatorGrant', () => {
    it('returns active grant for user + tenant', async () => {
      const grant = { globalUserId: GLOBAL_USER_ID, tenantKey: 'brooklyn', status: 'active' };
      PivotCreatorGrant.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(grant),
      });

      const result = await getActiveCreatorGrant(req, {
        globalUserId: GLOBAL_USER_ID,
        tenantKey: 'brooklyn',
      });

      expect(result).toEqual(grant);
      expect(PivotCreatorGrant.findOne).toHaveBeenCalledWith({
        globalUserId: GLOBAL_USER_ID,
        tenantKey: 'brooklyn',
        status: 'active',
      });
    });

    it('returns null when grant missing or revoked', async () => {
      PivotCreatorGrant.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await getActiveCreatorGrant(req, {
        globalUserId: GLOBAL_USER_ID,
        tenantKey: 'brooklyn',
      });

      expect(result).toBeNull();
    });
  });

  describe('listCreatorGrants', () => {
    it('lists active grants with user email', async () => {
      const grant = makeGrantDoc();
      PivotCreatorGrant.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([grant]),
        }),
      });
      GlobalUser.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: grant.globalUserId, email: 'host@example.com', name: 'Host' },
          ]),
        }),
      });

      const result = await listCreatorGrants(req, 'brooklyn');

      expect(result.error).toBeUndefined();
      expect(result.data.tenantKey).toBe('brooklyn');
      expect(result.data.grants).toHaveLength(1);
      expect(result.data.grants[0].email).toBe('host@example.com');
      expect(result.data.grants[0].userId).toBe(String(grant.globalUserId));
      expect(PivotCreatorGrant.find).toHaveBeenCalledWith({
        tenantKey: 'brooklyn',
        status: 'active',
      });
    });

    it('rejects non-pivot tenant', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await listCreatorGrants(req, 'rpi');
      expect(result.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('grantCreator', () => {
    it('creates a new active grant by email', async () => {
      mockFindOneLean(GlobalUser, {
        _id: new mongoose.Types.ObjectId(GLOBAL_USER_ID),
        email: 'host@example.com',
        name: 'Host',
      });
      PivotCreatorGrant.findOne.mockResolvedValue(null);
      const created = makeGrantDoc();
      PivotCreatorGrant.create.mockResolvedValue(created);

      const result = await grantCreator(req, 'brooklyn', { email: 'Host@Example.com' });

      expect(result.error).toBeUndefined();
      expect(result.reactivated).toBe(false);
      expect(result.data.status).toBe('active');
      expect(PivotCreatorGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'brooklyn',
          status: 'active',
          grantedBy: ACTOR_ID,
        }),
      );
    });

    it('reactivates a revoked grant', async () => {
      const user = {
        _id: new mongoose.Types.ObjectId(GLOBAL_USER_ID),
        email: 'host@example.com',
        name: 'Host',
      };
      GlobalUser.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(user),
        }),
      });
      const existing = makeGrantDoc({
        status: 'revoked',
        revokedAt: new Date('2026-07-01T00:00:00.000Z'),
        revokedBy: ACTOR_ID,
      });
      PivotCreatorGrant.findOne.mockResolvedValue(existing);

      const result = await grantCreator(req, 'brooklyn', { globalUserId: GLOBAL_USER_ID });

      expect(result.reactivated).toBe(true);
      expect(existing.status).toBe('active');
      expect(existing.revokedAt).toBeNull();
      expect(existing.save).toHaveBeenCalled();
    });

    it('conflicts when grant already active', async () => {
      mockFindByIdLean({
        _id: new mongoose.Types.ObjectId(GLOBAL_USER_ID),
        email: 'host@example.com',
      });
      PivotCreatorGrant.findOne.mockResolvedValue(makeGrantDoc({ status: 'active' }));

      const result = await grantCreator(req, 'brooklyn', { globalUserId: GLOBAL_USER_ID });

      expect(result.status).toBe(409);
      expect(result.code).toBe('CREATOR_GRANT_EXISTS');
    });
  });

  describe('revokeCreator', () => {
    it('soft-revokes an active grant', async () => {
      const grant = makeGrantDoc({ status: 'active' });
      PivotCreatorGrant.findOne.mockResolvedValue(grant);
      mockFindByIdLean({
        _id: grant.globalUserId,
        email: 'host@example.com',
        name: 'Host',
      });

      const result = await revokeCreator(req, 'brooklyn', GLOBAL_USER_ID);

      expect(result.error).toBeUndefined();
      expect(result.data.status).toBe('revoked');
      expect(grant.status).toBe('revoked');
      expect(grant.revokedBy).toBe(ACTOR_ID);
      expect(grant.save).toHaveBeenCalled();
    });

    it('returns 404 when grant missing', async () => {
      PivotCreatorGrant.findOne.mockResolvedValue(null);

      const result = await revokeCreator(req, 'brooklyn', GLOBAL_USER_ID);

      expect(result.status).toBe(404);
      expect(result.code).toBe('CREATOR_GRANT_NOT_FOUND');
    });
  });
});
