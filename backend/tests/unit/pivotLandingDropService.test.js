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
  getPivotLandingDrop,
  buildFeaturedLandingQuery,
  LANDING_DROP_LIMIT,
} = require('../../services/pivotLandingDropService');

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

/** Sunday Aug 16 2026 — after Thursday's drop, mid-week for ISO 2026-W33. */
const WALL_CLOCK = new Date('2026-08-16T20:00:00.000Z');
/** Thursday Aug 13 2026 18:00 America/New_York (EDT). */
const DROP_AT = new Date('2026-08-13T22:00:00.000Z');
/** Thursday Aug 6 2026 18:00 America/New_York (EDT) — previous week. */
const PREV_DROP_AT = new Date('2026-08-06T22:00:00.000Z');

function catalogEvent(overrides = {}) {
  const id = overrides._id || `event-${Math.random().toString(16).slice(2)}`;
  return {
    _id: id,
    name: 'warehouse show',
    description: 'secret afters and a ticket link you should never see',
    location: 'brooklyn',
    start_time: new Date('2026-08-14T23:00:00.000Z'),
    end_time: new Date('2026-08-15T03:00:00.000Z'),
    externalLink: 'https://partiful.com/e/secret',
    image: 'https://cdn.example/cover.jpg',
    customFields: {
      pivot: {
        ingestStatus: 'published',
        featured: true,
        batchWeek: '2026-W33',
        host: { name: 'public records' },
        tags: ['live-music'],
      },
    },
    ...overrides,
    customFields: {
      pivot: {
        ingestStatus: 'published',
        featured: true,
        batchWeek: '2026-W33',
        host: { name: 'public records' },
        tags: ['live-music'],
        ...(overrides.customFields?.pivot || {}),
      },
    },
  };
}

function mockEventFindByWeek(rowsByWeek) {
  const find = jest.fn().mockImplementation((query) => {
    const week = query['customFields.pivot.batchWeek'];
    const rows = rowsByWeek[week] || [];
    const lean = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort, lean });
    return { select, sort, lean };
  });
  getModels.mockReturnValue({ Event: { find } });
  return find;
}

