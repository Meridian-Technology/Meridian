jest.mock('../../services/getGlobalModelService', () => jest.fn());

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  nominatePlatformAdmin,
  approvePlatformAdminInvite,
  revokePlatformAdminInvite,
  markPlatformAdminInvitesReadyForEmail,
  listPlatformAdmins,
} = require('../../services/platformAdminInviteService');

function makeInviteDoc(overrides = {}) {
  const doc = {
    _id: 'inv1',
    email: 'ops@example.com',
    status: 'pending_signup',
    globalUserId: null,
    invitedBy: null,
    save: jest.fn(async function save() {
      return this;
    }),
    toObject() {
      return { ...this, save: undefined, toObject: undefined };
    },
    ...overrides,
  };
  return doc;
}

describe('platformAdminInviteService', () => {
  let PlatformRole;
  let GlobalUser;
  let PlatformAdminInvite;
  let req;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { globalUserId: 'actor1' }, globalDb: {} };

    PlatformRole = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    GlobalUser = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };
    PlatformAdminInvite = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    };

    getGlobalModels.mockImplementation((_req, ...names) => {
      const all = { PlatformRole, GlobalUser, PlatformAdminInvite };
      return names.reduce((acc, name) => {
        if (all[name]) acc[name] = all[name];
        return acc;
      }, {});
    });
  });

  function mockFindOneLean(model, value) {
    model.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    });
  }

  it('nominates unknown email as pending_signup without PlatformRole', async () => {
    mockFindOneLean(GlobalUser, null);
    PlatformAdminInvite.findOne.mockResolvedValue(null);
    const created = makeInviteDoc({ status: 'pending_signup' });
    PlatformAdminInvite.create.mockResolvedValue(created);

    const result = await nominatePlatformAdmin(req, { email: 'Ops@Example.com' });

    expect(result.error).toBeUndefined();
    expect(result.data.status).toBe('pending_signup');
    expect(result.data.email).toBe('ops@example.com');
    expect(PlatformAdminInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ops@example.com',
        status: 'pending_signup',
        globalUserId: null,
      }),
    );
    expect(PlatformRole.findOne).not.toHaveBeenCalled();
  });

  it('nominates known email as ready_for_approval without granting role', async () => {
    mockFindOneLean(GlobalUser, {
      _id: 'gu1',
      email: 'ops@example.com',
      name: 'Ops',
    });
    mockFindOneLean(PlatformRole, null);
    PlatformAdminInvite.findOne.mockResolvedValue(null);
    PlatformAdminInvite.create.mockResolvedValue(
      makeInviteDoc({
        status: 'ready_for_approval',
        globalUserId: 'gu1',
      }),
    );

    const result = await nominatePlatformAdmin(req, { email: 'ops@example.com' });

    expect(result.data.status).toBe('ready_for_approval');
    expect(PlatformRole.findOne).toHaveBeenCalledWith({ globalUserId: 'gu1' });
    expect(PlatformAdminInvite.create).toHaveBeenCalled();
  });

  it('rejects nominate when already platform admin', async () => {
    mockFindOneLean(GlobalUser, { _id: 'gu1', email: 'ops@example.com' });
    mockFindOneLean(PlatformRole, {
      globalUserId: 'gu1',
      roles: ['platform_admin'],
    });

    const result = await nominatePlatformAdmin(req, { email: 'ops@example.com' });
    expect(result.code).toBe('ALREADY_PLATFORM_ADMIN');
    expect(result.status).toBe(409);
  });

  it('marks pending_signup ready when GlobalUser appears (no role grant)', async () => {
    PlatformAdminInvite.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await markPlatformAdminInvitesReadyForEmail(req, {
      email: 'ops@example.com',
      globalUserId: 'gu1',
    });

    expect(result.updated).toBe(1);
    expect(PlatformAdminInvite.updateMany).toHaveBeenCalledWith(
      { email: 'ops@example.com', status: 'pending_signup' },
      {
        $set: {
          status: 'ready_for_approval',
          globalUserId: 'gu1',
        },
      },
    );
  });

  it('approve grants platform_admin and marks invite approved', async () => {
    const invite = makeInviteDoc({
      status: 'ready_for_approval',
      globalUserId: 'gu1',
      email: 'ops@example.com',
    });
    PlatformAdminInvite.findById.mockResolvedValue(invite);
    GlobalUser.findById.mockResolvedValue({
      _id: 'gu1',
      email: 'ops@example.com',
      name: 'Ops',
    });

    const pr = {
      globalUserId: 'gu1',
      roles: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    PlatformRole.findOne.mockResolvedValue(pr);

    const result = await approvePlatformAdminInvite(req, { inviteId: 'inv1' });

    expect(result.error).toBeUndefined();
    expect(pr.roles).toContain('platform_admin');
    expect(pr.save).toHaveBeenCalled();
    expect(invite.status).toBe('approved');
    expect(invite.save).toHaveBeenCalled();
    expect(result.data.email).toBe('ops@example.com');
  });

  it('approve rejects pending_signup nominations', async () => {
    PlatformAdminInvite.findById.mockResolvedValue(
      makeInviteDoc({ status: 'pending_signup' }),
    );

    const result = await approvePlatformAdminInvite(req, { inviteId: 'inv1' });
    expect(result.code).toBe('NOT_READY_FOR_APPROVAL');
    expect(result.status).toBe(409);
  });

  it('revoke cancels open nomination', async () => {
    const invite = makeInviteDoc({ status: 'ready_for_approval' });
    PlatformAdminInvite.findById.mockResolvedValue(invite);

    const result = await revokePlatformAdminInvite(req, { inviteId: 'inv1' });
    expect(result.data.status).toBe('revoked');
    expect(invite.save).toHaveBeenCalled();
  });

  it('list returns admins and open nominations', async () => {
    PlatformRole.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { globalUserId: 'gu1', roles: ['platform_admin'] },
      ]),
    });
    PlatformAdminInvite.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'inv2',
            email: 'new@example.com',
            status: 'pending_signup',
            globalUserId: null,
          },
        ]),
      }),
    });
    GlobalUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'gu1', email: 'admin@example.com', name: 'Admin' },
        ]),
      }),
    });

    const data = await listPlatformAdmins(req);
    expect(data.admins).toHaveLength(1);
    expect(data.admins[0].email).toBe('admin@example.com');
    expect(data.nominations).toHaveLength(1);
    expect(data.nominations[0].status).toBe('pending_signup');
  });
});
