const {
  CREW_WEEKLY_DROP_PUSH_BODIES,
  countUnfinishedSwipers,
  resolveCrewWeeklyDropBody,
  resolveCrewWeeklyDropVariant,
} = require('../../utilities/pivotCrewPushCopy');

describe('pivotCrewPushCopy', () => {
  it('returns unfinished variant when crew has pending swipers', () => {
    expect(
      resolveCrewWeeklyDropVariant({
        hasCrew: true,
        userSwiped: false,
        anyCrewUnfinished: true,
      }),
    ).toBe('unfinished');
    expect(resolveCrewWeeklyDropBody('unfinished')).toBe(
      CREW_WEEKLY_DROP_PUSH_BODIES.unfinished,
    );
  });

  it('returns ritual variant once user and crew have swiped', () => {
    expect(
      resolveCrewWeeklyDropVariant({
        hasCrew: true,
        userSwiped: true,
        anyCrewUnfinished: false,
      }),
    ).toBe('ritual');
    expect(resolveCrewWeeklyDropBody('ritual')).toBe(
      CREW_WEEKLY_DROP_PUSH_BODIES.ritual,
    );
  });

  it('returns null for solo users', () => {
    expect(resolveCrewWeeklyDropVariant({ hasCrew: false })).toBeNull();
  });

  it('returns decide variant during decide phase instead of drop ritual copy', () => {
    expect(
      resolveCrewWeeklyDropVariant({
        hasCrew: true,
        userSwiped: true,
        anyCrewUnfinished: false,
        ritualPhase: 'decide',
      }),
    ).toBe('decide');
    expect(resolveCrewWeeklyDropBody('decide')).toBe("confirm where your crew's going");
  });

  it('returns recap variant during recap phase', () => {
    expect(
      resolveCrewWeeklyDropVariant({
        hasCrew: true,
        userSwiped: true,
        anyCrewUnfinished: false,
        ritualPhase: 'recap',
      }),
    ).toBe('recap');
  });

  it('counts unfinished swipers from week progress', () => {
    expect(countUnfinishedSwipers({ activeMemberCount: 4, swipedCount: 2 })).toBe(2);
  });
});
