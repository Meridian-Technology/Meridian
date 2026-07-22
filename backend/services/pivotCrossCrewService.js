const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { resolveCrewConfig, resolveBatchWeek } = require('./pivotCrewWeekStateService');

const LOCKED_JUDGEMENT_STATUSES = ['confirmed', 'swapped'];

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function toFriendIdSet(friendIds) {
  return new Set((friendIds || []).map((id) => String(id)));
}

function countMutualFriends(userFriendIds, memberFriendIds) {
  let count = 0;
  for (const friendId of memberFriendIds) {
    if (userFriendIds.has(friendId)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Whether the viewer connects to a crew member via direct friendship or
 * enough mutual accepted friends (Task 4.1 — no other-crew PII).
 */
function memberQualifiesForCrossCrewOverlap({
  userFriendIds,
  memberFriendIds,
  memberId,
  minSharedFriends,
}) {
  const memberKey = String(memberId);
  if (userFriendIds.has(memberKey)) {
    return true;
  }
  return countMutualFriends(userFriendIds, memberFriendIds) >= minSharedFriends;
}

function crewQualifiesForCrossCrewOverlap({
  memberIds,
  friendIdsByMemberId,
  userFriendIds,
  minSharedFriends,
}) {
  return memberIds.some((memberId) =>
    memberQualifiesForCrossCrewOverlap({
      userFriendIds,
      memberFriendIds: friendIdsByMemberId.get(String(memberId)) || new Set(),
      memberId,
      minSharedFriends,
    }),
  );
}

async function loadAcceptedFriendIds(Friendship, userId) {
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .select('requester recipient')
    .lean();

  const uid = String(userId);
  return rows.map((row) =>
    String(row.requester) === uid ? String(row.recipient) : String(row.requester),
  );
}

async function loadFriendIdsByUserId(Friendship, userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: { $in: userIds } }, { recipient: { $in: userIds } }],
  })
    .select('requester recipient')
    .lean();

  const tracked = new Set(userIds.map((id) => String(id)));
  const friendIdsByUserId = new Map(userIds.map((id) => [String(id), new Set()]));

  for (const row of rows) {
    const requester = String(row.requester);
    const recipient = String(row.recipient);

    if (tracked.has(requester)) {
      friendIdsByUserId.get(requester).add(recipient);
    }
    if (tracked.has(recipient)) {
      friendIdsByUserId.get(recipient).add(requester);
    }
  }

  return friendIdsByUserId;
}

/**
 * Detect event IDs eligible for cross-crew surfacing for the current user.
 * Returns a Set of eventId strings — no other-crew PII.
 */
async function detectCrossCrewOverlapEventIds(req, batchWeek) {
  const userId = req.user?.userId;
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  const userObjectId = toObjectId(userId);

  if (!userObjectId || !tenantKey || !batchWeek) {
    return new Set();
  }

  const crewConfig = await resolveCrewConfig(req);
  if (!crewConfig.crossCrew?.enabled) {
    return new Set();
  }

  const minSharedFriends = crewConfig.crossCrew.minSharedFriends ?? 1;
  const {
    PivotCrewMembership,
    PivotCrewWeekState,
    Friendship,
  } = getModels(req, 'PivotCrewMembership', 'PivotCrewWeekState', 'Friendship');

  const [userMemberships, userFriendIdList] = await Promise.all([
    PivotCrewMembership.find({ userId: userObjectId, status: 'active' })
      .select('crewId')
      .lean(),
    loadAcceptedFriendIds(Friendship, userObjectId),
  ]);

  const userCrewIds = new Set(userMemberships.map((row) => String(row.crewId)));
  const userFriendIds = toFriendIdSet(userFriendIdList);

  const lockedWeekStates = await PivotCrewWeekState.find({
    tenantKey,
    batchWeek,
    judgementStatus: { $in: LOCKED_JUDGEMENT_STATUSES },
    proposedEventId: { $ne: null },
    ...(userCrewIds.size ? { crewId: { $nin: [...userCrewIds] } } : {}),
  })
    .select('crewId proposedEventId')
    .lean();

  if (!lockedWeekStates.length) {
    return new Set();
  }

  const candidateCrewIds = [...new Set(lockedWeekStates.map((row) => String(row.crewId)))];
  const crewMemberships = await PivotCrewMembership.find({
    crewId: { $in: candidateCrewIds },
    status: 'active',
    userId: { $ne: null },
  })
    .select('crewId userId')
    .lean();

  const memberIdsByCrewId = new Map();
  const allMemberIds = new Set();
  for (const row of crewMemberships) {
    const crewKey = String(row.crewId);
    const memberKey = String(row.userId);
    if (!memberIdsByCrewId.has(crewKey)) {
      memberIdsByCrewId.set(crewKey, []);
    }
    memberIdsByCrewId.get(crewKey).push(memberKey);
    allMemberIds.add(memberKey);
  }

  const memberObjectIds = [...allMemberIds]
    .map((id) => toObjectId(id))
    .filter(Boolean);
  const friendIdsByMemberId = await loadFriendIdsByUserId(Friendship, memberObjectIds);

  const qualifyingCrewIds = new Set();
  for (const crewId of candidateCrewIds) {
    const memberIds = memberIdsByCrewId.get(crewId) || [];
    if (
      crewQualifiesForCrossCrewOverlap({
        memberIds,
        friendIdsByMemberId,
        userFriendIds,
        minSharedFriends,
      })
    ) {
      qualifyingCrewIds.add(crewId);
    }
  }

  const overlapEventIds = new Set();
  for (const row of lockedWeekStates) {
    if (qualifyingCrewIds.has(String(row.crewId))) {
      overlapEventIds.add(String(row.proposedEventId));
    }
  }

  return overlapEventIds;
}

