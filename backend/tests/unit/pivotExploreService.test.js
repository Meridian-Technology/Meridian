jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));
jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
  normalizePivotTagSlugs: jest.requireActual('../../services/pivotTagCatalogService')
    .normalizePivotTagSlugs,
  validatePivotEventTags: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  listPivotTags,
  validatePivotEventTags,
} = require('../../services/pivotTagCatalogService');
const { getFeedPilotWindowFilter } = require('../../services/pivotFeedService');
const {
  getPivotExplore,
  normalizeExploreLimit,
  normalizeExploreOffset,
  normalizeExploreNight,
  normalizeExploreSort,
  compareByStartTime,
  eventMatchesNight,
  eventMatchesQuery,
  buildExploreRails,
  resolveExploreUserIntent,
  shouldExcludePassedExploreEvent,
  EXPLORE_INTENT_BADGE_PRIORITY,
  DEFAULT_EXPLORE_LIMIT,
  DEFAULT_EXPLORE_SORT,
} = require('../../services/pivotExploreService');

const CATALOG_TAGS = [
  { slug: 'live-music', label: 'live music' },
  { slug: 'board-games', label: 'board games' },
];

function mockUserModel(friendUsers = [], pivotInterestTags = []) {
  return {
    findById: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ pivotInterestTags }),
    })),
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(friendUsers),
    })),
  };
}

function mockUniversalFeedbackModel(rows = []) {
  return {
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    })),
  };
}

function withExploreModels(partial = {}) {
  return {
    UniversalFeedback: mockUniversalFeedbackModel(),
    ...partial,
  };
}

function mockEventFind(events) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(events),
  };
}

function mockIntentFind(rows = []) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

function setupCatalogMocks() {
  listPivotTags.mockResolvedValue({ data: { tags: CATALOG_TAGS } });
  validatePivotEventTags.mockImplementation(async (_req, tags, options = {}) => {
    const normalized = Array.isArray(tags) ? tags : [];
    if (options.required !== false && normalized.length === 0) {
      return {
        error: 'At least one catalog tag is required.',
        status: 400,
        code: 'TAGS_REQUIRED',
      };
    }
    if (!normalized.length) {
      return { tags: [] };
    }

    const known = new Set(CATALOG_TAGS.map((row) => row.slug));
    const unknown = normalized.filter((slug) => !known.has(slug));
    if (unknown.length) {
      return {
        error: `Unknown catalog tag(s): ${unknown.join(', ')}`,
        status: 400,
        code: 'INVALID_TAG',
      };
    }

    return { tags: normalized };
  });
}

function mockExploreModels(events, intentRows = []) {
  const intentFind = jest.fn(() => mockIntentFind(intentRows));

  getModels.mockReturnValue(withExploreModels({
    Event: { find: jest.fn(() => mockEventFind(events)) },
    Friendship: {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      })),
    },
    PivotEventIntent: { find: intentFind },
    User: mockUserModel(),
  }));

  return { intentFind };
}

