jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  upsertStoredTenantRow: jest.fn(),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const {
  getTenantByKey,
  upsertStoredTenantRow,
} = require('../../services/tenantConfigService');
const {
  PIVOT_CLIP_CONFIG_DEFAULTS,
  mergePivotClipConfig,
  validatePivotClipConfig,
} = require('../../utilities/pivotClipConfig');
const { normalizeTenantOverrides } = require('../../constants/defaultTenants');
const { getPivotClipDrop } = require('../../services/pivotClipDropService');
const {
  getTenantClipAdmin,
  updateTenantClipConfig,
  searchClipCandidateEvents,
} = require('../../services/pivotClipAdminService');

const ID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ID_C = 'cccccccccccccccccccccccc';
const ID_D = 'dddddddddddddddddddddddd';

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
const NOW = new Date('2026-08-20T21:00:00.000Z');
/** Thursday Aug 13 2026 18:00 America/New_York — the live week's drop. */
const DROP_AT = new Date('2026-08-13T22:00:00.000Z');

function catalogEvent(id, overrides = {}) {
  return {
    _id: id,
    name: `event ${id.slice(0, 1)}`,
    location: 'brooklyn',
    start_time: new Date('2026-09-04T23:00:00.000Z'),
    end_time: new Date('2026-09-05T03:00:00.000Z'),
    image: 'https://cdn.example/cover.jpg',
    ...overrides,
    customFields: {
      pivot: {
        ingestStatus: 'published',
        batchWeek: '2026-W36',
        host: { name: 'public records' },
        ...(overrides.pivot || {}),
      },
    },
  };
}

/**
 * Queries by `_id` answer from `byId` (published-only queries skip ids in
 * `unpublished`); week queries answer from `weekRows`.
 */
function mockEvents({ byId = {}, unpublished = [], weekRows = [], searchRows = [] } = {}) {
  const chain = (rows) => {
    const lean = jest.fn().mockResolvedValue(rows);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ lean, limit });
    const select = jest.fn().mockReturnValue({ sort, lean, limit });
    return { select, sort, lean, limit };
  };
  const find = jest.fn().mockImplementation((query) => {
    if (query._id?.$in) {
      const published = Boolean(query['customFields.pivot.ingestStatus']);
      const rows = query._id.$in
        .filter((id) => byId[id] && !(published && unpublished.includes(id)))
        .map((id) => byId[id]);
      return chain(rows);
    }
    if (query['customFields.pivot.batchWeek']) return chain(weekRows);
    return chain(searchRows);
  });
  getModels.mockReturnValue({ Event: { find } });
  return find;
}

beforeEach(() => {
  jest.clearAllMocks();
  connectToDatabase.mockResolvedValue({ models: {} });
});

describe('pivotClipConfig', () => {
  it('fills defaults and keeps the pinned order, deduped', () => {
    expect(validatePivotClipConfig({ deckSource: 'custom', curatedEventIds: [ID_B, ID_A, ID_B] }))
      .toEqual({
        config: {
          ...PIVOT_CLIP_CONFIG_DEFAULTS,
          deckSource: 'custom',
          curatedEventIds: [ID_B, ID_A],
        },
      });
  });

  it('rejects bad values', () => {
    expect(validatePivotClipConfig({ deckSource: 'random' }).error).toMatch(/deckSource/);
    expect(validatePivotClipConfig({ cardLimit: 0 }).error).toMatch(/cardLimit/);
    expect(validatePivotClipConfig({ cardLimit: 99 }).error).toMatch(/cardLimit/);
    expect(validatePivotClipConfig({ hidePastEvents: 'yes' }).error).toMatch(/hidePastEvents/);
    expect(validatePivotClipConfig({ curatedEventIds: ['nope'] }).error).toMatch(/invalid event id/);
    expect(validatePivotClipConfig([]).error).toMatch(/object/);
  });

  it('reads a missing or invalid stored value as the defaults', () => {
    expect(mergePivotClipConfig(undefined)).toEqual({ ...PIVOT_CLIP_CONFIG_DEFAULTS, curatedEventIds: [] });
    expect(mergePivotClipConfig({ deckSource: 'random' }).deckSource).toBe('week');
    // Mongoose may hand back nulls for unset fields.
    expect(mergePivotClipConfig({ deckSource: 'custom', cardLimit: null }).cardLimit).toBe(12);
  });

  it('survives the tenant override normalizer, and a bad value drops only itself', () => {
    const [ok] = normalizeTenantOverrides([
      { tenantKey: 'nyc', pivotClipConfig: { deckSource: 'custom', curatedEventIds: [ID_A] } },
    ]);
    expect(ok.pivotClipConfig).toMatchObject({ deckSource: 'custom', curatedEventIds: [ID_A] });

    const [kept] = normalizeTenantOverrides([
      { tenantKey: 'nyc', location: 'NYC', pivotClipConfig: { deckSource: 'random' } },
    ]);
    expect(kept).toEqual({ tenantKey: 'nyc', location: 'NYC' });
  });
});

