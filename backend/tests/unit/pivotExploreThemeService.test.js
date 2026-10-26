// The rules under test are pure; keep the city, S3 and clip services out.
jest.mock('../../services/pivotIngestPublishService', () => ({ resolvePivotTenant: jest.fn() }));
jest.mock('../../services/imageUploadService', () => ({ uploadImageToS3: jest.fn() }));
jest.mock('../../services/pivotClipAdminService', () => ({
  describeCuratedEvents: jest.fn(),
  searchClipCandidateEvents: jest.fn(),
  tenantEventModel: jest.fn(),
}));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotCarouselRelatedService', () => ({
  findSuggestedCurationGroups: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { describeCuratedEvents, tenantEventModel } = require('../../services/pivotClipAdminService');
const { findSuggestedCurationGroups } = require('../../services/pivotCarouselRelatedService');

const {
  FEATURED_MAX,
  cityEventIds,
  listExploreThemeCarouselGroups,
  parseCalendarDate,
  resolveThemeWindow,
  serializeExploreTheme,
  themeStatus,
  validateThemeInput,
} = require('../../services/pivotExploreThemeService');

const IMAGE = 'https://bucket.s3.amazonaws.com/pivot-explore-themes/toronto/abc.jpg';
const ID = (n) => String(n).padStart(24, '0');

describe('parseCalendarDate', () => {
  it('reads real calendar days only', () => {
    expect(parseCalendarDate('2026-10-31')).toMatchObject({ year: 2026, month: 10, day: 31 });
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('10/31/2026')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
  });
});

