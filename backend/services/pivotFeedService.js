const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isValidIsoWeek, shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  resolvePivotLiveBatchWeek,
  resolvePivotDropPendingForCalendarWeek,
  resolvePivotUpcomingDropBatchWeek,
  describePivotBatchWeekResolution,
} = require('../utilities/pivotDropSchedule');
const { PIVOT_TAG_SLUG_PATTERN } = require('../schemas/pivotTagCatalog');
const {
  normalizePivotTimeSlots,
  serializePivotTimeSlots,
  isUpcomingWithTimeSlots,
} = require('../utilities/pivotTimeSlots');
const {
  serializePivotMovie,
  resolvePivotCoverImageUrl,
} = require('../utilities/pivotMovieMetadata');
const { serializePivotEnrichment } = require('../utilities/pivotEnrichment');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const {
  normalizeDeckSnapshotRefresh,
  recordPivotDeckSnapshot,
  getPivotDeckSnapshot,
} = require('./pivotDeckSnapshotService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const {
  PIVOT_CREW_CONFIG_DEFAULTS,
} = require('../utilities/pivotCrewConfig');
const { mergePivotDeckConfig } = require('../utilities/pivotDeckConfig');
const { getPivotConfig } = require('./pivotConfigService');
const { getHiddenUserIdSet } = require('./pivotSafetyService');
const {
  loadRichLocationViewerContext,
  projectEventRichLocation,
} = require('./justGoRichLocationProjectionService');

const FRIEND_CAP = 5;
const FEED_CREW_CONFIG_CACHE_TTL_MS = 60_000;
const PIVOT_EVENT_STATUSES = ['approved', 'not-applicable'];
const LOW_FEEDBACK_RATING_THRESHOLD = 3;
/** Ranker id stamped on feed payloads + deck impressions. */
const PIVOT_FEED_RANKER_VERSION = 'rules_v1';
const PUBLIC_EVENT_FIELDS =
  'name description location richLocation start_time end_time externalLink type registrationCount image customFields.pivot';
const CATALOG_PROBE_FIELDS = 'start_time end_time customFields.pivot';

/** @type {Map<string, { expiresAt: number, value: { crewSignalWeight: number } }>} */
const feedCrewConfigCache = new Map();
/** @type {Map<string, { expiresAt: number, value: object }>} */
const feedDeckConfigCache = new Map();

const PUBLISHED_CATALOG_BASE_QUERY = {
  'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  status: { $in: PIVOT_EVENT_STATUSES },
  isDeleted: { $ne: true },
  'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
};

function buildPublishedCatalogQuery(batchWeek, now) {
  return {
    'customFields.pivot.batchWeek': batchWeek,
    ...PUBLISHED_CATALOG_BASE_QUERY,
    ...getFeedPilotWindowFilter(now),
  };
}

function countUpcomingCatalogEvents(events, now) {
  return events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, now),
  ).length;
}

async function countUpcomingCatalogEventsForBatchWeek(req, batchWeek, now) {
  const { Event } = getModels(req, 'Event');
  const events = await Event.find(buildPublishedCatalogQuery(batchWeek, now))
    .select(CATALOG_PROBE_FIELDS)
    .lean();
  return countUpcomingCatalogEvents(events, now);
}

/**
 * Pick the batchWeek for feed/explore when the client did not pass ?batchWeek.
 * Prefer the current consumer week; if that catalog has no upcoming published
 * events, probe adjacent ISO weeks (handles event-date vs drop-week skew).
 */
async function resolvePivotFeedBatchWeek(req, { tenant, now, requestedBatchWeek }) {
  const trimmedRequest =
    typeof requestedBatchWeek === 'string' ? requestedBatchWeek.trim() : '';

  if (trimmedRequest) {
    return {
      batchWeek: trimmedRequest,
      batchWeekSource: 'query',
      catalogProbeWeeks: [trimmedRequest],
    };
  }

  const preferred = resolvePivotLiveBatchWeek(tenant, now);
  const dropPending = resolvePivotDropPendingForCalendarWeek(tenant, now);
  const probeOrder = dropPending
    ? [preferred, shiftIsoWeek(preferred, -1)]
    : [preferred, shiftIsoWeek(preferred, 1), shiftIsoWeek(preferred, -1)];
  const seen = new Set();
  const catalogProbeWeeks = [];

  for (const week of probeOrder) {
    if (seen.has(week)) {
      continue;
    }
    seen.add(week);
    catalogProbeWeeks.push(week);

    const matchCount = await countUpcomingCatalogEventsForBatchWeek(req, week, now);
    if (matchCount > 0) {
      return {
        batchWeek: week,
        batchWeekSource: week === preferred ? 'consumer_week' : 'catalog_fallback',
        catalogProbeWeeks,
        catalogMatchCount: matchCount,
      };
    }
  }

  return {
    batchWeek: preferred,
    batchWeekSource: 'consumer_week',
    catalogProbeWeeks,
    catalogMatchCount: 0,
  };
}

