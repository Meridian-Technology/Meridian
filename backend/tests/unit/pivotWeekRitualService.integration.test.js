jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

jest.mock('../../services/pivotCrewWeekStateService', () => ({
  getPivotCrewWeekProgress: jest.fn(),
}));

jest.mock('../../services/pivotIntentService', () => ({
  getWeekRecap: jest.fn(),
}));

jest.mock('../../services/pivotCrewRitualEnrichment', () => ({
  loadCrewMemberSwipeMaps: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

const mongoose = require('mongoose');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { getPivotCrewWeekProgress } = require('../../services/pivotCrewWeekStateService');
const { getWeekRecap } = require('../../services/pivotIntentService');
const { loadCrewMemberSwipeMaps } = require('../../services/pivotCrewRitualEnrichment');
const getModels = require('../../services/getModelService');
const { getPivotWeekRitual } = require('../../services/pivotWeekRitualService');

describe('getPivotWeekRitual', () => {
  const userId = '507f191e810c19729de860eb';
  const req = { school: 'nyc', user: { userId } };

  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotPilot: true,
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  const openWindow = '2026-07-25T12:00:00.000Z';

  function mockDeckSnapshot({ orderedEventIds = [], intentEventIds = [] } = {}) {
    const snapshotFindOne = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          orderedEventIds.length
            ? { orderedEventIds: orderedEventIds.map((id) => new mongoose.Types.ObjectId(id)) }
            : null,
        ),
      }),
    });
    const intentFind = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          intentEventIds.map((eventId) => ({
            eventId: new mongoose.Types.ObjectId(eventId),
          })),
        ),
      }),
    });

    getModels.mockReturnValue({
      PivotDeckSnapshot: { findOne: snapshotFindOne },
      PivotEventIntent: { find: intentFind },
    });
  }

  beforeEach(() => {
    getTenantByKey.mockReset();
    getPivotCrewWeekProgress.mockReset();
    getWeekRecap.mockReset();
    getModels.mockReset();
    loadCrewMemberSwipeMaps.mockReset();
    getTenantByKey.mockResolvedValue(nycTenant);
    loadCrewMemberSwipeMaps.mockResolvedValue(new Map());
  });

  it('includes per-member swipe status on ritual crews', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [{
          crewId: '665a1b2c3d4e5f6789012345',
          name: 'Friday Plans',
          swipedCount: 2,
          activeCount: 3,
          invitedCount: 1,
          quorumMet: false,
          judgementStatus: 'awaiting_quorum',
          proposedEvent: null,
          runnerUp: null,
          judgementWindowEndsAt: null,
        }],
      },
    });
    loadCrewMemberSwipeMaps.mockResolvedValue(
      new Map([
        [
          '665a1b2c3d4e5f6789012345',
          [
            { userId: 'user-a', displayLabel: 'Alex', swiped: true, status: 'active', role: 'owner' },
            { userId: 'user-b', displayLabel: 'Sam', swiped: false, status: 'active', role: 'member' },
            { userId: null, displayLabel: 'invited', swiped: false, status: 'invited', role: 'member' },
          ],
        ],
      ]),
    );
    mockDeckSnapshot({
      orderedEventIds: ['665a1b2c3d4e5f6789012347', '665a1b2c3d4e5f6789012348'],
      intentEventIds: ['665a1b2c3d4e5f6789012347'],
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.crews[0].swipeProgress.members).toHaveLength(3);
    expect(result.data.crews[0].swipeProgress.members[0].swiped).toBe(true);
  });

  it('returns pre_drop while calendar-week drop is still pending', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [{
          crewId: '665a1b2c3d4e5f6789012345',
          name: 'Friday Plans',
          swipedCount: 0,
          activeCount: 3,
          invitedCount: 0,
          quorumMet: false,
          judgementStatus: 'awaiting_quorum',
          proposedEvent: null,
          runnerUp: null,
          judgementWindowEndsAt: null,
        }],
      },
    });
    mockDeckSnapshot();

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('pre_drop');
    expect(result.data.actions.openDeck).toBe(false);
  });

  it('returns solo swiping phase for users with no crews', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: { batchWeek: '2026-W30', crews: [] },
    });
    mockDeckSnapshot({
      orderedEventIds: ['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346'],
      intentEventIds: ['665a1b2c3d4e5f6789012345'],
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('solo');
    expect(result.data.crews).toEqual([]);
    expect(result.data.deck.remaining).toBe(1);
    expect(result.data.actions.openDeck).toBe(true);
    expect(result.data.recap).toBeUndefined();
  });

  it('returns drop_live for one crew before deck starts', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [{
          crewId: '665a1b2c3d4e5f6789012345',
          name: 'Friday Plans',
          swipedCount: 0,
          activeCount: 3,
          invitedCount: 0,
          quorumMet: false,
          judgementStatus: 'awaiting_quorum',
          proposedEvent: null,
          runnerUp: null,
          judgementWindowEndsAt: null,
        }],
      },
    });
    mockDeckSnapshot({
      orderedEventIds: ['665a1b2c3d4e5f6789012347'],
      intentEventIds: [],
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('drop_live');
    expect(result.data.crews).toHaveLength(1);
    expect(result.data.deck.remaining).toBe(1);
    expect(result.data.deck.complete).toBe(false);
  });

  it('returns swiping for three crews with partial deck progress', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: ['a', 'b', 'c'].map((suffix, index) => ({
          crewId: `665a1b2c3d4e5f678901234${index}`,
          name: `Crew ${suffix.toUpperCase()}`,
          swipedCount: index + 1,
          activeCount: 3,
          invitedCount: 0,
          quorumMet: index > 0,
          judgementStatus: 'awaiting_quorum',
          proposedEvent: null,
          runnerUp: null,
          judgementWindowEndsAt: null,
        })),
      },
    });
    mockDeckSnapshot({
      orderedEventIds: [
        '665a1b2c3d4e5f6789012345',
        '665a1b2c3d4e5f6789012346',
        '665a1b2c3d4e5f6789012347',
      ],
      intentEventIds: ['665a1b2c3d4e5f6789012345'],
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('swiping');
    expect(result.data.crews).toHaveLength(3);
    expect(result.data.deck.remaining).toBe(2);
  });

  it('returns decide with queue when judgement is pending', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [
          {
            crewId: '665a1b2c3d4e5f6789012345',
            name: 'Friday Plans',
            swipedCount: 3,
            activeCount: 3,
            invitedCount: 0,
            quorumMet: true,
            judgementStatus: 'proposed',
            proposedEvent: { id: 'event-1', name: 'Jazz Night' },
            runnerUp: null,
            judgementWindowEndsAt: openWindow,
          },
          {
            crewId: '665a1b2c3d4e5f6789012346',
            name: 'Saturday Crew',
            swipedCount: 3,
            activeCount: 3,
            invitedCount: 0,
            quorumMet: true,
            judgementStatus: 'split',
            proposedEvent: { id: 'event-2', name: 'Comedy Show' },
            runnerUp: { id: 'event-3', name: 'Gallery Walk' },
            judgementWindowEndsAt: openWindow,
          },
        ],
      },
    });
    mockDeckSnapshot({
      orderedEventIds: ['665a1b2c3d4e5f6789012347'],
      intentEventIds: ['665a1b2c3d4e5f6789012347'],
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('decide');
    expect(result.data.decideQueueOrder).toEqual([
      '665a1b2c3d4e5f6789012345',
      '665a1b2c3d4e5f6789012346',
    ]);
    expect(result.data.crews[0].judgement.needsUserAction).toBe(true);
    expect(result.data.actions.openDecide).toBe(true);
    expect(result.data.nudge).toEqual({
      type: 'decide',
      crewId: '665a1b2c3d4e5f6789012345',
      copyKey: 'crew.ritual.nudgeDecide',
    });
  });

  it('returns recap with crew-first payload when deck is complete', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [{
          crewId: '665a1b2c3d4e5f6789012345',
          name: 'Friday Plans',
          swipedCount: 3,
          activeCount: 3,
          invitedCount: 0,
          quorumMet: true,
          judgementStatus: 'confirmed',
          proposedEvent: { id: 'event-1', name: 'Jazz Night' },
          runnerUp: null,
          judgementWindowEndsAt: null,
        }],
      },
    });
    mockDeckSnapshot({
      orderedEventIds: ['665a1b2c3d4e5f6789012347'],
      intentEventIds: ['665a1b2c3d4e5f6789012347'],
    });
    getWeekRecap.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crewPicks: [{ crewId: '665a1b2c3d4e5f6789012345', crewName: 'Friday Plans' }],
        events: [{ _id: 'event-9', name: 'My Pick' }],
      },
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: '2026-W30',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(result.data.phase).toBe('recap');
    expect(result.data.recap).toEqual({
      crewOutcomes: [{ crewId: '665a1b2c3d4e5f6789012345', crewName: 'Friday Plans' }],
      personal: [{ _id: 'event-9', name: 'My Pick' }],
    });
    expect(result.data.actions.openRecap).toBe(true);
    expect(getWeekRecap).toHaveBeenCalledWith(req, expect.objectContaining({ batchWeek: '2026-W30' }));
  });
});
