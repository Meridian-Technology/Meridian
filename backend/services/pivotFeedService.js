const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { PIVOT_TAG_SLUG_PATTERN } = require('../schemas/pivotTagCatalog');

const FRIEND_CAP = 5;
const PIVOT_EVENT_STATUSES = ['approved', 'not-applicable'];
const LOW_FEEDBACK_RATING_THRESHOLD = 3;
const PUBLIC_EVENT_FIELDS =
  'name description location start_time end_time externalLink type registrationCount image customFields.pivot';

function getPilotWindow(now = new Date()) {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
}

/** True when the event has not ended yet — deck should not surface past plans. */
function isUpcomingPivotEvent(event, now = new Date()) {
  if (!event) {
    return false;
  }

  const end =
    event.end_time != null && event.end_time !== ''
      ? new Date(event.end_time)
      : null;
  if (end && !Number.isNaN(end.getTime())) {
    return end > now;
  }

  const start =
    event.start_time != null && event.start_time !== ''
      ? new Date(event.start_time)
      : null;
  if (start && !Number.isNaN(start.getTime())) {
    return start > now;
  }

  return false;
}

function getUpcomingEventTimeFilter(now = new Date()) {
  return {
    $or: [
      { end_time: { $gt: now } },
      {
        end_time: { $in: [null] },
        start_time: { $gt: now },
      },
      {
        end_time: { $exists: false },
        start_time: { $gt: now },
      },
    ],
  };
}

function resolveDisplayHost(pivotMeta) {
  const host = pivotMeta?.host;
  const name = host?.name?.trim();
  if (!name) {
    return null;
  }

  return {
    name,
    ...(host.imageUrl ? { imageUrl: host.imageUrl } : {}),
    ...(host.profileUrl ? { profileUrl: host.profileUrl } : {}),
  };
}

function serializePivotFeedEvent(event, extras) {
  const pivot = event.customFields?.pivot || {};
  const coverImageUrl =
    typeof event.image === 'string' && event.image.trim() ? event.image.trim() : null;

  return {
    _id: String(event._id),
    name: event.name,
    description: event.description,
    location: event.location,
    start_time: event.start_time,
    end_time: event.end_time,
    externalLink: event.externalLink,
    type: event.type,
    registrationCount: event.registrationCount ?? 0,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    ...(coverImageUrl ? { coverImageUrl } : {}),
    displayHost: extras.displayHost,
    userIntent: extras.userIntent,
    friendsInterested: extras.friendsInterested,
    friendsGoing: extras.friendsGoing,
    // Total counts (uncapped) so the client can render "N friends interested"
    // even when the preview arrays above are capped at FRIEND_CAP.
    friendsInterestedCount: extras.friendsInterestedCount,
    friendsGoingCount: extras.friendsGoingCount,
  };
}

async function getAcceptedFriendIds(Friendship, userId) {
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .select('requester recipient')
    .lean();

  const uid = String(userId);
  return rows.map((row) =>
    String(row.requester) === uid ? row.recipient : row.requester,
  );
}

function mapFriendPreview(user) {
  return {
    id: String(user._id),
    name: user.name || user.username || 'friend',
    picture: user.picture || null,
  };
}

function makeEmptySocialMap(eventIds) {
  return new Map(
    eventIds.map((id) => [
      String(id),
      {
        friendsInterested: [],
        friendsGoing: [],
        friendInterestedCount: 0,
        friendRegisteredCount: 0,
      },
    ]),
  );
}

async function loadFriendSocial(req, userId, eventIds, previewCap = FRIEND_CAP, batchWeek = null) {
  const emptySocial = makeEmptySocialMap(eventIds);

  if (!eventIds.length) {
    return { userIntents: new Map(), socialByEvent: emptySocial };
  }

  const { Friendship, PivotEventIntent, User } = getModels(
    req,
    'Friendship',
    'PivotEventIntent',
    'User',
  );

  const userIntentQuery = {
    userId,
    eventId: { $in: eventIds },
  };
  if (batchWeek) {
    userIntentQuery.batchWeek = batchWeek;
  }

  const userIntentRows = await PivotEventIntent.find(userIntentQuery)
    .select('eventId status')
    .lean();

  const userIntents = new Map(
    userIntentRows.map((row) => [String(row.eventId), row.status]),
  );

  const friendIds = await getAcceptedFriendIds(Friendship, userId);
  if (!friendIds.length) {
    return { userIntents, socialByEvent: emptySocial };
  }

  const friendIntentRows = await PivotEventIntent.find({
    eventId: { $in: eventIds },
    userId: { $in: friendIds },
    status: { $in: ['interested', 'registered'] },
  })
    .select('eventId userId status')
    .lean();

  if (!friendIntentRows.length) {
    return { userIntents, socialByEvent: emptySocial };
  }

  const friendUserIds = [
    ...new Set(friendIntentRows.map((row) => String(row.userId))),
  ];
  const users = await User.find({ _id: { $in: friendUserIds } })
    .select('name username picture')
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const socialByEvent = makeEmptySocialMap(eventIds);

  for (const row of friendIntentRows) {
    const eventKey = String(row.eventId);
    const bucket = socialByEvent.get(eventKey);
    const friend = userById.get(String(row.userId));
    if (!bucket || !friend) {
      continue;
    }

    const preview = mapFriendPreview(friend);
    if (row.status === 'registered') {
      bucket.friendRegisteredCount += 1;
      bucket.friendInterestedCount += 1;
      if (bucket.friendsGoing.length < previewCap) {
        bucket.friendsGoing.push(preview);
      }
      if (bucket.friendsInterested.length < previewCap) {
        bucket.friendsInterested.push(preview);
      }
    } else if (row.status === 'interested') {
      bucket.friendInterestedCount += 1;
      if (bucket.friendsInterested.length < previewCap) {
        bucket.friendsInterested.push(preview);
      }
    }
  }

  return { userIntents, socialByEvent };
}

