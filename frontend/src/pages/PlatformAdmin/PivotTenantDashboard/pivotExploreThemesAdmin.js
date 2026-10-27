/**
 * Pure helpers for Content → Explore themes: the theme form's draft, what a
 * save sends, and how themes read in the list (status, dates, overlaps).
 */

/** The city's catalog for one batch week: what the Events page lists. */
export function cityCatalogPath(tenantKey) {
  return `/admin/pivot/tenants/${encodeURIComponent(String(tenantKey || '').trim().toLowerCase())}/ops`;
}

export function exploreThemePaths(tenantKey) {
  const base = `/admin/pivot/tenants/${encodeURIComponent(String(tenantKey || '').trim().toLowerCase())}/explore-themes`;
  return {
    list: base,
    theme: (id) => `${base}/${encodeURIComponent(id)}`,
    image: `${base}/image`,
    events: `${base}/events`,
    carouselGroups: `${base}/carousel-groups`,
    unsplash: `${base}/unsplash`,
    unsplashSelect: `${base}/unsplash/select`,
  };
}

export function exploreThemeUnsplashUrl(tenantKey, { query = '', page = 1 } = {}) {
  const params = new URLSearchParams();
  const term = String(query || '').trim();
  if (term) params.set('query', term);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return `${exploreThemePaths(tenantKey).unsplash}${search ? `?${search}` : ''}`;
}

/** Where a theme's featured events can start from: carousels the team made
 * recently, or the carousel workspace's live suggestions. */
export const EXPLORE_THEME_GROUP_SOURCES = Object.freeze([
  { id: 'recent', label: 'Recent carousels' },
  { id: 'suggested', label: 'Suggested groups' },
]);

export function exploreThemeCarouselGroupsUrl(tenantKey, source) {
  const id = source === 'suggested' ? 'suggested' : 'recent';
  return `${exploreThemePaths(tenantKey).carouselGroups}?source=${id}`;
}

/**
 * Takes a carousel group's events into the featured list: only events the
 * app can show, not already featured, up to `max`. `replace` starts the list
 * over from the group. Reports how many went in and how many didn't fit.
 */
export function mergeCarouselGroupEvents(current, groupEvents, max, { replace = false } = {}) {
  const base = replace ? [] : current;
  const have = new Set(base.map((event) => event.id));
  const fresh = (groupEvents || []).filter(
    (event) => event.state === 'live' && !have.has(event.id) && have.add(event.id),
  );
  const room = Math.max(0, max - base.length);
  const taken = fresh.slice(0, room);
  return { events: [...base, ...taken], added: taken.length, overflow: fresh.length - taken.length };
}

export function exploreThemeSearchUrl(tenantKey, { q = '', includePast = false } = {}) {
  const params = new URLSearchParams();
  const term = String(q || '').trim();
  if (term) params.set('q', term);
  if (includePast) params.set('includePast', 'true');
  const query = params.toString();
  return `${exploreThemePaths(tenantKey).events}${query ? `?${query}` : ''}`;
}

/** An empty theme starting today and running a week, as calendar days. */
export function newExploreThemeDraft(today = new Date()) {
  const start = toCalendarDate(today);
  const end = toCalendarDate(new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000));
  return {
    id: null,
    name: '',
    tagline: '',
    startsOn: start,
    endsOn: end,
    backgroundImageUrl: '',
    backgroundCredit: null,
    published: false,
    events: [],
  };
}

export function exploreThemeDraftFromTheme(theme) {
  return {
    id: theme.id,
    name: theme.name || '',
    tagline: theme.tagline || '',
    startsOn: theme.startsOn || '',
    endsOn: theme.endsOn || '',
    backgroundImageUrl: theme.backgroundImageUrl || '',
    backgroundCredit: theme.backgroundCredit || null,
    published: theme.published === true,
    // Whole rows, so newly added events render before a save.
    events: Array.isArray(theme.events) ? theme.events : [],
  };
}

/** The request body for a create or edit. */
export function exploreThemeInputFromDraft(draft) {
  return {
    name: draft.name.trim(),
    tagline: draft.tagline.trim(),
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    backgroundImageUrl: draft.backgroundImageUrl || '',
    backgroundCredit: draft.backgroundCredit || null,
    published: draft.published === true,
    eventIds: draft.events.map((event) => event.id),
  };
}

