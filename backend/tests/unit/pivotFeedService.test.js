jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));
jest.mock('../../services/pivotConfigService', () => ({
  getPivotConfig: jest.fn(),
}));
jest.mock('../../services/pivotDeckSnapshotService', () => ({
  normalizeDeckSnapshotRefresh: jest.requireActual('../../services/pivotDeckSnapshotService')
    .normalizeDeckSnapshotRefresh,
  recordPivotDeckSnapshot: jest.fn().mockResolvedValue({ skipped: false }),
}));

const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { getPivotConfig } = require('../../services/pivotConfigService');
const { recordPivotDeckSnapshot } = require('../../services/pivotDeckSnapshotService');
const {
  getPivotFeed,
  getPivotEventFriends,
  getPilotWindow,
  getFeedPilotWindowFilter,
  isUpcomingPivotEvent,
  getUpcomingEventTimeFilter,
  resolveDisplayHost,
  serializePivotFeedEvent,
  normalizeExcludeEventIds,
  countInterestOverlap,
  countCrewInterestBleedScore,
  computeInterestRankScore,
  subtractInterestTags,
  countNegativeTagOverlap,
  compareByFeedRank,
  normalizeInterestTagSet,
  loadNegativeFeedbackTags,
  resolvePivotFeedBatchWeek,
  clearFeedCrewConfigCacheForTests,
} = require('../../services/pivotFeedService');

function mockUserModel(pivotInterestTags = [], friendUsers = []) {
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

function withFeedModels(partial = {}) {
  const emptyMembershipFind = jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  }));
  const emptyCrewFind = jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  }));

  return {
    UniversalFeedback: mockUniversalFeedbackModel(),
    PivotCrewMembership: { find: emptyMembershipFind },
    PivotCrew: { find: emptyCrewFind },
    ...partial,
  };
}

