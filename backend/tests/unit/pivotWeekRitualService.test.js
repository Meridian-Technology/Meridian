const {
  computeRitualPhase,
  buildRitualActions,
  buildRitualRecap,
} = require('../../services/pivotWeekRitualService');
const { buildRitualNudge } = require('../../utilities/pivotRitualNudge');
const {
  buildDecideQueueOrder,
  pickCrewsNeedingDecide,
} = require('../../utilities/pivotCrewDecideQueue');

describe('pivotWeekRitualService helpers', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const openWindow = '2026-07-25T12:00:00.000Z';
  const closedWindow = '2026-07-23T12:00:00.000Z';

  const baseCrew = {
    crewId: 'crew-a',
    name: 'Friday Plans',
    swipedCount: 3,
    activeCount: 3,
    invitedCount: 0,
    quorumMet: true,
    judgementStatus: 'proposed',
    proposedEvent: { id: 'event-1', name: 'Jazz Night' },
    runnerUp: null,
    judgementWindowEndsAt: openWindow,
  };

  describe('computeRitualPhase', () => {
    it('returns pre_drop while calendar-week drop is pending', () => {
      expect(
        computeRitualPhase({
          hasCrews: true,
          dropPending: true,
          deck: { complete: false, started: false },
          decideQueueOrder: [],
        }),
      ).toBe('pre_drop');
    });

    it('returns solo for zero-crew users after drop', () => {
      expect(
        computeRitualPhase({
          hasCrews: false,
          dropPending: false,
          deck: { complete: false, started: false },
          decideQueueOrder: [],
        }),
      ).toBe('solo');
    });

    it('returns drop_live when crews exist but deck has not started', () => {
      expect(
        computeRitualPhase({
          hasCrews: true,
          dropPending: false,
          deck: { complete: false, started: false },
          decideQueueOrder: [],
        }),
      ).toBe('drop_live');
    });

    it('returns swiping while deck is incomplete and started', () => {
      expect(
        computeRitualPhase({
          hasCrews: true,
          dropPending: false,
          deck: { complete: false, started: true },
          decideQueueOrder: [],
        }),
      ).toBe('swiping');
    });

    it('returns decide when judgement queue is non-empty', () => {
      expect(
        computeRitualPhase({
          hasCrews: true,
          dropPending: false,
          deck: { complete: true, started: true },
          decideQueueOrder: ['crew-a'],
        }),
      ).toBe('decide');
    });

    it('returns recap when deck is complete and no decide is pending', () => {
      expect(
        computeRitualPhase({
          hasCrews: true,
          dropPending: false,
          deck: { complete: true, started: true },
          decideQueueOrder: [],
        }),
      ).toBe('recap');
    });
  });

  describe('buildDecideQueueOrder', () => {
    it('includes only crews with open proposed/split windows', () => {
      const crews = [
        baseCrew,
        {
          ...baseCrew,
          crewId: 'crew-b',
          judgementStatus: 'split',
          judgementWindowEndsAt: openWindow,
        },
        {
          ...baseCrew,
          crewId: 'crew-c',
          judgementStatus: 'proposed',
          judgementWindowEndsAt: closedWindow,
        },
        {
          ...baseCrew,
          crewId: 'crew-d',
          judgementStatus: 'confirmed',
          judgementWindowEndsAt: openWindow,
        },
      ];

      expect(buildDecideQueueOrder(crews, now)).toEqual(['crew-a', 'crew-b']);
      expect(pickCrewsNeedingDecide(crews, now)).toHaveLength(2);
    });
  });

  describe('buildRitualActions', () => {
    it('maps phases to client action flags', () => {
      expect(buildRitualActions('decide')).toEqual({
        openDeck: false,
        openDecide: true,
        openRecap: false,
      });
      expect(buildRitualActions('recap')).toEqual({
        openDeck: false,
        openDecide: false,
        openRecap: true,
      });
      expect(buildRitualActions('swiping')).toEqual({
        openDeck: true,
        openDecide: false,
        openRecap: false,
      });
    });
  });

  describe('buildRitualNudge', () => {
    it('prioritizes decide nudge over swipe', () => {
      expect(
        buildRitualNudge({
          phase: 'decide',
          decideQueueOrder: ['crew-a'],
          deck: { remaining: 0, complete: true },
          crews: [{ swipeProgress: { quorumMet: true } }],
        }),
      ).toEqual({
        type: 'decide',
        crewId: 'crew-a',
        copyKey: 'crew.ritual.nudgeDecide',
      });
    });
  });

  describe('buildRitualRecap', () => {
    it('splits legacy recap into crewOutcomes and personal', () => {
      expect(
        buildRitualRecap({
          crewPicks: [{ crewId: 'crew-a' }],
          events: [{ _id: 'event-1' }],
        }),
      ).toEqual({
        crewOutcomes: [{ crewId: 'crew-a' }],
        personal: [{ _id: 'event-1' }],
      });
    });
  });
});