/** Compare two of these to tell whether the form has unsaved changes. */
export function exploreThemeDraftKey(draft) {
  return draft ? JSON.stringify(exploreThemeInputFromDraft(draft)) : '';
}

/** Why the form can't be saved yet, or null. Mirrors the server's rules. */
export function exploreThemeDraftProblem(draft, limits = {}) {
  const nameMax = limits.nameMax || 40;
  const taglineMax = limits.taglineMax || 90;
  const featuredMax = limits.featuredMax || 12;
  const spanMaxDays = limits.spanMaxDays || 92;
  if (!draft.name.trim()) return 'Give the theme a name.';
  if (draft.name.trim().length > nameMax) return `Names are at most ${nameMax} characters.`;
  if (draft.tagline.trim().length > taglineMax) return `Taglines are at most ${taglineMax} characters.`;
  if (!draft.startsOn || !draft.endsOn) return 'Pick a start and end date.';
  if (draft.endsOn < draft.startsOn) return 'The theme has to end on or after its first day.';
  if (calendarDaysBetween(draft.startsOn, draft.endsOn) + 1 > spanMaxDays) {
    return `A theme runs at most ${spanMaxDays} days.`;
  }
  if (draft.events.length > featuredMax) return `Feature at most ${featuredMax} events.`;
  return null;
}

export const EXPLORE_THEME_STATUS = Object.freeze({
  live: { label: 'Live', tone: 'ok' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  draft: { label: 'Draft', tone: 'muted' },
  ended: { label: 'Ended', tone: 'muted' },
});

/**
 * Published themes whose days overlap `draft`'s. The app shows the one that
 * started latest, so an overlap is fine but worth knowing about.
 */
export function overlappingExploreThemes(draft, themes) {
  if (!draft?.startsOn || !draft?.endsOn) return [];
  return (themes || []).filter(
    (theme) =>
      theme.id !== draft.id
      && theme.published
      && theme.status !== 'ended'
      && theme.startsOn <= draft.endsOn
      && draft.startsOn <= theme.endsOn,
  );
}

const MONTH_DAY = { month: 'short', day: 'numeric', timeZone: 'UTC' };

/** `Oct 24 – 31, 2026`, from calendar days (no timezone shifting). */
export function formatExploreThemeDates(startsOn, endsOn) {
  const start = calendarDateToUtc(startsOn);
  const end = calendarDateToUtc(endsOn);
  if (!start || !end) return '';
  const year = end.getUTCFullYear();
  const startLabel = start.toLocaleDateString('en-US', MONTH_DAY);
  if (startsOn === endsOn) return `${startLabel}, ${year}`;
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
    && start.getUTCFullYear() === end.getUTCFullYear();
  const endLabel = sameMonth
    ? String(end.getUTCDate())
    : end.toLocaleDateString('en-US', MONTH_DAY);
  const startYear = start.getUTCFullYear() !== year ? `, ${start.getUTCFullYear()}` : '';
  return `${startLabel}${startYear} – ${endLabel}, ${year}`;
}

export function toCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDateToUtc(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function calendarDaysBetween(from, to) {
  const start = calendarDateToUtc(from);
  const end = calendarDateToUtc(to);
  if (!start || !end) return 0;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/** A catalog row from the Events page, as a featured event. */
export function catalogEventToFeatured(event, now = new Date()) {
  const ends = event.end_time || event.start_time;
  const ended = ends ? new Date(ends) < now : false;
  return {
    id: String(event._id),
    name: event.name || '',
    hostName: event.organizerName || '',
    startTime: event.start_time || null,
    ...(event.image ? { coverImageUrl: event.image } : {}),
    state: event.ingestStatus !== 'published' ? 'unpublished' : ended ? 'ended' : 'live',
  };
}

/**
 * Folds the catalog's selection back into the ordered featured list. Picks
 * stay where they were; new ones join the end in the order the catalog
 * lists them. Ids the catalog no longer selects are dropped.
 */
export function mergePickedEvents(current, selectedIds, catalogEvents, now = new Date()) {
  const kept = current.filter((event) => selectedIds.has(event.id));
  const have = new Set(kept.map((event) => event.id));
  const added = catalogEvents
    .filter((event) => selectedIds.has(String(event._id)) && !have.has(String(event._id)))
    .map((event) => catalogEventToFeatured(event, now));
  return [...kept, ...added];
}
