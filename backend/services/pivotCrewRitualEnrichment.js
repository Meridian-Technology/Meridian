const mongoose = require('mongoose');
const getModels = require('./getModelService');

const PIVOT_CREW_INVITED_DISPLAY_LABEL = 'invited';

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function serializeRitualSwipeMember(row, userById, swipedUserIds) {
  if (row.status === 'invited' || !row.userId) {
    return {
      userId: null,
      displayLabel: PIVOT_CREW_INVITED_DISPLAY_LABEL,
      picture: null,
      status: 'invited',
      role: row.role,
      swiped: false,
    };
  }

  const userId = row.userId.toString();
  const user = userById.get(userId);

  return {
    userId,
    displayLabel: user?.name || 'member',
    picture: user?.picture || null,
    status: 'active',
    role: row.role,
    swiped: swipedUserIds.has(userId),
  };
}

/**
 * Load per-crew roster members with swipe status for ritual payloads.
 * Any intent row for the batch week counts as "swiped" (matches week-state aggregation).
 */
async function loadCrewMemberSwipeMaps(req, crewIds, batchWeek) {
  if (!crewIds.length) {
    return new Map();
  }

  const crewObjectIds = crewIds.map((id) => toObjectId(id)).filter(Boolean);
  const { PivotCrewMembership, PivotEventIntent, User } = getModels(
    req,
    'PivotCrewMembership',
    'PivotEventIntent',
    'User',
  );

  const memberships = await PivotCrewMembership.find({
    crewId: { $in: crewObjectIds },
    status: { $in: ['active', 'invited'] },
  })
    .select('crewId userId status role invitedAt joinedAt')
    .sort({ role: 1, joinedAt: 1, invitedAt: 1 })
    .lean();

  const activeUserIds = [
    ...new Set(
      memberships
        .filter((row) => row.status === 'active' && row.userId)
        .map((row) => row.userId.toString()),
    ),
  ];

  const [users, intents] = await Promise.all([
    activeUserIds.length
      ? User.find({ _id: { $in: activeUserIds.map((id) => toObjectId(id)) } })
          .select('name picture')
          .lean()
      : [],
    activeUserIds.length
      ? PivotEventIntent.find({
          batchWeek,
          userId: { $in: activeUserIds.map((id) => toObjectId(id)) },
        })
          .select('userId')
          .lean()
      : [],
  ]);

  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const swipedUserIds = new Set(intents.map((row) => row.userId.toString()));

  const membersByCrewId = new Map();
  for (const crewId of crewIds) {
    membersByCrewId.set(crewId, []);
  }

  for (const row of memberships) {
    const crewId = row.crewId.toString();
    const members = membersByCrewId.get(crewId);
    if (!members) {
      continue;
    }
    members.push(serializeRitualSwipeMember(row, userById, swipedUserIds));
  }

  return membersByCrewId;
}

module.exports = {
  serializeRitualSwipeMember,
  loadCrewMemberSwipeMaps,
};
