const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const {
  listPivotTags,
  normalizePivotTagSlugs,
  validatePivotEventTags,
} = require('./pivotTagCatalogService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  normalizePivotTimeSlots,
} = require('../utilities/pivotTimeSlots');
const {
  resolvePivotDropInstant,
  describePivotBatchWeekResolution,
} = require('../utilities/pivotDropSchedule');
const { collectPivotEnrichmentSearchText } = require('../utilities/pivotEnrichment');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const { PIVOT_FEED_INGEST_STATUS, PIVOT_INGEST_STATUSES } = require('../utilities/pivotIngestStatus');
const {
  getFeedPilotWindowFilter,
  isUpcomingPivotEvent,
  resolveDisplayHost,
  serializePivotFeedEvent,
  compareByFeedRank,
  loadFriendSocial,
  loadUserInterestTags,
  loadNegativeFeedbackTags,
  resolvePivotFeedBatchWeek,
  PIVOT_EVENT_STATUSES,
  PIVOT_FEED_RANKER_VERSION,
  FRIEND_CAP,
} = require('./pivotFeedService');
const { resolveExploreSections } = require('./pivotExploreSectionsService');

const PUBLIC_EVENT_FIELDS =
  'name description location start_time end_time externalLink type registrationCount image customFields.pivot';
const DEFAULT_EXPLORE_LIMIT = 40;
const MAX_EXPLORE_LIMIT = 100;
const EXPLORE_SORT_MODES = new Set(['for_you', 'soonest']);
const DEFAULT_EXPLORE_SORT = 'for_you';
const EXPLORE_NIGHT_SHORTDAYS = new Set(['thu', 'fri', 'sat', 'sun']);
const EXPLORE_NIGHT_WEEKDAY = {
  sun: 0,
  thu: 4,
  fri: 5,
  sat: 6,
};
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const EXPLORE_RAIL_COPY = {
  friends: 'friends going',
  tonight: 'tonight',
  forYou: 'for you later',
};

/** Client badge precedence: registered (going) → interested → unset. */
const EXPLORE_INTENT_BADGE_PRIORITY = Object.freeze([
  'registered',
  'interested',
  null,
]);
const EXPLORE_USER_INTENT_STATUSES = new Set([
  'interested',
  'registered',
  'passed',
]);

