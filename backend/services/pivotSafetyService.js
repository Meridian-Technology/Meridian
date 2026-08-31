const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  PIVOT_SAFETY_REPORT_REASONS,
} = require('../schemas/pivotSafetyReport');

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function getSafetyModel(req, name) {
  try {
    return getModels(req, name)?.[name] || null;
  } catch {
    return null;
  }
}

/**
 * User IDs hidden from this requester: people they blocked, and people who blocked them.
 */
async function getHiddenUserIdSet(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return new Set();
  }

  const PivotUserBlock = getSafetyModel(req, 'PivotUserBlock');
  if (!PivotUserBlock?.find) {
    return new Set();
  }

  const rows = await PivotUserBlock.find({
    $or: [{ blockerId: userId }, { blockedId: userId }],
  })
    .select('blockerId blockedId')
    .lean();

  const hidden = new Set();
  const me = String(userId);
  for (const row of rows) {
    const blockerId = String(row.blockerId);
    const blockedId = String(row.blockedId);
    hidden.add(blockerId === me ? blockedId : blockerId);
  }
  return hidden;
}

async function areUsersBlocked(req, userIdA, userIdB) {
  if (!userIdA || !userIdB) {
    return false;
  }

  const PivotUserBlock = getSafetyModel(req, 'PivotUserBlock');
  if (!PivotUserBlock?.findOne) {
    return false;
  }

  const hit = await PivotUserBlock.findOne({
    $or: [
      { blockerId: userIdA, blockedId: userIdB },
      { blockerId: userIdB, blockedId: userIdA },
    ],
  })
    .select('_id')
    .lean();

  return Boolean(hit);
}

function parseTargetUserId(body = {}) {
  return String(body.userId || '').trim();
}

function invalidUserId() {
  return {
    error: 'A valid userId is required.',
    status: 400,
    code: 'INVALID_USER_ID',
  };
}

async function removeFriendshipsBetween(req, userIdA, userIdB) {
  const Friendship = getSafetyModel(req, 'Friendship');
  if (!Friendship?.deleteMany) {
    return;
  }

  await Friendship.deleteMany({
    $or: [
      { requester: userIdA, recipient: userIdB },
      { requester: userIdB, recipient: userIdA },
    ],
  });
}

async function blockPivotUser(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const targetId = parseTargetUserId(body);
  if (!toObjectId(targetId)) {
    return invalidUserId();
  }
  if (targetId === String(userId)) {
    return {
      error: 'Cannot block yourself.',
      status: 400,
      code: 'SELF_BLOCK',
    };
  }

  const User = getSafetyModel(req, 'User');
  const PivotUserBlock = getSafetyModel(req, 'PivotUserBlock');
  if (!User?.findById || !PivotUserBlock?.updateOne) {
    return { error: 'Unable to block user.', status: 500, code: 'SAFETY_UNAVAILABLE' };
  }

  const target = await User.findById(targetId).select('_id').lean();
  if (!target) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  await PivotUserBlock.updateOne(
    { blockerId: userId, blockedId: targetId },
    {
      $setOnInsert: {
        blockerId: userId,
        blockedId: targetId,
      },
    },
    { upsert: true },
  );
  await removeFriendshipsBetween(req, userId, targetId);

  return { data: { userId: targetId, blocked: true } };
}

async function unblockPivotUser(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const targetId = parseTargetUserId(body);
  if (!toObjectId(targetId)) {
    return invalidUserId();
  }

  const PivotUserBlock = getSafetyModel(req, 'PivotUserBlock');
  if (!PivotUserBlock?.deleteOne) {
    return { error: 'Unable to unblock user.', status: 500, code: 'SAFETY_UNAVAILABLE' };
  }

  await PivotUserBlock.deleteOne({ blockerId: userId, blockedId: targetId });

  return { data: { userId: targetId, blocked: false } };
}

function serializeSafetyUser(user) {
  const row = {
    id: user._id.toString(),
    name: user.name || '',
    picture: user.picture || null,
  };
  if (user.username) {
    row.username = user.username;
  }
  return row;
}