function getPilotWindow(now = new Date()) {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
}

/** Mongo filter: upcoming events with start (or any showtime) inside the 7-day pilot window. */
function getFeedPilotWindowFilter(now = new Date()) {
  const { windowStart, windowEnd } = getPilotWindow(now);

  return {
    $and: [
      getUpcomingEventTimeFilter(now),
      {
        $or: [
          {
            'customFields.pivot.timeSlots.0': { $exists: false },
            start_time: { $gte: windowStart, $lt: windowEnd },
          },
          {
            'customFields.pivot.timeSlots.0': { $exists: true },
            'customFields.pivot.timeSlots': {
              $elemMatch: {
                start_time: { $gte: windowStart, $lt: windowEnd },
              },
            },
          },
        ],
      },
    ],
  };
}

/** True when the event has not ended yet — deck should not surface past plans. */
function isUpcomingPivotEvent(event, now = new Date()) {
  if (!event) {
    return false;
  }

  const slotUpcoming = isUpcomingWithTimeSlots(event.customFields?.pivot, now);
  if (slotUpcoming != null) {
    return slotUpcoming;
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
  const coverImageUrl = resolvePivotCoverImageUrl(event);
  const movie = serializePivotMovie(pivot.movie);
  const enrichment = serializePivotEnrichment(pivot);
  const normalizedSlots = normalizePivotTimeSlots(pivot.timeSlots);
  const timeSlots = normalizedSlots.length
    ? serializePivotTimeSlots(normalizedSlots, extras.socialByTimeSlot)
    : undefined;
  const richLocation = projectEventRichLocation(event, extras.richLocationViewerContext);

  return {
    _id: String(event._id),
    name: event.name,
    description: movie?.synopsis || event.description,
    location: event.location,
    ...(richLocation ? { richLocation } : {}),
    start_time: event.start_time,
    end_time: event.end_time,
    externalLink: event.externalLink,
    type: event.type,
    registrationCount: event.registrationCount ?? 0,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(timeSlots ? { timeSlots } : {}),
    ...(movie ? { movie } : {}),
    ...(enrichment ? { enrichment } : {}),
    displayHost: extras.displayHost,
    userIntent: extras.userIntent,
    ...(extras.userTimeSlotId ? { userTimeSlotId: extras.userTimeSlotId } : {}),
    friendsInterested: extras.friendsInterested,
    friendsGoing: extras.friendsGoing,
    // Total counts (uncapped) so the client can render "N friends interested"
    // even when the preview arrays above are capped at FRIEND_CAP.
    friendsInterestedCount: extras.friendsInterestedCount,
    friendsGoingCount: extras.friendsGoingCount,
    ...(extras.crewInterestedCount > 0
      ? { crewInterestedCount: extras.crewInterestedCount }
      : {}),
    ...(extras.crewRegisteredCount > 0
      ? { crewRegisteredCount: extras.crewRegisteredCount }
      : {}),
    /** 0-based position in the ranked feed (exposure bias / training). */
    ...(typeof extras.rankInFeed === 'number' ? { rankInFeed: extras.rankInFeed } : {}),
    ...(extras.dropDeckScore ? { dropDeckScore: extras.dropDeckScore } : {}),
  };
}

async function getAcceptedFriendIds(Friendship, userId, hiddenIds = new Set()) {
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .select('requester recipient')
    .lean();

  const uid = String(userId);
  return rows
    .map((row) => (String(row.requester) === uid ? row.recipient : row.requester))
    .filter((id) => !hiddenIds.has(String(id)));
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
        crewInterestedCount: 0,
        crewRegisteredCount: 0,
      },
    ]),
  );
}

