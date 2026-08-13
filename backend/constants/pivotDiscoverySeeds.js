/**
 * Search seeds for autonomous city source discovery.
 *
 * Seeding from the tag catalog rather than from prior results is deliberate. The
 * manual Claude Code loop narrowed over time because each pass was seeded with
 * the previous deck, so it kept rediscovering the same kind of event. Anchoring
 * the queries to the canonical tag slugs instead means breadth is a property of
 * the taxonomy the feed already ranks on, and every run reaches for the same
 * spread of categories no matter what last week's deck happened to contain.
 */

const { getPivotTagCatalogSeedRows } = require('./pivotTagCatalogSeed');

/**
 * Per-tag query phrasings. These describe the *venue or organizer* rather than
 * the event, because searching for a recurring host surfaces a calendar page
 * that keeps paying off, while searching for an event surfaces a one-off
 * listing that is stale within a week.
 */
const TAG_QUERY_TEMPLATES = {
  'live-music': ['live music venues', 'concert calendar', 'music venue shows'],
  'board-games': ['board game cafe', 'game store events'],
  'food-and-drink': ['brewery events', 'restaurant events calendar', 'food hall events'],
  outdoors: ['parks and recreation events', 'hiking group', 'outdoor recreation calendar'],
  'art-and-culture': ['art gallery events', 'museum calendar', 'arts center events'],
  nightlife: ['bar events calendar', 'nightlife listings'],
  fitness: ['run club', 'fitness studio class schedule'],
  tech: ['tech meetup', 'startup events'],
  comedy: ['comedy club calendar', 'open mic night'],
  'film-and-tv': ['independent cinema showtimes', 'film screenings'],
  wellness: ['yoga studio schedule', 'meditation classes'],
  gaming: ['esports events', 'arcade events'],
  dance: ['dance classes', 'salsa night'],
  volunteering: ['volunteer opportunities calendar', 'community service events'],
  'markets-and-fairs': ['farmers market', 'craft fair schedule'],
  workshops: ['workshop calendar', 'maker space classes'],
  'family-friendly': ['family events calendar', 'library events'],
  social: ['community events calendar', 'social club events'],
};

/**
 * City-wide queries that do not belong to any single tag. These reach the
 * aggregators and alt-weeklies that cover a whole city at once, which in a small
 * market is often where the long tail actually lives.
 */
const CITY_WIDE_QUERY_TEMPLATES = [
  'events calendar this week',
  'things to do this weekend',
  'alt weekly newspaper events',
  'downtown district events',
  'university campus events calendar',
];

/**
 * Path fragments that mark a page as a recurring event *index*. Scored highest
 * first; discovery prefers an index over a single event detail page because an
 * index keeps yielding on every later refresh.
 */
const EVENT_INDEX_PATH_HINTS = [
  'events',
  'calendar',
  'whats-on',
  'upcoming',
  'shows',
  'schedule',
  'lineup',
  'happenings',
  'programs',
  'tickets',
];

/** Search phrase handed to Firecrawl's map endpoint when locating that index. */
const EVENT_INDEX_MAP_SEARCH = 'events calendar upcoming shows';

/**
 * Hosts that are never worth registering as a source: social networks and
 * reference sites whose pages are not scrapable calendars, plus search and
 * retail domains that pollute results. Partiful and Luma are absent on purpose —
 * discovery routes those to their native parsers instead of rejecting them.
 */
const NON_SOURCE_HOST_PATTERNS = [
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)pinterest\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)yelp\.com$/i,
  /(^|\.)tripadvisor\.com$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)apple\.com$/i,
  /(^|\.)amazon\.com$/i,
  /(^|\.)spotify\.com$/i,
  /(^|\.)yahoo\.com$/i,
  /(^|\.)quora\.com$/i,
];

function isNonSourceHost(hostname) {
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';
  if (!host) return true;
  return NON_SOURCE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * Build the query list for a city.
 *
 * Queries are interleaved one phrasing per tag before taking a second phrasing
 * from any tag, so a `maxQueries` cap trims depth within a category instead of
 * dropping whole categories off the end of the list.
 *
 * @param {object} options
 * @param {string} options.city - Display name used in the query text.
 * @param {string[]} [options.tags] - Catalog slugs to cover; defaults to all.
 * @param {number} [options.maxQueries] - Cap on returned queries.
 * @returns {Array<{query: string, tag: string|null}>}
 */
function buildDiscoveryQueries(options = {}) {
  const city = typeof options.city === 'string' ? options.city.trim() : '';
  if (!city) return [];

  const catalogSlugs = getPivotTagCatalogSeedRows().map((row) => row.slug);
  const filtered = Array.isArray(options.tags) && options.tags.length;
  const requested = filtered
    ? options.tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter((tag) => catalogSlugs.includes(tag))
    : catalogSlugs;

  const tags = [...new Set(requested)];

  // A filter naming only unknown slugs is a caller mistake. Returning the
  // city-wide queries anyway would run a job that covers none of what was asked
  // for, so report emptiness and let the caller see the bad filter.
  if (filtered && !tags.length) return [];

  const rounds = [];
  const cityWide = CITY_WIDE_QUERY_TEMPLATES.map((template) => ({
    query: `${city} ${template}`,
    tag: null,
  }));

  const depth = Math.max(
    ...tags.map((tag) => (TAG_QUERY_TEMPLATES[tag] || []).length),
    0,
  );
  for (let index = 0; index < depth; index += 1) {
    for (const tag of tags) {
      const template = (TAG_QUERY_TEMPLATES[tag] || [])[index];
      if (!template) continue;
      rounds.push({ query: `${template} ${city}`, tag });
    }
  }

  // City-wide queries lead: in a small market they are the highest-yield probes.
  const ordered = [...cityWide, ...rounds];
  const max = Number(options.maxQueries);
  if (Number.isFinite(max) && max > 0) {
    return ordered.slice(0, Math.floor(max));
  }
  return ordered;
}

module.exports = {
  buildDiscoveryQueries,
  isNonSourceHost,
  TAG_QUERY_TEMPLATES,
  CITY_WIDE_QUERY_TEMPLATES,
  EVENT_INDEX_PATH_HINTS,
  EVENT_INDEX_MAP_SEARCH,
  NON_SOURCE_HOST_PATTERNS,
};
