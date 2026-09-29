const { PIVOT_INTERACTION_RETRIEVALS } = require('../schemas/pivotInteraction');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { logPivot } = require('../utilities/pivotLogger');

/** Platform-admin entry points are cross-tenant, so each call opens its own city DB. */
async function openPivotTenantDb(req, tenantKey) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }
  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  return { tenantReq: { db, school: tenantResult.tenant.tenantKey } };
}

const EXPLORE_SECTIONS_SOURCES = Object.freeze(['rules_v0', 'curated']);

const EXPLORE_SECTION_LAYOUTS = Object.freeze(['rail', 'grid', 'list']);

/** Hard cap on how many events an admin can bundle into one curated collection. */
const MAX_EXPLORE_COLLECTION_EVENTS = 10;

const EXPLORE_SECTION_COPY = Object.freeze({
  trending: 'trending',
});

const EXPLORE_CATEGORY_MIN_EVENTS = 3;
const EXPLORE_CATEGORY_MAX_EVENTS = 4;

const RETRIEVAL_SET = new Set(PIVOT_INTERACTION_RETRIEVALS);

/**
 * Stored curation document (future tenant DB collection).
 *
 * @typedef {object} PivotExploreCurationSection
 * @property {string} id
 * @property {string} title
 * @property {string} retrieval
 * @property {'rail'|'grid'|'list'} [layout]
 * @property {string[]} eventIds
 * @property {string} [subtitle]
 *
 * @typedef {object} PivotExploreCurationDoc
 * @property {string} tenantKey
 * @property {string} batchWeek
 * @property {PivotExploreCurationSection[]} sections
 */

function shouldBuildExploreSections(filters = {}) {
  return (
    !filters.q &&
    !filters.friendsOnly &&
    !(filters.tags && filters.tags.length) &&
    !filters.night
  );
}

function serializedEventSocialScore(event) {
  return (event.friendsInterestedCount || 0) + (event.friendsGoingCount || 0);
}

function serializedEventHasFriendActivity(event) {
  return (
    (event.friendsInterestedCount || 0) > 0 || (event.friendsGoingCount || 0) > 0
  );
}

function serializedEventHasCrewActivity(event, lockedPickEventIds = new Set()) {
  if (lockedPickEventIds.has(String(event._id))) {
    return true;
  }

  return (event.crewInterestedCount || 0) + (event.crewRegisteredCount || 0) > 0;
}

function serializedEventCrewActivityScore(event, lockedPickEventIds = new Set()) {
  const lockedBoost = lockedPickEventIds.has(String(event._id)) ? 100 : 0;
  return (
    lockedBoost
    + (event.crewRegisteredCount || 0) * 1.5
    + (event.crewInterestedCount || 0)
  );
}

function serializedEventHasTag(event, tagSlug) {
  const tags = event.tags;
  if (!Array.isArray(tags) || !tags.length) {
    return false;
  }

  const normalized = String(tagSlug).trim().toLowerCase();
  return tags.some((tag) => String(tag).trim().toLowerCase() === normalized);
}

