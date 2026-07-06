const mongoose = require('mongoose');
const getModels = require('./getModelService');
const NotificationService = require('./notificationService');
const { getFriendRequests } = require('../utilities/friendUtils');

const SEARCH_RESULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

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
  sendPivotFriendRequest,
  listPivotFriends,
  listPivotFriendRequests,
  acceptPivotFriendRequest,
  declinePivotFriendRequest,
  SEARCH_RESULT_LIMIT,
  MIN_QUERY_LENGTH,
};