describe('pivotFeedService helpers', () => {
  it('resolveDisplayHost returns trimmed host fields', () => {
    expect(
      resolveDisplayHost({
        host: {
          name: ' Brooklyn Board Game Cafe ',
          imageUrl: 'https://example.com/a.jpg',
        },
      }),
    ).toEqual({
      name: 'Brooklyn Board Game Cafe',
      imageUrl: 'https://example.com/a.jpg',
    });
  });

  it('resolveDisplayHost rejects missing name', () => {
    expect(resolveDisplayHost({ host: { imageUrl: 'x' } })).toBeNull();
  });

  it('getPilotWindow starts today UTC for seven days', () => {
    const now = new Date('2026-05-26T15:00:00.000Z');
    const { windowStart, windowEnd } = getPilotWindow(now);
    expect(windowStart.toISOString()).toBe('2026-05-26T00:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('isUpcomingPivotEvent treats ended events as past', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    expect(
      isUpcomingPivotEvent(
        {
          start_time: new Date('2026-05-25T19:00:00.000Z'),
          end_time: new Date('2026-05-25T23:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isUpcomingPivotEvent(
        {
          start_time: new Date('2026-05-28T19:00:00.000Z'),
          end_time: new Date('2026-05-28T23:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('isUpcomingPivotEvent uses start_time when end_time is missing', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    expect(
      isUpcomingPivotEvent({ start_time: new Date('2026-05-25T19:00:00.000Z') }, now),
    ).toBe(false);
    expect(
      isUpcomingPivotEvent({ start_time: new Date('2026-05-28T19:00:00.000Z') }, now),
    ).toBe(true);
  });

  it('normalizeExcludeEventIds parses csv strings and drops invalid ids', () => {
    expect(
      normalizeExcludeEventIds(
        '665a1b2c3d4e5f6789012345, not-an-id ,665a1b2c3d4e5f6789012346',
      ),
    ).toEqual(['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346']);
  });

  it('normalizeExcludeEventIds accepts arrays and dedupes', () => {
    expect(
      normalizeExcludeEventIds([
        '665a1b2c3d4e5f6789012345',
        '665a1b2c3d4e5f6789012345',
      ]),
    ).toEqual(['665a1b2c3d4e5f6789012345']);
  });

  it('normalizeExcludeEventIds returns empty array for falsy input', () => {
    expect(normalizeExcludeEventIds(undefined)).toEqual([]);
    expect(normalizeExcludeEventIds('')).toEqual([]);
  });

  it('serializePivotFeedEvent strips hosting fields and attaches pivot extras', () => {
    const payload = serializePivotFeedEvent(
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
            tags: ['board-games'],
            host: { name: 'Brooklyn Board Game Cafe' },
            enrichment: {
              vibe: ['cozy'],
              priceBand: 'low',
              neighborhood: 'park slope',
            },
          },
        },
      },
      {
        displayHost: { name: 'Brooklyn Board Game Cafe' },
        userIntent: 'interested',
        friendsInterested: [],
        friendsGoing: [],
        friendsInterestedCount: 0,
        friendsGoingCount: 0,
      },
    );

    expect(payload).toMatchObject({
      _id: '665a1b2c3d4e5f6789012345',
      name: 'Friday Night Board Games',
      displayHost: { name: 'Brooklyn Board Game Cafe' },
      userIntent: 'interested',
      tags: ['board-games'],
      enrichment: {
        vibe: ['cozy'],
        priceBand: 'low',
        neighborhood: 'park slope',
      },
      friendsInterestedCount: 0,
      friendsGoingCount: 0,
    });
    expect(payload).not.toHaveProperty('crewInterestedCount');
    expect(payload).not.toHaveProperty('crewRegisteredCount');
    expect(payload).not.toHaveProperty('hostingId');
  });

  it('serializePivotFeedEvent includes crew counts when non-zero', () => {
    const payload = serializePivotFeedEvent(
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Friday Night Board Games',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Brooklyn Board Game Cafe' } } },
      },
      {
        displayHost: { name: 'Brooklyn Board Game Cafe' },
        userIntent: null,
        friendsInterested: [],
        friendsGoing: [],
        friendsInterestedCount: 0,
        friendsGoingCount: 0,
        crewInterestedCount: 2,
        crewRegisteredCount: 1,
      },
    );

    expect(payload.crewInterestedCount).toBe(2);
    expect(payload.crewRegisteredCount).toBe(1);
  });

  it('serializePivotFeedEvent omits zero crew counts', () => {
    const payload = serializePivotFeedEvent(
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Friday Night Board Games',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Brooklyn Board Game Cafe' } } },
      },
      {
        displayHost: { name: 'Brooklyn Board Game Cafe' },
        userIntent: null,
        friendsInterested: [],
        friendsGoing: [],
        friendsInterestedCount: 0,
        friendsGoingCount: 0,
        crewInterestedCount: 0,
        crewRegisteredCount: 0,
      },
    );

    expect(payload).not.toHaveProperty('crewInterestedCount');
    expect(payload).not.toHaveProperty('crewRegisteredCount');
  });

  it('countInterestOverlap uses catalog slug equality only', () => {
    const interests = normalizeInterestTagSet(['live-music', 'board-games']);
    expect(
      countInterestOverlap(
        { customFields: { pivot: { tags: ['live-music', 'social'] } } },
        interests,
      ),
    ).toBe(1);
    expect(
      countInterestOverlap(
        { customFields: { pivot: { tags: ['Live-Music'] } } },
        interests,
      ),
    ).toBe(1);
    expect(
      countInterestOverlap(
        { customFields: { pivot: { tags: ['nightlife'] } } },
        interests,
      ),
    ).toBe(0);
    expect(
      countInterestOverlap(
        { customFields: { pivot: { tags: [] } } },
        interests,
      ),
    ).toBe(0);
  });

  it('compareByFeedRank sorts interest overlap before start_time when friend scores tie', () => {
    const socialByEvent = new Map();
    const interests = normalizeInterestTagSet(['live-music']);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { tags: ['live-music'] } },
      },
    ];

    events.sort(compareByFeedRank(socialByEvent, interests));

    expect(events.map((event) => event._id)).toEqual(['2', '1']);
  });

  it('compareByFeedRank downranks shared negative-feedback tags after interest overlap', () => {
    const socialByEvent = new Map();
    const interests = normalizeInterestTagSet(['board-games', 'live-music']);
    const negativeTags = normalizeInterestTagSet(['board-games']);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: ['board-games'] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { tags: ['live-music'] } },
      },
    ];

    events.sort(compareByFeedRank(socialByEvent, interests, negativeTags));

    expect(events.map((event) => event._id)).toEqual(['2', '1']);
  });

  it('compareByFeedRank skips crew tiers when crewSignalWeight is zero', () => {
    const socialByEvent = new Map([
      [
        '1',
        {
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 5,
          crewRegisteredCount: 0,
        },
      ],
      [
        '2',
        {
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 0,
          crewRegisteredCount: 0,
        },
      ],
    ]);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
    ];

    events.sort(
      compareByFeedRank(socialByEvent, new Set(), new Set(), { crewSignalWeight: 0 }),
    );

    expect(events.map((event) => event._id)).toEqual(['2', '1']);
  });

  it('compareByFeedRank boosts crew registered above crew interested when weighted', () => {
    const socialByEvent = new Map([
      [
        '1',
        {
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 3,
          crewRegisteredCount: 0,
        },
      ],
      [
        '2',
        {
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 1,
          crewRegisteredCount: 1,
        },
      ],
    ]);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
    ];

    events.sort(
      compareByFeedRank(socialByEvent, new Set(), new Set(), { crewSignalWeight: 0.2 }),
    );

    expect(events.map((event) => event._id)).toEqual(['2', '1']);
  });

  it('compareByFeedRank applies crew boosts after friend boosts', () => {
    const socialByEvent = new Map([
      [
        '1',
        {
          friendInterestedCount: 1,
          friendRegisteredCount: 0,
          crewInterestedCount: 5,
          crewRegisteredCount: 5,
        },
      ],
      [
        '2',
        {
          friendInterestedCount: 0,
          friendRegisteredCount: 0,
          crewInterestedCount: 1,
          crewRegisteredCount: 1,
        },
      ],
    ]);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
    ];

    events.sort(
      compareByFeedRank(socialByEvent, new Set(), new Set(), { crewSignalWeight: 0.2 }),
    );

    expect(events.map((event) => event._id)).toEqual(['1', '2']);
  });

  it('countCrewInterestBleedScore caps bleed at maxWeight', () => {
    const crewTags = normalizeInterestTagSet(['live-music', 'board-games', 'food']);
    const event = {
      customFields: {
        pivot: { tags: ['live-music', 'board-games', 'food'] },
      },
    };

    expect(countCrewInterestBleedScore(event, crewTags, 0.15)).toBe(0.15);
    expect(countCrewInterestBleedScore(event, crewTags, 0)).toBe(0);
  });

  it('computeInterestRankScore keeps personal overlap ahead of bleed-only ties', () => {
    const personalTags = normalizeInterestTagSet(['live-music']);
    const crewBleedTags = normalizeInterestTagSet(['board-games']);
    const personalMatch = {
      customFields: { pivot: { tags: ['live-music'] } },
    };
    const bleedOnlyMatch = {
      customFields: { pivot: { tags: ['board-games'] } },
    };
    const rankOptions = {
      interestBleed: { enabled: true, maxWeight: 0.15 },
      crewBleedTags,
    };

    expect(computeInterestRankScore(personalMatch, personalTags, rankOptions)).toBe(1);
    expect(computeInterestRankScore(bleedOnlyMatch, personalTags, rankOptions)).toBe(0.15);
  });

  it('compareByFeedRank applies crew interest bleed below personal overlap', () => {
    const socialByEvent = new Map();
    const personalTags = normalizeInterestTagSet([]);
    const crewBleedTags = normalizeInterestTagSet(['live-music']);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: ['live-music'] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
    ];

    events.sort(
      compareByFeedRank(socialByEvent, personalTags, new Set(), {
        interestBleed: { enabled: true, maxWeight: 0.15 },
        crewBleedTags,
      }),
    );

    expect(events.map((event) => event._id)).toEqual(['1', '2']);
  });

  it('compareByFeedRank skips interest bleed when disabled', () => {
    const socialByEvent = new Map();
    const crewBleedTags = normalizeInterestTagSet(['live-music']);
    const events = [
      {
        _id: '1',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { tags: ['live-music'] } },
      },
      {
        _id: '2',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { tags: [] } },
      },
    ];

    events.sort(
      compareByFeedRank(socialByEvent, new Set(), new Set(), {
        interestBleed: { enabled: false, maxWeight: 0.15 },
        crewBleedTags,
      }),
    );

    expect(events.map((event) => event._id)).toEqual(['2', '1']);
  });

  it('countNegativeTagOverlap returns zero for untagged events', () => {
    const negativeTags = normalizeInterestTagSet(['board-games']);
    expect(
      countNegativeTagOverlap(
        { customFields: { pivot: { tags: [] } } },
        negativeTags,
      ),
    ).toBe(0);
    expect(
      countNegativeTagOverlap({ customFields: { pivot: {} } }, negativeTags),
    ).toBe(0);
  });
});

