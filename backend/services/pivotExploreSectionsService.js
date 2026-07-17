const { PIVOT_INTERACTION_RETRIEVALS } = require('../schemas/pivotInteraction');

const EXPLORE_SECTIONS_SOURCES = Object.freeze(['rules_v0', 'curated']);

const EXPLORE_SECTION_LAYOUTS = Object.freeze(['rail', 'grid', 'list']);

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

/**
 * Load tenant/week curation override. Returns null until a curation store exists.
 *
 * @param {import('express').Request} _req
 * @param {{ tenantKey: string, batchWeek: string, previewMode?: boolean }} _context
 * @returns {Promise<PivotExploreCurationDoc|null>}
 */
async function loadExploreCuration(_req, _context) {
  return null;
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
    sections: buildRulesExploreSections(serializedEvents, rails, { now }),
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
  resolveExploreSections,
  serializedEventSocialScore,
  serializedEventHasFriendActivity,
  isSerializedEventTonight,
};