function normalizeExcludeEventIds(rawExcludeEventIds) {
  if (!rawExcludeEventIds) {
    return [];
  }

  const raw = Array.isArray(rawExcludeEventIds)
    ? rawExcludeEventIds
    : String(rawExcludeEventIds).split(',');

  const seen = new Set();
  for (const value of raw) {
    const id = String(value).trim();
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      seen.add(id);
    }
  }

  return [...seen];
}

function normalizeInterestTagSet(rawTags) {
  if (!Array.isArray(rawTags)) {
    return new Set();
  }

  const tags = new Set();
  for (const raw of rawTags) {
    if (typeof raw !== 'string') {
      continue;
    }
    const slug = raw.trim().toLowerCase();
    if (slug) {
      tags.add(slug);
    }
  }
  return tags;
}

function countInterestOverlap(event, userInterestTags) {
  if (!userInterestTags.size) {
    return 0;
  }

  const eventTags = event.customFields?.pivot?.tags;
  if (!Array.isArray(eventTags) || !eventTags.length) {
    return 0;
  }

  let overlap = 0;
  for (const raw of eventTags) {
    if (typeof raw !== 'string') {
      continue;
    }
    const slug = raw.trim().toLowerCase();
    if (slug && userInterestTags.has(slug)) {
      overlap += 1;
    }
  }

  return overlap;
}

function countNegativeTagOverlap(event, negativeFeedbackTags) {
  if (!negativeFeedbackTags.size) {
    return 0;
  }

  const eventTags = event.customFields?.pivot?.tags;
  if (!Array.isArray(eventTags) || !eventTags.length) {
    return 0;
  }

  let overlap = 0;
  for (const raw of eventTags) {
    if (typeof raw !== 'string') {
      continue;
    }
    const slug = raw.trim().toLowerCase();
    if (slug && negativeFeedbackTags.has(slug)) {
      overlap += 1;
    }
  }

  return overlap;
}

function compareByFeedRank(
  socialByEvent,
  userInterestTags,
  negativeFeedbackTags = new Set(),
) {
  return (a, b) => {
    const sa = socialByEvent.get(String(a._id));
    const sb = socialByEvent.get(String(b._id));
    const aRegistered = sa?.friendRegisteredCount || 0;
    const bRegistered = sb?.friendRegisteredCount || 0;
    if (aRegistered !== bRegistered) {
      return bRegistered - aRegistered;
    }

    const aInterested = sa?.friendInterestedCount || 0;
    const bInterested = sb?.friendInterestedCount || 0;
    if (aInterested !== bInterested) {
      return bInterested - aInterested;
    }

    const aOverlap = countInterestOverlap(a, userInterestTags);
    const bOverlap = countInterestOverlap(b, userInterestTags);
    if (aOverlap !== bOverlap) {
      return bOverlap - aOverlap;
    }

    const aPenalty = countNegativeTagOverlap(a, negativeFeedbackTags);
    const bPenalty = countNegativeTagOverlap(b, negativeFeedbackTags);
    if (aPenalty !== bPenalty) {
      return aPenalty - bPenalty;
    }

    const aStart = new Date(a.start_time).getTime() || 0;
    const bStart = new Date(b.start_time).getTime() || 0;
    return aStart - bStart;
  };
}

async function loadUserInterestTags(req, userId) {
  const { User } = getModels(req, 'User');
  const user = await User.findById(userId).select('pivotInterestTags').lean();
  return normalizeInterestTagSet(user?.pivotInterestTags);
}

