const mongoose = require('mongoose');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const {
  hashContactEmail,
  hashContactIdentifiers,
  isValidContactHash,
} = require('../utilities/pivotContactHash');
const {
  resolveFriendshipStatus,
} = require('./pivotFriendService');

const MAX_HASHES_PER_REQUEST = 500;
const MATCH_RESULT_LIMIT = 30;

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function toGlobalObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function serializeMatchedUser(user, friendshipStatus) {
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

function dedupeHashes(hashes = []) {
  const seen = new Set();
  const deduped = [];

  for (const row of hashes) {
    const type = String(row?.type || '').trim().toLowerCase();
    const hash = String(row?.hash || '').trim().toLowerCase();
    if ((type !== 'email' && type !== 'phone') || !isValidContactHash(hash)) {
      continue;
    }

    const key = `${type}:${hash}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ type, hash });
  }

  return deduped;
}

/**
 * Upsert the requester's own email hash so other users can discover them via contacts.
 * Raw email is read from GlobalUser once, hashed in memory, and only the digest is stored.
 */
async function syncUserContactHashes(req) {
  const globalUserObjectId = toGlobalObjectId(req.user?.globalUserId);
  if (!globalUserObjectId) {
    return { synced: false };
  }

  const { GlobalUser, PivotContactHash } = getGlobalModels(req, 'GlobalUser', 'PivotContactHash');
  const globalUser = await GlobalUser.findById(globalUserObjectId).select('email').lean();
  if (!globalUser?.email) {
    return { synced: false };
  }

  const emailHash = hashContactEmail(globalUser.email);
  if (!emailHash) {
    return { synced: false };
  }

  await PivotContactHash.updateOne(
    { globalUserId: globalUserObjectId, identifierType: 'email', hash: emailHash },
    {
      $setOnInsert: {
        globalUserId: globalUserObjectId,
        identifierType: 'email',
        hash: emailHash,
      },
    },
    { upsert: true },
  );

  return { synced: true };
}

/**
 * Match pre-hashed contact identifiers against registered user hashes in the global DB.
 * Never stores uploaded address-book hashes — only reads the match table.
 */
async function matchPivotContacts(req, body = {}) {
  const userId = req.user?.userId;
  const globalUserObjectId = toGlobalObjectId(req.user?.globalUserId);
  if (!userId || !globalUserObjectId) {
    return unauthorized();
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { data: { users: [], matchedHashCount: 0, submittedHashCount: 0 } };
  }

  const submittedHashes = Array.isArray(body.hashes)
    ? dedupeHashes(body.hashes)
    : hashContactIdentifiers(body.identifiers);

  if (submittedHashes.length > MAX_HASHES_PER_REQUEST) {
    return {
      error: `At most ${MAX_HASHES_PER_REQUEST} contact hashes may be submitted per request.`,
      status: 400,
      code: 'TOO_MANY_HASHES',
    };
  }

  await syncUserContactHashes(req);

  if (!submittedHashes.length) {
    return {
      data: {
        users: [],
        matchedHashCount: 0,
        submittedHashCount: 0,
      },
    };
  }

  const { PivotContactHash, TenantMembership } = getGlobalModels(
    req,
    'PivotContactHash',
    'TenantMembership',
  );

  const hashClauses = submittedHashes.map(({ type, hash }) => ({
    identifierType: type,
    hash,
  }));

  const matchedRows = await PivotContactHash.find({
    $or: hashClauses,
    globalUserId: { $ne: globalUserObjectId },
  })
    .select('globalUserId identifierType hash')
    .lean();

  const matchedHashCount = new Set(
    matchedRows.map((row) => `${row.identifierType}:${row.hash}`),
  ).size;

  if (!matchedRows.length) {
    return {
      data: {
        users: [],
        matchedHashCount: 0,
        submittedHashCount: submittedHashes.length,
      },
    };
  }

  const matchedGlobalIds = [...new Set(matchedRows.map((row) => row.globalUserId.toString()))];

  const memberships = await TenantMembership.find({
    globalUserId: { $in: matchedGlobalIds },
    tenantKey,
    status: 'active',
  })
    .select('globalUserId tenantUserId')
    .lean();

  const tenantUserIds = memberships
    .map((row) => row.tenantUserId?.toString())
    .filter((id) => id && id !== userId.toString());

  if (!tenantUserIds.length) {
    return {
      data: {
        users: [],
        matchedHashCount,
        submittedHashCount: submittedHashes.length,
      },
    };
  }

  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const users = await User.find({ _id: { $in: tenantUserIds } })
    .select('name picture username')
    .lean();

  const friendships = await Friendship.find({
    $or: [
      { requester: userId, recipient: { $in: tenantUserIds } },
      { requester: { $in: tenantUserIds }, recipient: userId },
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
  for (const tenantUserId of tenantUserIds) {
    if (results.length >= MATCH_RESULT_LIMIT) {
      break;
    }

    const user = users.find((row) => row._id.toString() === tenantUserId);
    if (!user) {
      continue;
    }

    const friendshipStatus = resolveFriendshipStatus(
      friendshipByOtherId.get(tenantUserId),
      userId,
    );
    if (friendshipStatus === 'accepted') {
      continue;
    }

    results.push(serializeMatchedUser(user, friendshipStatus));
  }

  return {
    data: {
      users: results,
      matchedHashCount,
      submittedHashCount: submittedHashes.length,
    },
  };
}

module.exports = {
  matchPivotContacts,
  syncUserContactHashes,
  MAX_HASHES_PER_REQUEST,
  MATCH_RESULT_LIMIT,
};
