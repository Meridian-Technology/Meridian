const mongoose = require('mongoose');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const NotificationService = require('./notificationService');
const { getFriendRequests } = require('../utilities/friendUtils');

const SEARCH_RESULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;
const COHORT_SUGGESTION_LIMIT = 30;

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function normalizeQuery(q) {
  return String(q || '').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameUsernameQuery(term) {
  const regex = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [{ name: { $regex: regex } }, { username: { $regex: regex } }],
  };
}

function resolveFriendshipStatus(friendship, currentUserId) {
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'accepted';
  if (friendship.status !== 'pending') return 'none';

  return friendship.requester.toString() === currentUserId.toString()
    ? 'pending_outgoing'
    : 'pending_incoming';
}

function serializeSearchUser(user, friendshipStatus) {
  const row = {
    id: user._id.toString(),
    name: user.name || '',
    picture: user.picture || null,
    friendshipStatus,
  };

  if (user.username) {
    row.username = user.username;
  }

  return row;
}

/**
 * Search for users in the current pilot city tenant by display name or username.
 * Scoped to req.db (derived from req.school subdomain) — not cross-tenant.
 */
async function searchPivotFriends(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const query = normalizeQuery(options.q);
  if (query.length < MIN_QUERY_LENGTH) {
    return { data: { users: [] } };
  }

  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const users = await User.find({
    ...buildNameUsernameQuery(query),
    _id: { $ne: userId },
  })
    .select('name picture username')
    .limit(SEARCH_RESULT_LIMIT)
    .lean();

  if (!users.length) {
    return { data: { users: [] } };
  }

  const hitIds = users.map((user) => user._id);
  const friendships = await Friendship.find({
    $or: [
      { requester: userId, recipient: { $in: hitIds } },
      { requester: { $in: hitIds }, recipient: userId },
    ],
  })
    .select('requester recipient status')
    .lean();

  const friendshipByOtherId = new Map();
  for (const friendship of friendships) {
    const otherId =
      friendship.requester.toString() === userId.toString()
        ? friendship.recipient.toString()
        : friendship.requester.toString();
    friendshipByOtherId.set(otherId, friendship);
  }

  const results = users.map((user) =>
    serializeSearchUser(user, resolveFriendshipStatus(friendshipByOtherId.get(user._id.toString()), userId)),
  );

  return { data: { users: results } };
}

function toGlobalObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function dedupePreservingOrder(ids) {
  const seen = new Set();
  const ordered = [];
  for (const id of ids) {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(id);
    }
  }
  return ordered;
}

/**
 * Suggest other pilot users who joined the same **cohort** (shared referral-code cohortId)
 * so a new user can seed their friend graph during onboarding ("know any of these people?").
 *
 * Grouping is cohort-only (Task 0.3 `cohortId`) — never by raw code. Users whose code carries
 * no cohortId, or who have no redemption record, get an empty list (the onboarding step then
 * auto-skips). Excludes self and users who are already friends; pending requests remain visible
 * with their status so the row shows a disabled "pending" chip.
 *
 * Redemptions + codes + membership live in the global DB; profiles + friendships in the tenant DB.
 */