describe('getPivotClipDrop with a custom deck', () => {
  it('plays pinned cards from any week in the admin’s order, under the card limit', async () => {
    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      pivotClipConfig: { deckSource: 'custom', cardLimit: 2, curatedEventIds: [ID_C, ID_A, ID_B] },
    });
    mockEvents({
      byId: {
        [ID_A]: catalogEvent(ID_A),
        [ID_B]: catalogEvent(ID_B),
        [ID_C]: catalogEvent(ID_C, { pivot: { batchWeek: '2026-W40' } }),
      },
    });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });

    expect(result.data).toMatchObject({
      segment: 'custom',
      batchWeek: '2026-W33',
      liveWeek: '2026-W33',
      fallback: false,
      dropAt: DROP_AT.toISOString(),
    });
    expect(result.data.events.map((card) => card.id)).toEqual([ID_C, ID_A]);
  });

  it('skips ended and unpublished pins unless past events are kept', async () => {
    const ended = catalogEvent(ID_B, {
      start_time: new Date('2026-08-01T23:00:00.000Z'),
      end_time: new Date('2026-08-02T03:00:00.000Z'),
    });
    mockEvents({
      byId: { [ID_A]: catalogEvent(ID_A), [ID_B]: ended, [ID_C]: catalogEvent(ID_C) },
      unpublished: [ID_C],
    });

    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      pivotClipConfig: { deckSource: 'custom', curatedEventIds: [ID_A, ID_B, ID_C] },
    });
    let result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });
    expect(result.data.events.map((card) => card.id)).toEqual([ID_A]);

    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      pivotClipConfig: {
        deckSource: 'custom',
        hidePastEvents: false,
        curatedEventIds: [ID_A, ID_B, ID_C],
      },
    });
    result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });
    expect(result.data.events.map((card) => card.id)).toEqual([ID_A, ID_B]);
  });

  it('falls back to the week deck when no pin is playable, unless told not to', async () => {
    const weekCard = catalogEvent(ID_D, {
      start_time: new Date('2026-08-14T23:00:00.000Z'),
      end_time: new Date('2026-08-15T03:00:00.000Z'),
      pivot: { batchWeek: '2026-W33', clipDrop: true },
    });
    mockEvents({ weekRows: [weekCard] });

    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      pivotClipConfig: { deckSource: 'custom', curatedEventIds: [ID_A] },
    });
    let result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });
    expect(result.data.segment).toBe('clip');
    expect(result.data.events.map((card) => card.id)).toEqual([ID_D]);

    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      pivotClipConfig: { deckSource: 'custom', fallbackToWeek: false, curatedEventIds: [ID_A] },
    });
    result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });
    expect(result.data).toMatchObject({ segment: null, events: [], batchWeek: '2026-W33' });
  });

  it('applies the card limit to the week deck too', async () => {
    getTenantByKey.mockResolvedValue({ ...NYC_TENANT, pivotClipConfig: { cardLimit: 1 } });
    mockEvents({
      weekRows: [ID_A, ID_B].map((id, index) =>
        catalogEvent(id, {
          start_time: new Date(Date.UTC(2026, 7, 14, 23, index)),
          end_time: new Date(Date.UTC(2026, 7, 15, 3, index)),
          pivot: { batchWeek: '2026-W33', clipDrop: true },
        })),
    });

    const result = await getPivotClipDrop({}, { tenantKey: 'nyc', now: NOW });
    expect(result.data.events).toHaveLength(1);
  });
});