describe('getPivotFeed', () => {
  const userId = '507f191e810c19729de860eb';
  const req = { user: { userId }, school: 'nyc' };
  const now = new Date('2026-05-26T12:00:00.000Z');

  beforeEach(() => {
    getModels.mockReset();
    getTenantByKey.mockReset();
    getPivotConfig.mockReset();
    recordPivotDeckSnapshot.mockClear();
    clearFeedCrewConfigCacheForTests();
    getTenantByKey.mockResolvedValue({
      tenantKey: 'nyc',
      name: 'New York City Pilot',
      location: 'New York City',
      pivotPilot: true,
    });
    getPivotConfig.mockResolvedValue({
      data: {
        crew: {
          feedMix: {
            crewSignalWeight: 0.2,
          },
        },
      },
    });
  });

  function mockEventFind(events) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(events),
    };
    return chain;
  }

  function mockIntentFind(rows = []) {
    return {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    };
  }

  it('returns published pivot events with displayHost and empty feed fields', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Sunset Listening Party',
        description: 'Roof records',
        location: 'Brooklyn',
        start_time: new Date('2026-05-28T22:00:00.000Z'),
        end_time: new Date('2026-05-29T02:00:00.000Z'),
        externalLink: 'https://partiful.com/e/sunset',
        type: 'social',
        registrationCount: 4,
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Roof Records' },
            tags: ['music'],
          },
        },
      },
    ];

    const eventFind = mockEventFind(events);
    const Event = { find: jest.fn(() => eventFind) };
    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.batchWeek).toBe('2026-W22');
    expect(result.data.cityDisplayName).toBe('New York City');
    expect(result.data.rankerVersion).toBe('rules_v0');
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].displayHost).toEqual({ name: 'Roof Records' });
    expect(result.data.events[0].userIntent).toBeNull();
    expect(result.data.events[0].rankInFeed).toBe(0);
    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': '2026-W22',
        'customFields.pivot.ingestStatus': 'published',
        status: { $in: ['approved', 'not-applicable'] },
        ...getFeedPilotWindowFilter(now),
      }),
    );
  });

  it('includes multi-showtime events when a later showtime is in the pilot window', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012347',
        name: 'Film Night',
        start_time: new Date('2026-05-26T18:00:00.000Z'),
        end_time: new Date('2026-05-29T05:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Nitehawk Cinema' },
            tags: ['film-and-tv'],
            timeSlots: [
              {
                id: '6pm',
                start_time: new Date('2026-05-26T18:00:00.000Z'),
                end_time: new Date('2026-05-26T20:30:00.000Z'),
              },
              {
                id: '830pm',
                start_time: new Date('2026-05-28T23:30:00.000Z'),
                end_time: new Date('2026-05-29T02:00:00.000Z'),
              },
            ],
          },
        },
      },
    ];

    const eventFind = mockEventFind(events);
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => eventFind) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Film Night');
    expect(result.data.events[0].timeSlots).toHaveLength(2);
  });

  it('excludes events that have already ended from the deck feed', async () => {
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

    const eventFind = mockEventFind(events);
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => eventFind) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Upcoming Party');
  });

  it('returns empty events array when none match', async () => {
    const eventFind = mockEventFind([]);
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => eventFind) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });
    expect(result.data.events).toEqual([]);
  });

  it('queries only published ingestStatus (Choice A: staged/draft excluded at DB filter)', async () => {
    const eventFind = mockEventFind([]);
    const Event = { find: jest.fn(() => eventFind) };
    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': '2026-W22',
        'customFields.pivot.ingestStatus': 'published',
      }),
    );
    expect(Event.find.mock.calls[0][0]['customFields.pivot.ingestStatus']).not.toBe('staged');
    expect(Event.find.mock.calls[0][0]['customFields.pivot.ingestStatus']).not.toBe('draft');
  });

  it('includes published events for the requested batchWeek after release', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Released Party',
        start_time: new Date('2026-05-28T22:00:00.000Z'),
        end_time: new Date('2026-05-29T02:00:00.000Z'),
        registrationCount: 2,
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Roof Records' },
          },
        },
      },
    ];

    const eventFind = mockEventFind(events);
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => eventFind) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Released Party');
  });

  it('scopes feed to the requested batchWeek (wrong week excluded by query)', async () => {
    const eventFind = mockEventFind([]);
    const Event = { find: jest.fn(() => eventFind) };
    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'customFields.pivot.batchWeek': '2026-W22',
      }),
    );
  });

  it('rejects invalid batchWeek', async () => {
    const result = await getPivotFeed(req, { batchWeek: '2026-W999', now });
    expect(result.error).toMatch(/batchWeek/i);
    expect(result.status).toBe(400);
  });

  it('boosts events with friend registered above friend interested only', async () => {
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

    const eventFind = mockEventFind(events);
    const Event = { find: jest.fn(() => eventFind) };

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

    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { requester: userId, recipient: friendId },
          ]),
        })),
      },
      PivotEventIntent,
      User: mockUserModel([], [{ _id: friendId, name: 'Pat', picture: null }]),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Friend Registered',
      'Friend Interested',
      'No Friends (popular)',
    ]);
    expect(result.data.events.map((event) => event.rankInFeed)).toEqual([0, 1, 2]);
    expect(result.data.rankerVersion).toBe('rules_v0');
    const registered = result.data.events[0];
    expect(registered.friendsGoing).toHaveLength(1);
    expect(registered.friendsInterested).toHaveLength(1);
    expect(registered.friendsGoingCount).toBe(1);
    expect(registered.friendsInterestedCount).toBe(1);
    const interested = result.data.events[1];
    expect(interested.friendsGoing).toHaveLength(0);
    expect(interested.friendsInterested).toHaveLength(1);
    expect(interested.friendsGoingCount).toBe(0);
    expect(interested.friendsInterestedCount).toBe(1);
  });

  it('boosts interest-matching events above untagged ties when friend scores match', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Untagged Early',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        registrationCount: 10,
        customFields: {
          pivot: { host: { name: 'Venue A' }, tags: [] },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Live Music Night',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        registrationCount: 1,
        customFields: {
          pivot: { host: { name: 'Venue B' }, tags: ['live-music'] },
        },
      },
    ];

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(['live-music']),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Live Music Night',
      'Untagged Early',
    ]);
  });

  it('boosts events with crew registered above crew interested only', async () => {
    const crewMemberId = '507f191e810c19729de860ed';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'No Crew Signal',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        registrationCount: 50,
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Crew Interested',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        registrationCount: 5,
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
      {
        _id: '665a000000000000000000c3',
        name: 'Crew Registered',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        registrationCount: 1,
        customFields: { pivot: { host: { name: 'Venue C' } } },
      },
    ];

    const crewId = '665a000000000000000000d4';
    const PivotCrewMembership = {
      find: jest.fn((query) => {
        if (query.userId && !query.crewId) {
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([{ crewId }]),
          };
        }
        if (query.crewId) {
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([{ userId: crewMemberId }]),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      }),
    };
    const PivotCrew = {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: crewId }]),
      })),
    };
    const PivotEventIntent = {
      find: jest.fn((query) => {
        if (query.userId?.$in) {
          return mockIntentFind([
            {
              eventId: '665a000000000000000000b2',
              userId: crewMemberId,
              status: 'interested',
            },
            {
              eventId: '665a000000000000000000c3',
              userId: crewMemberId,
              status: 'registered',
            },
          ]);
        }
        return mockIntentFind();
      }),
    };

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotCrew,
      PivotCrewMembership,
      PivotEventIntent,
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Crew Registered',
      'Crew Interested',
      'No Crew Signal',
    ]);
    expect(getPivotConfig).toHaveBeenCalled();
  });

  it('returns crew social counts on feed events and dedupes members across crews', async () => {
    const crewMemberA = '507f191e810c19729de860ed';
    const crewMemberB = '507f191e810c19729de860ee';
    const events = [
      {
        _id: '665a000000000000000000c3',
        name: 'Crew Night',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue C' } } },
      },
    ];

    const crewIdOne = '665a000000000000000000d4';
    const crewIdTwo = '665a000000000000000000d5';
    const PivotCrewMembership = {
      find: jest.fn((query) => {
        if (query.userId && !query.crewId) {
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
              { crewId: crewIdOne },
              { crewId: crewIdTwo },
            ]),
          };
        }
        if (query.crewId) {
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
              { userId: crewMemberA },
              { userId: crewMemberB },
            ]),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      }),
    };
    const PivotCrew = {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: crewIdOne }, { _id: crewIdTwo }]),
      })),
    };
    const PivotEventIntent = {
      find: jest.fn((query) => {
        if (query.userId?.$in) {
          return mockIntentFind([
            {
              eventId: '665a000000000000000000c3',
              userId: crewMemberA,
              status: 'registered',
            },
            {
              eventId: '665a000000000000000000c3',
              userId: crewMemberB,
              status: 'interested',
            },
          ]);
        }
        return mockIntentFind();
      }),
    };

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotCrew,
      PivotCrewMembership,
      PivotEventIntent,
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });
    const event = result.data.events[0];

    expect(event.crewRegisteredCount).toBe(1);
    expect(event.crewInterestedCount).toBe(2);
  });

  it('omits crew social count fields when user has no crew signal', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Solo Deck Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Venue' },
          },
        },
      },
    ];

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events[0]).not.toHaveProperty('crewInterestedCount');
    expect(result.data.events[0]).not.toHaveProperty('crewRegisteredCount');
  });

  it('keeps pre-crew rank order when crewSignalWeight is zero', async () => {
    getPivotConfig.mockResolvedValue({
      data: {
        crew: {
          feedMix: {
            crewSignalWeight: 0,
          },
        },
      },
    });

    const crewMemberId = '507f191e810c19729de860ed';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Untagged',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue A' } } },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Later Crew Boosted',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Venue B' } } },
      },
    ];

    const crewId = '665a000000000000000000d4';
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotCrew: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ _id: crewId }]),
        })),
      },
      PivotCrewMembership: {
        find: jest.fn((query) => {
          if (query.userId && !query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ crewId }]),
            };
          }
          if (query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ userId: crewMemberId }]),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
          };
        }),
      },
      PivotEventIntent: {
        find: jest.fn((query) => {
          if (query.userId?.$in) {
            return mockIntentFind([
              {
                eventId: '665a000000000000000000b2',
                userId: crewMemberId,
                status: 'registered',
              },
            ]);
          }
          return mockIntentFind();
        }),
      },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Earlier Untagged',
      'Later Crew Boosted',
    ]);
  });

  it('boosts events matching crew member interests when bleed is enabled', async () => {
    const crewMemberId = '507f191e810c19729de860ed';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Generic',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue A' }, tags: ['food'] },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Crew Jazz Night',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue B' }, tags: ['live-music'] },
        },
      },
    ];

    const crewId = '665a000000000000000000d4';
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotCrew: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ _id: crewId }]),
        })),
      },
      PivotCrewMembership: {
        find: jest.fn((query) => {
          if (query.userId && !query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ crewId }]),
            };
          }
          if (query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ userId: crewMemberId }]),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
          };
        }),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: {
        findById: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue({ pivotInterestTags: [] }),
        })),
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { _id: crewMemberId, pivotInterestTags: ['live-music'] },
          ]),
        })),
      },
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Crew Jazz Night',
      'Earlier Generic',
    ]);
  });

  it('ignores crew interest bleed when requiresCrewMemberSwipe and member has not swiped', async () => {
    getPivotConfig.mockResolvedValue({
      data: {
        crew: {
          feedMix: { crewSignalWeight: 0.2 },
          interestBleed: {
            enabled: true,
            maxWeight: 0.15,
            requiresCrewMemberSwipe: true,
          },
        },
      },
    });

    const crewMemberId = '507f191e810c19729de860ed';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Generic',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue A' }, tags: ['food'] },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Crew Jazz Night',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue B' }, tags: ['live-music'] },
        },
      },
    ];

    const crewId = '665a000000000000000000d4';
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotCrew: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ _id: crewId }]),
        })),
      },
      PivotCrewMembership: {
        find: jest.fn((query) => {
          if (query.userId && !query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ crewId }]),
            };
          }
          if (query.crewId) {
            return {
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([{ userId: crewMemberId }]),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
          };
        }),
      },
      PivotEventIntent: {
        find: jest.fn((query) => {
          if (query.batchWeek && query.userId?.$in) {
            return mockIntentFind([]);
          }
          return mockIntentFind();
        }),
      },
      User: {
        findById: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue({ pivotInterestTags: [] }),
        })),
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { _id: crewMemberId, pivotInterestTags: ['live-music'] },
          ]),
        })),
      },
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Earlier Generic',
      'Crew Jazz Night',
    ]);
  });

  it('keeps friend-boost-only order when user interests are empty', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Later Untagged',
        start_time: new Date('2026-05-28T20:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue A' }, tags: ['live-music'] },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Earlier Untagged',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue B' }, tags: [] },
        },
      },
    ];

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel([]),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event.name)).toEqual([
      'Earlier Untagged',
      'Later Untagged',
    ]);
  });

  it('downranks events tagged like a low-rated pivot event without hiding them', async () => {
    const pastEventId = '665a000000000000000099';
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Board Game Night',
        start_time: new Date('2026-05-28T18:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue A' }, tags: ['board-games'] },
        },
      },
      {
        _id: '665a000000000000000000b2',
        name: 'Live Music Night',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: { host: { name: 'Venue B' }, tags: ['live-music'] },
        },
      },
    ];

    const Event = {
      find: jest.fn((query) => {
        if (query._id?.$in) {
          return {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
              {
                _id: pastEventId,
                customFields: { pivot: { tags: ['board-games'] } },
              },
            ]),
          };
        }
        return mockEventFind(events);
      }),
    };

    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(['board-games', 'live-music']),
      UniversalFeedback: mockUniversalFeedbackModel([{ processId: pastEventId }]),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events).toHaveLength(2);
    expect(result.data.events.map((event) => event.name)).toEqual([
      'Live Music Night',
      'Board Game Night',
    ]);
  });

  it('passes excludeEventIds into the Event query', async () => {
    const eventFind = mockEventFind([]);
    const Event = { find: jest.fn(() => eventFind) };
    getModels.mockReturnValue(withFeedModels({
      Event,
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    await getPivotFeed(req, {
      batchWeek: '2026-W22',
      now,
      excludeEventIds: '665a000000000000000000a1,bad-id',
    });

    expect(Event.find).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $nin: ['665a000000000000000000a1'] },
      }),
    );
  });

  it('omits events missing display host name', async () => {
    const eventFind = mockEventFind([
      {
        _id: '1',
        name: 'Bad Host',
        customFields: { pivot: { host: { name: '   ' } } },
      },
      {
        _id: '2',
        name: 'Good Host',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: { pivot: { host: { name: 'Real Venue' } } },
      },
    ]);
    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => eventFind) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].name).toBe('Good Host');
  });

  it('returns passed userIntent so clients can drop swiped-left cards from the deck', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Passed Event',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            host: { name: 'Venue' },
          },
        },
      },
    ];

    const intentFind = jest
      .fn()
      .mockReturnValueOnce(
        mockIntentFind([
          { eventId: '665a1b2c3d4e5f6789012345', status: 'passed' },
        ]),
      )
      .mockReturnValueOnce(mockIntentFind());

    getModels.mockReturnValue(withFeedModels({
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

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events[0].userIntent).toBe('passed');
    expect(intentFind.mock.calls[0][0]).toEqual({
      userId,
      eventId: { $in: events.map((event) => event._id) },
      batchWeek: '2026-W22',
    });
  });

  it('ignores swipe intents from a different batchWeek on the same event', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Fresh Again',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            host: { name: 'Venue' },
          },
        },
      },
    ];

    const intentFind = jest.fn().mockReturnValue(mockIntentFind());

    getModels.mockReturnValue(withFeedModels({
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

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events[0].userIntent).toBeNull();
    expect(intentFind.mock.calls[0][0]).toEqual({
      userId,
      eventId: { $in: events.map((event) => event._id) },
      batchWeek: '2026-W22',
    });
  });

  it('records a deck snapshot matching the ranked feed order', async () => {
    const events = [
      {
        _id: '665a000000000000000000a1',
        name: 'Earlier Generic',
        start_time: new Date('2026-05-28T19:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
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
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Venue B' },
            tags: ['live-music'],
          },
        },
      },
    ];

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(['live-music']),
    }));

    const result = await getPivotFeed(req, { batchWeek: '2026-W22', now });

    expect(result.data.events.map((event) => event._id)).toEqual([
      '665a000000000000000000b2',
      '665a000000000000000000a1',
    ]);
    expect(recordPivotDeckSnapshot).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [
          events[1]._id,
          events[0]._id,
        ],
        rankerVersion: 'rules_v0',
        forceRefresh: false,
      }),
    );
  });

  it('ignores refresh=1 for non-admin users', async () => {
    const events = [
      {
        _id: '665a1b2c3d4e5f6789012345',
        name: 'Sunset Listening Party',
        start_time: new Date('2026-05-28T22:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W22',
            ingestStatus: 'published',
            host: { name: 'Roof Records' },
          },
        },
      },
    ];

    getModels.mockReturnValue(withFeedModels({
      Event: { find: jest.fn(() => mockEventFind(events)) },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      PivotEventIntent: { find: jest.fn(() => mockIntentFind()) },
      User: mockUserModel(),
    }));

    await getPivotFeed(req, { batchWeek: '2026-W22', now, refresh: '1' });

    expect(recordPivotDeckSnapshot).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ forceRefresh: false }),
    );
  });
});