describe('pivotExploreService filter helpers', () => {
  it('normalizeExploreNight accepts weekday shortcuts and ISO dates', () => {
    expect(normalizeExploreNight('fri')).toBe('fri');
    expect(normalizeExploreNight('2026-05-29')).toBe('2026-05-29');
    expect(normalizeExploreNight('monday')).toBeUndefined();
  });

  it('eventMatchesNight matches local weekday in tenant timezone', () => {
    const event = {
      start_time: new Date('2026-05-29T23:00:00.000Z'),
      customFields: { pivot: {} },
    };

    expect(eventMatchesNight(event, 'fri', 'America/New_York')).toBe(true);
    expect(eventMatchesNight(event, 'sat', 'America/New_York')).toBe(false);
  });

  it('eventMatchesQuery searches name, description, host, and enrichment', () => {
    const event = {
      name: 'Sunset Listening Party',
      description: 'Roof records',
      customFields: {
        pivot: {
          host: { name: 'Roof Records' },
          enrichment: {
            vibe: ['intimate'],
            neighborhood: 'williamsburg',
          },
        },
      },
    };

    expect(eventMatchesQuery(event, 'roof')).toBe(true);
    expect(eventMatchesQuery(event, 'sunset')).toBe(true);
    expect(eventMatchesQuery(event, 'williamsburg')).toBe(true);
    expect(eventMatchesQuery(event, 'intimate')).toBe(true);
    expect(eventMatchesQuery(event, 'missing')).toBe(false);
  });

  it('buildExploreRails includes standard rails and interest-matched week tag rails', () => {
    const rails = buildExploreRails(
      CATALOG_TAGS,
      [
        {
          customFields: {
            pivot: { tags: ['live-music', 'board-games'] },
          },
        },
      ],
      new Set(['live-music']),
    );

    expect(rails).toEqual([
      { id: 'friends', title: 'friends going', retrieval: 'friends_rail' },
      { id: 'tonight', title: 'tonight', retrieval: 'filter' },
      { id: 'for_you', title: 'for you later', retrieval: 'for_you_rail' },
      { id: 'tag:live-music', title: 'live music', retrieval: 'tag_rail' },
    ]);
  });

  it('resolveExploreUserIntent returns only explore intent statuses', () => {
    expect(resolveExploreUserIntent({ status: 'registered' })).toBe('registered');
    expect(resolveExploreUserIntent({ status: 'interested' })).toBe('interested');
    expect(resolveExploreUserIntent({ status: 'passed' })).toBe('passed');
    expect(resolveExploreUserIntent({ status: 'unknown' })).toBeNull();
    expect(resolveExploreUserIntent(undefined)).toBeNull();
  });

  it('shouldExcludePassedExploreEvent respects excludePassed toggle', () => {
    const userIntents = new Map([
      ['1', { status: 'passed' }],
      ['2', { status: 'interested' }],
    ]);

    expect(
      shouldExcludePassedExploreEvent({ _id: '1' }, userIntents, true),
    ).toBe(true);
    expect(
      shouldExcludePassedExploreEvent({ _id: '1' }, userIntents, false),
    ).toBe(false);
    expect(
      shouldExcludePassedExploreEvent({ _id: '2' }, userIntents, true),
    ).toBe(false);
  });
});

describe('pivotExploreService pagination helpers', () => {
  it('normalizeExploreLimit defaults to 40', () => {
    expect(normalizeExploreLimit(undefined)).toBe(DEFAULT_EXPLORE_LIMIT);
    expect(normalizeExploreLimit('')).toBe(DEFAULT_EXPLORE_LIMIT);
  });

  it('normalizeExploreLimit rejects invalid values', () => {
    expect(normalizeExploreLimit('0')).toBeNull();
    expect(normalizeExploreLimit('-1')).toBeNull();
    expect(normalizeExploreLimit('abc')).toBeNull();
  });

  it('normalizeExploreOffset defaults to 0', () => {
    expect(normalizeExploreOffset(undefined)).toBe(0);
  });

  it('normalizeExploreOffset rejects negative values', () => {
    expect(normalizeExploreOffset('-1')).toBeNull();
  });
});