describe('pivotClipAdminService', () => {
  it('describes each pin’s state and previews the deck, even for a closed city', async () => {
    getTenantByKey.mockResolvedValue({
      ...NYC_TENANT,
      status: 'coming_soon',
      pivotClipConfig: { deckSource: 'custom', curatedEventIds: [ID_A, ID_B, ID_C, ID_D] },
    });
    mockEvents({
      byId: {
        [ID_A]: catalogEvent(ID_A),
        [ID_B]: catalogEvent(ID_B, {
          start_time: new Date('2026-08-01T23:00:00.000Z'),
          end_time: new Date('2026-08-02T03:00:00.000Z'),
        }),
        [ID_C]: catalogEvent(ID_C),
      },
      unpublished: [ID_C],
    });

    const result = await getTenantClipAdmin({}, { tenantKey: 'nyc', now: NOW });

    expect(result.data.cityStatus).toBe('coming_soon');
    expect(result.data.curated.map((row) => [row.id, row.state])).toEqual([
      [ID_A, 'live'],
      [ID_B, 'ended'],
      [ID_C, 'unpublished'],
      [ID_D, 'missing'],
    ]);
    expect(result.data.curated[0]).toMatchObject({
      name: 'event a',
      hostName: 'public records',
      batchWeek: '2026-W36',
    });
    expect(result.data.preview).toMatchObject({ segment: 'custom', liveWeek: '2026-W33' });
    expect(result.data.preview.events.map((card) => card.id)).toEqual([ID_A]);
    expect(result.data.preview).not.toHaveProperty('copy');
  });

  it('404s cities that are not Just Go', async () => {
    getTenantByKey.mockResolvedValue({ tenantKey: 'rpi', tenantType: 'campus' });
    await expect(getTenantClipAdmin({}, { tenantKey: 'rpi' })).resolves.toMatchObject({
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });
  });

  it('validates and stores the whole config', async () => {
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    mockEvents();

    const bad = await updateTenantClipConfig({}, { tenantKey: 'nyc', config: { cardLimit: 0 } });
    expect(bad).toMatchObject({ status: 400, code: 'INVALID_CLIP_CONFIG' });
    expect(upsertStoredTenantRow).not.toHaveBeenCalled();

    await updateTenantClipConfig(
      { user: { globalUserId: 'admin-1' } },
      { tenantKey: 'nyc', config: { deckSource: 'custom', curatedEventIds: [ID_A] }, now: NOW },
    );
    expect(upsertStoredTenantRow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantKey: 'nyc',
        pivotClipConfig: {
          ...PIVOT_CLIP_CONFIG_DEFAULTS,
          deckSource: 'custom',
          curatedEventIds: [ID_A],
        },
      }),
      'admin-1',
    );
  });

  it('searches published cards across weeks with an escaped name match', async () => {
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    const find = mockEvents({ searchRows: [catalogEvent(ID_A)] });

    const result = await searchClipCandidateEvents({}, { tenantKey: 'nyc', q: 'a.b', now: NOW });

    const query = find.mock.calls[0][0];
    expect(query).not.toHaveProperty(['customFields.pivot.batchWeek']);
    expect(query['customFields.pivot.ingestStatus']).toBeDefined();
    expect(query.name.$regex.source).toBe('a\\.b');
    expect(query.$or).toBeDefined();
    expect(result.data.events).toEqual([
      expect.objectContaining({ id: ID_A, state: 'live', batchWeek: '2026-W36' }),
    ]);

    await searchClipCandidateEvents({}, { tenantKey: 'nyc', includePast: 'true', now: NOW });
    expect(find.mock.calls[1][0]).not.toHaveProperty('$or');
  });
});