function normalizeExploreLimit(rawLimit) {
  if (rawLimit == null || rawLimit === '') {
    return DEFAULT_EXPLORE_LIMIT;
  }

  const parsed = Number.parseInt(String(rawLimit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, MAX_EXPLORE_LIMIT);
}

function normalizeExploreOffset(rawOffset) {
  if (rawOffset == null || rawOffset === '') {
    return 0;
  }

  const parsed = Number.parseInt(String(rawOffset), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeExploreBool(rawValue, defaultValue = false) {
  if (rawValue == null || rawValue === '') {
    return defaultValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return null;
}

function normalizeExploreTagsParam(rawTags) {
  if (rawTags == null || rawTags === '') {
    return [];
  }

  const parts = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags).split(',');

  return normalizePivotTagSlugs(parts);
}

function normalizeExploreSort(rawSort) {
  if (rawSort == null || rawSort === '') {
    return DEFAULT_EXPLORE_SORT;
  }

  const sort = String(rawSort).trim().toLowerCase();
  if (EXPLORE_SORT_MODES.has(sort)) {
    return sort;
  }

  return undefined;
}

function compareByStartTime(a, b) {
  const aStart = new Date(a.start_time).getTime() || 0;
  const bStart = new Date(b.start_time).getTime() || 0;
  return aStart - bStart;
}

function normalizeExploreQuery(rawQuery) {
  if (rawQuery == null || rawQuery === '') {
    return null;
  }

  const query = String(rawQuery).trim();
  return query.length ? query : null;
}

function normalizeExploreNight(rawNight) {
  if (rawNight == null || rawNight === '') {
    return null;
  }

  const night = String(rawNight).trim().toLowerCase();
  if (EXPLORE_NIGHT_SHORTDAYS.has(night)) {
    return night;
  }

  if (ISO_DATE_PATTERN.test(night)) {
    const parsed = new Date(`${night}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return night;
  }

  return undefined;
}

function collectEventStartInstants(event) {
  const slots = normalizePivotTimeSlots(event.customFields?.pivot?.timeSlots);
  if (slots.length) {
    return slots
      .map((slot) => new Date(slot.start_time))
      .filter((date) => !Number.isNaN(date.getTime()));
  }

  if (event.start_time == null || event.start_time === '') {
    return [];
  }

  const start = new Date(event.start_time);
  return Number.isNaN(start.getTime()) ? [] : [start];
}

function getLocalWeekdayIndex(date, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);

  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

function formatLocalIsoDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function eventMatchesNight(event, night, timeZone) {
  if (!night) {
    return true;
  }

  const instants = collectEventStartInstants(event);
  if (!instants.length) {
    return false;
  }

  if (EXPLORE_NIGHT_WEEKDAY[night] != null) {
    const targetWeekday = EXPLORE_NIGHT_WEEKDAY[night];
    return instants.some(
      (instant) => getLocalWeekdayIndex(instant, timeZone) === targetWeekday,
    );
  }

  return instants.some(
    (instant) => formatLocalIsoDate(instant, timeZone) === night,
  );
}

function eventMatchesQuery(event, query) {
  if (!query) {
    return true;
  }

  const needle = query.toLowerCase();
  const hostName = event.customFields?.pivot?.host?.name || '';
  const enrichmentText = collectPivotEnrichmentSearchText(event.customFields?.pivot);
  const haystack = [event.name, event.description, hostName, enrichmentText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

function eventHasAnyTag(event, tags) {
  if (!tags.length) {
    return true;
  }

  const eventTags = event.customFields?.pivot?.tags;
  if (!Array.isArray(eventTags) || !eventTags.length) {
    return false;
  }

  const eventTagSet = new Set(
    eventTags.map((raw) => String(raw).trim().toLowerCase()).filter(Boolean),
  );

  return tags.some((tag) => eventTagSet.has(tag));
}

function eventHasFriendActivity(event, socialByEvent) {
  const social = socialByEvent.get(String(event._id));
  return (
    (social?.friendRegisteredCount || 0) > 0 ||
    (social?.friendInterestedCount || 0) > 0
  );
}

function resolveExploreUserIntent(userIntentRow) {
  const status = userIntentRow?.status;
  if (!status || !EXPLORE_USER_INTENT_STATUSES.has(status)) {
    return null;
  }

  return status;
}

function shouldExcludePassedExploreEvent(event, userIntents, excludePassed) {
  if (!excludePassed) {
    return false;
  }

  const intent = userIntents.get(String(event._id));
  return intent?.status === 'passed';
}

function applyExploreFilters(events, filters, context) {
  const { userIntents, socialByEvent, timeZone } = context;

  return events.filter((event) => {
    if (shouldExcludePassedExploreEvent(event, userIntents, filters.excludePassed)) {
      return false;
    }

    if (filters.friendsOnly && !eventHasFriendActivity(event, socialByEvent)) {
      return false;
    }

    if (!eventHasAnyTag(event, filters.tags)) {
      return false;
    }

    if (!eventMatchesNight(event, filters.night, timeZone)) {
      return false;
    }

    return eventMatchesQuery(event, filters.q);
  });
}

function collectWeekTagSlugs(events) {
  const slugs = new Set();

  for (const event of events) {
    const tags = event.customFields?.pivot?.tags;
    if (!Array.isArray(tags)) {
      continue;
    }

    for (const raw of tags) {
      const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (slug) {
        slugs.add(slug);
      }
    }
  }

  return slugs;
}

function buildExploreRails(
  catalogTagRows,
  weekEvents,
  userInterestTags = new Set(),
  previewMode = false,
) {
  const rails = [
    {
      id: 'friends',
      title: EXPLORE_RAIL_COPY.friends,
      retrieval: 'friends_rail',
    },
    {
      id: 'tonight',
      title: EXPLORE_RAIL_COPY.tonight,
      retrieval: 'filter',
    },
    {
      id: 'for_you',
      title: EXPLORE_RAIL_COPY.forYou,
      retrieval: 'for_you_rail',
    },
  ];

  const weekTagSlugs = collectWeekTagSlugs(weekEvents);
  for (const row of catalogTagRows) {
    if (weekTagSlugs.has(row.slug) && (previewMode || userInterestTags.has(row.slug))) {
      rails.push({
        id: `tag:${row.slug}`,
        title: row.label,
        retrieval: 'tag_rail',
      });
    }
  }

  return rails;
}

function buildExploreFiltersPayload(filters) {
  return {
    tags: filters.tags,
    night: filters.night,
    friendsOnly: filters.friendsOnly,
    excludePassed: filters.excludePassed,
    q: filters.q,
    sort: filters.sort,
  };
}

function serializeExploreEvent(event, extras) {
  return serializePivotFeedEvent(event, extras);
}

function serializeExploreCatalogEvents(
  catalogEvents,
  { socialByEvent, userIntents, socialByEventAndSlot },
) {
  return catalogEvents.map((event) => {
    const id = String(event._id);
    const social = socialByEvent.get(id) || {
      friendsInterested: [],
      friendsGoing: [],
      friendInterestedCount: 0,
      friendRegisteredCount: 0,
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

    return serializeExploreEvent(event, {
      displayHost: resolveDisplayHost(event.customFields.pivot),
      userIntent: resolveExploreUserIntent(userIntentRow),
      userTimeSlotId: userIntentRow?.timeSlotId || null,
      socialByTimeSlot,
      friendsInterested: social.friendsInterested,
      friendsGoing: social.friendsGoing,
      friendsInterestedCount: social.friendInterestedCount || 0,
      friendsGoingCount: social.friendRegisteredCount || 0,
    });
  });
}

const PUBLISHED_BATCH_WEEK_PROBE = {
  'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  status: { $in: PIVOT_EVENT_STATUSES },
  isDeleted: { $ne: true },
  'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
};

async function listPublishedPivotBatchWeeks(Event) {
  if (typeof Event.distinct !== 'function') {
    return undefined;
  }

  const weeks = await Event.distinct('customFields.pivot.batchWeek', PUBLISHED_BATCH_WEEK_PROBE);
  return weeks.filter(Boolean).map(String).sort();
}

function summarizeExploreFilterRemovals(catalogEvents, filteredEvents, userIntents, excludePassed) {
  const passedInCatalog = catalogEvents.filter(
    (event) => userIntents.get(String(event._id))?.status === 'passed',
  ).length;

  return {
    catalogCount: catalogEvents.length,
    filteredCount: filteredEvents.length,
    removedPassed: excludePassed ? passedInCatalog : 0,
    removedByOtherFilters: Math.max(
      0,
      catalogEvents.length - passedInCatalog - filteredEvents.length,
    ),
  };
}

async function getPivotExplore(req, options = {}) {
  const previewMode = Boolean(options.previewMode);
  const userId = previewMode ? null : req.user?.userId;
  if (!previewMode && !userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const now = options.now || new Date();
  const tenant = await getTenantByKey(req, req.school);

  let batchWeek;
  let batchWeekPick;
  let batchWeekResolution;

  if (previewMode) {
    const requested = options.batchWeek?.trim();
    if (!requested) {
      return {
        error: 'batchWeek is required for explore preview.',
        status: 400,
        code: 'BATCH_WEEK_REQUIRED',
      };
    }
    if (!isValidIsoWeek(requested)) {
      return {
        error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
        status: 400,
        code: 'INVALID_BATCH_WEEK',
      };
    }
    batchWeek = requested;
    batchWeekPick = { batchWeek, batchWeekSource: 'preview_explicit' };
    batchWeekResolution = {
      ...describePivotBatchWeekResolution(tenant, now, requested),
      ...batchWeekPick,
      resolvedBatchWeek: batchWeek,
      previewMode: true,
    };
  } else {
    if (options.batchWeek?.trim() && !isValidIsoWeek(options.batchWeek.trim())) {
      return {
        error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
        status: 400,
        code: 'INVALID_BATCH_WEEK',
      };
    }

    batchWeekPick = await resolvePivotFeedBatchWeek(req, {
      tenant,
      now,
      requestedBatchWeek: options.batchWeek,
    });
    batchWeek = batchWeekPick.batchWeek;
    batchWeekResolution = {
      ...describePivotBatchWeekResolution(tenant, now, options.batchWeek),
      ...batchWeekPick,
      resolvedBatchWeek: batchWeekPick.batchWeek,
    };
  }

  logPivot('info', 'explore request', {
    ...pivotRequestContext(req),
    ...batchWeekResolution,
  });

  const limit = normalizeExploreLimit(options.limit);
  if (limit == null) {
    return {
      error: 'limit must be a positive integer.',
      status: 400,
      code: 'INVALID_LIMIT',
    };
  }

  const offset = normalizeExploreOffset(options.offset);
  if (offset == null) {
    return {
      error: 'offset must be a non-negative integer.',
      status: 400,
      code: 'INVALID_OFFSET',
    };
  }

  const night = normalizeExploreNight(options.night);
  if (options.night != null && options.night !== '' && night === undefined) {
    return {
      error: 'night must be thu, fri, sat, sun, or YYYY-MM-DD.',
      status: 400,
      code: 'INVALID_NIGHT',
    };
  }

  const friendsOnly = normalizeExploreBool(options.friendsOnly, false);
  if (friendsOnly == null) {
    return {
      error: 'friendsOnly must be true or false.',
      status: 400,
      code: 'INVALID_FRIENDS_ONLY',
    };
  }

  const excludePassed = normalizeExploreBool(options.excludePassed, true);
  if (excludePassed == null) {
    return {
      error: 'excludePassed must be true or false.',
      status: 400,
      code: 'INVALID_EXCLUDE_PASSED',
    };
  }

  const filterTags = normalizeExploreTagsParam(options.tags);
  if (filterTags.length) {
    const tagValidation = await validatePivotEventTags(req, filterTags, {
      required: false,
      activeOnly: true,
    });
    if (tagValidation.error) {
      return {
        error: tagValidation.error,
        status: tagValidation.status || 400,
        code: tagValidation.code || 'INVALID_TAG',
      };
    }
  }

  const sort = normalizeExploreSort(options.sort);
  if (options.sort != null && options.sort !== '' && sort === undefined) {
    return {
      error: 'sort must be for_you or soonest.',
      status: 400,
      code: 'INVALID_SORT',
    };
  }

  const queryText = normalizeExploreQuery(options.q);
  const filters = {
    tags: filterTags,
    night,
    friendsOnly,
    excludePassed,
    q: queryText,
    sort,
  };

  const catalogResult = await listPivotTags(req);
  if (catalogResult.error) {
    return {
      error: catalogResult.error,
      status: catalogResult.status || 500,
      code: 'TAG_CATALOG_UNAVAILABLE',
    };
  }
  const catalogTagRows = catalogResult.data?.tags || [];

  const { Event } = getModels(req, 'Event');

  const query = {
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': previewMode
      ? { $in: [...PIVOT_INGEST_STATUSES] }
      : PIVOT_FEED_INGEST_STATUS,
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
    ...getFeedPilotWindowFilter(now),
  };
  if (filterTags.length) {
    query['customFields.pivot.tags'] = { $in: filterTags };
  }

  const events = await Event.find(query)
    .select(PUBLIC_EVENT_FIELDS)
    .lean();

  const catalogEvents = events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, now),
  );

  const catalogEventIds = catalogEvents.map((event) => event._id);
  let userInterestTags;
  let friendSocial;
  let negativeFeedbackTags;
  if (previewMode) {
    userInterestTags = new Set();
    friendSocial = {
      userIntents: new Map(),
      socialByEvent: new Map(),
      socialByEventAndSlot: new Map(),
    };
    negativeFeedbackTags = new Set();
  } else {
    [userInterestTags, friendSocial, negativeFeedbackTags] = await Promise.all([
      loadUserInterestTags(req, userId),
      loadFriendSocial(req, userId, catalogEventIds, FRIEND_CAP, batchWeek),
      sort === 'for_you'
        ? loadNegativeFeedbackTags(req, userId)
        : Promise.resolve(new Set()),
    ]);
  }
  const { userIntents, socialByEvent, socialByEventAndSlot } = friendSocial;

  const cityDisplayName = tenant?.location || tenant?.name || req.school;
  const { timezone: timeZone } = resolvePivotDropInstant(tenant, batchWeek, now);

  const filteredEvents = applyExploreFilters(catalogEvents, filters, {
    userIntents,
    socialByEvent,
    timeZone,
  });

  if (sort === 'for_you') {
    filteredEvents.sort(
      compareByFeedRank(socialByEvent, userInterestTags, negativeFeedbackTags),
    );
  } else {
    filteredEvents.sort(compareByStartTime);
  }

  const total = filteredEvents.length;
  const rails = buildExploreRails(
    catalogTagRows,
    catalogEvents,
    userInterestTags,
    previewMode,
  );
  const serializedEvents = serializeExploreCatalogEvents(filteredEvents, {
    socialByEvent,
    userIntents,
    socialByEventAndSlot,
  });
  const pageEvents = serializedEvents.slice(offset, offset + limit);
  const { sections, sectionsSource } = await resolveExploreSections(req, {
    tenantKey: req.school,
    batchWeek,
    previewMode,
    serializedEvents,
    rails,
    filters,
    now,
  });
  const filterRemovals = summarizeExploreFilterRemovals(
    catalogEvents,
    filteredEvents,
    userIntents,
    excludePassed,
  );

  let publishedBatchWeeks;
  if (events.length === 0 || total === 0) {
    publishedBatchWeeks = await listPublishedPivotBatchWeeks(Event);
  }

  logPivot('info', 'explore built', {
    ...pivotRequestContext(req),
    ...batchWeekResolution,
    batchWeek,
    cityDisplayName,
    candidateCount: events.length,
    catalogEventCount: catalogEvents.length,
    droppedBeforeCatalog: events.length - catalogEvents.length,
    eventCount: total,
    limit,
    offset,
    returnedCount: pageEvents.length,
    sectionCount: sections.length,
    sectionsSource,
    filterRemovals,
    publishedBatchWeeks,
    filterTags: filterTags.length ? filterTags : undefined,
    friendsOnly: friendsOnly || undefined,
    excludePassed,
    night: night || undefined,
    q: queryText || undefined,
    sort,
  });

  return {
    data: {
      batchWeek,
      cityDisplayName,
      catalogTotal: catalogEvents.length,
      hiddenPassedCount: filterRemovals.removedPassed,
      total,
      rankerVersion: PIVOT_FEED_RANKER_VERSION,
      limit,
      offset,
      filters: buildExploreFiltersPayload(filters),
      rails,
      sections,
      sectionsSource,
      intentBadgePriority: [...EXPLORE_INTENT_BADGE_PRIORITY],
      previewMode,
      events: pageEvents,
    },
  };
}

/**
 * Platform-admin explore preview for a tenant batch week (no end-user auth context).
 *
 * @param {object} req
 * @param {{ tenantKey: string, batchWeek: string, now?: Date, limit?: string|number, offset?: string|number, tags?: string, night?: string, friendsOnly?: string|boolean, excludePassed?: string|boolean, q?: string, sort?: string }} options
 */
async function getPivotExplorePreview(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const tenantKey = tenantResult.tenant.tenantKey;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = {
    ...req,
    school: tenantKey,
    db,
  };

  return getPivotExplore(tenantReq, {
    batchWeek: options.batchWeek,
    limit: options.limit,
    offset: options.offset,
    tags: options.tags,
    night: options.night,
    friendsOnly: options.friendsOnly,
    excludePassed: options.excludePassed,
    q: options.q,
    sort: options.sort,
    now: options.now,
    previewMode: true,
  });
}

module.exports = {
  getPivotExplore,
  getPivotExplorePreview,
  normalizeExploreLimit,
  normalizeExploreOffset,
  normalizeExploreBool,
  normalizeExploreTagsParam,
  normalizeExploreQuery,
  normalizeExploreNight,
  normalizeExploreSort,
  compareByStartTime,
  eventMatchesNight,
  eventMatchesQuery,
  eventHasAnyTag,
  eventHasFriendActivity,
  resolveExploreUserIntent,
  shouldExcludePassedExploreEvent,
  applyExploreFilters,
  buildExploreRails,
  buildExploreFiltersPayload,
  EXPLORE_INTENT_BADGE_PRIORITY,
  DEFAULT_EXPLORE_LIMIT,
  MAX_EXPLORE_LIMIT,
  DEFAULT_EXPLORE_SORT,
  EXPLORE_SORT_MODES,
};
