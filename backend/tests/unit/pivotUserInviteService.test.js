jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));
jest.mock('../../services/pivotSafetyService', () => ({
  areUsersBlocked: jest.fn(),
}));
jest.mock('../../services/notificationService', () => ({
  withModels: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { areUsersBlocked } = require('../../services/pivotSafetyService');
const NotificationService = require('../../services/notificationService');
const {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  normalizeInviteCode,
  getMyPivotUserInvite,
  previewPivotUserInvite,
  acceptPivotUserInvite,
} = require('../../services/pivotUserInviteService');

const inviterGlobalId = '64b000000000000000000001';
const inviterUserId = '64a000000000000000000001';
const inviteeGlobalId = '64b000000000000000000002';
const inviteeUserId = '64a000000000000000000002';

const bostonTenant = {
  tenantKey: 'boston',
  subdomain: 'boston',
  location: 'Boston',
  status: 'active',
  tenantType: 'pivot',
};

function lean(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function selectLean(value) {
  return {
    select: jest.fn().mockReturnValue(lean(value)),
  };
}

function inviteRow(overrides = {}) {
  return {
    _id: 'invite-1',
    code: 'k7m2qx9a',
    globalUserId: inviterGlobalId,
    tenantKey: 'boston',
    tenantUserId: inviterUserId,
    inviterName: 'Maya',
    inviterPicture: 'https://img/maya.jpg',
    acceptedCount: 2,
    ...overrides,
  };
}

describe('invite codes', () => {
  it('draws codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      [...code].forEach((ch) => expect(INVITE_CODE_ALPHABET).toContain(ch));
    }
  });

  it('normalizes case and rejects malformed codes', () => {
    expect(normalizeInviteCode('  K7M2QX9A ')).toBe('k7m2qx9a');
    expect(normalizeInviteCode('abc')).toBe('');
    expect(normalizeInviteCode('k7m2/../x')).toBe('');
    expect(normalizeInviteCode(null)).toBe('');
  });
});

describe('getMyPivotUserInvite', () => {
  let User;
  let PivotUserInvite;
  const req = {
    school: 'boston',
    user: { userId: inviterUserId, globalUserId: inviterGlobalId },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(bostonTenant);
    User = { findById: jest.fn().mockReturnValue(selectLean({ name: 'Maya Lin', picture: 'p.jpg' })) };
    PivotUserInvite = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    };
    getModels.mockReturnValue({ User });
    getGlobalModels.mockReturnValue({ PivotUserInvite });
  });

  it('requires a signed-in global user', async () => {
    const result = await getMyPivotUserInvite({ school: 'boston', user: { userId: inviterUserId } });
    expect(result.status).toBe(401);
  });

  it('refuses non-pivot tenants', async () => {
    getTenantByKey.mockResolvedValue({ tenantKey: 'rpi', status: 'active' });
    const result = await getMyPivotUserInvite({ ...req, school: 'rpi' });
    expect(result.code).toBe('NOT_PIVOT_TENANT');
  });

  it('returns the existing link and refreshes the first-name snapshot', async () => {
    PivotUserInvite.findOneAndUpdate.mockReturnValue(lean(inviteRow()));

    const result = await getMyPivotUserInvite(req);

    const [, update] = PivotUserInvite.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({ inviterName: 'Maya', inviterPicture: 'p.jpg' });
    expect(PivotUserInvite.create).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      code: 'k7m2qx9a',
      webLink: 'http://localhost:3000/invite/k7m2qx9a',
      deepLink: 'justgo://invite/k7m2qx9a',
      cityDisplayName: 'Boston',
      acceptedCount: 2,
    });
  });

  it('creates a link on first request and retries a code collision', async () => {
    PivotUserInvite.findOneAndUpdate.mockReturnValue(lean(null));
    PivotUserInvite.create
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000, keyPattern: { code: 1 } }))
      .mockResolvedValueOnce(inviteRow({ code: 'abcdefgh', acceptedCount: 0 }));

    const result = await getMyPivotUserInvite(req);

    expect(PivotUserInvite.create).toHaveBeenCalledTimes(2);
    expect(result.data.code).toBe('abcdefgh');
    expect(result.data.acceptedCount).toBe(0);
  });

  it('reuses the row a concurrent request created', async () => {
    PivotUserInvite.findOneAndUpdate.mockReturnValue(lean(null));
    PivotUserInvite.create.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 11000, keyPattern: { globalUserId: 1, tenantKey: 1 } }),
    );
    PivotUserInvite.findOne.mockReturnValue(lean(inviteRow()));

    const result = await getMyPivotUserInvite(req);

    expect(PivotUserInvite.create).toHaveBeenCalledTimes(1);
    expect(result.data.code).toBe('k7m2qx9a');
  });
});