async function listBlockedPivotUsers(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const PivotUserBlock = getSafetyModel(req, 'PivotUserBlock');
  const User = getSafetyModel(req, 'User');
  if (!PivotUserBlock?.find || !User?.find) {
    return { data: { users: [] } };
  }

  const rows = await PivotUserBlock.find({ blockerId: userId })
    .select('blockedId createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const blockedIds = rows.map((row) => row.blockedId).filter(Boolean);
  if (!blockedIds.length) {
    return { data: { users: [] } };
  }

  const users = await User.find({ _id: { $in: blockedIds } })
    .select('name picture username')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  return {
    data: {
      users: rows
        .map((row) => userById.get(String(row.blockedId)))
        .filter(Boolean)
        .map(serializeSafetyUser),
    },
  };
}

async function reportPivotUser(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const targetId = parseTargetUserId(body);
  if (!toObjectId(targetId)) {
    return invalidUserId();
  }
  if (targetId === String(userId)) {
    return {
      error: 'Cannot report yourself.',
      status: 400,
      code: 'SELF_REPORT',
    };
  }

  const reason = String(body.reason || '').trim().toLowerCase();
  if (!PIVOT_SAFETY_REPORT_REASONS.includes(reason)) {
    return {
      error: 'A valid report reason is required.',
      status: 400,
      code: 'INVALID_REASON',
    };
  }

  const notes = String(body.notes || '').trim().slice(0, 1000);

  const User = getSafetyModel(req, 'User');
  const PivotSafetyReport = getSafetyModel(req, 'PivotSafetyReport');
  if (!User?.findById || !PivotSafetyReport?.create) {
    return { error: 'Unable to submit report.', status: 500, code: 'SAFETY_UNAVAILABLE' };
  }

  const target = await User.findById(targetId).select('_id').lean();
  if (!target) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  const report = await PivotSafetyReport.create({
    reporterId: userId,
    targetUserId: targetId,
    reason,
    notes,
  });

  return {
    data: {
      reportId: report._id.toString(),
      userId: targetId,
      reason,
    },
  };
}

async function listPivotSafetyTargets(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const hidden = await getHiddenUserIdSet(req);
  const User = getSafetyModel(req, 'User');
  const Friendship = getSafetyModel(req, 'Friendship');
  const PivotCrewMembership = getSafetyModel(req, 'PivotCrewMembership');
  if (!User?.find || !Friendship?.find) {
    return { data: { users: [] } };
  }

  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' },
    ],
  })
    .select('requester recipient')
    .lean();

  const me = String(userId);
  const friendIds = [];
  for (const row of friendships) {
    const otherId =
      String(row.requester) === me ? String(row.recipient) : String(row.requester);
    if (otherId && otherId !== me && !hidden.has(otherId)) {
      friendIds.push(otherId);
    }
  }

  const crewMemberIds = [];
  if (PivotCrewMembership?.find) {
    const myCrews = await PivotCrewMembership.find({
      userId,
      status: 'active',
    })
      .select('crewId')
      .lean();
    const crewIds = myCrews.map((row) => row.crewId).filter(Boolean);
    if (crewIds.length) {
      const roster = await PivotCrewMembership.find({
        crewId: { $in: crewIds },
        status: 'active',
        userId: { $ne: null },
      })
        .select('userId')
        .lean();
      for (const row of roster) {
        const otherId = row.userId ? String(row.userId) : '';
        if (otherId && otherId !== me && !hidden.has(otherId)) {
          crewMemberIds.push(otherId);
        }
      }
    }
  }

  const friendSet = new Set(friendIds);
  const allIds = [...new Set([...friendIds, ...crewMemberIds])];
  if (!allIds.length) {
    return { data: { users: [] } };
  }

  const users = await User.find({ _id: { $in: allIds } })
    .select('name picture username')
    .lean();

  const targets = users
    .map((user) => ({
      ...serializeSafetyUser(user),
      source: friendSet.has(user._id.toString()) ? 'friend' : 'crew',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { data: { users: targets } };
}

module.exports = {
  getHiddenUserIdSet,
  areUsersBlocked,
  blockPivotUser,
  unblockPivotUser,
  listBlockedPivotUsers,
  reportPivotUser,
  listPivotSafetyTargets,
  PIVOT_SAFETY_REPORT_REASONS,
};
