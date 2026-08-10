jest.mock('../../services/notificationService', () => ({
  withModels: jest.fn(() => ({
    createSystemNotification: jest.fn().mockResolvedValue({}),
  })),
}));

const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotCrewSchema = require('../../schemas/pivotCrew');
const pivotCrewMembershipSchema = require('../../schemas/pivotCrewMembership');
const userSchema = require('../../schemas/user');
const getModels = require('../../services/getModelService');
const {
  createPivotCrew,
  listPivotCrews,
  getPivotCrewDetail,
  deletePivotCrew,
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
  addPivotCrewMember,
  listPivotCrewInvites,
  acceptPivotCrewInvite,
  declinePivotCrewInvite,
  countQuorumEligibleMembers,
  buildCrewQuorumSnapshot,
  PIVOT_CREW_INVITED_DISPLAY_LABEL,
} = require('../../services/pivotCrewService');

describe('pivotCrewService (Task 1.2)', () => {
  let mongo;
  let req;
  let ownerId;
  let memberId;
  let outsiderId;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    getOrCreateModel(mongo.connection, 'PivotCrew', pivotCrewSchema, 'pivotCrews');
    getOrCreateModel(
      mongo.connection,
      'PivotCrewMembership',
      pivotCrewMembershipSchema,
      'pivotCrewMemberships',
    );
    getOrCreateModel(mongo.connection, 'User', userSchema, 'users');

    const models = getModels(
      { db: mongo.connection, school: 'nyc' },
      'PivotCrew',
      'PivotCrewMembership',
      'User',
    );
    await models.PivotCrew.syncIndexes();
    await models.PivotCrewMembership.syncIndexes();
  });

  beforeEach(async () => {
    ownerId = new mongoose.Types.ObjectId();
    memberId = new mongoose.Types.ObjectId();
    outsiderId = new mongoose.Types.ObjectId();

    const { User } = getModels({ db: mongo.connection, school: 'nyc' }, 'User');
    await User.create([
      { _id: ownerId, name: 'Owner Person', email: 'owner@example.com', username: 'owner_person' },
      { _id: memberId, name: 'Member Person', email: 'member@example.com', username: 'member_person' },
      { _id: outsiderId, name: 'Outsider Person', email: 'outsider@example.com', username: 'outsider_person' },
    ]);

    req = {
      db: mongo.connection,
      school: 'nyc',
      user: { userId: ownerId.toString() },
    };
  });

  afterEach(async () => {
    await mongo.reset();
    const models = getModels(
      { db: mongo.connection, school: 'nyc' },
      'PivotCrew',
      'PivotCrewMembership',
    );
    await models.PivotCrew.syncIndexes();
    await models.PivotCrewMembership.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('creates a crew with owner membership and invite link', async () => {
    const result = await createPivotCrew(req, { name: 'Friday Plans' });

    expect(result.data.crew.name).toBe('Friday Plans');
    expect(result.data.crew.role).toBe('owner');
    expect(result.data.crew.activeMemberCount).toBe(1);
    expect(result.data.inviteLink).toMatch(/^meridian:\/\/pivot\/crew\/join\?token=/);
  });

  it('lists all active crews for the user', async () => {
    await createPivotCrew(req, { name: 'Crew A' });
    await createPivotCrew(req, { name: 'Crew B' });

    const result = await listPivotCrews(req);

    expect(result.data.crews).toHaveLength(2);
    expect(result.data.crews.map((crew) => crew.name).sort()).toEqual(['Crew A', 'Crew B']);
  });

  it('returns crew detail and roster for members', async () => {
    const created = await createPivotCrew(req, { name: 'Open Mic Crew' });
    const crewId = created.data.crew.id;

    const detail = await getPivotCrewDetail(req, crewId);

    expect(detail.data.crew.name).toBe('Open Mic Crew');
    expect(detail.data.roster).toHaveLength(1);
    expect(detail.data.roster[0].displayLabel).toBe('Owner Person');
  });

  it('allows active members to rotate invite links', async () => {
    const created = await createPivotCrew(req, { name: 'Weekend Runners' });
    const crewId = created.data.crew.id;
    const originalLink = created.data.inviteLink;

    req.user.userId = memberId.toString();
    await joinPivotCrew(req, { token: originalLink.split('token=')[1] });

    const rotated = await rotatePivotCrewInviteLink(
      { ...req, user: { userId: memberId.toString() } },
      crewId,
    );

    expect(rotated.data.inviteLink).not.toBe(originalLink);
    expect(rotated.data.inviteLink).toMatch(/^meridian:\/\/pivot\/crew\/join\?token=/);
  });

  it('joins a crew via invite token', async () => {
    const created = await createPivotCrew(req, { name: 'Sunset Crew' });
    const token = decodeURIComponent(created.data.inviteLink.split('token=')[1]);

    req.user.userId = memberId.toString();
    const joined = await joinPivotCrew(req, { token });

    expect(joined.data.crew.name).toBe('Sunset Crew');
    expect(joined.data.roster.some((row) => row.userId === memberId.toString())).toBe(true);

    const listed = await listPivotCrews(req);
    expect(listed.data.crews).toHaveLength(1);
  });

  it('rejects crew detail for non-members', async () => {
    const created = await createPivotCrew(req, { name: 'Private Crew' });

    const result = await getPivotCrewDetail(
      { ...req, user: { userId: outsiderId.toString() } },
      created.data.crew.id,
    );

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  describe('invited placeholders (Task 1.3)', () => {
    it('creates invited rows visible on roster with generic label', async () => {
      const created = await createPivotCrew(req, { name: 'Bench Crew' });
      const crewId = created.data.crew.id;

      const invited = await invitePivotCrewPlaceholders(req, crewId, { count: 2 });

      expect(invited.data.crew.invitedCount).toBe(2);
      expect(invited.data.roster.filter((row) => row.status === 'invited')).toHaveLength(2);
      expect(
        invited.data.roster.every(
          (row) => row.status !== 'invited' || row.displayLabel === PIVOT_CREW_INVITED_DISPLAY_LABEL,
        ),
      ).toBe(true);
      expect(invited.data.roster.every((row) => row.userId == null || row.status === 'active')).toBe(
        true,
      );
    });

    it('excludes invited placeholders from quorum counts', async () => {
      const created = await createPivotCrew(req, { name: 'Quorum Crew' });
      const crewId = created.data.crew.id;

      await invitePivotCrewPlaceholders(req, crewId, { count: 3 });
      const detail = await getPivotCrewDetail(req, crewId);

      expect(detail.data.quorum.quorumEligibleCount).toBe(1);
      expect(detail.data.quorum.invitedCount).toBe(3);
      expect(
        countQuorumEligibleMembers(
          detail.data.roster.map((row) => ({
            status: row.status,
            userId: row.userId ? new mongoose.Types.ObjectId(row.userId) : null,
          })),
        ),
      ).toBe(1);
      expect(
        buildCrewQuorumSnapshot([
          { status: 'active', userId: ownerId },
          { status: 'invited', userId: null },
          { status: 'invited', userId: null },
        ]).quorumEligibleCount,
      ).toBe(1);
    });

    it('consumes an invited placeholder when join succeeds via share link', async () => {
      const created = await createPivotCrew(req, { name: 'Share Crew' });
      const crewId = created.data.crew.id;
      const shareToken = decodeURIComponent(created.data.inviteLink.split('token=')[1]);

      await invitePivotCrewPlaceholders(req, crewId, { count: 2 });

      req.user.userId = memberId.toString();
      const joined = await joinPivotCrew(req, { token: shareToken });

      expect(joined.data.crew.activeMemberCount).toBe(2);
      expect(joined.data.crew.invitedCount).toBe(1);
      expect(joined.data.roster.filter((row) => row.status === 'invited')).toHaveLength(1);
      expect(joined.data.roster.some((row) => row.userId === memberId.toString())).toBe(true);
    });

    it('activates a specific placeholder when joining via its invite token', async () => {
      const created = await createPivotCrew(req, { name: 'Token Crew' });
      const crewId = created.data.crew.id;

      await invitePivotCrewPlaceholders(req, crewId, { count: 1 });
      const { PivotCrewMembership } = getModels(
        { db: mongo.connection, school: 'nyc' },
        'PivotCrewMembership',
      );
      const placeholder = await PivotCrewMembership.findOne({
        crewId,
        status: 'invited',
        userId: null,
      }).lean();

      req.user.userId = memberId.toString();
      const joined = await joinPivotCrew(req, { token: placeholder.inviteToken });

      expect(joined.data.crew.invitedCount).toBe(0);
      expect(joined.data.roster).toHaveLength(2);
      expect(joined.data.roster.find((row) => row.userId === memberId.toString())?.displayLabel).toBe(
        'Member Person',
      );
    });
  });

  describe('addPivotCrewMember', () => {
    it('sends a pending crew invite instead of adding the user immediately', async () => {
      const created = await createPivotCrew(req, { name: 'Contacts Crew' });
      const crewId = created.data.crew.id;

      const invited = await addPivotCrewMember(req, crewId, { userId: memberId.toString() });

      expect(invited.data.crew.activeMemberCount).toBe(1);
      expect(
        invited.data.roster.some(
          (row) => row.userId === memberId.toString() && row.status === 'pending',
        ),
      ).toBe(true);

      req.user.userId = memberId.toString();
      const inbox = await listPivotCrewInvites(req);
      expect(inbox.data.received).toHaveLength(1);
      expect(inbox.data.received[0].crewName).toBe('Contacts Crew');

      const membershipId = inbox.data.received[0].membershipId;
      const accepted = await acceptPivotCrewInvite(req, membershipId);
      expect(accepted.data.crewName).toBe('Contacts Crew');

      req.user.userId = ownerId.toString();
      const detail = await getPivotCrewDetail(req, crewId);
      expect(detail.data.crew.activeMemberCount).toBe(2);
      expect(
        detail.data.roster.some(
          (row) => row.userId === memberId.toString() && row.status === 'active',
        ),
      ).toBe(true);
    });

    it('declines a pending crew invite', async () => {
      const created = await createPivotCrew(req, { name: 'Decline Crew' });
      const crewId = created.data.crew.id;

      await addPivotCrewMember(req, crewId, { userId: memberId.toString() });

      req.user.userId = memberId.toString();
      const inbox = await listPivotCrewInvites(req);
      const membershipId = inbox.data.received[0].membershipId;
      const declined = await declinePivotCrewInvite(req, membershipId);
      expect(declined.data.declined).toBe(true);

      const afterDecline = await listPivotCrewInvites(req);
      expect(afterDecline.data.received).toHaveLength(0);
    });

    it('rejects adding yourself', async () => {
      const created = await createPivotCrew(req, { name: 'Self Crew' });
      const result = await addPivotCrewMember(req, created.data.crew.id, {
        userId: ownerId.toString(),
      });

      expect(result.code).toBe('SELF_ADD');
    });
  });

  describe('deletePivotCrew', () => {
    it('lets the owner archive a crew and removes it from lists', async () => {
      const created = await createPivotCrew(req, { name: 'Delete Me' });
      const crewId = created.data.crew.id;

      const deleted = await deletePivotCrew(req, crewId);
      expect(deleted.data.crewId).toBe(crewId);
      expect(deleted.data.archivedAt).toBeTruthy();

      const listed = await listPivotCrews(req);
      expect(listed.data.crews).toHaveLength(0);

      const detail = await getPivotCrewDetail(req, crewId);
      expect(detail.status).toBe(404);
    });

    it('forbids non-owner members from deleting', async () => {
      const created = await createPivotCrew(req, { name: 'Member Guard' });
      const token = decodeURIComponent(created.data.inviteLink.split('token=')[1]);

      req.user.userId = memberId.toString();
      await joinPivotCrew(req, { token });

      const result = await deletePivotCrew(req, created.data.crew.id);
      expect(result.status).toBe(403);
      expect(result.code).toBe('FORBIDDEN');

      req.user.userId = ownerId.toString();
      const listed = await listPivotCrews(req);
      expect(listed.data.crews).toHaveLength(1);
    });
  });
});