describe('getPivotLandingDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({ models: {} });
    getTenantByKey.mockResolvedValue(NYC_TENANT);
  });

  it('requires a tenant key', async () => {
    const result = await getPivotLandingDrop({}, {});
    expect(result).toMatchObject({
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects unknown and non-pivot cities', async () => {
    getTenantByKey.mockResolvedValueOnce(null);
    await expect(getPivotLandingDrop({}, { tenantKey: 'missing' })).resolves.toMatchObject({
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });

    getTenantByKey.mockResolvedValueOnce({
      tenantKey: 'rpi',
      tenantType: 'campus',
      status: 'active',
    });
    await expect(getPivotLandingDrop({}, { tenantKey: 'rpi' })).resolves.toMatchObject({
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    });
  });

  it('ranks featured live-week cards at drop time and caps at 4', async () => {
    const friday = catalogEvent({
      _id: 'fri',
      name: 'friday night market',
      start_time: new Date('2026-08-14T23:00:00.000Z'),
      end_time: new Date('2026-08-15T03:00:00.000Z'),
    });
    const saturday = catalogEvent({
      _id: 'sat',
      name: 'saturday warehouse',
      start_time: new Date('2026-08-16T02:00:00.000Z'),
      end_time: new Date('2026-08-16T06:00:00.000Z'),
    });
    const sunday = catalogEvent({
      _id: 'sun',
      name: 'sunday matinee',
      start_time: new Date('2026-08-16T18:00:00.000Z'),
      end_time: new Date('2026-08-16T21:00:00.000Z'),
    });
    const monday = catalogEvent({
      _id: 'mon',
      name: 'monday film',
      start_time: new Date('2026-08-18T00:00:00.000Z'),
      end_time: new Date('2026-08-18T03:00:00.000Z'),
    });
    const tuesday = catalogEvent({
      _id: 'tue',
      name: 'tuesday fifth card',
      start_time: new Date('2026-08-19T00:00:00.000Z'),
      end_time: new Date('2026-08-19T03:00:00.000Z'),
    });
    const beforeDrop = catalogEvent({
      _id: 'wed',
      name: 'wednesday already over',
      start_time: new Date('2026-08-12T23:00:00.000Z'),
      end_time: new Date('2026-08-13T02:00:00.000Z'),
    });
    const noHost = catalogEvent({
      _id: 'ghost',
      name: 'no host',
      customFields: { pivot: { host: { name: '' }, tags: [] } },
    });

    const find = mockEventFindByWeek({
      '2026-W33': [friday, saturday, sunday, monday, tuesday, beforeDrop, noHost],
    });

    const result = await getPivotLandingDrop(
      { globalDb: {} },
      { tenantKey: 'nyc', now: WALL_CLOCK },
    );

    expect(connectToDatabase).toHaveBeenCalledWith('nyc');
    expect(find).toHaveBeenCalledWith(buildFeaturedLandingQuery('2026-W33', DROP_AT));
    expect(buildFeaturedLandingQuery('2026-W33', DROP_AT)).toEqual({
      ...buildPublishedCatalogQuery('2026-W33', DROP_AT),
      'customFields.pivot.featured': true,
    });
    expect(result.data.batchWeek).toBe('2026-W33');
    expect(result.data.liveWeek).toBe('2026-W33');
    expect(result.data.fallback).toBe(false);
    expect(result.data.dropAt).toBe(DROP_AT.toISOString());
    expect(result.data.events).toHaveLength(LANDING_DROP_LIMIT);
    expect(result.data.events.map((card) => card.id)).toEqual(['fri', 'sat', 'sun', 'mon']);
    expect(result.data.events.map((card) => card.name)).not.toContain('tuesday fifth card');
    expect(result.data.events.map((card) => card.name)).not.toContain('wednesday already over');

    const fridayCard = result.data.events[0];
    expect(fridayCard).toMatchObject({
      id: 'fri',
      name: 'friday night market',
      hostName: 'public records',
      location: 'brooklyn',
      tag: 'live-music',
      coverImageUrl: 'https://cdn.example/cover.jpg',
    });
    expect(fridayCard).not.toHaveProperty('description');
    expect(fridayCard).not.toHaveProperty('externalLink');
    expect(fridayCard).not.toHaveProperty('featured');
    expect(Object.keys(fridayCard).sort()).toEqual(
      ['coverImageUrl', 'hostName', 'id', 'location', 'name', 'startTime', 'tag'].sort(),
    );
  });

  it('falls back to last week’s featured segment when this week has none', async () => {
    const lastWeek = catalogEvent({
      _id: 'prev-fri',
      name: 'last friday market',
      start_time: new Date('2026-08-07T23:00:00.000Z'),
      end_time: new Date('2026-08-08T03:00:00.000Z'),
      customFields: { pivot: { batchWeek: '2026-W32' } },
    });
    const find = mockEventFindByWeek({
      '2026-W33': [],
      '2026-W32': [lastWeek],
    });

    const result = await getPivotLandingDrop(
      { globalDb: {} },
      { tenantKey: 'nyc', now: WALL_CLOCK },
    );

    expect(find).toHaveBeenCalledWith(buildFeaturedLandingQuery('2026-W33', DROP_AT));
    expect(find).toHaveBeenCalledWith(buildFeaturedLandingQuery('2026-W32', PREV_DROP_AT));
    expect(result.data.fallback).toBe(true);
    expect(result.data.liveWeek).toBe('2026-W33');
    expect(result.data.batchWeek).toBe('2026-W32');
    expect(result.data.events.map((card) => card.id)).toEqual(['prev-fri']);
  });

  it('does not fall back when this week has a featured segment', async () => {
    const thisWeek = catalogEvent({
      _id: 'fri',
      name: 'friday night market',
    });
    const lastWeek = catalogEvent({
      _id: 'prev-fri',
      name: 'last friday market',
      customFields: { pivot: { batchWeek: '2026-W32' } },
    });
    const find = mockEventFindByWeek({
      '2026-W33': [thisWeek],
      '2026-W32': [lastWeek],
    });

    const result = await getPivotLandingDrop(
      { globalDb: {} },
      { tenantKey: 'nyc', now: WALL_CLOCK },
    );

    expect(find).toHaveBeenCalledTimes(1);
    expect(result.data.fallback).toBe(false);
    expect(result.data.events.map((card) => card.id)).toEqual(['fri']);
  });
});