describe('getPivotEventFriends', () => {
  const userId = '507f191e810c19729de860eb';
  const friendId = '507f191e810c19729de860ec';
  const eventId = '665a1b2c3d4e5f6789012345';
  const req = { user: { userId }, school: 'nyc' };

  beforeEach(() => {
    getModels.mockReset();
  });

  it('returns uncapped friend lists for a published pivot event', async () => {
    getModels.mockReturnValue({
      Event: {
        findOne: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue({ _id: eventId }),
        })),
      },
      Friendship: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { requester: userId, recipient: friendId, status: 'accepted' },
          ]),
        })),
      },
      PivotEventIntent: {
        find: jest.fn()
          .mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
          })
          .mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([
              { eventId, userId: friendId, status: 'registered' },
            ]),
          }),
      },
      User: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { _id: friendId, name: 'Pat', picture: null },
          ]),
        })),
      },
    });

    const result = await getPivotEventFriends(req, eventId);

    expect(result.data.going).toEqual([
      { id: friendId, name: 'Pat', picture: null },
    ]);
    expect(result.data.interested).toEqual([
      { id: friendId, name: 'Pat', picture: null },
    ]);
  });

  it('returns 404 when the event is not a published pivot catalog event', async () => {
    getModels.mockReturnValue({
      Event: {
        findOne: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(null),
        })),
      },
    });

    const result = await getPivotEventFriends(req, eventId);
    expect(result.status).toBe(404);
    expect(result.code).toBe('EVENT_NOT_FOUND');
  });
});

