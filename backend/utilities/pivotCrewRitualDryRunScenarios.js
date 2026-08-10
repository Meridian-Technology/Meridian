/**
 * Ritual dry-run fixtures for solo, multi-crew, split decide, and invited-only weeks.
 * Used by `npm run dry-run:pivot-crew-ritual` and unit tests.
 */

const mongoose = require('mongoose');

const BATCH_WEEK = '2026-W30';
const DROP_LIVE_NOW = new Date('2026-07-24T12:00:00.000Z');
const OPEN_WINDOW = '2026-07-25T12:00:00.000Z';

function mockDeckSnapshot(getModels, { orderedEventIds = [], intentEventIds = [] } = {}) {
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

const PIVOT_CREW_RITUAL_DRY_RUN_SCENARIOS = [
  {
    id: 'solo',
    label: 'solo user — deck in progress, no crews',
    setup({ getPivotCrewWeekProgress, loadCrewMemberSwipeMaps, getModels }) {
      getPivotCrewWeekProgress.mockResolvedValue({
        data: { batchWeek: BATCH_WEEK, crews: [] },
      });
      loadCrewMemberSwipeMaps.mockResolvedValue(new Map());
      mockDeckSnapshot(getModels, {
        orderedEventIds: ['665a1b2c3d4e5f6789012345', '665a1b2c3d4e5f6789012346'],
        intentEventIds: ['665a1b2c3d4e5f6789012345'],
      });
    },
    assert(result) {
      expect(result.data.phase).toBe('solo');
      expect(result.data.crews).toEqual([]);
      expect(result.data.actions.openDeck).toBe(true);
      expect(result.data.recap).toBeUndefined();
    },
  },
  {
    id: 'one-crew',
    label: 'one crew — drop live before deck starts',
    setup({ getPivotCrewWeekProgress, loadCrewMemberSwipeMaps, getModels }) {
      getPivotCrewWeekProgress.mockResolvedValue({
        data: {
          batchWeek: BATCH_WEEK,
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
      loadCrewMemberSwipeMaps.mockResolvedValue(new Map());
      mockDeckSnapshot(getModels, {
        orderedEventIds: ['665a1b2c3d4e5f6789012347'],
        intentEventIds: [],
      });
    },
    assert(result) {
      expect(result.data.phase).toBe('drop_live');
      expect(result.data.crews).toHaveLength(1);
      expect(result.data.actions.openDeck).toBe(true);
    },
  },
  {
    id: 'three-crews',
    label: 'three crews — swiping with partial deck progress',
    setup({ getPivotCrewWeekProgress, loadCrewMemberSwipeMaps, getModels }) {
      getPivotCrewWeekProgress.mockResolvedValue({
        data: {
          batchWeek: BATCH_WEEK,
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
      loadCrewMemberSwipeMaps.mockResolvedValue(new Map());
      mockDeckSnapshot(getModels, {
        orderedEventIds: [
          '665a1b2c3d4e5f6789012345',
          '665a1b2c3d4e5f6789012346',
          '665a1b2c3d4e5f6789012347',
        ],
        intentEventIds: ['665a1b2c3d4e5f6789012345'],
      });
    },
    assert(result) {
      expect(result.data.phase).toBe('swiping');
      expect(result.data.crews).toHaveLength(3);
      expect(result.data.deck.remaining).toBe(2);
    },
  },
  {
    id: 'split-decide',
    label: 'split judgement — decide queue with proposed + split crews',
    setup({ getPivotCrewWeekProgress, loadCrewMemberSwipeMaps, getModels }) {
      getPivotCrewWeekProgress.mockResolvedValue({
        data: {
          batchWeek: BATCH_WEEK,
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
              judgementWindowEndsAt: OPEN_WINDOW,
            },
            {
              crewId: '665a1b2c3d4e5f6789012346',
              name: 'Saturday Crew',
              swipedCount: 3,
              activeCount: 3,
              invitedCount: 0,
              quorumMet: true,
              judgementStatus: 'deciding',
              proposedEvent: { id: 'event-2', name: 'Comedy Show' },
              runnerUp: { id: 'event-3', name: 'Gallery Walk' },
              judgementWindowEndsAt: OPEN_WINDOW,
              consensus: {
                startedAt: '2026-07-24T10:00:00.000Z',
                endsAt: OPEN_WINDOW,
                swapsRemaining: 1,
                swapBudget: 2,
                confirmedCount: 1,
                activeCount: 3,
              },
            },
          ],
        },
      });
      loadCrewMemberSwipeMaps.mockResolvedValue(new Map());
      mockDeckSnapshot(getModels, {
        orderedEventIds: ['665a1b2c3d4e5f6789012347'],
        intentEventIds: ['665a1b2c3d4e5f6789012347'],
      });
    },
    assert(result) {
      expect(result.data.phase).toBe('decide');
      expect(result.data.decideQueueOrder).toEqual([
        '665a1b2c3d4e5f6789012345',
        '665a1b2c3d4e5f6789012346',
      ]);
      expect(result.data.actions.openDecide).toBe(true);
      expect(result.data.crews[1].judgement.status).toBe('deciding');
      expect(result.data.crews[1].judgement.consensus?.swapsRemaining).toBe(1);
    },
  },
  {
    id: 'invited-only',
    label: 'invited placeholders — excluded from quorum, dashboard still live',
    setup({ getPivotCrewWeekProgress, loadCrewMemberSwipeMaps, getModels }) {
      getPivotCrewWeekProgress.mockResolvedValue({
        data: {
          batchWeek: BATCH_WEEK,
          crews: [{
            crewId: '665a1b2c3d4e5f6789012345',
            name: 'Friday Plans',
            swipedCount: 1,
            activeCount: 2,
            invitedCount: 2,
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
              { userId: null, displayLabel: 'invited', swiped: false, status: 'invited', role: 'member' },
            ],
          ],
        ]),
      );
      mockDeckSnapshot(getModels, {
        orderedEventIds: ['665a1b2c3d4e5f6789012347', '665a1b2c3d4e5f6789012348'],
        intentEventIds: ['665a1b2c3d4e5f6789012347'],
      });
    },
    assert(result) {
      expect(result.data.phase).toBe('swiping');
      expect(result.data.crews[0].swipeProgress.members.filter((m) => m.status === 'invited')).toHaveLength(2);
      expect(result.data.crews[0].swipeProgress.quorumMet).toBe(false);
      expect(result.data.actions.openDecide).toBe(false);
    },
  },
];

module.exports = {
  BATCH_WEEK,
  DROP_LIVE_NOW,
  PIVOT_CREW_RITUAL_DRY_RUN_SCENARIOS,
};