function buildFeedRankCrewConfig(crewConfig = PIVOT_CREW_CONFIG_DEFAULTS) {
  return {
    crewSignalWeight:
      crewConfig.feedMix?.crewSignalWeight
      ?? PIVOT_CREW_CONFIG_DEFAULTS.feedMix.crewSignalWeight,
    interestBleed: {
      enabled:
        crewConfig.interestBleed?.enabled
        ?? PIVOT_CREW_CONFIG_DEFAULTS.interestBleed.enabled,
      maxWeight:
        crewConfig.interestBleed?.maxWeight
        ?? PIVOT_CREW_CONFIG_DEFAULTS.interestBleed.maxWeight,
      requiresCrewMemberSwipe:
        crewConfig.interestBleed?.requiresCrewMemberSwipe
        ?? PIVOT_CREW_CONFIG_DEFAULTS.interestBleed.requiresCrewMemberSwipe,
    },
  };
}

async function getFeedRankCrewConfig(req) {
  const tenantKey = req.school;
  const fallback = buildFeedRankCrewConfig(PIVOT_CREW_CONFIG_DEFAULTS);

  if (!tenantKey) {
    return fallback;
  }

  const cached = feedCrewConfigCache.get(tenantKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value = fallback;
  try {
    const result = await getPivotConfig(req);
    if (result.data?.crew) {
      value = buildFeedRankCrewConfig(result.data.crew);
    }
  } catch (error) {
    logPivot('warn', 'feed rank crew config fallback', {
      ...pivotRequestContext(req),
      error: error.message,
    });
  }

  feedCrewConfigCache.set(tenantKey, {
    value,
    expiresAt: Date.now() + FEED_CREW_CONFIG_CACHE_TTL_MS,
  });
  return value;
}

function clearFeedCrewConfigCacheForTests() {
  feedCrewConfigCache.clear();
  feedDeckConfigCache.clear();
}

function getFeedDeckConfigFromTenant(tenant) {
  const tenantKey = tenant?.tenantKey;
  const fallback = mergePivotDeckConfig();

  if (!tenantKey) {
    return fallback;
  }

  const cached = feedDeckConfigCache.get(tenantKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = mergePivotDeckConfig(tenant?.pivotDeckConfig);
  feedDeckConfigCache.set(tenantKey, {
    value,
    expiresAt: Date.now() + FEED_CREW_CONFIG_CACHE_TTL_MS,
  });
  return value;
}

async function resolveUserCrewScope(req, userId) {
  const userObjectId = mongoose.Types.ObjectId.isValid(String(userId))
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!userObjectId) {
    return { crewIds: [], memberIds: [] };
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  const { PivotCrew, PivotCrewMembership } = getModels(
    req,
    'PivotCrew',
    'PivotCrewMembership',
  );

  const myMemberships = await PivotCrewMembership.find({
    userId: userObjectId,
    status: 'active',
  })
    .select('crewId')
    .lean();

  if (!myMemberships.length) {
    return { crewIds: [], memberIds: [] };
  }

  const crewIds = myMemberships.map((row) => row.crewId);
  const activeCrews = await PivotCrew.find({
    _id: { $in: crewIds },
    archivedAt: null,
    ...(tenantKey ? { tenantKey } : {}),
  })
    .select('_id')
    .lean();

  if (!activeCrews.length) {
    return { crewIds: [], memberIds: [] };
  }

  const activeCrewIds = activeCrews.map((crew) => crew._id);
  const crewMembers = await PivotCrewMembership.find({
    crewId: { $in: activeCrewIds },
    status: 'active',
    userId: { $ne: null, $nin: [userObjectId] },
  })
    .select('userId')
    .lean();

  return {
    crewIds: activeCrewIds.map((id) => String(id)),
    memberIds: [...new Set(crewMembers.map((row) => String(row.userId)).filter(Boolean))],
  };
}

async function resolveActiveCrewMemberIds(req, userId) {
  const { memberIds } = await resolveUserCrewScope(req, userId);
  return memberIds;
}

async function resolveUserActiveCrewIds(req, userId) {
  const { crewIds } = await resolveUserCrewScope(req, userId);
  return crewIds;
}

async function loadCrewInterestBleedTags(req, userId, batchWeek, interestBleedConfig) {
  if (!interestBleedConfig?.enabled) {
    return new Set();
  }

  let crewMemberIds = await resolveActiveCrewMemberIds(req, userId);
  if (!crewMemberIds.length) {
    return new Set();
  }

  if (interestBleedConfig.requiresCrewMemberSwipe && batchWeek) {
    const { PivotEventIntent } = getModels(req, 'PivotEventIntent');
    const swipedRows = await PivotEventIntent.find({
      batchWeek,
      userId: { $in: crewMemberIds },
    })
      .select('userId')
      .lean();

    const swipedUserIds = new Set(
      swipedRows.map((row) => String(row.userId)).filter(Boolean),
    );
    crewMemberIds = crewMemberIds.filter((memberId) => swipedUserIds.has(memberId));
    if (!crewMemberIds.length) {
      return new Set();
    }
  }

  const { User } = getModels(req, 'User');
  const users = await User.find({ _id: { $in: crewMemberIds } })
    .select('pivotInterestTags')
    .lean();

  const tags = new Set();
  for (const user of users) {
    for (const tag of normalizeInterestTagSet(user?.pivotInterestTags)) {
      tags.add(tag);
    }
  }
  return tags;
}

function subtractInterestTags(sourceTags, excludeTags) {
  if (!sourceTags?.size) {
    return new Set();
  }
  if (!excludeTags?.size) {
    return new Set(sourceTags);
  }

  const out = new Set();
  for (const tag of sourceTags) {
    if (!excludeTags.has(tag)) {
      out.add(tag);
    }
  }
  return out;
}

async function applyCrewSocialCounts(req, userId, eventIds, batchWeek, socialByEvent) {
  if (!eventIds.length || !batchWeek) {
    return;
  }

  const crewMemberIds = await resolveActiveCrewMemberIds(req, userId);
  if (!crewMemberIds.length) {
    return;
  }

  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');

  const intentRows = await PivotEventIntent.find({
    eventId: { $in: eventIds },
    userId: { $in: crewMemberIds },
    batchWeek,
    status: { $in: ['interested', 'registered'] },
  })
    .select('eventId userId status')
    .lean();

  const statusByEventUser = new Map();
  for (const row of intentRows) {
    const eventKey = String(row.eventId);
    const memberKey = String(row.userId);
    const compositeKey = `${eventKey}\0${memberKey}`;
    const existing = statusByEventUser.get(compositeKey);
    if (row.status === 'registered' || !existing) {
      statusByEventUser.set(compositeKey, row.status);
    }
  }

  for (const [compositeKey, status] of statusByEventUser) {
    const eventKey = compositeKey.split('\0')[0];
    const bucket = socialByEvent.get(eventKey);
    if (!bucket) {
      continue;
    }
    if (status === 'registered') {
      bucket.crewRegisteredCount += 1;
      bucket.crewInterestedCount += 1;
    } else {
      bucket.crewInterestedCount += 1;
    }
  }
}

async function loadFriendSocial(req, userId, eventIds, previewCap = FRIEND_CAP, batchWeek = null) {
  const emptySocial = makeEmptySocialMap(eventIds);

  if (!eventIds.length) {
    return {
      userIntents: new Map(),
      socialByEvent: emptySocial,
      socialByEventAndSlot: new Map(),
    };
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
    .select('eventId status timeSlotId')
    .lean();

  const userIntents = new Map(
    userIntentRows.map((row) => [
      String(row.eventId),
      {
        status: row.status,
        timeSlotId: row.timeSlotId || null,
      },
    ]),
  );

  const friendIds = await getAcceptedFriendIds(
    Friendship,
    userId,
    await getHiddenUserIdSet(req),
  );
  if (!friendIds.length) {
    return {
      userIntents,
      socialByEvent: emptySocial,
      socialByEventAndSlot: new Map(),
    };
  }

  const friendIntentRows = await PivotEventIntent.find({
    eventId: { $in: eventIds },
    userId: { $in: friendIds },
    status: { $in: ['interested', 'registered'] },
  })
    .select('eventId userId status timeSlotId')
    .lean();

  if (!friendIntentRows.length) {
    return {
      userIntents,
      socialByEvent: emptySocial,
      socialByEventAndSlot: new Map(),
    };
  }

  const friendUserIds = [
    ...new Set(friendIntentRows.map((row) => String(row.userId))),
  ];
  const users = await User.find({ _id: { $in: friendUserIds } })
    .select('name username picture')
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const socialByEvent = makeEmptySocialMap(eventIds);
  const socialByEventAndSlot = new Map();

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

      const slotId = row.timeSlotId ? String(row.timeSlotId).trim() : '';
      if (slotId) {
        const slotKey = `${eventKey}:${slotId}`;
        if (!socialByEventAndSlot.has(slotKey)) {
          socialByEventAndSlot.set(slotKey, {
            friendsGoing: [],
            friendsGoingCount: 0,
          });
        }
        const slotBucket = socialByEventAndSlot.get(slotKey);
        slotBucket.friendsGoingCount += 1;
        if (slotBucket.friendsGoing.length < previewCap) {
          slotBucket.friendsGoing.push(preview);
        }
      }
    } else if (row.status === 'interested') {
      bucket.friendInterestedCount += 1;
      if (bucket.friendsInterested.length < previewCap) {
        bucket.friendsInterested.push(preview);
      }
    }
  }

  return { userIntents, socialByEvent, socialByEventAndSlot };
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

function countCrewInterestBleedScore(event, crewBleedTags, maxWeight) {
  const cappedWeight = Number(maxWeight) || 0;
  if (cappedWeight <= 0 || !crewBleedTags?.size) {
    return 0;
  }

  const overlap = countInterestOverlap(event, crewBleedTags);
  if (overlap <= 0) {
    return 0;
  }

  return Math.min(overlap * cappedWeight, cappedWeight);
}

function computeInterestRankScore(event, userInterestTags, rankOptions = {}) {
  const personalScore = countInterestOverlap(event, userInterestTags);
  const interestBleed = rankOptions.interestBleed;
  if (!interestBleed?.enabled) {
    return personalScore;
  }

  const bleedScore = countCrewInterestBleedScore(
    event,
    rankOptions.crewBleedTags,
    interestBleed.maxWeight,
  );
  return personalScore + bleedScore;
}

function explainDropDeckScore(
  event,
  social = {},
  userInterestTags,
  negativeFeedbackTags = new Set(),
  rankOptions = {},
  deckConfig,
) {
  const weights = deckConfig?.weights || mergePivotDeckConfig().weights;
  const friendGoing = (social.friendRegisteredCount || 0) * (Number(weights.friendGoing) || 0);
  const friendInterested =
    (social.friendInterestedCount || 0) * (Number(weights.friendInterested) || 0);
  const crewSignal = Number(weights.crewSignal) || 0;
  const crew =
    crewSignal *
    (1.5 * (social.crewRegisteredCount || 0) + (social.crewInterestedCount || 0));
  const personal =
    (Number(weights.personalInterest) || 0) * countInterestOverlap(event, userInterestTags);
  const bleed = rankOptions.interestBleed?.enabled
    ? countCrewInterestBleedScore(
        event,
        rankOptions.crewBleedTags,
        rankOptions.interestBleed.maxWeight,
      )
    : 0;
  const negative =
    (Number(weights.negativeTag) || 0) * countNegativeTagOverlap(event, negativeFeedbackTags);
  const total = friendGoing + friendInterested + crew + personal + bleed - negative;
  return {
    total,
    friendGoing,
    friendInterested,
    crew,
    personal,
    bleed,
    negative,
  };
}

function roundDropDeckScoreParts(parts) {
  const rounded = {};
  for (const [key, value] of Object.entries(parts || {})) {
    rounded[key] = Math.round((Number(value) || 0) * 1000) / 1000;
  }
  return rounded;
}

function computeDropDeckScore(
  event,
  social = {},
  userInterestTags,
  negativeFeedbackTags = new Set(),
  rankOptions = {},
  deckConfig,
) {
  return explainDropDeckScore(
    event,
    social,
    userInterestTags,
    negativeFeedbackTags,
    rankOptions,
    deckConfig,
  ).total;
}

function compareByDropDeckScore(
  socialByEvent,
  userInterestTags,
  negativeFeedbackTags = new Set(),
  rankOptions = {},
  deckConfig,
) {
  return (a, b) => {
    const aSocial = socialByEvent.get(String(a._id)) || {};
    const bSocial = socialByEvent.get(String(b._id)) || {};
    const aScore = computeDropDeckScore(
      a,
      aSocial,
      userInterestTags,
      negativeFeedbackTags,
      rankOptions,
      deckConfig,
    );
    const bScore = computeDropDeckScore(
      b,
      bSocial,
      userInterestTags,
      negativeFeedbackTags,
      rankOptions,
      deckConfig,
    );
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    const aStart = new Date(a.start_time).getTime() || 0;
    const bStart = new Date(b.start_time).getTime() || 0;
    return aStart - bStart;
  };
}

function selectDropDeckEvents(
  events,
  socialByEvent,
  userInterestTags,
  negativeFeedbackTags = new Set(),
  rankOptions = {},
  deckConfig,
) {
  const config = deckConfig || mergePivotDeckConfig();
  const ranked = [...events].sort(
    compareByDropDeckScore(
      socialByEvent,
      userInterestTags,
      negativeFeedbackTags,
      rankOptions,
      config,
    ),
  );

  if (ranked.length <= config.softMax) {
    return ranked;
  }

  const selected = ranked.slice(0, config.softMax);
  const cutoffEvent = selected[selected.length - 1];
  const cutoffScore = computeDropDeckScore(
    cutoffEvent,
    socialByEvent.get(String(cutoffEvent._id)) || {},
    userInterestTags,
    negativeFeedbackTags,
    rankOptions,
    config,
  );
  const cutoff = Math.max(cutoffScore * config.leewayRatio, config.highScoreFloor);

  for (let index = config.softMax; index < ranked.length && selected.length < config.hardMax; index += 1) {
    const event = ranked[index];
    const score = computeDropDeckScore(
      event,
      socialByEvent.get(String(event._id)) || {},
      userInterestTags,
      negativeFeedbackTags,
      rankOptions,
      config,
    );
    if (score < cutoff) {
      break;
    }
    selected.push(event);
  }

  return selected;
}

function applyFrozenDeckOrder(events, orderedEventIds) {
  if (!Array.isArray(orderedEventIds) || !orderedEventIds.length) {
    return events;
  }

  const byId = new Map(events.map((event) => [String(event._id), event]));
  const frozen = [];
  for (const rawId of orderedEventIds) {
    const event = byId.get(String(rawId));
    if (event) {
      frozen.push(event);
    }
  }
  return frozen;
}

/** Ops preview: reload snapshot IDs even if they already left the 7-day window. */
async function hydrateFrozenPreviewEvents(Event, knownEvents, orderedEventIds) {
  const byId = new Map((knownEvents || []).map((event) => [String(event._id), event]));
  const missing = [];
  for (const rawId of orderedEventIds || []) {
    const id = String(rawId || '').trim();
    if (id && !byId.has(id) && mongoose.Types.ObjectId.isValid(id)) {
      missing.push(id);
    }
  }
  if (!missing.length) {
    return applyFrozenDeckOrder(knownEvents, orderedEventIds);
  }

  const extra = await Event.find({
    _id: { $in: missing },
    isDeleted: { $ne: true },
  })
    .select(PUBLIC_EVENT_FIELDS)
    .lean();

  return applyFrozenDeckOrder([...(knownEvents || []), ...extra], orderedEventIds);
}

function compareByFeedRank(
  socialByEvent,
  userInterestTags,
  negativeFeedbackTags = new Set(),
  rankOptions = {},
) {
  const crewSignalWeight = Number(rankOptions.crewSignalWeight) || 0;

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

    if (crewSignalWeight > 0) {
      const aCrewRegistered = (sa?.crewRegisteredCount || 0) * crewSignalWeight;
      const bCrewRegistered = (sb?.crewRegisteredCount || 0) * crewSignalWeight;
      if (aCrewRegistered !== bCrewRegistered) {
        return bCrewRegistered - aCrewRegistered;
      }

      const aCrewInterested = (sa?.crewInterestedCount || 0) * crewSignalWeight;
      const bCrewInterested = (sb?.crewInterestedCount || 0) * crewSignalWeight;
      if (aCrewInterested !== bCrewInterested) {
        return bCrewInterested - aCrewInterested;
      }
    }

    const aOverlap = computeInterestRankScore(a, userInterestTags, rankOptions);
    const bOverlap = computeInterestRankScore(b, userInterestTags, rankOptions);
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
  const tenant = await getTenantByKey(req, req.school);

  if (options.batchWeek?.trim() && !isValidIsoWeek(options.batchWeek.trim())) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const batchWeekPick = await resolvePivotFeedBatchWeek(req, {
    tenant,
    now,
    requestedBatchWeek: options.batchWeek,
  });
  const batchWeek = batchWeekPick.batchWeek;
  const batchWeekResolution = {
    ...describePivotBatchWeekResolution(tenant, now, options.batchWeek),
    ...batchWeekPick,
    resolvedBatchWeek: batchWeekPick.batchWeek,
  };

  const { Event } = getModels(req, 'Event');
  const excludeEventIds = normalizeExcludeEventIds(options.excludeEventIds);

  // Choice A: draft/staged never appear; only published after explicit Release.
  // Covered by Event index `pivot_batchWeek_ingestStatus_start_time` (Task 1.4).
  const query = {
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
    ...getFeedPilotWindowFilter(now),
  };
  if (excludeEventIds.length) {
    query._id = { $nin: excludeEventIds };
  }

  const events = await Event.find(query)
    .select(PUBLIC_EVENT_FIELDS)
    .sort({ registrationCount: -1, start_time: 1 })
    .lean();

  const isPreview = options.preview === true;
  const ignoreSnapshot = isPreview && options.ignoreSnapshot === true;
  const forceRefresh = isPreview
    ? false
    : normalizeDeckSnapshotRefresh(options.refresh, req.user?.roles);
  const existingSnapshot =
    forceRefresh || ignoreSnapshot
      ? null
      : await getPivotDeckSnapshot(req, { userId, batchWeek });
  const frozen = Boolean(existingSnapshot?.orderedEventIds?.length);

  const validEvents = events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, now),
  );
  const catalogEvents =
    frozen && isPreview
      ? await hydrateFrozenPreviewEvents(
          Event,
          validEvents,
          existingSnapshot.orderedEventIds,
        )
      : validEvents;
  const eventIds = catalogEvents.map((event) => event._id);
  const [
    { userIntents, socialByEvent, socialByEventAndSlot },
    userInterestTags,
    negativeFeedbackTags,
    crewRankConfig,
    richLocationViewerContext,
  ] = await Promise.all([
    loadFriendSocial(req, userId, eventIds, FRIEND_CAP, batchWeek),
    loadUserInterestTags(req, userId),
    loadNegativeFeedbackTags(req, userId),
    getFeedRankCrewConfig(req),
    loadRichLocationViewerContext(req, eventIds, { tenant }),
  ]);

  await applyCrewSocialCounts(req, userId, eventIds, batchWeek, socialByEvent);

  let crewBleedTags = new Set();
  if (crewRankConfig.interestBleed?.enabled) {
    const crewTagUnion = await loadCrewInterestBleedTags(
      req,
      userId,
      batchWeek,
      crewRankConfig.interestBleed,
    );
    crewBleedTags = subtractInterestTags(crewTagUnion, userInterestTags);
  }

  const rankOptions = {
    crewSignalWeight: crewRankConfig.crewSignalWeight,
    interestBleed: crewRankConfig.interestBleed,
    crewBleedTags,
  };
  const deckConfig = getFeedDeckConfigFromTenant(tenant);

  let deckEvents = catalogEvents;
  if (frozen) {
    deckEvents = applyFrozenDeckOrder(catalogEvents, existingSnapshot.orderedEventIds);
  } else {
    deckEvents = selectDropDeckEvents(
      catalogEvents,
      socialByEvent,
      userInterestTags,
      negativeFeedbackTags,
      rankOptions,
      deckConfig,
    );
    if (!isPreview) {
      await recordPivotDeckSnapshot(req, {
        userId,
        batchWeek,
        orderedEventIds: deckEvents.map((event) => event._id),
        rankerVersion: PIVOT_FEED_RANKER_VERSION,
        forceRefresh,
      });
    }
  }

  const cityDisplayName = tenant?.location || tenant?.name || req.school;

  const multiSlotEventCount = deckEvents.filter(
    (event) => normalizePivotTimeSlots(event.customFields?.pivot?.timeSlots).length > 0,
  ).length;

  logPivot('info', 'feed built', {
    ...pivotRequestContext(req),
    ...batchWeekResolution,
    batchWeek,
    cityDisplayName,
    candidateCount: events.length,
    eventCount: deckEvents.length,
    catalogEligibleCount: validEvents.length,
    droppedBeforeCatalog: events.length - validEvents.length,
    multiSlotEventCount,
    excludedCount: excludeEventIds.length,
    interestTagCount: userInterestTags.size,
    negativeTagPenaltyCount: negativeFeedbackTags.size,
    deckSoftMax: deckConfig.softMax,
    deckHardMax: deckConfig.hardMax,
    frozenDeck: frozen,
  });

  if (validEvents.length === 0 && typeof Event.distinct === 'function') {
    const publishedBatchWeeks = await Event.distinct('customFields.pivot.batchWeek', {
      ...PUBLISHED_CATALOG_BASE_QUERY,
    });
    logPivot('warn', 'feed empty catalog — published batchWeeks in tenant', {
      ...pivotRequestContext(req),
      batchWeek,
      publishedBatchWeeks: publishedBatchWeeks.filter(Boolean).map(String).sort(),
    });
  }

  return {
    data: {
      batchWeek,
      cityDisplayName,
      rankerVersion: PIVOT_FEED_RANKER_VERSION,
      events: deckEvents.map((event, rankInFeed) => {
        const id = String(event._id);
        const social = socialByEvent.get(id) || {
          friendsInterested: [],
          friendsGoing: [],
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 0,
          crewRegisteredCount: 0,
        };
        const userIntentRow = userIntents.get(id);
        const normalizedSlots = normalizePivotTimeSlots(
          event.customFields?.pivot?.timeSlots,
        );
        const socialByTimeSlot = new Map();
        for (const slot of normalizedSlots) {
          const slotSocial = socialByEventAndSlot.get(`${id}:${slot.id}`);
          if (slotSocial) {
            socialByTimeSlot.set(slot.id, slotSocial);
          }
        }

        return serializePivotFeedEvent(event, {
          displayHost: resolveDisplayHost(event.customFields.pivot),
          userIntent: userIntentRow?.status || null,
          richLocationViewerContext,
          userTimeSlotId: userIntentRow?.timeSlotId || null,
          socialByTimeSlot,
          friendsInterested: social.friendsInterested,
          friendsGoing: social.friendsGoing,
          friendsInterestedCount: social.friendInterestedCount || 0,
          friendsGoingCount: social.friendRegisteredCount || 0,
          crewInterestedCount: social.crewInterestedCount || 0,
          crewRegisteredCount: social.crewRegisteredCount || 0,
          rankInFeed,
          ...(options.includeScores
            ? {
                dropDeckScore: roundDropDeckScoreParts(
                  explainDropDeckScore(
                    event,
                    social,
                    userInterestTags,
                    negativeFeedbackTags,
                    rankOptions,
                    deckConfig,
                  ),
                ),
              }
            : {}),
        });
      }),
      frozen,
      eligibleCount: catalogEvents.length,
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
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
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
  getFeedPilotWindowFilter,
  isUpcomingPivotEvent,
  getUpcomingEventTimeFilter,
  resolveDisplayHost,
  serializePivotFeedEvent,
  normalizeExcludeEventIds,
  normalizeInterestTagSet,
  countInterestOverlap,
  countCrewInterestBleedScore,
  computeInterestRankScore,
  computeDropDeckScore,
  explainDropDeckScore,
  compareByDropDeckScore,
  selectDropDeckEvents,
  applyFrozenDeckOrder,
  subtractInterestTags,
  countNegativeTagOverlap,
  compareByFeedRank,
  getFeedRankCrewConfig,
  buildFeedRankCrewConfig,
  resolveUserCrewScope,
  resolveActiveCrewMemberIds,
  resolveUserActiveCrewIds,
  loadCrewInterestBleedTags,
  applyCrewSocialCounts,
  clearFeedCrewConfigCacheForTests,
  loadFriendSocial,
  loadUserInterestTags,
  loadNegativeFeedbackTags,
  collectCatalogTagsFromEvents,
  mapFriendPreview,
  resolvePivotFeedBatchWeek,
  countUpcomingCatalogEventsForBatchWeek,
  buildPublishedCatalogQuery,
  countUpcomingCatalogEvents,
  LOW_FEEDBACK_RATING_THRESHOLD,
  FRIEND_CAP,
  PIVOT_EVENT_STATUSES,
  PIVOT_FEED_RANKER_VERSION,
};
