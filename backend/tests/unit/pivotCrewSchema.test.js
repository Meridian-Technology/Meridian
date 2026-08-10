const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotCrewSchema = require('../../schemas/pivotCrew');
const pivotCrewMembershipSchema = require('../../schemas/pivotCrewMembership');
const getModels = require('../../services/getModelService');

describe('PivotCrew + PivotCrewMembership schemas (Task 1.1)', () => {
  let mongo;
  let PivotCrew;
  let PivotCrewMembership;
  let req;

  const ownerId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();
  const tenantKey = 'nyc';

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    PivotCrew = getOrCreateModel(mongo.connection, 'PivotCrew', pivotCrewSchema, 'pivotCrews');
    PivotCrewMembership = getOrCreateModel(
      mongo.connection,
      'PivotCrewMembership',
      pivotCrewMembershipSchema,
      'pivotCrewMemberships',
    );
    req = { db: mongo.connection, school: tenantKey };

    await PivotCrew.syncIndexes();
    await PivotCrewMembership.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotCrew.syncIndexes();
    await PivotCrewMembership.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getModels registration', () => {
    it('registers PivotCrew and PivotCrewMembership on tenant connection', () => {
      const models = getModels(req, 'PivotCrew', 'PivotCrewMembership');

      expect(models.PivotCrew).toBeDefined();
      expect(models.PivotCrewMembership).toBeDefined();
      expect(models.PivotCrew.collection.name).toBe('pivotCrews');
      expect(models.PivotCrewMembership.collection.name).toBe('pivotCrewMemberships');
    });
  });

  describe('PivotCrew', () => {
    it('persists crew with tenantKey and creator', async () => {
      const crew = await PivotCrew.create({
        name: 'Weekend Runners',
        createdBy: ownerId,
        tenantKey,
        shareInviteToken: PivotCrewMembership.generateInviteToken(),
      });

      expect(crew._id).toBeDefined();
      expect(crew.name).toBe('Weekend Runners');
      expect(crew.createdBy).toEqual(ownerId);
      expect(crew.tenantKey).toBe('nyc');
      expect(crew.archivedAt).toBeNull();
      expect(crew.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('PivotCrewMembership', () => {
    async function createCrew(name) {
      return PivotCrew.create({
        name,
        createdBy: ownerId,
        tenantKey,
        shareInviteToken: PivotCrewMembership.generateInviteToken(),
      });
    }

    it('allows a user to belong to multiple active crews', async () => {
      const now = new Date();
      const crewA = await createCrew('Crew A');
      const crewB = await createCrew('Crew B');
      const crewC = await createCrew('Crew C');

      await PivotCrewMembership.create([
        {
          crewId: crewA._id,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'owner',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId: crewB._id,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
        {
          crewId: crewC._id,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        },
      ]);

      const memberships = await PivotCrewMembership.find({
        userId: ownerId,
        status: 'active',
      }).lean();

      expect(memberships).toHaveLength(3);
    });

    it('rejects duplicate active membership for same crew and user', async () => {
      const now = new Date();
      const crew = await createCrew('Duplicate Guard');

      await PivotCrewMembership.create({
        crewId: crew._id,
        userId: ownerId,
        inviteToken: PivotCrewMembership.generateInviteToken(),
        status: 'active',
        role: 'owner',
        invitedAt: now,
        joinedAt: now,
      });

      await expect(
        PivotCrewMembership.create({
          crewId: crew._id,
          userId: ownerId,
          inviteToken: PivotCrewMembership.generateInviteToken(),
          status: 'active',
          role: 'member',
          invitedAt: now,
          joinedAt: now,
        }),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('enforces unique inviteToken', async () => {
      const now = new Date();
      const crew = await createCrew('Token Guard');
      const token = PivotCrewMembership.generateInviteToken();

      await PivotCrewMembership.create({
        crewId: crew._id,
        userId: ownerId,
        inviteToken: token,
        status: 'active',
        role: 'owner',
        invitedAt: now,
        joinedAt: now,
      });

      await expect(
        PivotCrewMembership.create({
          crewId: crew._id,
          userId: memberId,
          inviteToken: token,
          status: 'invited',
          role: 'member',
          invitedAt: now,
        }),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('allows invited placeholders without userId', async () => {
      const now = new Date();
      const crew = await createCrew('Invited Bench');

      const invited = await PivotCrewMembership.create({
        crewId: crew._id,
        userId: null,
        inviteToken: PivotCrewMembership.generateInviteToken(),
        status: 'invited',
        role: 'member',
        invitedAt: now,
      });

      expect(invited.userId).toBeNull();
      expect(invited.joinedAt).toBeNull();
      expect(invited.status).toBe('invited');
    });

    it('allows left membership and re-join as new active row', async () => {
      const now = new Date();
      const crew = await createCrew('Leave and Return');

      await PivotCrewMembership.create({
        crewId: crew._id,
        userId: ownerId,
        inviteToken: PivotCrewMembership.generateInviteToken(),
        status: 'left',
        role: 'member',
        invitedAt: now,
        joinedAt: now,
      });

      const rejoined = await PivotCrewMembership.create({
        crewId: crew._id,
        userId: ownerId,
        inviteToken: PivotCrewMembership.generateInviteToken(),
        status: 'active',
        role: 'member',
        invitedAt: now,
        joinedAt: now,
      });

      expect(rejoined.status).toBe('active');
    });
  });
});