/**
 * Map eventId -> cross-crew surface metadata for the viewer.
 * Omits events with no overlap; never includes other-crew PII.
 */
async function getCrossCrewOverlapByEventId(req, options = {}) {
  const normalizedWeek = options.batchWeek
    ? { batchWeek: options.batchWeek.trim() }
    : await resolveBatchWeek(req, options.batchWeek);

  if (normalizedWeek.error) {
    return { error: normalizedWeek.error, status: normalizedWeek.status, code: normalizedWeek.code };
  }

  const crewConfig = await resolveCrewConfig(req);
  if (!crewConfig.crossCrew?.enabled) {
    return { data: new Map() };
  }

  const overlapEventIds = await detectCrossCrewOverlapEventIds(
    req,
    normalizedWeek.batchWeek,
  );

  const requestedIds = options.eventIds?.length
    ? new Set(options.eventIds.map((id) => String(id)))
    : null;

  const surfaceCopyKey = crewConfig.crossCrew.surfaceCopyKey || 'another_crew_going';
  const overlaps = new Map();

  for (const eventId of overlapEventIds) {
    if (requestedIds && !requestedIds.has(eventId)) {
      continue;
    }
    overlaps.set(eventId, { surfaceCopyKey });
  }

  return { data: overlaps };
}

function serializeCrossCrewOverlapMap(overlapMap) {
  const out = {};
  for (const [eventId, meta] of overlapMap.entries()) {
    out[eventId] = meta;
  }
  return out;
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

/**
 * Single-event cross-crew overlap check for event detail (Task 4.2).
 */
async function getPivotEventCrossCrewOverlap(req, eventId, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const eventObjectId = toObjectId(eventId);
  if (!eventObjectId) {
    return { error: 'Event not found.', status: 404, code: 'NOT_FOUND' };
  }

  const normalizedWeek = options.batchWeek?.trim()
    ? { batchWeek: options.batchWeek.trim() }
    : await resolveBatchWeek(req, options.batchWeek);

  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const overlapResult = await getCrossCrewOverlapByEventId(req, {
    batchWeek: normalizedWeek.batchWeek,
    eventIds: [String(eventId)],
  });

  if (overlapResult.error) {
    return overlapResult;
  }

  const meta = overlapResult.data.get(String(eventId));
  return {
    data: {
      batchWeek: normalizedWeek.batchWeek,
      crossCrewOverlap: Boolean(meta),
      ...(meta ? { surfaceCopyKey: meta.surfaceCopyKey } : {}),
    },
  };
}

/**
 * Attach `crossCrewOverlap: true` on rows whose eventId qualifies (Task 4.2).
 */
async function attachCrossCrewOverlapFlags(req, batchWeek, rows, getEventId) {
  if (!rows?.length) {
    return rows;
  }

  const eventIds = [...new Set(rows.map((row) => String(getEventId(row))))];
  const overlapResult = await getCrossCrewOverlapByEventId(req, { batchWeek, eventIds });
  if (overlapResult.error || !overlapResult.data?.size) {
    return rows;
  }

  return rows.map((row) => {
    const eventId = String(getEventId(row));
    if (!overlapResult.data.has(eventId)) {
      return row;
    }
    return { ...row, crossCrewOverlap: true };
  });
}

module.exports = {
  memberQualifiesForCrossCrewOverlap,
  crewQualifiesForCrossCrewOverlap,
  detectCrossCrewOverlapEventIds,
  getCrossCrewOverlapByEventId,
  getPivotEventCrossCrewOverlap,
  attachCrossCrewOverlapFlags,
  serializeCrossCrewOverlapMap,
};
