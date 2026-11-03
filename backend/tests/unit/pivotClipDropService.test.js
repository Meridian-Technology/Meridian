jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { buildPublishedCatalogQuery } = require('../../services/pivotFeedService');
const {
  getPivotClipDrop,
  getPivotCityWeekCounts,
  buildClipDropQuery,
  CLIP_DROP_LIMIT,
  CLIP_EVENT_FIELDS,
} = require('../../services/pivotClipDropService');

const NYC_TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  status: 'active',
  location: 'New York City',
  pivotDropTimezone: 'America/New_York',
  pivotDropDayOfWeek: 4,
  pivotDropHour: 18,
  pivotDropMinute: 0,
};

/** Thursday Aug 20 2026 17:00 EDT — an hour before the next drop. */
const HOUR_BEFORE_NEXT_DROP = new Date('2026-08-20T21:00:00.000Z');
/** Thursday Aug 13 2026 18:00 America/New_York (EDT). */
const DROP_AT = new Date('2026-08-13T22:00:00.000Z');
/** Thursday Aug 20 2026 18:00 America/New_York (EDT). */
const NEXT_DROP_AT = new Date('2026-08-20T22:00:00.000Z');

function catalogEvent(overrides = {}) {
  const pivot = {
    ingestStatus: 'published',
    clipDrop: true,
    featured: false,
    batchWeek: '2026-W33',
    host: { name: 'public records' },
    tags: ['live-music', 'late-night'],
    ...(overrides.customFields?.pivot || {}),
  };
  return {
    _id: overrides._id || `event-${Math.random().toString(16).slice(2)}`,
    name: 'warehouse show',
    description: 'doors at nine, bring cash',
    location: 'brooklyn',
    start_time: new Date('2026-08-14T23:00:00.000Z'),
    end_time: new Date('2026-08-15T03:00:00.000Z'),
    externalLink: 'https://partiful.com/e/secret',
    image: 'https://cdn.example/cover.jpg',
    ...overrides,
    customFields: { pivot },
  };
}

/** Rows keyed by `${batchWeek}:${segment}` where segment is clip or featured. */
function mockEventFindBySegment(rowsBySegment) {
  const find = jest.fn().mockImplementation((query) => {
    const week = query['customFields.pivot.batchWeek'];
    const segment = query['customFields.pivot.clipDrop'] ? 'clip' : 'featured';
    const rows = rowsBySegment[`${week}:${segment}`] || [];
    const lean = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort, lean });
    return { select, sort, lean };
  });
  getModels.mockReturnValue({ Event: { find } });
  return find;
}