describe('getPivotExplore', () => {
  const userId = '507f191e810c19729de860eb';
  const req = { user: { userId }, school: 'nyc', globalDb: {} };
  const now = new Date('2026-05-26T12:00:00.000Z');

  beforeEach(() => {
    getModels.mockReset();
    getTenantByKey.mockReset();
    listPivotTags.mockReset();
    validatePivotEventTags.mockReset();
    setupCatalogMocks();
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      name: 'New York City Pilot',
      location: 'Brooklyn',
      pivotPilot: true,
    });
  });

  it('returns published pivot events with displayHost and total count', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Friday Night Board Games',
        description: 'BYOB',
        location: 'Brooklyn',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        end_time: new Date('2026-05-28T23:00:00.000Z'),
        externalLink: 'https://partiful.com/e/example',
        type: 'social',
        registrationCount: 12,
        hostingId: '665a00000000000000000001',
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Brooklyn Board Game Cafe' },
            tags: ['board-games'],
          },
        },
      },
    ];

    const Event = { find: jest.fn(() => mockEventFind(events)) };
    getModels.mockReturnValue(withExploreModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, { batchWeek: '2026-W22', now });

    expect(result.data.batchWeek).toBe('2026-W22');
    expect(result.data.cityDisplayName).toBe('Brooklyn');
    expect(result.data.total).toBe(1);
    expect(result.data.limit).toBe(DEFAULT_EXPLORE_LIMIT);
    expect(result.data.offset).toBe(0);
    expect(result.data.filters).toEqual({
      tags: [],
      night: null,
      friendsOnly: false,
      excludePassed: true,
      q: null,
      sort: DEFAULT_EXPLORE_SORT,
    });
    expect(result.data.rails.map((rail) => rail.id)).toEqual([
      'friends',
      'tonight',
      'for_you',
      'tag:board-games',
    ]);
    expect(result.data.intentBadgePriority).toEqual(EXPLORE_INTENT_BADGE_PRIORITY);
    expect(result.data.sectionsSource).toBe('rules_v0');
    expect(result.data.sections).toEqual([]);
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].displayHost).toEqual({
      name: 'Brooklyn Board Game Cafe',
    });
    expect(result.data.events[0].userIntent).toBeNull();
    expect(result.data.events[0]).not.toHaveProperty('hostingId');
    expect(result.data.events[0]).not.toHaveProperty('rankInFeed');
    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': '2026-W22',
        'customFields.pivot.ingestStatus': 'published',
        status: { $in: ['approved', 'not-applicable'] },
        ...getFeedPilotWindowFilter(now),
      }),
    );
  });

  it('queries only published ingestStatus for the requested batchWeek', async () => {
    const Event = { find: jest.fn(() => mockEventFind([])) };
    getModels.mockReturnValue(withExploreModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    await getPivotExplore(req, { batchWeek: '2026-W22', now });

    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': '2026-W22',
        'customFields.pivot.ingestStatus': 'published',
      }),
    );
  });

  it('excludes events that have already ended', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Past Party',
        start_time: new Date('2026-05-25T19:00:00.000Z'),
        end_time: new Date('2026-05-25T23:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Past Venue' },
          },
        },
      },
      {
        _id: '665a1b2c3d4e5f6789012346',
        name: 'Upcoming Party',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        end_time: new Date('2026-05-28T23:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Future Venue' },
          },
        },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, { batchWeek: '2026-W22', now });

    expect(result.data.total).toBe(1);
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Upcoming Party');
  });

  it('sorts by friends going then friends interested then start_time', async () => {
    const friendId = '507f191e810c19729de860ec';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'No Friends (popular)',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        registrationCount: 50,
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Friend Interested',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        registrationCount: 5,
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
      {
        _id: '665a000000000000000000c3',
        name: 'Friend Registered',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        registrationCount: 1,
        customFields: { pivot: { host: { name: 'Venue C' } } },
      },
    ];

    const PivotEventIntent = {
      find: jest.fn((query) => {
        const isFriendQuery = query.userId && query.userId.$in;
        const rows = isFriendQuery
          ? [
              {
                eventId: '665a000000000000000000b2',
                userId: friendId,
                status: 'interested',
              },
              {
                eventId: '665a000000000000000000c3',
                userId: friendId,
                status: 'registered',
              },
            ]
          : [];
        return mockIntentFind(rows);
      }),
    };

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { requester: userId, recipient: friendId },
          ]),
        })),
      },
      PivotEventIntent,
      User: mockUserModel([{ _id: friendId, name: 'Pat', picture: null }]),
    }));

    const result = await getPivotExplore(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Friend Registered',
      'Friend Interested',
      'No Friends (popular)',
    ]);
    expect(result.data.total).toBe(3);
  });

  it('paginates with limit and offset', async () => {
    const events = Array.from({ length: 5 }, (_value, index) => ({
      _id: `665a0000000000000000000${index}`,
      name: `Event ${index}`,
      start_time: new Date(`2026-05-28T${10 + index}:00:00.000Z`),
      customFields: {
        pivot: {
          batchWeek: '2026-W22',
          ingestStatus: 'published',
          host: { name: `Venue ${index}` },
        },
      },
    }));

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      limit: '2',
      offset: '2',
    });

    expect(result.data.total).toBe(5);
    expect(result.data.limit).toBe(2);
    expect(result.data.offset).toBe(2);
    expect(result.data.events).toHaveLength(2);
    expect(result.data.events.map((event) => event.name)).toEqual([
      'Event 2',
      'Event 3',
    ]);
  });

  it('includes userIntent from the same batchWeek', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Interested Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            host: { name: 'Venue' },
          },
        },
      },
    ];

    mockExploreModels(events, [
      { eventId: '665a1b2c3d4e5f6789012345', status: 'interested' },
    ]);

    const result = await getPivotExplore(req, { batchWeek: '2026-W22', now });

    expect(result.data.events[0].userIntent).toBe('interested');
  });

  describe('excludePassed intent reconcile', () => {
    const mixedEvents = [
      {
        _id: '665a000000000000000000a1',
        name: 'Passed Event',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Interested Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
      {
        _id: '665a000000000000000000c3',
        name: 'Registered Event',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue C' } } },
      },
      {
        _id: '665a000000000000000000d4',
        name: 'Fresh Event',
        start_time: new Date('2026-05-28T21:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue D' } } },
      },
    ];

    const mixedIntents = [
      { eventId: '665a000000000000000000a1', status: 'passed' },
      { eventId: '665a000000000000000000b2', status: 'interested' },
      { eventId: '665a000000000000000000c3', status: 'registered' },
    ];

    it('excludes passed events by default', async () => {
      mockExploreModels(mixedEvents, mixedIntents);

      const result = await getPivotExplore(req, { batchWeek: '2026-W22', now });

      expect(result.data.filters.excludePassed).toBe(true);
      expect(result.data.catalogTotal).toBe(4);
      expect(result.data.hiddenPassedCount).toBe(1);
      expect(result.data.total).toBe(3);
      expect(result.data.events.map((event) => event.name)).toEqual([
        'Interested Event',
        'Registered Event',
        'Fresh Event',
      ]);
      expect(result.data.events.find((event) => event.name === 'Passed Event')).toBeUndefined();
    });

    it('keeps interested and registered events with userIntent set when excludePassed is true', async () => {
      mockExploreModels(mixedEvents, mixedIntents);

      const result = await getPivotExplore(req, {
        batchWeek: '2026-W22',
        now,
        excludePassed: 'true',
      });

      const interested = result.data.events.find((event) => event.name === 'Interested Event');
      const registered = result.data.events.find((event) => event.name === 'Registered Event');

      expect(interested?.userIntent).toBe('interested');
      expect(registered?.userIntent).toBe('registered');
    });

    it('includes passed events with userIntent when excludePassed=false', async () => {
      mockExploreModels(mixedEvents, mixedIntents);

      const result = await getPivotExplore(req, {
        batchWeek: '2026-W22',
        now,
        excludePassed: 'false',
      });

      expect(result.data.filters.excludePassed).toBe(false);
      expect(result.data.total).toBe(4);
      expect(result.data.events.find((event) => event.name === 'Passed Event')?.userIntent).toBe(
        'passed',
      );
    });
  });

  it('filters by catalog tag and adds tag constraint to the Event query', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Live Music Night',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue A' },
            tags: ['live-music'],
          },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Board Games',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue B' },
            tags: ['board-games'],
          },
        },
      },
    ];

    const Event = { find: jest.fn(() => mockEventFind(events)) };
    getModels.mockReturnValue(withExploreModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      tags: 'live-music',
    });

    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.tags': { $in: ['live-music'] },
      }),
    );
    expect(result.data.filters.tags).toEqual(['live-music']);
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Live Music Night');
  });

  it('rejects unknown catalog tags with 400', async () => {
    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      tags: 'not-a-real-tag',
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_TAG');
    expect(result.error).toMatch(/Unknown catalog tag/);
  });

  it('friendsOnly restricts to events with friend interested or going', async () => {
    const friendId = '507f191e810c19729de860ec';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Solo Event',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Friend Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
    ];

    const PivotEventIntent = {
      find: jest.fn((query) => {
        const isFriendQuery = query.userId && query.userId.$in;
        const rows = isFriendQuery
          ? [
              {
                eventId: '665a000000000000000000b2',
                userId: friendId,
                status: 'interested',
              },
            ]
          : [];
        return mockIntentFind(rows);
      }),
    };

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { requester: userId, recipient: friendId },
          ]),
        })),
      },
      PivotEventIntent,
      User: mockUserModel([{ _id: friendId, name: 'Pat', picture: null }]),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      friendsOnly: 'true',
    });

    expect(result.data.filters.friendsOnly).toBe(true);
    expect(result.data.total).toBe(1);
    expect(result.data.events[0].name).toBe('Friend Event');
  });

  it('filters by metadata search query q', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Sunset Listening Party',
        description: 'Roof records',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Roof Records' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Board Game Night',
        description: 'Tables open late',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Brooklyn Board Game Cafe' } } },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      q: 'board game',
    });

    expect(result.data.filters.q).toBe('board game');
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Board Game Night');
  });

  it('filters by night weekday shortcut', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Thursday Jazz',
        start_time: new Date('2026-05-28T23:30:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Friday Night Games',
        start_time: new Date('2026-05-29T23:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['board-games']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      night: 'fri',
    });

    expect(result.data.filters.night).toBe('fri');
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Friday Night Games');
  });

  it('rejects invalid batchWeek', async () => {
    const result = await getPivotExplore(req, { batchWeek: '2026-W999', now });
    expect(result.error).toMatch(/batchWeek/i);
    expect(result.status).toBe(400);
  });

  it('rejects invalid limit', async () => {
    const result = await getPivotExplore(req, { batchWeek: '2026-W22', limit: '0', now });
    expect(result.code).toBe('INVALID_LIMIT');
    expect(result.status).toBe(400);
  });

  it('normalizeExploreSort accepts for_you and soonest', () => {
    expect(normalizeExploreSort(undefined)).toBe(DEFAULT_EXPLORE_SORT);
    expect(normalizeExploreSort('for_you')).toBe('for_you');
    expect(normalizeExploreSort('soonest')).toBe('soonest');
    expect(normalizeExploreSort('start_time')).toBeUndefined();
  });

  it('sort=for_you ranks interest overlap ahead of start_time', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Generic',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue A' },
            tags: ['food'],
          },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Later Match',
        start_time: new Date('2026-05-29T23:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue B' },
            tags: ['live-music'],
          },
        },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['live-music']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      sort: 'for_you',
    });

    expect(result.data.filters.sort).toBe('for_you');
    expect(result.data.events.map((event) => event.name)).toEqual([
      'Later Match',
      'Earlier Generic',
    ]);
  });

  it('sort=soonest orders by start_time only', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Generic',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue A' },
            tags: ['food'],
          },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Later Match',
        start_time: new Date('2026-05-29T23:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue B' },
            tags: ['live-music'],
          },
        },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([], ['live-music']),
    }));

    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      now,
      sort: 'soonest',
    });

    expect(result.data.filters.sort).toBe('soonest');
    expect(result.data.events.map((event) => event.name)).toEqual([
      'Earlier Generic',
      'Later Match',
    ]);
  });

  it('rejects invalid sort', async () => {
    const result = await getPivotExplore(req, {
      batchWeek: '2026-W22',
      sort: 'magic',
      now,
    });
    expect(result.code).toBe('INVALID_SORT');
    expect(result.status).toBe(400);
  });

  it('previewMode requires batchWeek', async () => {
    const result = await getPivotExplore(
      { user: null, school: 'nyc' },
      { previewMode: true, now },
    );
    expect(result.code).toBe('BATCH_WEEK_REQUIRED');
    expect(result.status).toBe(400);
  });

  it('previewMode skips end-user auth and sets previewMode flag', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Preview Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue A' },
            tags: ['live-music'],
          },
        },
      },
    ];

    getModels.mockReturnValue(withExploreModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
    }));

    const result = await getPivotExplore(
      { user: null, school: 'nyc' },
      { previewMode: true, batchWeek: '2026-W22', now },
    );

    expect(result.data.previewMode).toBe(true);
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Preview Event');
  });

  it('previewMode includes staged and draft catalog rows', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Published Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue A' },
            ingestStatus: 'published',
          },
        },
      },
      {
        _id: '665a000000000000000000a2',
        name: 'Staged Event',
        start_time: new Date('2026-05-29T19:00:00.000Z'),
        customFields: {
          pivot: {
            host: { name: 'Venue B' },
            ingestStatus: 'staged',
          },
        },
      },
    ];

    const find = jest.fn(() => mockEventFind(events));
    getModels.mockReturnValue(withExploreModels({
      Event: { find },
    }));

    const result = await getPivotExplore(
      { user: null, school: 'nyc' },
      { previewMode: true, batchWeek: '2026-W22', now },
    );

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.ingestStatus': { $in: ['draft', 'staged', 'published'] },
      }),
    );
    expect(result.data.events.map((event) => event.name)).toEqual([
      'Published Event',
      'Staged Event',
    ]);
  });
});
