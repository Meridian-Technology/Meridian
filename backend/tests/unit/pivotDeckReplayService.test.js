jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: jest.fn(),
}));
jest.mock('../../utilities/pivotMovieMetadata', () => ({
  resolvePivotCoverImageUrl: jest.fn(() => 'https://cdn.example/cover.jpg'),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { normalizeBatchWeek } = require('../../services/pivotWeeklySnapshotService');
const {
  buildDeckReplaySessions,
  getUserDeckReplay,
  SESSION_GAP_MS,
} = require('../../services/pivotDeckReplayService');

const TENANT = { tenantKey: 'nyc' };
const USER_ID = '507f191e810c19729de860eb';
const EVENT_A = '665a1b2c3d4e5f6789012345';
const EVENT_B = '665a1b2c3d4e5f6789012346';
const EVENT_C = '665a1b2c3d4e5f6789012347';

function t(ms) {
  return new Date(ms);
}

describe('buildDeckReplaySessions', () => {
  it('uses recorded dwell ms for focus → swipe timing', () => {
    const sessions = buildDeckReplaySessions([
      {
        eventId: EVENT_A,
        type: 'impression',
        createdAt: t(1_000),
        rankInFeed: 0,
      },
      {
        eventId: EVENT_A,
        type: 'dwell',
        ms: 2400,
        createdAt: t(3_500),
        rankInFeed: 0,
      },
      {
        eventId: EVENT_A,
        type: 'pass',
        createdAt: t(3_500),
        rankInFeed: 0,
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].cards).toHaveLength(1);
    expect(sessions[0].cards[0]).toMatchObject({
      eventId: EVENT_A,
      action: 'pass',
      dwellMs: 2400,
    });
    expect(sessions[0].cards[0].actedAt - sessions[0].cards[0].focusedAt).toBe(2400);
  });

  it('falls back to impression → action span when dwell is missing', () => {
    const sessions = buildDeckReplaySessions([
      { eventId: EVENT_A, type: 'impression', createdAt: t(10_000) },
      { eventId: EVENT_A, type: 'interested', createdAt: t(14_000) },
    ]);

    expect(sessions[0].cards[0].dwellMs).toBe(4000);
    expect(sessions[0].cards[0].action).toBe('interested');
  });

  it('records detail_open time so replay can open and infer close', () => {
    const sessions = buildDeckReplaySessions([
      { eventId: EVENT_A, type: 'impression', createdAt: t(1_000) },
      { eventId: EVENT_A, type: 'detail_open', createdAt: t(2_200) },
      { eventId: EVENT_A, type: 'interested', createdAt: t(5_000) },
    ]);

    expect(sessions[0].cards[0]).toMatchObject({
      openedDetail: true,
      openedDetailAt: 2_200,
      action: 'interested',
    });
  });

  it('splits sessions on a long gap', () => {
    const sessions = buildDeckReplaySessions([
      { eventId: EVENT_A, type: 'pass', createdAt: t(1_000) },
      {
        eventId: EVENT_B,
        type: 'pass',
        createdAt: t(1_000 + SESSION_GAP_MS + 5_000),
      },
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].cards[0].eventId).toBe(EVENT_A);
    expect(sessions[1].cards[0].eventId).toBe(EVENT_B);
  });

  it('keeps swipe order by focus time across cards', () => {
    const sessions = buildDeckReplaySessions([
      { eventId: EVENT_B, type: 'interested', createdAt: t(8_000), rankInFeed: 1 },
      { eventId: EVENT_A, type: 'pass', createdAt: t(3_000), rankInFeed: 0 },
      { eventId: EVENT_C, type: 'pass', createdAt: t(12_000), rankInFeed: 2 },
    ]);

    expect(sessions[0].cards.map((card) => card.eventId)).toEqual([
      EVENT_A,
      EVENT_B,
      EVENT_C,
    ]);
  });

  it('ignores explore-surface rows and cards without a swipe', () => {
    const sessions = buildDeckReplaySessions([
      {
        eventId: EVENT_A,
        type: 'pass',
        surface: 'explore',
        createdAt: t(1_000),
      },
      {
        eventId: EVENT_B,
        type: 'impression',
        surface: 'deck',
        createdAt: t(2_000),
      },
    ]);

    expect(sessions).toEqual([]);
  });
});

describe('getUserDeckReplay', () => {
  function chainFind(docs) {
    return {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(docs),
    };
  }

  beforeEach(() => {
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    normalizeBatchWeek.mockReturnValue({ batchWeek: '2026-W38' });
    connectToDatabase.mockResolvedValue({});
    getModels.mockReturnValue({
      User: {
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({
              _id: USER_ID,
              name: 'Ada',
              username: 'ada',
              picture: null,
            }),
          }),
        }),
      },
      PivotInteraction: {
        find: jest.fn().mockReturnValue(
          chainFind([
            {
              eventId: EVENT_A,
              type: 'dwell',
              ms: 1500,
              surface: 'deck',
              createdAt: t(5_000),
            },
            {
              eventId: EVENT_A,
              type: 'pass',
              surface: 'deck',
              createdAt: t(5_000),
            },
          ]),
        ),
      },
      Event: {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: EVENT_A,
                name: 'Night Market',
                description: 'Food',
                location: 'Chinatown',
                start_time: new Date('2026-09-18T02:00:00.000Z'),
                customFields: { pivot: { host: { name: 'Host Club' }, tags: ['food'] } },
              },
            ]),
          }),
        }),
      },
    });
  });

  it('hydrates swipe cards for the requested week', async () => {
    const result = await getUserDeckReplay(
      {},
      { tenantKey: 'nyc', userId: USER_ID, batchWeek: '2026-W38' },
    );

    expect(result.data.cardCount).toBe(1);
    expect(result.data.sessions[0].cards[0].event.name).toBe('Night Market');
    expect(result.data.sessions[0].cards[0].action).toBe('pass');
    expect(result.data.sessions[0].cards[0].dwellMs).toBe(1500);
  });

  it('rejects a bad user id', async () => {
    const result = await getUserDeckReplay({}, { tenantKey: 'nyc', userId: 'nope' });
    expect(result.code).toBe('INVALID_USER_ID');
  });
});
