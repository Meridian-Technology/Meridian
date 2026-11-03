/**
 * Just Go App Clip deck: the clip-curated cards for the live week, ranked as
 * if the deck opened at that week's drop instant. A demo an hour before the
 * next drop still plays the whole week.
 *
 * Curated with internal `customFields.pivot.clipDrop`. Falls back to the
 * landing's featured segment, then to last week. Neither flag is returned.
 * A city can instead pin its own list from any week (`pivotClipConfig`,
 * `deckSource: 'custom'`), played in the admin's order.
 * No ticket links: the clip is a no-account preview, like the landing. Cards
 * carry the feed's details, movie, and showtimes for the clip's detail sheet.
 * Carries the city's Voice overrides for the pack's text (`copy`).
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const {
  batchWeekToDropCycleUtcRange,
  shiftIsoWeek,
} = require('../utilities/pivotIsoWeek');
const {
  resolvePivotLiveBatchWeek,
  resolvePivotDropInstant,
} = require('../utilities/pivotDropSchedule');
const { mergePivotDeckConfig } = require('../utilities/pivotDeckConfig');
const {
  PUBLISHED_CATALOG_BASE_QUERY,
  buildPublishedCatalogQuery,
  isUpcomingPivotEvent,
} = require('./pivotFeedService');
const { mergePivotClipConfig, PIVOT_CLIP_CONFIG_DEFAULTS } = require('../utilities/pivotClipConfig');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');
const {
  LANDING_EVENT_FIELDS,
  buildFeaturedLandingQuery,
  loadDropSegmentWeek,
  resolvePublicDropTenant,
  serializeLandingDropEvent,
} = require('./pivotLandingDropService');
const { getClipDropCopy } = require('./pivotCopyService');
const { eventDetailsForFeed } = require('../utilities/pivotEventPrice');
const { serializePivotMovie } = require('../utilities/pivotMovieMetadata');
const {
  normalizePivotTimeSlots,
  serializePivotTimeSlots,
} = require('../utilities/pivotTimeSlots');

/** Default deck size; a city's `pivotClipConfig.cardLimit` overrides it. */
const CLIP_DROP_LIMIT = PIVOT_CLIP_CONFIG_DEFAULTS.cardLimit;
const CLIP_DESCRIPTION_MAX = 600;
const CLIP_EVENT_FIELDS = `${LANDING_EVENT_FIELDS} description end_time`;

function buildClipDropQuery(batchWeek, dropAt) {
  return {
    ...buildPublishedCatalogQuery(batchWeek, dropAt),
    'customFields.pivot.clipDrop': true,
  };
}

/** Clip-curated cards first; the landing's featured cards if none are flagged. */
const CLIP_SEGMENTS = [
  { segment: 'clip', buildQuery: buildClipDropQuery },
  { segment: 'featured', buildQuery: buildFeaturedLandingQuery },
];

function clipDescription(event) {
  const source = event.customFields?.pivot?.movie?.synopsis || event.description || '';
  const text = String(source).replace(/\s+/g, ' ').trim();
  if (text.length <= CLIP_DESCRIPTION_MAX) return text;
  return `${text.slice(0, CLIP_DESCRIPTION_MAX - 1).trimEnd()}…`;
}

function serializeClipDropEvent(event, options = {}) {
  const card = serializeLandingDropEvent(event, options);
  const tags = Array.isArray(event.customFields?.pivot?.tags)
    ? event.customFields.pivot.tags
      .filter((tag) => typeof tag === 'string' && tag.trim())
      .map((tag) => tag.trim())
    : [];
  const description = clipDescription(event);
  const pivot = event.customFields?.pivot || {};
  const details = eventDetailsForFeed(pivot);
  const movie = serializePivotMovie(pivot.movie);
  const slots = normalizePivotTimeSlots(pivot.timeSlots);

  return {
    ...card,
    ...(event.end_time ? { endTime: event.end_time } : {}),
    ...(description ? { description } : {}),
    ...(tags.length ? { tags } : {}),
    ...(details ? { details } : {}),
    ...(movie ? { movie } : {}),
    ...(slots.length ? { timeSlots: serializePivotTimeSlots(slots) } : {}),
  };
}

function nextDropAtAfter(tenant, liveWeek, now) {
  const nextWeek = shiftIsoWeek(liveWeek, 1);
  if (!nextWeek) return null;
  try {
    return resolvePivotDropInstant(tenant, nextWeek, now).dropAt;
  } catch {
    return null;
  }
}

/** The live week's clip cards, then featured, then the same for last week. */
async function loadClipWeekDeck(Event, tenant, liveWeek, now) {
  const deckConfig = mergePivotDeckConfig(tenant.pivotDeckConfig);
  const weeks = [liveWeek, shiftIsoWeek(liveWeek, -1)].filter(Boolean);
  for (const week of weeks) {
    for (const candidate of CLIP_SEGMENTS) {
      const result = await loadDropSegmentWeek(Event, tenant, week, now, deckConfig, {
        buildQuery: candidate.buildQuery,
        fields: CLIP_EVENT_FIELDS,
      });
      if (result.ranked.length > 0) {
        return { ...result, segment: candidate.segment };
      }
    }
  }
  return null;
}

/**
 * The city's pinned list, any batch week, in the admin's order. Unpublished
 * or deleted events drop out; ended ones too unless the city keeps them.
 */
