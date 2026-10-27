import {
  exploreThemeCarouselGroupsUrl,
  catalogEventToFeatured,
  mergePickedEvents,
  exploreThemeDraftFromTheme,
  exploreThemeDraftKey,
  exploreThemeDraftProblem,
  exploreThemeInputFromDraft,
  exploreThemePaths,
  exploreThemeSearchUrl,
  exploreThemeUnsplashUrl,
  formatExploreThemeDates,
  mergeCarouselGroupEvents,
  newExploreThemeDraft,
  overlappingExploreThemes,
} from './pivotExploreThemesAdmin';

const theme = (overrides = {}) => ({
  id: 't1',
  name: 'Halloween',
  tagline: 'spooky season',
  startsOn: '2026-10-24',
  endsOn: '2026-10-31',
  backgroundImageUrl: 'https://x/pivot-explore-themes/a.jpg',
  published: true,
  status: 'live',
  events: [{ id: 'e1', name: 'Haunted walk', state: 'live' }],
  ...overrides,
});

describe('exploreThemePaths', () => {
  it('scopes every call to the city', () => {
    const paths = exploreThemePaths(' Toronto ');
    expect(paths.list).toBe('/admin/pivot/tenants/toronto/explore-themes');
    expect(paths.theme('abc')).toBe('/admin/pivot/tenants/toronto/explore-themes/abc');
    expect(exploreThemeSearchUrl('toronto', { q: ' haunted ' }))
      .toBe('/admin/pivot/tenants/toronto/explore-themes/events?q=haunted');
  });
});

describe('drafts', () => {
  it('round-trips a theme into the request body, events as ordered ids', () => {
    expect(exploreThemeInputFromDraft(exploreThemeDraftFromTheme(theme()))).toEqual({
      name: 'Halloween',
      tagline: 'spooky season',
      startsOn: '2026-10-24',
      endsOn: '2026-10-31',
      backgroundImageUrl: 'https://x/pivot-explore-themes/a.jpg',
      backgroundCredit: null,
      published: true,
      eventIds: ['e1'],
    });
  });

  it('starts new themes as a week-long draft from today', () => {
    const draft = newExploreThemeDraft(new Date(2026, 9, 25, 12));
    expect(draft).toMatchObject({ startsOn: '2026-10-25', endsOn: '2026-10-31', published: false });
  });

  it('tells edits apart by what a save would send', () => {
    const draft = exploreThemeDraftFromTheme(theme());
    const key = exploreThemeDraftKey(draft);
    expect(exploreThemeDraftKey({ ...draft, tagline: 'spooky season ' })).toBe(key);
    expect(exploreThemeDraftKey({ ...draft, events: [] })).not.toBe(key);
  });

  it('explains what blocks a save', () => {
    const draft = exploreThemeDraftFromTheme(theme());
    expect(exploreThemeDraftProblem(draft)).toBeNull();
    expect(exploreThemeDraftProblem({ ...draft, name: ' ' })).toMatch(/name/);
    expect(exploreThemeDraftProblem({ ...draft, endsOn: '2026-10-01' })).toMatch(/end on or after/);
    expect(exploreThemeDraftProblem({ ...draft, endsOn: '2027-06-01' })).toMatch(/at most 92 days/);
  });
});

describe('overlappingExploreThemes', () => {
  it('lists other published, unfinished themes sharing a day', () => {
    const themes = [
      theme(),
      theme({ id: 't2', name: 'Nuit Blanche', startsOn: '2026-10-31', endsOn: '2026-11-01' }),
      theme({ id: 't3', name: 'Draft', published: false, status: 'draft' }),
      theme({ id: 't4', name: 'Pride', startsOn: '2026-06-01', endsOn: '2026-06-30', status: 'ended' }),
    ];
    const draft = exploreThemeDraftFromTheme(themes[0]);
    expect(overlappingExploreThemes(draft, themes).map((row) => row.id)).toEqual(['t2']);
  });
});

describe('formatExploreThemeDates', () => {
  it('reads calendar days without timezone drift', () => {
    expect(formatExploreThemeDates('2026-10-24', '2026-10-31')).toBe('Oct 24 – 31, 2026');
    expect(formatExploreThemeDates('2026-10-31', '2026-11-02')).toBe('Oct 31 – Nov 2, 2026');
    expect(formatExploreThemeDates('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
    expect(formatExploreThemeDates('2026-10-31', '2026-10-31')).toBe('Oct 31, 2026');
  });
});

describe('carousel groups', () => {
  const ev = (id, state = 'live') => ({ id, name: id, state });

  it('asks for recent carousels unless suggestions are wanted', () => {
    expect(exploreThemeCarouselGroupsUrl('toronto', 'suggested'))
      .toBe('/admin/pivot/tenants/toronto/explore-themes/carousel-groups?source=suggested');
    expect(exploreThemeCarouselGroupsUrl('toronto', 'anything'))
      .toBe('/admin/pivot/tenants/toronto/explore-themes/carousel-groups?source=recent');
  });

  it('adds only showable events not already featured, up to the cap', () => {
    const current = [ev('a')];
    const group = [ev('a'), ev('b'), ev('c', 'ended'), ev('d'), ev('e'), ev('e')];
    expect(mergeCarouselGroupEvents(current, group, 3)).toEqual({
      events: [ev('a'), ev('b'), ev('d')],
      added: 2,
      overflow: 1,
    });
  });

  it('can start the list over from a group', () => {
    const result = mergeCarouselGroupEvents([ev('a')], [ev('b'), ev('c', 'missing')], 12, { replace: true });
    expect(result).toEqual({ events: [ev('b')], added: 1, overflow: 0 });
  });
});

describe('exploreThemeUnsplashUrl', () => {
  it('searches by keyword and pages on', () => {
    expect(exploreThemeUnsplashUrl('toronto', { query: ' pumpkins ', page: 2 }))
      .toBe('/admin/pivot/tenants/toronto/explore-themes/unsplash?query=pumpkins&page=2');
    expect(exploreThemeUnsplashUrl('toronto')).toBe('/admin/pivot/tenants/toronto/explore-themes/unsplash');
  });
});

describe('picking from the catalog', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const row = (id, overrides = {}) => ({
    _id: id,
    name: `Event ${id}`,
    organizerName: 'Host',
    start_time: '2026-10-30T23:00:00Z',
    image: `https://img/${id}.jpg`,
    ingestStatus: 'published',
    ...overrides,
  });

  it('reads a catalog row as a featured event', () => {
    expect(catalogEventToFeatured(row('a'), now)).toEqual({
      id: 'a',
      name: 'Event a',
      hostName: 'Host',
      startTime: '2026-10-30T23:00:00Z',
      coverImageUrl: 'https://img/a.jpg',
      state: 'live',
    });
    expect(catalogEventToFeatured(row('b', { ingestStatus: 'staged' }), now).state).toBe('unpublished');
    expect(catalogEventToFeatured(row('c', { start_time: '2026-10-01T00:00:00Z' }), now).state).toBe('ended');
  });

  it('keeps earlier picks in place and adds new ones in catalog order', () => {
    const current = [{ id: 'x', name: 'From another week' }, { id: 'a', name: 'Event a' }];
    const catalog = [row('c'), row('a'), row('b')];
    const merged = mergePickedEvents(current, new Set(['x', 'b', 'c']), catalog, now);
    expect(merged.map((event) => event.id)).toEqual(['x', 'c', 'b']);
  });
});