async function getPivotCohortSuggestions(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const globalUserObjectId = toGlobalObjectId(req.user?.globalUserId);
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!globalUserObjectId || !tenantKey) {
    return { data: { users: [] } };
  }

  const { PivotReferralCode, PivotReferralRedemption, TenantMembership } = getGlobalModels(
    req,
    'PivotReferralCode',
    'PivotReferralRedemption',
    'TenantMembership',
  );

  // 1. Codes the requester has redeemed.
  const myRedemptions = await PivotReferralRedemption.find({ globalUserId: globalUserObjectId })
    .select('code')
    .lean();
  const myCodes = [...new Set(myRedemptions.map((row) => row.code).filter(Boolean))];
  if (!myCodes.length) {
    return { data: { users: [] } };
  }

  // 2. cohortId(s) for those codes in the active pilot city. Cohort-only grouping.
  const myCodeDocs = await PivotReferralCode.find({ code: { $in: myCodes }, tenantKey })
    .select('cohortId')
    .lean();
  const cohortIds = [...new Set(myCodeDocs.map((doc) => doc.cohortId).filter(Boolean))];
  if (!cohortIds.length) {
    return { data: { users: [] } };
  }

  // 3. All codes belonging to the same cohort(s) in this tenant.
  const cohortCodeDocs = await PivotReferralCode.find({ cohortId: { $in: cohortIds }, tenantKey })
    .select('code')
    .lean();
  const cohortCodes = [...new Set(cohortCodeDocs.map((doc) => doc.code).filter(Boolean))];
  if (!cohortCodes.length) {
    return { data: { users: [] } };
  }

  // 4. globalUserIds that redeemed any cohort code (exclude self), most recent first.
  const cohortRedemptions = await PivotReferralRedemption.find({
    code: { $in: cohortCodes },
    globalUserId: { $ne: globalUserObjectId },
  })
    .select('globalUserId')
    .sort({ createdAt: -1 })
    .lean();
  const orderedGlobalIds = dedupePreservingOrder(
    cohortRedemptions.map((row) => row.globalUserId),
  );
  if (!orderedGlobalIds.length) {
    return { data: { users: [] } };
  }

  // 5. Map global identities to tenant users via active membership in this city.
  const memberships = await TenantMembership.find({
    globalUserId: { $in: orderedGlobalIds },
    tenantKey,
    status: 'active',
  })
    .select('globalUserId tenantUserId')
    .lean();
  const tenantUserIdByGlobal = new Map(
    memberships.map((m) => [m.globalUserId.toString(), m.tenantUserId.toString()]),
  );

  const orderedTenantUserIds = [];
  for (const gid of orderedGlobalIds) {
    const tenantUserId = tenantUserIdByGlobal.get(gid.toString());
    if (tenantUserId && tenantUserId !== userId.toString()) {
      orderedTenantUserIds.push(tenantUserId);
    }
  }
  if (!orderedTenantUserIds.length) {
    return { data: { users: [] } };
  }

  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const users = await User.find({ _id: { $in: orderedTenantUserIds } })
    .select('name picture username')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  const friendships = await Friendship.find({
    $or: [
      { requester: userId, recipient: { $in: orderedTenantUserIds } },
      { requester: { $in: orderedTenantUserIds }, recipient: userId },
    ],
  })
    .select('requester recipient status')
    .lean();

  const friendshipByOtherId = new Map();
  for (const friendship of friendships) {
    const otherId =
      friendship.requester.toString() === userId.toString()
        ? friendship.recipient.toString()
        : friendship.requester.toString();
    friendshipByOtherId.set(otherId, friendship);
  }

  const results = [];
  for (const tenantUserId of orderedTenantUserIds) {
    if (results.length >= COHORT_SUGGESTION_LIMIT) break;
    const user = userById.get(tenantUserId);
    if (!user) continue;

    const friendshipStatus = resolveFriendshipStatus(
      friendshipByOtherId.get(tenantUserId),
      userId,
    );
    if (friendshipStatus === 'accepted') continue; // already friends — nothing to suggest

    results.push(serializeSearchUser(user, friendshipStatus));
  }

  return { data: { users: results } };
}

/**
 * Send a friend request to another user in the current pilot city tenant by userId.
 * Pivot users may lack a campus username; this avoids POST /friend-request/:username.
 */
async function sendPivotFriendRequest(req, body = {}) {
  const requesterId = req.user?.userId;
  if (!requesterId) {
    return unauthorized();
  }

  const recipientId = String(body.userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    return {
      error: 'A valid userId is required.',
      status: 400,
      code: 'INVALID_USER_ID',
    };
  }

  if (recipientId === requesterId.toString()) {
    return {
      error: 'Cannot send friend request to self.',
      status: 400,
      code: 'SELF_REQUEST',
    };
  }

  const { User, Friendship, Notification } = getModels(req, 'User', 'Friendship', 'Notification');

  const recipient = await User.findById(recipientId).select('name username').lean();
  if (!recipient) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  const existingFriendship = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  });

  if (existingFriendship) {
    if (existingFriendship.status === 'pending') {
      return {
        error: 'Friend request already sent.',
        status: 400,
        code: 'REQUEST_PENDING',
      };
    }
    if (existingFriendship.status === 'accepted') {
      return {
        error: 'You are already friends with this user.',
        status: 400,
        code: 'ALREADY_FRIENDS',
      };
    }
  }

  const requesterUser = await User.findById(requesterId).select('name username').lean();
  if (!requesterUser) {
    return { error: 'User not found.', status: 404, code: 'REQUESTER_NOT_FOUND' };
  }

  const newFriendship = await new Friendship({
    requester: requesterId,
    recipient: recipientId,
    status: 'pending',
  }).save();

  const notificationService = NotificationService.withModels({ Notification, User });
  const senderName =
    requesterUser.name?.trim() ||
    requesterUser.username?.trim() ||
    'Someone';

  await notificationService.createSystemNotification(recipientId, 'User', 'friend_request', {
    senderName,
    friendshipId: newFriendship._id,
    sender: requesterId,
  });

  return {
    data: {
      friendshipId: newFriendship._id.toString(),
      friendshipStatus: 'pending_outgoing',
    },
  };
}

