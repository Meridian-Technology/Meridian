const {
  RITUAL_NUDGE_TYPES,
  buildRitualNudge,
} = require('../../utilities/pivotRitualNudge');

describe('pivotRitualNudge', () => {
  it('returns at most one nudge directive', () => {
    const nudge = buildRitualNudge({
      phase: 'decide',
      decideQueueOrder: ['crew-a', 'crew-b'],
      deck: { remaining: 0, complete: true },
      crews: [{ swipeProgress: { quorumMet: true } }],
    });

    expect(Object.keys(nudge)).toEqual(['type', 'crewId', 'copyKey']);
    expect(RITUAL_NUDGE_TYPES).toContain(nudge.type);
  });

  it('covers all ritual nudge types by phase priority', () => {
    expect(
      buildRitualNudge({
        phase: 'recap',
        decideQueueOrder: [],
        deck: { remaining: 0, complete: true },
        crews: [],
      })?.type,
    ).toBe('recap');

    expect(
      buildRitualNudge({
        phase: 'swiping',
        decideQueueOrder: [],
        deck: { remaining: 3, complete: false },
        crews: [],
      })?.type,
    ).toBe('swipe');

    expect(
      buildRitualNudge({
        phase: 'drop_live',
        decideQueueOrder: [],
        deck: { remaining: 5, complete: false },
        crews: [{ swipeProgress: { quorumMet: false } }],
      })?.type,
    ).toBe('quorum_waiting');
  });
});
