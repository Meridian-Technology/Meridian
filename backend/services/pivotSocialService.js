const mongoose = require('mongoose');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const {
  getAcceptedFriendIds,
  mapFriendPreview,
  resolveDisplayHost,
  serializePivotFeedEvent,
  PIVOT_EVENT_STATUSES,
} = require('./pivotFeedService');
const { resolveFriendshipStatus, getPivotCohortSuggestions } = require('./pivotFriendService');
const { getHiddenUserIdSet } = require('./pivotSafetyService');
const { resolvePlanVisibleUserIds, normalizePlanVisibility } = require('./pivotPlanVisibilityService');
const { getTenantByKey } = require('./tenantConfigService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { resolvePivotLiveBatchWeek } = require('../utilities/pivotDropSchedule');

/**
 * The Friends tab in one request: what friends are doing this drop, what
 * happened around you this week, and who you might know.
 *
 * Friend plans respect each friend's `pivotPlanVisibility`; blocked/hidden
 * users never appear. No city-wide or stranger data is exposed.
 */

const FRIEND_PLAN_LIMIT = 12;
const FRIEND_PLAN_PREVIEW_CAP = 5;
const ACTIVITY_LIMIT = 20;
const SUGGESTION_LIMIT = 10;
/** Treat an event as still upcoming until a few hours past its start when it has no end. */
const PAST_EVENT_GRACE_MS = 3 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PLAN_STATUSES = ['interested', 'registered'];
const PLAN_EVENT_FIELDS =
  'name description location richLocation start_time end_time externalLink type image customFields.pivot';

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function isUpcoming(event, now) {
  const end = event.end_time ? new Date(event.end_time).getTime() : null;
  if (end && !Number.isNaN(end)) {
    return end >= now.getTime();
  }
  const start = new Date(event.start_time).getTime();
  return !Number.isNaN(start) && start + PAST_EVENT_GRACE_MS >= now.getTime();
}

function toTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** Friends' interested/going rows this week, grouped by event, plus the viewer's own intents. */
async function loadFriendPlans(req, { userId, visibleFriendIds, batchWeek, now }) {
  if (!visibleFriendIds.length) {
    return { plans: [], rows: [], eventsById: new Map(), userById: new Map() };
  }

  const { PivotEventIntent, Event, User } = getModels(req, 'PivotEventIntent', 'Event', 'User');
  const rows = await PivotEventIntent.find({
    userId: { $in: visibleFriendIds },
    batchWeek,
    status: { $in: PLAN_STATUSES },
  })
    .select('eventId userId status updatedAt')
    .lean();
  if (!rows.length) {
    return { plans: [], rows: [], eventsById: new Map(), userById: new Map() };
  }

  const eventIds = [...new Set(rows.map((row) => String(row.eventId)))];
  const friendUserIds = [...new Set(rows.map((row) => String(row.userId)))];
  const [events, users, myRows] = await Promise.all([
    Event.find({
      _id: { $in: eventIds },
      'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
      status: { $in: PIVOT_EVENT_STATUSES },
      isDeleted: { $ne: true },
      'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
    })
      .select(PLAN_EVENT_FIELDS)
      .lean(),
    User.find({ _id: { $in: friendUserIds } }).select('name username picture').lean(),
    PivotEventIntent.find({ userId, eventId: { $in: eventIds } })
      .select('eventId status timeSlotId')
      .lean(),
  ]);

  const eventsById = new Map(
    events
      .filter((event) => isUpcoming(event, now) && resolveDisplayHost(event.customFields?.pivot))
      .map((event) => [String(event._id), event]),
  );
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const myIntentByEvent = new Map(myRows.map((row) => [String(row.eventId), row]));

  const buckets = new Map();
  for (const row of rows) {
    const eventId = String(row.eventId);
    const friend = userById.get(String(row.userId));
    if (!eventsById.has(eventId) || !friend) continue;
    if (!buckets.has(eventId)) {
      buckets.set(eventId, { going: [], interested: [], goingCount: 0, interestedCount: 0 });
    }
    const bucket = buckets.get(eventId);
    const preview = mapFriendPreview(friend);
    // Going implies interested, matching feed counts.
    bucket.interestedCount += 1;
    if (bucket.interested.length < FRIEND_PLAN_PREVIEW_CAP) bucket.interested.push(preview);
    if (row.status === 'registered') {
      bucket.goingCount += 1;
      if (bucket.going.length < FRIEND_PLAN_PREVIEW_CAP) bucket.going.push(preview);
    }
  }

  const plans = [...buckets.entries()]
    .map(([eventId, bucket]) => {
      const event = eventsById.get(eventId);
      const mine = myIntentByEvent.get(eventId);
      return serializePivotFeedEvent(event, {
        displayHost: resolveDisplayHost(event.customFields?.pivot),
        userIntent: mine?.status || null,
        userTimeSlotId: mine?.timeSlotId || null,
        socialByTimeSlot: new Map(),
        friendsInterested: bucket.interested,
        friendsGoing: bucket.going,
        friendsInterestedCount: bucket.interestedCount,
        friendsGoingCount: bucket.goingCount,
      });
    })
    .sort(
      (a, b) =>
        b.friendsGoingCount * 2 + b.friendsInterestedCount
          - (a.friendsGoingCount * 2 + a.friendsInterestedCount)
        || toTime(a.start_time) - toTime(b.start_time),
    )
    .slice(0, FRIEND_PLAN_LIMIT);

  return { plans, rows, eventsById, userById };
}

function friendPlanActivity(rows, eventsById, userById) {
  return rows
    .filter((row) => eventsById.has(String(row.eventId)) && userById.has(String(row.userId)))
    .map((row) => {
      const event = eventsById.get(String(row.eventId));
      return {
        type: row.status === 'registered' ? 'friend_going' : 'friend_interested',
        at: row.updatedAt || null,
        actor: mapFriendPreview(userById.get(String(row.userId))),
        event: { id: String(event._id), name: event.name },
      };
    });
}

/** People who joined or connected through the viewer's personal invite link this week. */
async function inviteJoinActivity(req, { globalUserId, tenantKey, hidden, since }) {
  const globalObjectId = toObjectId(globalUserId);
  if (!globalObjectId || !req.globalDb) return [];

  const { PivotUserInviteAcceptance, TenantMembership } = getGlobalModels(
    req,
    'PivotUserInviteAcceptance',
    'TenantMembership',
  );
  const acceptances = await PivotUserInviteAcceptance.find({
    inviterGlobalUserId: globalObjectId,
    tenantKey,
    createdAt: { $gte: since },
  })
    .select('inviteeGlobalUserId createdAt')
    .lean();
  if (!acceptances.length) return [];

  const memberships = await TenantMembership.find({
    tenantKey,
    globalUserId: { $in: acceptances.map((row) => row.inviteeGlobalUserId) },
  })
    .select('globalUserId tenantUserId')
    .lean();
  const tenantUserByGlobal = new Map(
    memberships.map((row) => [String(row.globalUserId), String(row.tenantUserId)]),
  );

  const tenantUserIds = [...tenantUserByGlobal.values()].filter((id) => !hidden.has(id));
  if (!tenantUserIds.length) return [];
  const { User } = getModels(req, 'User');
  const users = await User.find({ _id: { $in: tenantUserIds } }).select('name username picture').lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  return acceptances
    .map((row) => {
      const user = userById.get(tenantUserByGlobal.get(String(row.inviteeGlobalUserId)));
      return user
        ? { type: 'invite_joined', at: row.createdAt, actor: mapFriendPreview(user) }
        : null;
    })
    .filter(Boolean);
}

/** Circles the viewer is in that locked a pick this week. */
async function circlePickActivity(req, { userId, batchWeek, tenantKey }) {
  const { PivotCrew, PivotCrewMembership, PivotCrewWeekState, Event } = getModels(
    req,
    'PivotCrew',
    'PivotCrewMembership',
    'PivotCrewWeekState',
    'Event',
  );
  const crewIds = await PivotCrewMembership.distinct('crewId', {
    userId: toObjectId(userId),
    status: 'active',
  });
  if (!crewIds.length) return [];

  const [crews, states] = await Promise.all([
    PivotCrew.find({ _id: { $in: crewIds }, tenantKey, archivedAt: null }).select('name').lean(),
    PivotCrewWeekState.find({
      crewId: { $in: crewIds },
      batchWeek,
      judgementStatus: { $in: ['confirmed', 'swapped'] },
      proposedEventId: { $ne: null },
    })
      .select('crewId proposedEventId updatedAt')
      .lean(),
  ]);
  if (!states.length) return [];

  const events = await Event.find({ _id: { $in: states.map((row) => row.proposedEventId) } })
    .select('name')
    .lean();
  const crewById = new Map(crews.map((crew) => [String(crew._id), crew]));
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  return states
    .map((state) => {
      const crew = crewById.get(String(state.crewId));
      const event = eventById.get(String(state.proposedEventId));
      return crew && event
        ? {
            type: 'circle_pick',
            at: state.updatedAt || null,
            crew: { id: String(crew._id), name: crew.name },
            event: { id: String(event._id), name: event.name },
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Friends of friends, ranked by mutual count. Falls back to cohort-mates
 * (people who joined with the same pilot code) when there are none yet.
 */
async function loadSuggestions(req, { userId, friendIds, hidden }) {
  const { Friendship, User } = getModels(req, 'Friendship', 'User');
  const me = String(userId);
  const friendSet = new Set(friendIds.map(String));
  const mutualsByCandidate = new Map();

  if (friendIds.length) {
    const rows = await Friendship.find({
      status: 'accepted',
      $or: [{ requester: { $in: friendIds } }, { recipient: { $in: friendIds } }],
    })
      .select('requester recipient')
      .lean();

    for (const row of rows) {
      const a = String(row.requester);
      const b = String(row.recipient);
      const [friend, candidate] = friendSet.has(a) ? [a, b] : [b, a];
      if (!friendSet.has(friend) || candidate === me || friendSet.has(candidate) || hidden.has(candidate)) {
        continue;
      }
      if (!mutualsByCandidate.has(candidate)) mutualsByCandidate.set(candidate, new Set());
      mutualsByCandidate.get(candidate).add(friend);
    }
  }

  const ranked = [...mutualsByCandidate.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, SUGGESTION_LIMIT);

  if (!ranked.length) {
    try {
      const cohort = await getPivotCohortSuggestions(req);
      return (cohort.data?.users || [])
        .slice(0, SUGGESTION_LIMIT)
        .map((user) => ({ ...user, mutualCount: 0, reason: 'cohort' }));
    } catch {
      return [];
    }
  }

  const candidateIds = ranked.map(([id]) => id);
  const [users, pending] = await Promise.all([
    User.find({ _id: { $in: candidateIds } }).select('name username picture').lean(),
    Friendship.find({
      $or: [
        { requester: userId, recipient: { $in: candidateIds } },
        { requester: { $in: candidateIds }, recipient: userId },
      ],
    })
      .select('requester recipient status')
      .lean(),
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const friendshipByOther = new Map(
    pending.map((row) => [
      String(row.requester) === me ? String(row.recipient) : String(row.requester),
      row,
    ]),
  );

  return ranked
    .map(([id, mutuals]) => {
      const user = userById.get(id);
      if (!user) return null;
      return {
        id,
        name: user.name || user.username || '',
        picture: user.picture || null,
        friendshipStatus: resolveFriendshipStatus(friendshipByOther.get(id), me),
        mutualCount: mutuals.size,
        reason: 'mutual',
      };
    })
    .filter(Boolean);
}

async function getPivotSocialWeek(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const now = options.now || new Date();
  const requested = typeof options.batchWeek === 'string' ? options.batchWeek.trim() : '';
  if (requested && !isValidIsoWeek(requested)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  // Default to the city's live drop week (drops don't land on ISO Mondays).
  const batchWeek =
    requested
    || resolvePivotLiveBatchWeek((await getTenantByKey(req, tenantKey).catch(() => null)) || {}, now);

  const { Friendship, User } = getModels(req, 'Friendship', 'User');
  const hidden = await getHiddenUserIdSet(req);
  const [friendIds, me] = await Promise.all([
    getAcceptedFriendIds(Friendship, userId, hidden),
    User.findById(userId).select('pivotPlanVisibility').lean(),
  ]);

  const friendVisibility = friendIds.length
    ? await User.find({ _id: { $in: friendIds } }).select('pivotPlanVisibility').lean()
    : [];
  const visibleSet = await resolvePlanVisibleUserIds(req, userId, friendVisibility);
  const visibleFriendIds = friendIds.filter((id) => visibleSet.has(String(id)));

  const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS);
  const [{ plans, rows, eventsById, userById }, invites, circlePicks, suggestions] =
    await Promise.all([
      loadFriendPlans(req, { userId, visibleFriendIds, batchWeek, now }),
      inviteJoinActivity(req, { globalUserId: req.user?.globalUserId, tenantKey, hidden, since }),
      circlePickActivity(req, { userId, batchWeek, tenantKey }),
      loadSuggestions(req, { userId, friendIds, hidden }),
    ]);

  const activity = [...friendPlanActivity(rows, eventsById, userById), ...invites, ...circlePicks]
    .sort((a, b) => toTime(b.at) - toTime(a.at))
    .slice(0, ACTIVITY_LIMIT);

  return {
    data: {
      batchWeek,
      friendCount: friendIds.length,
      planVisibility: normalizePlanVisibility(me?.pivotPlanVisibility),
      friendPlans: plans,
      activity,
      suggestions,
    },
  };
}

module.exports = {
  FRIEND_PLAN_LIMIT,
  ACTIVITY_LIMIT,
  SUGGESTION_LIMIT,
  getPivotSocialWeek,
};