describe('previewPivotUserInvite', () => {
  let PivotUserInvite;
  const req = { school: 'www' };

  beforeEach(() => {
    jest.clearAllMocks();
    PivotUserInvite = { findOne: jest.fn() };
    getGlobalModels.mockReturnValue({ PivotUserInvite });
  });

  it('reports malformed and unknown codes as invalid instead of erroring', async () => {
    expect((await previewPivotUserInvite(req, '../x')).data).toEqual({ valid: false });
    expect(PivotUserInvite.findOne).not.toHaveBeenCalled();

    PivotUserInvite.findOne.mockReturnValue(lean(null));
    expect((await previewPivotUserInvite(req, 'zzzzzzzz')).data).toEqual({ valid: false });
  });

  it('returns the inviter first name and their open city', async () => {
    PivotUserInvite.findOne.mockReturnValue(lean(inviteRow()));
    getTenantByKey.mockResolvedValue(bostonTenant);

    const result = await previewPivotUserInvite(req, 'K7M2QX9A');

    expect(result.data).toEqual({
      valid: true,
      code: 'k7m2qx9a',
      inviter: { name: 'Maya', picture: 'https://img/maya.jpg' },
      city: { tenantKey: 'boston', subdomain: 'boston', cityDisplayName: 'Boston' },
    });
  });

  it('keeps the invite valid but drops the city when it has closed', async () => {
    PivotUserInvite.findOne.mockReturnValue(lean(inviteRow()));
    getTenantByKey.mockResolvedValue({ ...bostonTenant, status: 'paused' });

    const result = await previewPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data.valid).toBe(true);
    expect(result.data.city).toBeNull();
  });
});

