const mongoose = require('mongoose');
const getModels = require('./getModelService');
const pivotCrewMembershipSchema = require('../schemas/pivotCrewMembership');
const {
  scheduleCrewWeekRecompute,
  scheduleCrewWeekRecomputeForCrew,
} = require('./pivotCrewWeekStateService');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');

const CREW_NAME_MAX_LENGTH = 80;
const MAX_INVITE_PLACEHOLDERS_PER_REQUEST = 20;
const PIVOT_CREW_INVITED_DISPLAY_LABEL = 'invited';
const PIVOT_CREW_JOIN_DEEP_LINK_PREFIX = 'meridian://pivot/crew/join?token=';
const PIVOT_CREW_JOIN_WEB_LINK_PREFIX = 'https://meridian.study/pivot/crew/join?token=';

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function invalidTenant() {
  return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
}

function notFound(message = 'Crew not found.') {
  return { error: message, status: 404, code: 'NOT_FOUND' };
}

function normalizeTenantKey(req) {
  return typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
}

function normalizeCrewName(name) {
  return String(name || '').trim();
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function generateShareInviteToken() {
  return pivotCrewMembershipSchema.statics.generateInviteToken();
}

function buildCrewInviteLinks(token) {
  const trimmed = String(token || '').trim();
  return {
    deepLink: `${PIVOT_CREW_JOIN_DEEP_LINK_PREFIX}${encodeURIComponent(trimmed)}`,
    webLink: `${PIVOT_CREW_JOIN_WEB_LINK_PREFIX}${encodeURIComponent(trimmed)}`,
  };
}

function serializeCrewSummary(crew, counts = {}) {
  return {
    id: crew._id.toString(),
    name: crew.name,
    tenantKey: crew.tenantKey,
    createdAt: crew.createdAt,
    archivedAt: crew.archivedAt,
    activeMemberCount: counts.activeMemberCount ?? 0,
    invitedCount: counts.invitedCount ?? 0,
    role: counts.role ?? null,
  };
}

function serializeRosterMember(row, userById) {
  if (row.status === 'invited' || !row.userId) {
    return {
      membershipId: row._id.toString(),
      status: row.status,
      role: row.role,
      displayLabel: PIVOT_CREW_INVITED_DISPLAY_LABEL,
      userId: null,
      picture: null,
      invitedAt: row.invitedAt,
    };
  }

  const user = userById.get(row.userId.toString());
  return {
    membershipId: row._id.toString(),
    status: row.status,
    role: row.role,
    displayLabel: user?.name || 'member',
    userId: row.userId.toString(),
    picture: user?.picture || null,
    joinedAt: row.joinedAt,
  };
}

/**
 * Quorum and swipe aggregation must count active members with userId only — never invited placeholders.
 */
function countQuorumEligibleMembers(rows) {
  return rows.filter(
    (row) => row.status === 'active' && row.userId != null,
  ).length;
}

function buildCrewQuorumSnapshot(rows) {
  const activeMemberCount = rows.filter((row) => row.status === 'active' && row.userId != null).length;
  const invitedCount = rows.filter((row) => row.status === 'invited').length;

  return {
    activeMemberCount,
    invitedCount,
    quorumEligibleCount: activeMemberCount,
  };
}

async function loadMembershipCounts(PivotCrewMembership, crewIds) {
  if (!crewIds.length) {
    return new Map();
  }

  const rows = await PivotCrewMembership.aggregate([
    {
      $match: {
        crewId: { $in: crewIds },
        status: { $in: ['active', 'invited'] },
      },
    },
    {
      $group: {
        _id: { crewId: '$crewId', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  const countsByCrewId = new Map();
  for (const row of rows) {
    const crewId = row._id.crewId.toString();
    const current = countsByCrewId.get(crewId) || {
      activeMemberCount: 0,
      invitedCount: 0,
    };
    if (row._id.status === 'active') {
      current.activeMemberCount = row.count;
    } else if (row._id.status === 'invited') {
      current.invitedCount = row.count;
    }
    countsByCrewId.set(crewId, current);
  }

  return countsByCrewId;
}

async function requireActiveMembership(req, crewId) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return notFound();
  }

  const { PivotCrew, PivotCrewMembership } = getModels(req, 'PivotCrew', 'PivotCrewMembership');
  const tenantKey = normalizeTenantKey(req);
  if (!tenantKey) {
    return invalidTenant();
  }

  const crew = await PivotCrew.findOne({
    _id: crewObjectId,
    tenantKey,
    archivedAt: null,
  }).lean();

  if (!crew) {
    return notFound();
  }

  const membership = await PivotCrewMembership.findOne({
    crewId: crewObjectId,
    userId,
    status: 'active',
  }).lean();

  if (!membership) {
    return {
      error: 'You are not a member of this crew.',
      status: 403,
      code: 'FORBIDDEN',
    };
  }

  return { crew, membership, PivotCrew, PivotCrewMembership };
}

async function findCrewByInviteToken(PivotCrew, PivotCrewMembership, token, tenantKey) {
  const crewByShare = await PivotCrew.findOne({
    shareInviteToken: token,
    tenantKey,
    archivedAt: null,
  }).lean();

  if (crewByShare) {
    return { crew: crewByShare, placeholder: null, joinViaShareLink: true };
  }

  const invitedRow = await PivotCrewMembership.findOne({
    inviteToken: token,
    status: 'invited',
    userId: null,
  }).lean();

  if (!invitedRow) {
    return { crew: null, placeholder: null, joinViaShareLink: false };
  }

  const crew = await PivotCrew.findOne({
    _id: invitedRow.crewId,
    tenantKey,
    archivedAt: null,
  }).lean();

  if (!crew) {
    return { crew: null, placeholder: null, joinViaShareLink: false };
  }

  return { crew, placeholder: invitedRow, joinViaShareLink: false };
}

async function resolveInvitePlaceholder(PivotCrewMembership, crewId, preferredPlaceholder = null) {
  if (preferredPlaceholder?._id) {
    return PivotCrewMembership.findOne({
      _id: preferredPlaceholder._id,
      crewId,
      status: 'invited',
      userId: null,
    });
  }

  return PivotCrewMembership.findOne({
    crewId,
    status: 'invited',
    userId: null,
  }).sort({ invitedAt: 1 });
}

async function activateCrewMembership({
  crewId,
  userObjectId,
  PivotCrewMembership,
  placeholder = null,
  leftMembership = null,
}) {
  const now = new Date();

  if (placeholder) {
    placeholder.userId = userObjectId;
    placeholder.status = 'active';
    placeholder.role = 'member';
    placeholder.invitedAt = placeholder.invitedAt || now;
    placeholder.joinedAt = now;
    placeholder.inviteToken = generateShareInviteToken();
    await placeholder.save();
    return;
  }

  if (leftMembership) {
    leftMembership.status = 'active';
    leftMembership.role = 'member';
    leftMembership.inviteToken = generateShareInviteToken();
    leftMembership.invitedAt = now;
    leftMembership.joinedAt = now;
    await leftMembership.save();
    return;
  }

  await PivotCrewMembership.create({
    crewId,
    userId: userObjectId,
    inviteToken: generateShareInviteToken(),
    status: 'active',
    role: 'member',
    invitedAt: now,
    joinedAt: now,
  });
}

async function invitePivotCrewPlaceholders(req, crewId, options = {}) {
  const access = await requireActiveMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const rawCount = Number(options.count ?? 1);
  if (!Number.isInteger(rawCount) || rawCount < 1 || rawCount > MAX_INVITE_PLACEHOLDERS_PER_REQUEST) {
    return {
      error: `count must be an integer from 1 to ${MAX_INVITE_PLACEHOLDERS_PER_REQUEST}.`,
      status: 400,
      code: 'INVALID_COUNT',
    };
  }

  const { crew, PivotCrewMembership } = access;
  const now = new Date();
  const rows = Array.from({ length: rawCount }, () => ({
    crewId: crew._id,
    userId: null,
    inviteToken: generateShareInviteToken(),
    status: 'invited',
    role: 'member',
    invitedAt: now,
  }));

  await PivotCrewMembership.insertMany(rows, { ordered: true });

  return getPivotCrewDetail(req, crew._id.toString());
}

async function createPivotCrew(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = normalizeTenantKey(req);
  if (!tenantKey) {
    return invalidTenant();
  }

  const name = normalizeCrewName(options.name);
  if (!name) {
    return { error: 'Crew name is required.', status: 400, code: 'NAME_REQUIRED' };
  }
  if (name.length > CREW_NAME_MAX_LENGTH) {
    return {
      error: `Crew name must be ${CREW_NAME_MAX_LENGTH} characters or fewer.`,
      status: 400,
      code: 'NAME_TOO_LONG',
    };
  }

  const userObjectId = toObjectId(userId);
  const now = new Date();
  const shareInviteToken = generateShareInviteToken();
  const membershipInviteToken = generateShareInviteToken();

  const { PivotCrew, PivotCrewMembership } = getModels(req, 'PivotCrew', 'PivotCrewMembership');

  const crew = await PivotCrew.create({
    name,
    createdBy: userObjectId,
    tenantKey,
    shareInviteToken,
  });

  await PivotCrewMembership.create({
    crewId: crew._id,
    userId: userObjectId,
    inviteToken: membershipInviteToken,
    status: 'active',
    role: 'owner',
    invitedAt: now,
    joinedAt: now,
  });

  const inviteLinks = buildCrewInviteLinks(shareInviteToken);

  return {
    data: {
      crew: serializeCrewSummary(crew.toObject(), {
        activeMemberCount: 1,
        invitedCount: 0,
        role: 'owner',
      }),
      inviteLink: inviteLinks.deepLink,
      inviteLinks,
    },
  };
}

async function listPivotCrews(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = normalizeTenantKey(req);
  if (!tenantKey) {
    return invalidTenant();
  }

  const userObjectId = toObjectId(userId);
  const { PivotCrew, PivotCrewMembership } = getModels(req, 'PivotCrew', 'PivotCrewMembership');

  const memberships = await PivotCrewMembership.find({
    userId: userObjectId,
    status: 'active',
  })
    .select('crewId role')
    .lean();

  if (!memberships.length) {
    return { data: { crews: [] } };
  }

  const roleByCrewId = new Map(
    memberships.map((row) => [row.crewId.toString(), row.role]),
  );
  const crewIds = memberships.map((row) => row.crewId);

  const crews = await PivotCrew.find({
    _id: { $in: crewIds },
    tenantKey,
    archivedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const countsByCrewId = await loadMembershipCounts(PivotCrewMembership, crews.map((crew) => crew._id));

  return {
    data: {
      crews: crews.map((crew) =>
        serializeCrewSummary(crew, {
          ...countsByCrewId.get(crew._id.toString()),
          role: roleByCrewId.get(crew._id.toString()) || null,
        }),
      ),
    },
  };
}

async function getPivotCrewDetail(req, crewId) {
  const access = await requireActiveMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const { crew, membership, PivotCrewMembership } = access;
  const { User } = getModels(req, 'User');

  const rosterRows = await PivotCrewMembership.find({
    crewId: crew._id,
    status: { $in: ['active', 'invited'] },
  })
    .sort({ role: 1, joinedAt: 1, invitedAt: 1 })
    .lean();

  const userIds = rosterRows
    .filter((row) => row.userId)
    .map((row) => row.userId);

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name picture')
        .lean()
    : [];

  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const counts = (await loadMembershipCounts(PivotCrewMembership, [crew._id])).get(
    crew._id.toString(),
  ) || { activeMemberCount: 0, invitedCount: 0 };
  const quorum = buildCrewQuorumSnapshot(rosterRows);

  const inviteLinks = buildCrewInviteLinks(crew.shareInviteToken);

  return {
    data: {
      crew: serializeCrewSummary(crew, {
        ...counts,
        role: membership.role,
      }),
      roster: rosterRows.map((row) => serializeRosterMember(row, userById)),
      quorum,
      inviteLink: inviteLinks.deepLink,
      inviteLinks,
    },
  };
}

async function rotatePivotCrewInviteLink(req, crewId) {
  const access = await requireActiveMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const { crew, PivotCrew } = access;
  const nextToken = generateShareInviteToken();

  const updated = await PivotCrew.findOneAndUpdate(
    { _id: crew._id, archivedAt: null },
    { $set: { shareInviteToken: nextToken } },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    return notFound();
  }

  const inviteLinks = buildCrewInviteLinks(nextToken);

  return {
    data: {
      crewId: updated._id.toString(),
      inviteLink: inviteLinks.deepLink,
      inviteLinks,
      rotatedAt: new Date().toISOString(),
    },
  };
}

async function joinPivotCrew(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = normalizeTenantKey(req);
  if (!tenantKey) {
    return invalidTenant();
  }

  const token = String(options.token || '').trim();
  if (!token) {
    return { error: 'Invite token is required.', status: 400, code: 'TOKEN_REQUIRED' };
  }

  const userObjectId = toObjectId(userId);
  const { PivotCrew, PivotCrewMembership } = getModels(req, 'PivotCrew', 'PivotCrewMembership');

  const { crew, placeholder: tokenPlaceholder, joinViaShareLink } = await findCrewByInviteToken(
    PivotCrew,
    PivotCrewMembership,
    token,
    tenantKey,
  );

  if (!crew) {
    return notFound('Invite link is invalid or expired.');
  }

  const existingActive = await PivotCrewMembership.findOne({
    crewId: crew._id,
    userId: userObjectId,
    status: 'active',
  }).lean();

  if (existingActive) {
    return getPivotCrewDetail(req, crew._id.toString());
  }

  const leftMembership = await PivotCrewMembership.findOne({
    crewId: crew._id,
    userId: userObjectId,
    status: 'left',
  });

  let placeholder = null;
  if (!leftMembership) {
    if (tokenPlaceholder) {
      placeholder = await resolveInvitePlaceholder(
        PivotCrewMembership,
        crew._id,
        tokenPlaceholder,
      );
    } else if (joinViaShareLink) {
      placeholder = await resolveInvitePlaceholder(PivotCrewMembership, crew._id);
    }
  }

  await activateCrewMembership({
    crewId: crew._id,
    userObjectId,
    PivotCrewMembership,
    placeholder,
    leftMembership,
  });

  const batchWeek = toIsoWeek(new Date());
  scheduleCrewWeekRecomputeForCrew(req, { crewId: crew._id.toString(), batchWeek });
  scheduleCrewWeekRecompute(req, { userId, batchWeek });

  return getPivotCrewDetail(req, crew._id.toString());
}

module.exports = {
  createPivotCrew,
  listPivotCrews,
  getPivotCrewDetail,
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
  countQuorumEligibleMembers,
  buildCrewQuorumSnapshot,
  buildCrewInviteLinks,
  PIVOT_CREW_INVITED_DISPLAY_LABEL,
  PIVOT_CREW_JOIN_DEEP_LINK_PREFIX,
  MAX_INVITE_PLACEHOLDERS_PER_REQUEST,
};