describe('resolveThemeWindow', () => {
  it('runs midnight to midnight in the city timezone, end day inclusive', () => {
    const window = resolveThemeWindow('2026-10-24', '2026-10-31', 'America/Toronto');
    expect(window.startsAt.toISOString()).toBe('2026-10-24T04:00:00.000Z');
    // EDT ends Nov 1, so midnight after the 31st is still UTC-4.
    expect(window.endsAt.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('follows the clock change inside the window', () => {
    const window = resolveThemeWindow('2026-10-31', '2026-11-01', 'America/Toronto');
    expect(window.endsAt.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

describe('themeStatus', () => {
  const theme = {
    published: true,
    startsAt: new Date('2026-10-24T04:00:00Z'),
    endsAt: new Date('2026-11-01T04:00:00Z'),
  };
  it('reads draft, scheduled, live and ended', () => {
    expect(themeStatus({ ...theme, published: false }, new Date('2026-10-25T00:00:00Z'))).toBe('draft');
    expect(themeStatus(theme, new Date('2026-10-20T00:00:00Z'))).toBe('scheduled');
    expect(themeStatus(theme, new Date('2026-10-24T04:00:00Z'))).toBe('live');
    expect(themeStatus(theme, new Date('2026-11-01T04:00:00Z'))).toBe('ended');
  });
});

describe('validateThemeInput', () => {
  const valid = {
    name: 'Halloween',
    tagline: 'spooky season in toronto',
    startsOn: '2026-10-24',
    endsOn: '2026-10-31',
    eventIds: [ID(1), ID(2), ID(1)],
    backgroundImageUrl: IMAGE,
    published: true,
  };

  it('accepts a full theme and dedupes featured events in order', () => {
    const { fields, error } = validateThemeInput(valid);
    expect(error).toBeUndefined();
    expect(fields.eventIds).toEqual([ID(1), ID(2)]);
    expect(fields.published).toBe(true);
  });

  it('needs a name and real dates in order', () => {
    expect(validateThemeInput({ ...valid, name: '  ' }).error).toMatch(/name/);
    expect(validateThemeInput({ ...valid, endsOn: '2026-10-23' }).error).toMatch(/end on or after/);
    expect(validateThemeInput({ ...valid, endsOn: '2027-03-01' }).error).toMatch(/at most/);
  });

  it('caps featured events and rejects bad ids', () => {
    const tooMany = Array.from({ length: FEATURED_MAX + 1 }, (_, i) => ID(i + 1));
    expect(validateThemeInput({ ...valid, eventIds: tooMany }).error).toMatch(/at most/);
    expect(validateThemeInput({ ...valid, eventIds: ['nope'] }).error).toMatch(/not valid/);
  });

  it('only takes photos uploaded through the panel', () => {
    expect(validateThemeInput({ ...valid, backgroundImageUrl: 'https://example.com/a.jpg' }).error)
      .toMatch(/Upload/);
    expect(validateThemeInput({ ...valid, backgroundImageUrl: '' }).fields.backgroundImageUrl).toBe('');
  });

  it('edits only the fields sent, checking dates against the stored ones', () => {
    const existing = { startsOn: '2026-10-24', endsOn: '2026-10-31' };
    expect(validateThemeInput({ tagline: 'boo' }, { partial: true, existing }).fields)
      .toEqual({ tagline: 'boo' });
    expect(validateThemeInput({ endsOn: '2026-10-01' }, { partial: true, existing }).error)
      .toMatch(/end on or after/);
    expect(validateThemeInput({ endsOn: '2026-11-02' }, { partial: true, existing }).fields)
      .toEqual({ startsOn: '2026-10-24', endsOn: '2026-11-02' });
  });
});

describe('serializeExploreTheme', () => {
  it('keeps the admin order and drops events explore does not carry', () => {
    const theme = {
      _id: ID(9),
      name: 'Halloween',
      tagline: '',
      backgroundImageUrl: IMAGE,
      startsAt: new Date('2026-10-24T04:00:00Z'),
      endsAt: new Date('2026-11-01T04:00:00Z'),
      eventIds: [ID(3), ID(1), ID(2)],
    };
    const eventsById = new Map([
      [ID(1), { _id: ID(1) }],
      [ID(3), { _id: ID(3) }],
    ]);
    expect(serializeExploreTheme(theme, eventsById)).toEqual({
      id: ID(9),
      name: 'Halloween',
      tagline: null,
      backgroundImageUrl: IMAGE,
      startsAt: '2026-10-24T04:00:00.000Z',
      endsAt: '2026-11-01T04:00:00.000Z',
      events: [{ _id: ID(3) }, { _id: ID(1) }],
    });
    expect(serializeExploreTheme(null, eventsById)).toBeNull();
  });
});

/** A Mongoose query stand-in: find(filter).sort().limit().select().lean(). */
function model(rows) {
  const find = jest.fn(() => {
    const chain = {
      sort: () => chain,
      limit: () => chain,
      select: () => chain,
      lean: async () => rows,
    };
    return chain;
  });
  return { find };
}

const live = (id, name) => ({ id, name, state: 'live' });

describe('cityEventIds', () => {
  it('keeps this city’s valid ids in order, once each', () => {
    expect(cityEventIds([
      { sourceTenantKey: 'toronto', eventId: ID(2) },
      { sourceTenantKey: 'montreal', eventId: ID(3) },
      { sourceTenantKey: 'Toronto', eventId: ID(1) },
      { sourceTenantKey: 'toronto', eventId: ID(2) },
      { sourceTenantKey: 'toronto', eventId: 'bad' },
      null,
    ], 'toronto')).toEqual([ID(2), ID(1)]);
  });
});

describe('listExploreThemeCarouselGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'toronto' } });
    tenantEventModel.mockResolvedValue({});
    describeCuratedEvents.mockImplementation(async (_Event, ids) =>
      ids.map((id) => live(id, `Event ${Number(id)}`)));
  });

  it('lists recent carousels and open drafts with this city’s events, newest first', async () => {
    const decks = model([{
      _id: 'deck1',
      name: 'Halloween weekend',
      accountId: 'acct1',
      sources: [
        { sourceTenantKey: 'toronto', eventId: ID(1) },
        { sourceTenantKey: 'montreal', eventId: ID(9) },
      ],
      updatedAt: new Date('2026-10-20T00:00:00Z'),
    }]);
    const drafts = model([{
      _id: 'draft1',
      theme: 'spooky picks',
      accountId: 'acct1',
      selected: [{ ref: { sourceTenantKey: 'toronto', eventId: ID(2) } }],
      updatedAt: new Date('2026-10-22T00:00:00Z'),
    }]);
    const accounts = model([{ _id: 'acct1', displayName: 'Just Go Toronto' }]);
    getGlobalModels.mockReturnValue({
      PivotCarouselDeck: decks,
      PivotCarouselCurationDraft: drafts,
      PivotCarouselAccount: accounts,
    });

    const { data } = await listExploreThemeCarouselGroups({}, 'toronto', {});

    expect(decks.find.mock.calls[0][0]).toMatchObject({
      'sources.sourceTenantKey': 'toronto',
      status: { $ne: 'archived' },
    });
    expect(drafts.find.mock.calls[0][0]).toMatchObject({ status: 'open' });
    expect(data.source).toBe('recent');
    expect(data.groups.map((group) => [group.id, group.label, group.detail])).toEqual([
      ['draft:draft1', 'spooky picks', 'Just Go Toronto · Draft'],
      ['issue:deck1', 'Halloween weekend', 'Just Go Toronto · Carousel'],
    ]);
    expect(data.groups[1].events).toEqual([live(ID(1), 'Event 1')]);
  });

  it('trims suggested groups to this city and drops ones too thin to help', async () => {
    getGlobalModels.mockReturnValue({ PivotCarouselAccount: model([{ _id: 'acct1' }]) });
    findSuggestedCurationGroups.mockResolvedValue({
      data: {
        groups: [
          {
            id: 'toronto:x',
            label: 'live music + jazz',
            signal: { label: 'Featured' },
            candidates: [
              { ref: { sourceTenantKey: 'toronto', eventId: ID(1) } },
              { ref: { sourceTenantKey: 'toronto', eventId: ID(2) } },
              { ref: { sourceTenantKey: 'montreal', eventId: ID(3) } },
            ],
          },
          {
            id: 'montreal:y',
            label: 'mostly elsewhere',
            signal: { label: 'Promoted' },
            candidates: [
              { ref: { sourceTenantKey: 'toronto', eventId: ID(4) } },
              { ref: { sourceTenantKey: 'montreal', eventId: ID(5) } },
            ],
          },
        ],
      },
    });

    const { data } = await listExploreThemeCarouselGroups({}, 'toronto', { source: 'suggested' });

    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({
      id: 'suggested:toronto:x',
      label: 'live music + jazz',
      detail: 'Starts from a featured event',
    });
    expect(data.groups[0].events.map((event) => event.id)).toEqual([ID(1), ID(2)]);
  });

  it('explains why there are no suggestions', async () => {
    getGlobalModels.mockReturnValue({ PivotCarouselAccount: model([]) });
    let result = await listExploreThemeCarouselGroups({}, 'toronto', { source: 'suggested' });
    expect(result.data.notice).toMatch(/No carousel account/);

    getGlobalModels.mockReturnValue({ PivotCarouselAccount: model([{ _id: 'acct1' }]) });
    findSuggestedCurationGroups.mockResolvedValue({ error: 'off', code: 'PROVIDER_UNAVAILABLE' });
    result = await listExploreThemeCarouselGroups({}, 'toronto', { source: 'suggested' });
    expect(result.data).toMatchObject({ groups: [], notice: expect.stringMatching(/turned off/) });
  });
});