describe('acceptPivotUserInvite', () => {
  let User;
  let Friendship;
  let Notification;
  let PivotUserInvite;
  let PivotUserInviteAcceptance;
  let createSystemNotification;
  let savedFriendships;
  const req = {
    school: 'boston',
    user: { userId: inviteeUserId, globalUserId: inviteeGlobalId },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    savedFriendships = [];
    areUsersBlocked.mockResolvedValue(false);
    getTenantByKey.mockResolvedValue(bostonTenant);

    User = {
      findById: jest.fn((id) => selectLean(
        String(id) === inviterUserId ? { _id: inviterUserId } : { name: 'Sam Rivera' },
      )),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    function FriendshipModel(doc) {
      Object.assign(this, doc);
      this.save = jest.fn(async () => {
        savedFriendships.push({ ...doc });
        return this;
      });
    }
    FriendshipModel.findOne = jest.fn().mockResolvedValue(null);
    Friendship = FriendshipModel;
    Notification = {};
    getModels.mockReturnValue({ User, Friendship, Notification });

    PivotUserInvite = {
      findOne: jest.fn().mockReturnValue(lean(inviteRow())),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    PivotUserInviteAcceptance = {
      findOne: jest.fn().mockReturnValue(lean(null)),
      create: jest.fn().mockResolvedValue({}),
    };
    getGlobalModels.mockReturnValue({ PivotUserInvite, PivotUserInviteAcceptance });

    createSystemNotification = jest.fn().mockResolvedValue({});
    NotificationService.withModels.mockReturnValue({ createSystemNotification });
  });

  it('makes the invitee friends with the inviter and tells the inviter', async () => {
    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data).toEqual({
      friended: true,
      alreadyAccepted: false,
      inviter: { name: 'Maya', picture: 'https://img/maya.jpg' },
    });
    expect(savedFriendships).toEqual([
      { requester: inviterUserId, recipient: inviteeUserId, status: 'accepted' },
    ]);
    expect(User.updateOne).toHaveBeenCalledTimes(2);
    expect(PivotUserInviteAcceptance.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'k7m2qx9a', tenantKey: 'boston', friended: true }),
    );
    expect(PivotUserInvite.updateOne).toHaveBeenCalledWith(
      { _id: 'invite-1' },
      { $inc: { acceptedCount: 1 } },
    );
    expect(createSystemNotification).toHaveBeenCalledWith(
      inviterUserId,
      'User',
      'pivot_invite_accepted',
      { senderName: 'Sam Rivera', sender: inviteeUserId },
    );
  });

  it('accepts a pending request between the pair instead of duplicating it', async () => {
    const pending = { status: 'pending', save: jest.fn().mockResolvedValue({}) };
    Friendship.findOne.mockResolvedValue(pending);

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data.friended).toBe(true);
    expect(pending.status).toBe('accepted');
    expect(savedFriendships).toEqual([]);
  });

  it('does not re-notify when they were already friends', async () => {
    Friendship.findOne.mockResolvedValue({ status: 'accepted' });

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data.friended).toBe(true);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(createSystemNotification).not.toHaveBeenCalled();
  });

  it('records attribution without a friendship when either side blocked the other', async () => {
    areUsersBlocked.mockResolvedValue(true);

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data.friended).toBe(false);
    expect(savedFriendships).toEqual([]);
    expect(PivotUserInviteAcceptance.create).toHaveBeenCalledWith(
      expect.objectContaining({ friended: false }),
    );
    expect(createSystemNotification).not.toHaveBeenCalled();
  });

  it('is idempotent for the same invitee and code', async () => {
    PivotUserInviteAcceptance.findOne.mockReturnValue(lean({ friended: true }));

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data).toMatchObject({ friended: true, alreadyAccepted: true });
    expect(Friendship.findOne).not.toHaveBeenCalled();
    expect(PivotUserInvite.updateOne).not.toHaveBeenCalled();
  });

  it('ignores your own link', async () => {
    PivotUserInvite.findOne.mockReturnValue(lean(inviteRow({ globalUserId: inviteeGlobalId })));

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data).toMatchObject({ friended: false, reason: 'self' });
    expect(PivotUserInviteAcceptance.create).not.toHaveBeenCalled();
  });

  it('reports the inviter city when the invitee is signed into another city', async () => {
    const result = await acceptPivotUserInvite({ ...req, school: 'nyc' }, 'k7m2qx9a');

    expect(result.data).toMatchObject({
      friended: false,
      reason: 'city_mismatch',
      city: { tenantKey: 'boston', cityDisplayName: 'Boston' },
    });
    expect(Friendship.findOne).not.toHaveBeenCalled();
  });

  it('404s an unknown code', async () => {
    PivotUserInvite.findOne.mockReturnValue(lean(null));
    const result = await acceptPivotUserInvite(req, 'zzzzzzzz');
    expect(result.code).toBe('INVITE_NOT_FOUND');
  });

  it('keeps the friendship when the inviter notification fails', async () => {
    createSystemNotification.mockRejectedValue(new Error('push down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await acceptPivotUserInvite(req, 'k7m2qx9a');

    expect(result.data.friended).toBe(true);
    warn.mockRestore();
  });
});
