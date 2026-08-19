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
    expect(resolveCrewWeeklyDropBody('decide')).toBe(CREW_WEEKLY_DROP_PUSH_BODIES.decide);
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
    expect(resolveCrewWeeklyDropBody('recap')).toBe(CREW_WEEKLY_DROP_PUSH_BODIES.recap);
  });

  it('keeps bundled fallbacks when the copy pack is empty', () => {
    const emptyPack = { entries: {}, tokens: {} };
    expect(resolveCrewWeeklyDropBody('ritual')).toBe(CREW_WEEKLY_DROP_PUSH_BODIES.ritual);
    expect(resolveCrewWeeklyDropBody('unfinished', emptyPack)).toBe(
      CREW_WEEKLY_DROP_PUSH_BODIES.unfinished,
    );
    expect(resolveCrewWeeklyDropBody('decide', emptyPack)).toBe(
      CREW_WEEKLY_DROP_PUSH_BODIES.decide,
    );
    expect(resolveCrewWeeklyDropBody('recap', null)).toBe(CREW_WEEKLY_DROP_PUSH_BODIES.recap);
  });

  it('formats overlay templates with pack tokens', () => {
    const pack = {
      entries: {
        'crew.push.weeklyDrop.ritualBody':
          "where's your {group.singular} going this week?",
      },
      tokens: { 'group.singular': 'block' },
    };
    expect(resolveCrewWeeklyDropBody('ritual', pack)).toBe(
      "where's your block going this week?",
    );
  });

  it('falls back when an overlay template is broken', () => {
    const pack = {
      entries: {
        'crew.push.weeklyDrop.unfinishedBody': '{unterminated',
      },
      tokens: {},
    };
    expect(resolveCrewWeeklyDropBody('unfinished', pack)).toBe(
      CREW_WEEKLY_DROP_PUSH_BODIES.unfinished,
    );
  });

  it('counts unfinished swipers from week progress', () => {
    expect(countUnfinishedSwipers({ activeMemberCount: 4, swipedCount: 2 })).toBe(2);
  });
});