describe('getPivotClipDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({ models: {} });
    getTenantByKey.mockResolvedValue(NYC_TENANT);
  });

  it('shares the landing city checks', async () => {
    await expect(getPivotClipDrop({}, {})).resolves.toMatchObject({
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    });

    getTenantByKey.mockResolvedValueOnce({ ...NYC_TENANT, status: 'waitlist' });
    await expect(getPivotClipDrop({}, { tenantKey: 'nyc' })).resolves.toMatchObject({
      status: 403,
      code: 'TENANT_NOT_ACTIVE',
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it('plays the whole live week an hour before the next drop', async () => {
    const friday = catalogEvent({ _id: 'fri', name: 'friday market' });
    const monday = catalogEvent({
      _id: 'mon',
      name: 'monday film',
      start_time: new Date('2026-08-18T00:00:00.000Z'),
      end_time: new Date('2026-08-18T03:00:00.000Z'),
    });
    const find = mockEventFindBySegment({ '2026-W33:clip': [friday, monday] });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });

    expect(find).toHaveBeenCalledWith(buildClipDropQuery('2026-W33', DROP_AT));
    expect(buildClipDropQuery('2026-W33', DROP_AT)).toEqual({
      ...buildPublishedCatalogQuery('2026-W33', DROP_AT),
      'customFields.pivot.clipDrop': true,
    });
    expect(result.data).toMatchObject({
      liveWeek: '2026-W33',
      batchWeek: '2026-W33',
      fallback: false,
      segment: 'clip',
      dropAt: DROP_AT.toISOString(),
      nextDropAt: NEXT_DROP_AT.toISOString(),
    });
    // Both already happened by wall-clock time; they still play as of the drop.
    expect(result.data.events.map((card) => card.id).sort()).toEqual(['fri', 'mon']);
  });

  it('serializes deck fields without ticket links or curation flags', async () => {
    mockEventFindBySegment({ '2026-W33:clip': [catalogEvent({ _id: 'fri' })] });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    const card = result.data.events[0];

    expect(card).toMatchObject({
      id: 'fri',
      hostName: 'public records',
      description: 'doors at nine, bring cash',
      tags: ['live-music', 'late-night'],
      tag: 'live-music',
      coverImageUrl: 'https://cdn.example/cover.jpg',
    });
    expect(card.endTime).toEqual(new Date('2026-08-15T03:00:00.000Z'));
    expect(card).not.toHaveProperty('externalLink');
    expect(card).not.toHaveProperty('clipDrop');
    expect(card).not.toHaveProperty('featured');
    expect(CLIP_EVENT_FIELDS).not.toContain('externalLink');
  });

  it('carries details, movie, and showtimes for the detail sheet', async () => {
    mockEventFindBySegment({
      '2026-W33:clip': [
        catalogEvent({
          _id: 'film',
          customFields: {
            pivot: {
              details: {
                version: 1,
                admission: 'paid',
                priceRange: { min: { amountMinor: 1500, currency: 'USD' } },
              },
              movie: { tmdbId: 655, title: 'Paris, Texas', runtimeMinutes: 145 },
              timeSlots: [
                { id: 'early', start_time: '2026-08-14T23:00:00.000Z' },
              ],
            },
          },
        }),
        catalogEvent({ _id: 'plain', start_time: new Date('2026-08-15T23:00:00.000Z') }),
      ],
    });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    const film = result.data.events.find((card) => card.id === 'film');
    const plain = result.data.events.find((card) => card.id === 'plain');

    expect(film.details).toMatchObject({
      admission: 'paid',
      priceRange: { min: { amountMinor: 1500, currency: 'USD' } },
    });
    expect(film.movie).toMatchObject({ title: 'Paris, Texas', runtimeMinutes: 145 });
    expect(film.timeSlots).toEqual([
      expect.objectContaining({ id: 'early', start_time: '2026-08-14T23:00:00.000Z' }),
    ]);
    expect(plain).not.toHaveProperty('details');
    expect(plain).not.toHaveProperty('movie');
    expect(plain).not.toHaveProperty('timeSlots');
  });

  it('carries an empty Voice overlay when copy is unavailable', async () => {
    mockEventFindBySegment({ '2026-W33:clip': [catalogEvent({ _id: 'fri' })] });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });

    expect(result.data.copy).toEqual({
      revision: 'p0:t0',
      schemaVersion: 1,
      tokens: {},
      entries: {},
    });
  });

  it('caps the deck', async () => {
    const rows = Array.from({ length: CLIP_DROP_LIMIT + 3 }, (_, index) =>
      catalogEvent({
        _id: `e${index}`,
        name: `event ${index}`,
        start_time: new Date(Date.UTC(2026, 7, 14, 23, index)),
      }));
    mockEventFindBySegment({ '2026-W33:clip': rows });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    expect(result.data.events).toHaveLength(CLIP_DROP_LIMIT);
  });

  it('falls back to this week’s featured cards before last week', async () => {
    const featured = catalogEvent({
      _id: 'feat',
      customFields: { pivot: { clipDrop: false, featured: true } },
    });
    const lastWeekClip = catalogEvent({
      _id: 'prev',
      customFields: { pivot: { batchWeek: '2026-W32' } },
    });
    mockEventFindBySegment({
      '2026-W33:featured': [featured],
      '2026-W32:clip': [lastWeekClip],
    });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    expect(result.data.segment).toBe('featured');
    expect(result.data.fallback).toBe(false);
    expect(result.data.events.map((card) => card.id)).toEqual(['feat']);
  });

  it('falls back to last week when this week has nothing curated', async () => {
    const lastWeekClip = catalogEvent({
      _id: 'prev',
      start_time: new Date('2026-08-07T23:00:00.000Z'),
      end_time: new Date('2026-08-08T03:00:00.000Z'),
      customFields: { pivot: { batchWeek: '2026-W32' } },
    });
    mockEventFindBySegment({ '2026-W32:clip': [lastWeekClip] });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    expect(result.data).toMatchObject({
      liveWeek: '2026-W33',
      batchWeek: '2026-W32',
      fallback: true,
      segment: 'clip',
    });
    expect(result.data.events.map((card) => card.id)).toEqual(['prev']);
  });

  it('returns an empty deck, not an error, when nothing is curated', async () => {
    mockEventFindBySegment({});

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    expect(result.data).toMatchObject({
      batchWeek: '2026-W33',
      segment: null,
      events: [],
      dropAt: DROP_AT.toISOString(),
    });
  });
});

describe('getPivotCityWeekCounts', () => {
  function mockWeekEvents(rows) {
    const lean = jest.fn().mockResolvedValue(rows);
    const select = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ select });
    getModels.mockReturnValue({ Event: { find } });
    return { find, select };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({});
    getTenantByKey.mockResolvedValue(NYC_TENANT);
  });

  it("counts the whole week and the sites it came from, curated or not", async () => {
    const { find, select } = mockWeekEvents([
      { customFields: { pivot: { sourceUrl: 'https://partiful.com/e/a', source: 'partiful' } } },
      { customFields: { pivot: { sourceUrl: 'https://www.partiful.com/e/b' } } },
      { customFields: { pivot: { sourceUrl: 'https://lu.ma/c' } } },
      { customFields: { pivot: { source: 'eventbrite' } } },
      { customFields: { pivot: {} } },
    ]);
    const result = await getPivotCityWeekCounts({}, { tenantKey: 'nyc', now: HOUR_BEFORE_NEXT_DROP });
    expect(result.data).toEqual({
      tenantKey: 'nyc',
      batchWeek: '2026-W33',
      eventCount: 5,
      sourceCount: 3,
    });
    const query = find.mock.calls[0][0];
    expect(query.isDeleted).toEqual({ $ne: true });
    expect(query['customFields.pivot.ingestStatus']).toBeUndefined();
    // The live week's drop cycle: Thursday drop to the next Thursday.
    expect(query.$or[0].start_time.$gte.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    expect(query.$or[0].start_time.$lt.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    // Counts only: no event fields leave the server.
    expect(select).toHaveBeenCalledWith('customFields.pivot.sourceUrl customFields.pivot.source');
  });

  it('shares the public city checks', async () => {
    const missing = await getPivotCityWeekCounts({}, {});
    expect(missing.status).toBe(400);
    getTenantByKey.mockResolvedValue(null);
    const unknown = await getPivotCityWeekCounts({}, { tenantKey: 'nowhere' });
    expect(unknown.status).toBe(404);
  });
});