describe('resolvePivotFeedBatchWeek', () => {
  const now = new Date('2026-07-13T16:00:00.000Z');
  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotPilot: true,
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  function mockCatalogProbe(eventsByWeek) {
    getModels.mockReturnValue({
      Event: {
        find: jest.fn((query) => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(
            eventsByWeek[query['customFields.pivot.batchWeek']] || [],
          ),
        })),
      },
    });
  }

  it('returns requested batchWeek without probing adjacent weeks', async () => {
    const Event = { find: jest.fn() };
    getModels.mockReturnValue({ Event });
    const req = { school: 'nyc' };

    const result = await resolvePivotFeedBatchWeek(req, {
      tenant: nycTenant,
      now,
      requestedBatchWeek: '2026-W22',
    });

    expect(result).toEqual({
      batchWeek: '2026-W22',
      batchWeekSource: 'query',
      catalogProbeWeeks: ['2026-W22'],
    });
    expect(Event.find).not.toHaveBeenCalled();
  });

  it('keeps the live consumer week Mon–Wed before the Thursday drop', async () => {
    mockCatalogProbe({
      '2026-W28': [
        {
          start_time: new Date('2026-07-14T23:00:00.000Z'),
          end_time: new Date('2026-07-15T03:00:00.000Z'),
          customFields: {
            pivot: { host: { name: 'Venue' } },
          },
        },
      ],
      '2026-W29': [
        {
          start_time: new Date('2026-07-16T23:00:00.000Z'),
          end_time: new Date('2026-07-17T03:00:00.000Z'),
          customFields: {
            pivot: { host: { name: 'Venue' } },
          },
        },
      ],
    });
    const req = { school: 'nyc' };

    const result = await resolvePivotFeedBatchWeek(req, {
      tenant: nycTenant,
      now,
    });

    expect(result.batchWeek).toBe('2026-W28');
    expect(result.batchWeekSource).toBe('consumer_week');
    expect(result.catalogMatchCount).toBe(1);
  });

  it('does not probe the next week before the drop instant', async () => {
    mockCatalogProbe({
      '2026-W28': [],
      '2026-W29': [],
      '2026-W30': [
        {
          start_time: new Date('2026-07-23T23:00:00.000Z'),
          end_time: new Date('2026-07-24T03:00:00.000Z'),
          customFields: {
            pivot: { host: { name: 'Venue' } },
          },
        },
      ],
    });
    const req = { school: 'nyc' };

    const result = await resolvePivotFeedBatchWeek(req, {
      tenant: nycTenant,
      now,
    });

    expect(result.batchWeek).toBe('2026-W28');
    expect(result.batchWeekSource).toBe('consumer_week');
    expect(result.catalogMatchCount).toBe(0);
    expect(result.catalogProbeWeeks).toEqual(['2026-W28', '2026-W27']);
  });

  it('falls back to the next week after the drop instant when the live week is exhausted', async () => {
    const afterDrop = new Date('2026-07-17T23:00:00.000Z');
    mockCatalogProbe({
      '2026-W29': [],
      '2026-W30': [
        {
          start_time: new Date('2026-07-23T23:00:00.000Z'),
          end_time: new Date('2026-07-24T03:00:00.000Z'),
          customFields: {
            pivot: { host: { name: 'Venue' } },
          },
        },
      ],
    });
    const req = { school: 'nyc' };

    const result = await resolvePivotFeedBatchWeek(req, {
      tenant: nycTenant,
      now: afterDrop,
    });

    expect(result.batchWeek).toBe('2026-W30');
    expect(result.batchWeekSource).toBe('catalog_fallback');
  });
});