function collectCatalogTagsFromEvents(events) {
  const tags = new Set();
  for (const event of events) {
    const eventTags = event.customFields?.pivot?.tags;
    if (!Array.isArray(eventTags)) {
      continue;
    }
    for (const raw of eventTags) {
      if (typeof raw !== 'string') {
        continue;
      }
      const slug = raw.trim().toLowerCase();
      if (slug && PIVOT_TAG_SLUG_PATTERN.test(slug)) {
        tags.add(slug);
      }
    }
  }
  return tags;
}

async function loadNegativeFeedbackTags(req, userId) {
  const { PIVOT_EVENT_FEATURE } = require('./pivotFeedbackService');
  const { UniversalFeedback, Event } = getModels(req, 'UniversalFeedback', 'Event');

  const lowRatings = await UniversalFeedback.find({
    user: userId,
    feature: PIVOT_EVENT_FEATURE,
    'responses.rating': { $lt: LOW_FEEDBACK_RATING_THRESHOLD },
  })
    .select('processId')
    .lean();

  if (!lowRatings.length) {
    return new Set();
  }

  const eventIds = lowRatings.map((row) => row.processId);
  const events = await Event.find({
    _id: { $in: eventIds },
    isDeleted: { $ne: true },
  })
    .select('customFields.pivot.tags')
    .lean();

  return collectCatalogTagsFromEvents(events);
}

async function getPivotFeed(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek?.trim() || toIsoWeek(now);
  if (options.batchWeek && !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const { Event } = getModels(req, 'Event');
  const { windowStart, windowEnd } = getPilotWindow(now);
  const excludeEventIds = normalizeExcludeEventIds(options.excludeEventIds);

  const query = {
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': 'published',
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    start_time: { $gte: windowStart, $lt: windowEnd },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
    $and: [getUpcomingEventTimeFilter(now)],
  };
  if (excludeEventIds.length) {
    query._id = { $nin: excludeEventIds };
  }

  const events = await Event.find(query)
    .select(PUBLIC_EVENT_FIELDS)
    .sort({ registrationCount: -1, start_time: 1 })
    .lean();

  const validEvents = events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, now),
  );
  const eventIds = validEvents.map((event) => event._id);
  const { userIntents, socialByEvent } = await loadFriendSocial(
    req,
    userId,
    eventIds,
    FRIEND_CAP,
    batchWeek,
  );

  const userInterestTags = await loadUserInterestTags(req, userId);
  const negativeFeedbackTags = await loadNegativeFeedbackTags(req, userId);
  validEvents.sort(
    compareByFeedRank(socialByEvent, userInterestTags, negativeFeedbackTags),
  );

  const tenant = await getTenantByKey(req, req.school);
  const cityDisplayName = tenant?.location || tenant?.name || req.school;

  return {
    data: {
      batchWeek,
      cityDisplayName,
      events: validEvents.map((event) => {
        const id = String(event._id);
        const social = socialByEvent.get(id) || {
          friendsInterested: [],
          friendsGoing: [],
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
        };

        return serializePivotFeedEvent(event, {
          displayHost: resolveDisplayHost(event.customFields.pivot),
          userIntent: userIntents.get(id) || null,
          friendsInterested: social.friendsInterested,
          friendsGoing: social.friendsGoing,
          friendsInterestedCount: social.friendInterestedCount || 0,
          friendsGoingCount: social.friendRegisteredCount || 0,
        });
      }),
    },
  };
}

async function getPivotEventFriends(req, eventId) {
  const userId = req.user?.userId;
  if (!userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const eventKey = String(eventId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(eventKey)) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const { Event } = getModels(req, 'Event');
  const event = await Event.findOne({
    _id: eventKey,
    'customFields.pivot.ingestStatus': 'published',
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
  })
    .select('_id')
    .lean();

  if (!event) {
    return {
      error: 'Event not found.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const { socialByEvent } = await loadFriendSocial(
    req,
    userId,
    [eventKey],
    Number.POSITIVE_INFINITY,
  );
  const social = socialByEvent.get(eventKey) || {
    friendsInterested: [],
    friendsGoing: [],
  };

  return {
    data: {
      interested: social.friendsInterested,
      going: social.friendsGoing,
    },
  };
}

module.exports = {
  getPivotFeed,
  getPivotEventFriends,
  getPilotWindow,
  isUpcomingPivotEvent,
  getUpcomingEventTimeFilter,
  resolveDisplayHost,
  serializePivotFeedEvent,
  normalizeExcludeEventIds,
  normalizeInterestTagSet,
  countInterestOverlap,
  countNegativeTagOverlap,
  compareByFeedRank,
  loadFriendSocial,
  loadUserInterestTags,
  loadNegativeFeedbackTags,
  collectCatalogTagsFromEvents,
  mapFriendPreview,
  LOW_FEEDBACK_RATING_THRESHOLD,
  PIVOT_EVENT_STATUSES,
};