function isSerializedEventTonight(event, now = new Date()) {
  if (!event.start_time) {
    return false;
  }

  const start = new Date(event.start_time);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

function appearanceCount(tracker, eventId) {
  return tracker.get(String(eventId)) ?? 0;
}

function markEventsShown(events, tracker) {
  for (const event of events) {
    const id = String(event._id);
    tracker.set(id, appearanceCount(tracker, id) + 1);
  }
}

function pickFreshCategoryEvents(candidates, tracker) {
  const fresh = candidates.filter(
    (event) => appearanceCount(tracker, event._id) === 0,
  );
  if (fresh.length < EXPLORE_CATEGORY_MIN_EVENTS) {
    return null;
  }

  const picked = fresh.slice(0, EXPLORE_CATEGORY_MAX_EVENTS);
  markEventsShown(picked, tracker);
  return picked;
}

function tagLabelForSlug(slug, rails) {
  const rail = rails.find((row) => row.id === `tag:${slug}`);
  if (rail?.title?.trim()) {
    return rail.title;
  }
  return slug.replace(/-/g, ' ');
}

function buildTagSectionCandidates(events, rails) {
  const eventsByTag = new Map();

  for (const event of events) {
    const tags = event.tags;
    if (!Array.isArray(tags) || !tags.length) {
      continue;
    }

    const seen = new Set();
    for (const tag of tags) {
      const slug = String(tag).trim().toLowerCase();
      if (!slug || seen.has(slug)) {
        continue;
      }
      seen.add(slug);

      const bucket = eventsByTag.get(slug) ?? [];
      bucket.push(event);
      eventsByTag.set(slug, bucket);
    }
  }

  return [...eventsByTag.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .map(([slug, tagEvents]) => ({
      id: `tag:${slug}`,
      title: tagLabelForSlug(slug, rails),
      events: tagEvents,
    }));
}

function normalizeExploreSectionLayout(layout) {
  const normalized = typeof layout === 'string' ? layout.trim().toLowerCase() : '';
  if (EXPLORE_SECTION_LAYOUTS.includes(normalized)) {
    return normalized;
  }
  return 'rail';
}

function normalizeExploreSectionRetrieval(retrieval) {
  const normalized =
    typeof retrieval === 'string' ? retrieval.trim().toLowerCase() : '';
  if (RETRIEVAL_SET.has(normalized)) {
    return normalized;
  }
  return 'curated_rail';
}

/**
 * Default rules-based browse sections (mirrors mobile pivotExploreRails v0).
 */
function buildRulesExploreSections(events, rails, options = {}) {
  if (!Array.isArray(events) || !events.length) {
    return [];
  }

  const maxPerCategory = Math.min(
    options.maxPerSection ?? EXPLORE_CATEGORY_MAX_EVENTS,
    EXPLORE_CATEGORY_MAX_EVENTS,
  );
  const now = options.now instanceof Date ? options.now : new Date();
  const lockedPickEventIds = options.lockedCrewPickEventIds instanceof Set
    ? options.lockedCrewPickEventIds
    : new Set();
  const tracker = new Map();
  const sections = [];

  const appendCategory = (id, title, retrieval, candidates) => {
    const picked = pickFreshCategoryEvents(candidates, tracker);
    if (!picked?.length) {
      return;
    }

    sections.push({
      id,
      title,
      retrieval,
      layout: 'rail',
      events: picked.slice(0, maxPerCategory),
    });
  };

  appendCategory(
    'trending',
    EXPLORE_SECTION_COPY.trending,
    'for_you_rail',
    [...events].sort(
      (left, right) =>
        serializedEventSocialScore(right) - serializedEventSocialScore(left),
    ),
  );

  const friendsRail = rails.find((rail) => rail.id === 'friends');
  if (friendsRail) {
    appendCategory(
      friendsRail.id,
      friendsRail.title,
      'friends_rail',
      events.filter(serializedEventHasFriendActivity),
    );
  }

  const crewsRail = rails.find((rail) => rail.id === 'crews');
  if (crewsRail) {
    appendCategory(
      crewsRail.id,
      crewsRail.title,
      'crews_rail',
      [...events]
        .filter((event) => serializedEventHasCrewActivity(event, lockedPickEventIds))
        .sort(
          (left, right) =>
            serializedEventCrewActivityScore(right, lockedPickEventIds)
            - serializedEventCrewActivityScore(left, lockedPickEventIds),
        ),
    );
  }

  const tonightRail = rails.find((rail) => rail.id === 'tonight');
  if (tonightRail) {
    appendCategory(
      tonightRail.id,
      tonightRail.title,
      'filter',
      events.filter((event) => isSerializedEventTonight(event, now)),
    );
  }

  for (const tagSection of buildTagSectionCandidates(events, rails)) {
    appendCategory(
      tagSection.id,
      tagSection.title,
      'tag_rail',
      tagSection.events,
    );
  }

  return sections;
}

function materializeCuratedSections(curation, eventsById) {
  const sections = [];

  for (const row of curation.sections || []) {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const title = typeof row?.title === 'string' ? row.title.trim() : '';
    if (!id || !title) {
      continue;
    }

    const eventIds = Array.isArray(row.eventIds) ? row.eventIds : [];
    const events = [];
    const seen = new Set();
    for (const rawId of eventIds) {
      const eventId = String(rawId);
      if (!eventId || seen.has(eventId)) {
        continue;
      }
      seen.add(eventId);
      const event = eventsById.get(eventId);
      if (event) {
        events.push(event);
      }
    }

    if (!events.length) {
      continue;
    }

    sections.push({
      id,
      title,
      retrieval: normalizeExploreSectionRetrieval(row.retrieval),
      layout: normalizeExploreSectionLayout(row.layout),
      subtitle: typeof row.subtitle === 'string' ? row.subtitle.trim() : undefined,
      events,
    });
  }

  return sections;
}

function serializeExploreCollection(doc) {
  return {
    _id: String(doc._id),
    batchWeek: doc.batchWeek,
    title: doc.title,
    subtitle: doc.subtitle || null,
    layout: doc.layout || 'rail',
    eventIds: (doc.eventIds || []).map(String),
    position: doc.position ?? 0,
    active: doc.active !== false,
    createdBy: doc.createdBy || null,
    updatedBy: doc.updatedBy || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Load tenant/week curation override — active admin-curated collections for
 * this batch week, in display order. Each collection renders as one Explore
 * row (`sectionsSource: 'curated'`).
 *
 * @param {import('express').Request} req
 * @param {{ tenantKey: string, batchWeek: string, previewMode?: boolean }} context
 * @returns {Promise<PivotExploreCurationDoc|null>}
 */
async function loadExploreCuration(req, context = {}) {
  const batchWeek = String(context.batchWeek || '').trim();
  if (!batchWeek) {
    return null;
  }

  try {
    const { PivotExploreCollection } = getModels(req, 'PivotExploreCollection');
    const rows = await PivotExploreCollection.find({ batchWeek, active: true })
      .sort({ position: 1, createdAt: 1 })
      .lean();

    if (!rows.length) {
      return null;
    }

    return {
      tenantKey: context.tenantKey,
      batchWeek,
      sections: rows.map((row) => ({
        id: `collection:${row._id}`,
        title: row.title,
        retrieval: 'curated_rail',
        layout: row.layout || 'rail',
        eventIds: (row.eventIds || []).map(String),
        ...(row.subtitle ? { subtitle: row.subtitle } : {}),
      })),
    };
  } catch (err) {
    logPivot('warn', 'explore curation load failed', {
      batchWeek,
      error: err.message,
    });
    return null;
  }
}

/** List admin-curated collections for a batch week (newest-created ties broken by position). */
async function listPivotExploreCollections(req, options = {}) {
  const batchWeek = String(options.batchWeek || '').trim();
  if (!batchWeek || !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const opened = await openPivotTenantDb(req, options.tenantKey);
  if (opened.error) {
    return opened;
  }

  const { Event, PivotExploreCollection } = getModels(
    opened.tenantReq,
    'Event',
    'PivotExploreCollection',
  );
  const rows = await PivotExploreCollection.find({ batchWeek })
    .sort({ position: 1, createdAt: 1 })
    .lean();

  const allEventIds = [...new Set(rows.flatMap((row) => (row.eventIds || []).map(String)))];
  const events = allEventIds.length
    ? await Event.find({ _id: { $in: allEventIds } }).select('name').lean()
    : [];
  const nameById = new Map(events.map((event) => [String(event._id), event.name]));

  return {
    data: {
      batchWeek,
      collections: rows.map((row) => ({
        ...serializeExploreCollection(row),
        events: (row.eventIds || []).map((id) => ({
          _id: String(id),
          name: nameById.get(String(id)) || String(id),
        })),
      })),
    },
  };
}

/** Create (no `collectionId`) or update an admin-curated Explore collection. */
async function upsertPivotExploreCollection(req, options = {}) {
  const batchWeek = String(options.batchWeek || '').trim();
  if (!batchWeek || !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const title = String(options.title || '').trim();
  if (!title) {
    return { error: 'title is required.', status: 400, code: 'TITLE_REQUIRED' };
  }

  const rawEventIds = Array.isArray(options.eventIds) ? options.eventIds : [];
  const eventIds = [...new Set(rawEventIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!eventIds.length) {
    return { error: 'At least one event is required.', status: 400, code: 'EVENTS_REQUIRED' };
  }
  if (eventIds.length > MAX_EXPLORE_COLLECTION_EVENTS) {
    return {
      error: `A collection can have at most ${MAX_EXPLORE_COLLECTION_EVENTS} events.`,
      status: 400,
      code: 'TOO_MANY_EVENTS',
    };
  }

  const opened = await openPivotTenantDb(req, options.tenantKey);
  if (opened.error) {
    return opened;
  }

  const { Event, PivotExploreCollection } = getModels(
    opened.tenantReq,
    'Event',
    'PivotExploreCollection',
  );
  const foundEvents = await Event.find({ _id: { $in: eventIds }, isDeleted: { $ne: true } })
    .select('_id')
    .lean();
  const foundIds = new Set(foundEvents.map((event) => String(event._id)));
  const missingIds = eventIds.filter((id) => !foundIds.has(id));
  if (missingIds.length) {
    return {
      error: `${missingIds.length} selected event(s) could not be found in the catalog.`,
      status: 400,
      code: 'EVENTS_NOT_FOUND',
    };
  }

  const layout = EXPLORE_SECTION_LAYOUTS.includes(options.layout) ? options.layout : 'rail';
  const subtitle = String(options.subtitle || '').trim() || null;
  const actor = String(options.actor || '').trim() || null;

  const collectionId = String(options.collectionId || '').trim();
  if (collectionId) {
    const existing = await PivotExploreCollection.findById(collectionId);
    if (!existing) {
      return { error: 'Collection not found.', status: 404, code: 'COLLECTION_NOT_FOUND' };
    }
    existing.batchWeek = batchWeek;
    existing.title = title;
    existing.subtitle = subtitle;
    existing.layout = layout;
    existing.eventIds = eventIds;
    if (options.position != null) existing.position = Number(options.position) || 0;
    if (options.active != null) existing.active = Boolean(options.active);
    existing.updatedBy = actor;
    await existing.save();
    return { data: serializeExploreCollection(existing.toObject()) };
  }

  const highestPositionRow = await PivotExploreCollection.findOne({ batchWeek })
    .sort({ position: -1 })
    .select('position')
    .lean();
  const created = await PivotExploreCollection.create({
    batchWeek,
    title,
    subtitle,
    layout,
    eventIds,
    position:
      options.position != null
        ? Number(options.position) || 0
        : (highestPositionRow?.position ?? -1) + 1,
    active: options.active != null ? Boolean(options.active) : true,
    createdBy: actor,
    updatedBy: actor,
  });
  return { data: serializeExploreCollection(created.toObject()) };
}

/** Permanently remove one curated collection. */
async function deletePivotExploreCollection(req, options = {}) {
  const collectionId = String(options.collectionId || '').trim();
  if (!collectionId) {
    return { error: 'collectionId is required.', status: 400, code: 'COLLECTION_ID_REQUIRED' };
  }

  const opened = await openPivotTenantDb(req, options.tenantKey);
  if (opened.error) {
    return opened;
  }

  const { PivotExploreCollection } = getModels(opened.tenantReq, 'PivotExploreCollection');
  const deleted = await PivotExploreCollection.findByIdAndDelete(collectionId).lean();
  if (!deleted) {
    return { error: 'Collection not found.', status: 404, code: 'COLLECTION_NOT_FOUND' };
  }
  return { data: { deleted: true, collectionId } };
}

/**
 * Resolve browse sections from curation override or default rules.
 */
async function resolveExploreSections(req, options = {}) {
  const {
    tenantKey,
    batchWeek,
    previewMode = false,
    serializedEvents = [],
    rails = [],
    filters = {},
    now = new Date(),
  } = options;

  if (!shouldBuildExploreSections(filters)) {
    return {
      sections: [],
      sectionsSource: 'rules_v0',
    };
  }

  const eventsById = new Map(
    serializedEvents.map((event) => [String(event._id), event]),
  );

  const loadCuration = options.loadExploreCuration || loadExploreCuration;
  const curation = await loadCuration(req, {
    tenantKey,
    batchWeek,
    previewMode,
  });

  if (curation?.sections?.length) {
    const sections = materializeCuratedSections(curation, eventsById);
    if (sections.length) {
      return {
        sections,
        sectionsSource: 'curated',
      };
    }
  }

  return {
    sections: buildRulesExploreSections(serializedEvents, rails, {
      now,
      lockedCrewPickEventIds: options.lockedCrewPickEventIds,
    }),
    sectionsSource: 'rules_v0',
  };
}

module.exports = {
  EXPLORE_SECTIONS_SOURCES,
  EXPLORE_SECTION_LAYOUTS,
  EXPLORE_SECTION_COPY,
  EXPLORE_CATEGORY_MIN_EVENTS,
  EXPLORE_CATEGORY_MAX_EVENTS,
  shouldBuildExploreSections,
  buildRulesExploreSections,
  materializeCuratedSections,
  loadExploreCuration,
  listPivotExploreCollections,
  upsertPivotExploreCollection,
  deletePivotExploreCollection,
  MAX_EXPLORE_COLLECTION_EVENTS,
  resolveExploreSections,
  serializedEventSocialScore,
  serializedEventHasFriendActivity,
  serializedEventHasCrewActivity,
  serializedEventCrewActivityScore,
  isSerializedEventTonight,
};
