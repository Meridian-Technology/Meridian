jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  getMergedTenants: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  buildCrewNudgePushMessage,
  countUnfinishedSwipers,
  isCrewEligibleForNudge,
  isNudgeWindowOpen,
  resolveNudgeEligibleAtMs,
  sendCrewUnfinishedSwipeNudgesForTenant,
} = require('../../services/pivotCrewNudgeService');
const { PIVOT_CREW_CONFIG_DEFAULTS } = require('../../utilities/pivotCrewConfig');

describe('pivotCrewNudgeService', () => {
  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  const crewId = '507f1f77bcf86cd799439011';
  const batchWeek = '2026-W23';

  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({});
  });

  it('builds pivot_crew_nudge push payload', () => {
    const message = buildCrewNudgePushMessage('ExponentPushToken[abc]', {
      batchWeek,
      crewId,
      crewName: 'Friday Plans',
      remainingCount: 3,
    });

    expect(message.data.type).toBe('pivot_crew_nudge');
    expect(message.data.crewId).toBe(crewId);
    expect(message.data.ritualPhase).toBe('swiping');
    expect(message.data.ritualNudgeType).toBe('quorum_waiting');
    expect(message.body).toBe('your crew is waiting on swipes');
  });

  it('builds overlay ritual nudge body from the copy pack', () => {
    const message = buildCrewNudgePushMessage('ExponentPushToken[abc]', {
      batchWeek,
      crewId,
      remainingCount: 3,
      copyPack: {
        entries: {
          'crew.push.ritual.quorumWaitingBody': '{group.singular} is waiting on swipes',
        },
        tokens: { 'group.singular': 'block' },
      },
    });

    expect(message.body).toBe('block is waiting on swipes');
  });

  it('computes nudge eligibility from dropAt plus reminder hours', () => {
    const dropAtMs = resolveNudgeEligibleAtMs(
      nycTenant,
      batchWeek,
      12,
      new Date('2026-06-04T20:00:00.000Z'),
    );

    expect(isNudgeWindowOpen(nycTenant, batchWeek, 12, new Date(dropAtMs - 1))).toBe(false);
    expect(isNudgeWindowOpen(nycTenant, batchWeek, 12, new Date(dropAtMs))).toBe(true);
  });

  it('counts unfinished swipers from swipe progress', () => {
    expect(
      countUnfinishedSwipers({
        activeMemberCount: 5,
        swipedCount: 2,
      }),
    ).toBe(3);
  });

  it('skips crews below min active members or with quorum met', () => {
    expect(
      isCrewEligibleForNudge(
        {
          swipeProgress: {
            activeMemberCount: 1,
            swipedCount: 0,
            quorumMet: false,
          },
        },
        PIVOT_CREW_CONFIG_DEFAULTS,
      ),
    ).toBe(false);

    expect(
      isCrewEligibleForNudge(
        {
          swipeProgress: {
            activeMemberCount: 4,
            swipedCount: 4,
            quorumMet: true,
          },
        },
        PIVOT_CREW_CONFIG_DEFAULTS,
      ),
    ).toBe(false);

    expect(
      isCrewEligibleForNudge(
        {
          swipeProgress: {
            activeMemberCount: 4,
            swipedCount: 2,
            quorumMet: false,
          },
        },
        PIVOT_CREW_CONFIG_DEFAULTS,
      ),
    ).toBe(true);
  });

  it('dedupes push sends to one nudge per crew per batchWeek', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);

    const nudgeSentFindOneLean = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'sent' });
    const nudgeSentCreate = jest.fn().mockResolvedValue({});

    getModels.mockImplementation((_req, ...names) => {
      const models = {
        PivotCrewWeekState: {
          find: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                crewId,
                batchWeek,
                swipeProgress: {
                  activeMemberCount: 4,
                  swipedCount: 1,
                  quorumMet: false,
                },
              },
            ]),
          }),
        },
        PivotCrew: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([{ _id: crewId, name: 'Friday Plans' }]),
            }),
          }),
        },
        PivotCrewMembership: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { userId: '507f191e810c19729de860ea' },
                { userId: '507f191e810c19729de860eb' },
              ]),
            }),
          }),
        },
        PivotEventIntent: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { userId: '507f191e810c19729de860ea' },
              ]),
            }),
          }),
        },
        User: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { _id: '507f191e810c19729de860eb', pushToken: 'ExponentPushToken[x]' },
              ]),
            }),
          }),
        },
        PivotCrewNudgeSent: {
          findOne: jest.fn(() => ({
            select: jest.fn(() => ({
              lean: nudgeSentFindOneLean,
            })),
          })),
          create: nudgeSentCreate,
        },
      };

      return names.reduce((acc, name) => {
        acc[name] = models[name];
        return acc;
      }, {});
    });

    axios.post.mockResolvedValue({
      data: { data: [{ status: 'ok' }] },
    });

    const afterWindow = new Date(
      resolveNudgeEligibleAtMs(nycTenant, batchWeek, 12, new Date('2026-06-04T20:00:00.000Z')),
    );

    const first = await sendCrewUnfinishedSwipeNudgesForTenant(
      { school: 'nyc' },
      { batchWeek, now: afterWindow },
    );
    const second = await sendCrewUnfinishedSwipeNudgesForTenant(
      { school: 'nyc' },
      { batchWeek, now: afterWindow },
    );

    expect(first.data.sent).toBe(1);
    expect(first.data.crewsNudged).toBe(1);
    expect(second.data.sent).toBe(0);
    expect(nudgeSentCreate).toHaveBeenCalledTimes(1);
  });
});