/**
 * List accepted friends for the current pilot city tenant.
 * Uses the same tenant-scoped Friendship/User models as campus /getFriends.
 */
async function listPivotFriends(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' },
    ],
  }).populate('requester recipient', 'username name picture email');

  const friendIds = friendships.map((friendship) =>
    friendship.requester._id.toString() === userId.toString()
      ? friendship.recipient._id
      : friendship.requester._id,
  );

  const friends = friendIds.length
    ? await User.find({ _id: { $in: friendIds } }).select('name username picture email partners')
    : [];

  return { data: { friends } };
}

/**
 * List pending friend requests (received + sent) for the current pilot city tenant.
 */
async function listPivotFriendRequests(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const { Friendship } = getModels(req, 'Friendship');
  const friendRequests = await getFriendRequests(Friendship, userId, {
    receivedFields: 'username name picture email _id',
    sentFields: 'username name picture email _id',
    lean: true,
  });

  return { data: friendRequests };
}

async function acceptPivotFriendRequest(req, friendshipId) {
  const recipientId = req.user?.userId;
  if (!recipientId) {
    return unauthorized();
  }

  const id = String(friendshipId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      error: 'A valid friendshipId is required.',
      status: 400,
      code: 'INVALID_FRIENDSHIP_ID',
    };
  }

  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const friendship = await Friendship.findById(id);
  if (!friendship) {
    return { error: 'Friendship not found.', status: 404, code: 'FRIENDSHIP_NOT_FOUND' };
  }
  if (friendship.recipient.toString() !== recipientId.toString()) {
    return { error: 'Not authorized to accept request.', status: 403, code: 'FORBIDDEN' };
  }

  friendship.status = 'accepted';
  await friendship.save();
  await User.updateOne({ _id: friendship.requester }, { $inc: { partners: 1 } });
  await User.updateOne({ _id: friendship.recipient }, { $inc: { partners: 1 } });

  return { data: { friendshipId: friendship._id.toString(), status: 'accepted' } };
}

async function declinePivotFriendRequest(req, friendshipId) {
  const recipientId = req.user?.userId;
  if (!recipientId) {
    return unauthorized();
  }

  const id = String(friendshipId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      error: 'A valid friendshipId is required.',
      status: 400,
      code: 'INVALID_FRIENDSHIP_ID',
    };
  }

  const { Friendship } = getModels(req, 'Friendship');

  const friendship = await Friendship.findById(id);
  if (!friendship) {
    return { error: 'Friendship not found.', status: 404, code: 'FRIENDSHIP_NOT_FOUND' };
  }
  if (friendship.recipient.toString() !== recipientId.toString()) {
    return { error: 'Not authorized to reject request.', status: 403, code: 'FORBIDDEN' };
  }

  await Friendship.deleteOne({ _id: friendship._id });

  return { data: { friendshipId: id, status: 'declined' } };
}

module.exports = {
  searchPivotFriends,
  getPivotCohortSuggestions,
  sendPivotFriendRequest,
  listPivotFriends,
  listPivotFriendRequests,
  acceptPivotFriendRequest,
  declinePivotFriendRequest,
  SEARCH_RESULT_LIMIT,
  MIN_QUERY_LENGTH,
  COHORT_SUGGESTION_LIMIT,
};