async function loadClipCuratedEvents(Event, clipConfig, now) {
  const ids = clipConfig.curatedEventIds || [];
  if (!ids.length) return [];
  const events = await Event.find({
    ...PUBLISHED_CATALOG_BASE_QUERY,
    _id: { $in: ids },
  })
    .select(CLIP_EVENT_FIELDS)
    .lean();
  const byId = new Map(events.map((event) => [String(event._id), event]));
  return ids
    .map((id) => byId.get(id))
    .filter((event) => event && (!clipConfig.hidePastEvents || isUpcomingPivotEvent(event, now)));
}

/**
 * The clip payload for a resolved city. The public route gates on an active
 * city first; the admin preview calls this directly.
 */
async function buildPivotClipDrop(req, tenant, options = {}) {
  const now = options.now || new Date();
  const liveWeek = resolvePivotLiveBatchWeek(tenant, now);
  const clipConfig = mergePivotClipConfig(tenant.pivotClipConfig);

  const db = await connectToDatabase(tenant.tenantKey);
  const scopedReq = { db, school: tenant.tenantKey };
  const { Event } = getModels(scopedReq, 'Event');

  let loaded = null;
  if (clipConfig.deckSource === 'custom') {
    const curated = await loadClipCuratedEvents(Event, clipConfig, now);
    if (curated.length > 0 || !clipConfig.fallbackToWeek) {
      // Swipes key off the live week so the app imports them with this week's.
      loaded = {
        batchWeek: liveWeek,
        dropAt: resolvePivotDropInstant(tenant, liveWeek, now).dropAt,
        ranked: curated,
        segment: curated.length > 0 ? 'custom' : null,
      };
    }
  }
  if (!loaded) {
    loaded = await loadClipWeekDeck(Event, tenant, liveWeek, now);
  }

  const nextDropAt = nextDropAtAfter(tenant, liveWeek, now);
  const copy = await getClipDropCopy(req, { tenantKey: tenant.tenantKey });
  const readsEnabled = isRichLocationCapabilityEnabled(tenant, 'reads');
  const dropAt = loaded
    ? loaded.dropAt
    : resolvePivotDropInstant(tenant, liveWeek, now).dropAt;

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      batchWeek: loaded ? loaded.batchWeek : liveWeek,
      liveWeek,
      fallback: Boolean(loaded && loaded.batchWeek !== liveWeek),
      segment: loaded ? loaded.segment : null,
      dropAt: dropAt.toISOString(),
      ...(nextDropAt ? { nextDropAt: nextDropAt.toISOString() } : {}),
      events: loaded
        ? loaded.ranked.slice(0, clipConfig.cardLimit).map((event) =>
          serializeClipDropEvent(event, { readsEnabled }))
        : [],
      /** Voice overrides for the pack's text; the clip has no account to fetch them. */
      copy,
    },
  };
}

/**
 * Everything on in a city this drop week, for the onboarding journey's
 * haystack ("in a week in san francisco, there are 171 events"): every
 * event starting in the live week's drop cycle that isn't deleted, whatever
 * its curation status, since the point is the whole week, not the deck. And
 * how many sites those events came from (by link host, else the platform).
 * No event fields are returned.
 */
async function getPivotCityWeekCounts(req, options = {}) {
  const resolved = await resolvePublicDropTenant(req, options.tenantKey);
  if (resolved.error) return resolved;
  const { tenant } = resolved;
  const now = options.now || new Date();
  const liveWeek = resolvePivotLiveBatchWeek(tenant, now);
  const { start, end } = batchWeekToDropCycleUtcRange(
    liveWeek,
    tenant.pivotDropDayOfWeek,
  );

  const db = await connectToDatabase(tenant.tenantKey);
  const { Event } = getModels({ db, school: tenant.tenantKey }, 'Event');
  const events = await Event.find({
    isDeleted: { $ne: true },
    $or: [
      { start_time: { $gte: start, $lt: end } },
      { 'customFields.pivot.timeSlots': { $elemMatch: { start_time: { $gte: start, $lt: end } } } },
    ],
  })
    .select('customFields.pivot.sourceUrl customFields.pivot.source')
    .lean();

  const sites = new Set();
  for (const event of events) {
    const site = eventSourceSite(event);
    if (site) sites.add(site);
  }
  return {
    data: {
      tenantKey: tenant.tenantKey,
      batchWeek: liveWeek,
      eventCount: events.length,
      sourceCount: sites.size,
    },
  };
}

function eventSourceSite(event) {
  const pivot = event?.customFields?.pivot || {};
  try {
    if (pivot.sourceUrl) {
      return new URL(pivot.sourceUrl).hostname.replace(/^www\./, '').toLowerCase();
    }
  } catch {
    // Not a URL; fall back to the platform name.
  }
  const source = String(pivot.source || '').trim().toLowerCase();
  return source || null;
}

async function getPivotClipDrop(req, options = {}) {
  const resolved = await resolvePublicDropTenant(req, options.tenantKey);
  if (resolved.error) return resolved;
  return buildPivotClipDrop(req, resolved.tenant, options);
}

module.exports = {
  getPivotClipDrop,
  getPivotCityWeekCounts,
  buildPivotClipDrop,
  serializeClipDropEvent,
  buildClipDropQuery,
  CLIP_DROP_LIMIT,
  CLIP_EVENT_FIELDS,
};
