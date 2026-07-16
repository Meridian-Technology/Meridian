/**
 * Platform admin nominations with manual approval.
 * Nominating never grants PlatformRole; Approve does.
 */
const getGlobalModels = require('./getGlobalModelService');

const OPEN_STATUSES = ['pending_signup', 'ready_for_approval'];

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

async function hasActivePlatformAdmin(PlatformRole, globalUserId) {
  if (!globalUserId) return false;
  const pr = await PlatformRole.findOne({ globalUserId }).lean();
  const roles = Array.isArray(pr?.roles) ? pr.roles : [];
  return roles.includes('platform_admin') || roles.includes('root');
}

function serializeNomination(invite, globalUser) {
  return {
    id: String(invite._id),
    email: invite.email,
    status: invite.status,
    globalUserId: invite.globalUserId || globalUser?._id || null,
    name: globalUser?.name || null,
    picture: globalUser?.picture || null,
    invitedBy: invite.invitedBy || null,
    createdAt: invite.createdAt || null,
    updatedAt: invite.updatedAt || null,
  };
}

function serializeAdmin(roleRow, globalUser) {
  return {
    globalUserId: roleRow.globalUserId,
    email: globalUser?.email || null,
    name: globalUser?.name || null,
    picture: globalUser?.picture || null,
  };
}

/**
 * List active platform admins + open nominations.
 */
async function listPlatformAdmins(req) {
  const { PlatformRole, GlobalUser, PlatformAdminInvite } = getGlobalModels(
    req,
    'PlatformRole',
    'GlobalUser',
    'PlatformAdminInvite',
  );

  const roles = await PlatformRole.find({
    roles: { $in: ['platform_admin', 'root'] },
  }).lean();

  const nominations = await PlatformAdminInvite.find({
    status: { $in: OPEN_STATUSES },
  })
    .sort({ createdAt: -1 })
    .lean();

  const userIds = [
    ...roles.map((r) => r.globalUserId),
    ...nominations.map((n) => n.globalUserId).filter(Boolean),
  ];
  const users = await GlobalUser.find({ _id: { $in: userIds } })
    .select('email name picture')
    .lean();
  const byId = users.reduce((acc, u) => {
    acc[u._id.toString()] = u;
    return acc;
  }, {});

  return {
    admins: roles.map((r) =>
      serializeAdmin(r, byId[r.globalUserId.toString()]),
    ),
    nominations: nominations.map((n) =>
      serializeNomination(
        n,
        n.globalUserId ? byId[n.globalUserId.toString()] : null,
      ),
    ),
  };
}

/**
 * Nominate an email. Never grants PlatformRole.
 */
async function nominatePlatformAdmin(req, { email: rawEmail }) {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes('@')) {
    return {
      error: 'A valid email is required.',
      status: 400,
      code: 'INVALID_EMAIL',
    };
  }

  const { PlatformRole, GlobalUser, PlatformAdminInvite } = getGlobalModels(
    req,
    'PlatformRole',
    'GlobalUser',
    'PlatformAdminInvite',
  );

  const globalUser = await GlobalUser.findOne({ email }).lean();
  if (globalUser && (await hasActivePlatformAdmin(PlatformRole, globalUser._id))) {
    return {
      error: 'This user is already a platform admin.',
      status: 409,
      code: 'ALREADY_PLATFORM_ADMIN',
    };
  }

  let invite = await PlatformAdminInvite.findOne({
    email,
    status: { $in: OPEN_STATUSES },
  });

  const nextStatus = globalUser ? 'ready_for_approval' : 'pending_signup';
  const invitedBy = actorId(req);

  if (invite) {
    invite.status = nextStatus;
    invite.globalUserId = globalUser?._id || invite.globalUserId || null;
    if (invitedBy) invite.invitedBy = invitedBy;
    await invite.save();
  } else {
    invite = await PlatformAdminInvite.create({
      email,
      status: nextStatus,
      globalUserId: globalUser?._id || null,
      invitedBy,
    });
  }

  return {
    data: serializeNomination(invite.toObject ? invite.toObject() : invite, globalUser),
  };
}

