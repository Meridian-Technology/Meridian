jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotFeedService', () => ({
  getPivotFeed: jest.fn(),
  normalizeInterestTagSet: jest.fn((tags) => new Set(Array.isArray(tags) ? tags : [])),
}));
jest.mock('../../services/pivotDeckSnapshotService', () => ({
  getPivotDeckSnapshot: jest.fn(),
  getLatestPivotDeckSnapshot: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { getPivotFeed } = require('../../services/pivotFeedService');
const {
  getPivotDeckSnapshot,
  getLatestPivotDeckSnapshot,
} = require('../../services/pivotDeckSnapshotService');
const { resolvePivotDropInstant } = require('../../utilities/pivotDropSchedule');
const {
  previewAdminDropDeck,
  parseRebuildFlag,
} = require('../../services/pivotAdminDropDeckService');

const TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  location: 'New York City',
  name: 'NYC',
  pivotPilot: true,
  pivotDropTimezone: 'America/New_York',
  pivotDropDayOfWeek: 4,
  pivotDropHour: 18,
  pivotDropMinute: 0,
};
const USER_ID = '507f191e810c19729de860eb';

function mockReq() {
  return {
    globalDb: {},
    user: { globalUserId: '507f191e810c19729de860ea' },
  };
}

function mockUserFindById(doc) {
  return {
    findById: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(doc),
    })),
  };
}

function mockAdaUser() {
  getModels.mockReturnValue({
    User: mockUserFindById({
      _id: USER_ID,
      name: 'Ada',
      username: 'ada',
      picture: null,
      pivotInterestTags: ['live-music'],
    }),
  });
}

describe('parseRebuildFlag', () => {
  it('treats true-like values as rebuild', () => {
    expect(parseRebuildFlag(true)).toBe(true);
    expect(parseRebuildFlag('true')).toBe(true);
    expect(parseRebuildFlag('TRUE')).toBe(true);
    expect(parseRebuildFlag('1')).toBe(true);
    expect(parseRebuildFlag(1)).toBe(true);
  });

  it('treats everything else as frozen preview', () => {
    expect(parseRebuildFlag(undefined)).toBe(false);
    expect(parseRebuildFlag('false')).toBe(false);
    expect(parseRebuildFlag('0')).toBe(false);
    expect(parseRebuildFlag(0)).toBe(false);
  });
});

describe('previewAdminDropDeck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    getPivotDeckSnapshot.mockResolvedValue(null);
    getLatestPivotDeckSnapshot.mockResolvedValue(null);
    getPivotFeed.mockResolvedValue({
      data: {
        batchWeek: '2026-W28',
        cityDisplayName: 'New York City',
        rankerVersion: 'rules_v1',
        frozen: true,
        eligibleCount: 40,
        events: [{ _id: '665a000000000000000000a1', name: 'Jazz Night' }],
      },
    });
  });

  it('returns 400 for an invalid userId', async () => {
    const result = await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: 'not-an-id',
    });
    expect(result.code).toBe('INVALID_USER_ID');
    expect(result.status).toBe(400);
    expect(getPivotFeed).not.toHaveBeenCalled();
  });

  it('returns 404 when the user is missing in the city', async () => {
    getModels.mockReturnValue({ User: mockUserFindById(null) });

    const result = await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_ID,
    });

    expect(result.code).toBe('USER_NOT_FOUND');
    expect(result.status).toBe(404);
    expect(getPivotFeed).not.toHaveBeenCalled();
  });

  it('loads a saved deck at the drop start, not clock now', async () => {
    mockAdaUser();
    getPivotDeckSnapshot.mockResolvedValue({
      batchWeek: '2026-W28',
      orderedEventIds: ['665a000000000000000000a1'],
    });
    const dropAt = resolvePivotDropInstant(TENANT, '2026-W28').dropAt;

    const result = await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_ID,
      batchWeek: '2026-W28',
    });

    expect(result.data.frozen).toBe(true);
    expect(result.data.asOf).toBe(dropAt.toISOString());
    expect(result.data.asOfLabel).toMatch(/Thu/);
    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        school: 'nyc',
        user: { userId: USER_ID, roles: [] },
      }),
      expect.objectContaining({
        batchWeek: '2026-W28',
        now: dropAt,
        preview: true,
        ignoreSnapshot: false,
        includeScores: true,
      }),
    );
  });

  it('uses the latest saved deck when no week is pinned', async () => {
    mockAdaUser();
    getLatestPivotDeckSnapshot.mockResolvedValue({
      batchWeek: '2026-W32',
      orderedEventIds: ['665a000000000000000000a1'],
    });
    const dropAt = resolvePivotDropInstant(TENANT, '2026-W32').dropAt;

    await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_ID,
    });

    expect(getLatestPivotDeckSnapshot).toHaveBeenCalled();
    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        batchWeek: '2026-W32',
        now: dropAt,
        preview: true,
        ignoreSnapshot: false,
      }),
    );
  });

  it('rebuilds without using the frozen snapshot', async () => {
    mockAdaUser();
    getLatestPivotDeckSnapshot.mockResolvedValue({
      batchWeek: '2026-W32',
      orderedEventIds: ['665a000000000000000000a1'],
    });
    getPivotFeed.mockResolvedValue({
      data: {
        batchWeek: '2026-W33',
        frozen: false,
        eligibleCount: 0,
        events: [],
      },
    });

    const result = await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_ID,
      rebuild: 'true',
    });

    expect(result.data.rebuild).toBe(true);
    expect(getLatestPivotDeckSnapshot).not.toHaveBeenCalled();
    expect(getPivotFeed.mock.calls[0][1].batchWeek).toBeUndefined();
    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        preview: true,
        ignoreSnapshot: true,
        includeScores: true,
      }),
    );
  });

  it('omits batchWeek so live preview matches the week the app would pick', async () => {
    mockAdaUser();

    await previewAdminDropDeck(mockReq(), {
      tenantKey: 'nyc',
      userId: USER_ID,
    });

    expect(getPivotFeed.mock.calls[0][1].batchWeek).toBeUndefined();
    expect(getPivotFeed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        preview: true,
        ignoreSnapshot: false,
        includeScores: true,
      }),
    );
  });
});