/**
 * Approve a ready nomination — grants platform_admin.
 */
async function approvePlatformAdminInvite(req, { inviteId }) {
  const id = String(inviteId || '').trim();
  if (!id) {
    return { error: 'inviteId is required.', status: 400, code: 'INVALID_INVITE' };
  }

  const { PlatformRole, GlobalUser, PlatformAdminInvite } = getGlobalModels(
    req,
    'PlatformRole',
    'GlobalUser',
    'PlatformAdminInvite',
  );

  const invite = await PlatformAdminInvite.findById(id);
  if (!invite || invite.status === 'revoked' || invite.status === 'approved') {
    return {
      error: 'Nomination not found or no longer open.',
      status: 404,
      code: 'INVITE_NOT_FOUND',
    };
  }

  if (invite.status !== 'ready_for_approval') {
    return {
      error: 'This nomination is still awaiting signup.',
      status: 409,
      code: 'NOT_READY_FOR_APPROVAL',
    };
  }

  let globalUser = null;
  if (invite.globalUserId) {
    globalUser = await GlobalUser.findById(invite.globalUserId);
  }
  if (!globalUser) {
    globalUser = await GlobalUser.findOne({ email: invite.email });
  }
  if (!globalUser) {
    return {
      error: 'Global user not found for this nomination.',
      status: 404,
      code: 'GLOBAL_USER_NOT_FOUND',
    };
  }

  let pr = await PlatformRole.findOne({ globalUserId: globalUser._id });
  if (!pr) {
    pr = new PlatformRole({ globalUserId: globalUser._id, roles: [] });
  }
  if (!pr.roles.includes('platform_admin')) {
    pr.roles.push('platform_admin');
    await pr.save();
  }

  invite.status = 'approved';
  invite.globalUserId = globalUser._id;
  invite.approvedBy = actorId(req);
  invite.approvedAt = new Date();
  await invite.save();

  return {
    data: {
      globalUserId: globalUser._id,
      email: globalUser.email,
      name: globalUser.name || null,
      inviteId: String(invite._id),
    },
  };
}

/**
 * Cancel an open nomination.
 */
async function revokePlatformAdminInvite(req, { inviteId }) {
  const id = String(inviteId || '').trim();
  if (!id) {
    return { error: 'inviteId is required.', status: 400, code: 'INVALID_INVITE' };
  }

  const { PlatformAdminInvite } = getGlobalModels(req, 'PlatformAdminInvite');
  const invite = await PlatformAdminInvite.findById(id);
  if (!invite || !OPEN_STATUSES.includes(invite.status)) {
    return {
      error: 'Open nomination not found.',
      status: 404,
      code: 'INVITE_NOT_FOUND',
    };
  }

  invite.status = 'revoked';
  invite.revokedAt = new Date();
  await invite.save();

  return {
    data: {
      id: String(invite._id),
      email: invite.email,
      status: invite.status,
    },
  };
}

/**
 * When a GlobalUser is created/linked, mark matching pending_signup invites ready.
 * Does not grant PlatformRole.
 */
async function markPlatformAdminInvitesReadyForEmail(req, { email: rawEmail, globalUserId }) {
  const email = normalizeEmail(rawEmail);
  if (!email || !globalUserId) {
    return { updated: 0 };
  }

  const { PlatformAdminInvite } = getGlobalModels(req, 'PlatformAdminInvite');
  const result = await PlatformAdminInvite.updateMany(
    { email, status: 'pending_signup' },
    {
      $set: {
        status: 'ready_for_approval',
        globalUserId,
      },
    },
  );

  return { updated: result.modifiedCount || result.nModified || 0 };
}

module.exports = {
  listPlatformAdmins,
  nominatePlatformAdmin,
  approvePlatformAdminInvite,
  revokePlatformAdminInvite,
  markPlatformAdminInvitesReadyForEmail,
  normalizeEmail,
  OPEN_STATUSES,
};
