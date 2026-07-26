const {
  startConsensusWindow,
  extendConsensusWindowOnSwap,
  isConsensusExpired,
  isUnanimousOnCurrentProposal,
  resolveLockedJudgementStatus,
  upsertMemberJudgement,
  memberConfirmedCurrentProposal,
  resolveEffectiveConsensusEndsAt,
} = require('../../utilities/pivotCrewConsensus');

describe('pivotCrewConsensus', () => {
  const crewConfig = {
    judgement: {
      consensusWindowMinutes: 180,
      swapResetBonusMinutes: 15,
      crewSwapBudget: 2,
    },
  };

  it('starts a 3h consensus window capped by hard deadline', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const hardDeadline = '2026-07-24T13:00:00.000Z';
    const started = startConsensusWindow(now, crewConfig, hardDeadline);
    expect(started.consensusStartedAt).toBe(now.toISOString());
    expect(started.consensusEndsAt).toBe(hardDeadline);
  });

  it('extends consensus window on swap by bonus minutes', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const weekState = {
      consensusStartedAt: '2026-07-24T10:00:00.000Z',
      consensusEndsAt: '2026-07-24T13:00:00.000Z',
    };
    const extended = extendConsensusWindowOnSwap(
      weekState,
      now,
      crewConfig,
      '2026-07-25T12:00:00.000Z',
    );
    expect(extended.consensusEndsAt).toBe('2026-07-24T13:15:00.000Z');
  });

  it('detects consensus expiry via effective endsAt', () => {
    const weekState = {
      judgementStatus: 'deciding',
      consensusEndsAt: '2026-07-24T15:00:00.000Z',
    };
    expect(
      isConsensusExpired(weekState, '2026-07-24T14:00:00.000Z', new Date('2026-07-24T14:00:00.000Z')),
    ).toBe(true);
    expect(
      isConsensusExpired(weekState, '2026-07-24T16:00:00.000Z', new Date('2026-07-24T14:00:00.000Z')),
    ).toBe(false);
  });

  it('requires unanimous confirms on current proposal', () => {
    const proposedEventId = 'event-1';
    const judgements = [
      { userId: 'a', action: 'confirmed', eventId: proposedEventId },
      { userId: 'b', action: 'swapped', eventId: proposedEventId },
    ];
    expect(
      isUnanimousOnCurrentProposal({
        activeMemberUserIds: ['a', 'b'],
        memberJudgements: judgements,
        proposedEventId,
      }),
    ).toBe(true);
    expect(
      isUnanimousOnCurrentProposal({
        activeMemberUserIds: ['a', 'b', 'c'],
        memberJudgements: judgements,
        proposedEventId,
      }),
    ).toBe(false);
  });

  it('marks locked status as swapped when candidate differs from original', () => {
    expect(
      resolveLockedJudgementStatus(
        { originalProposedEventId: 'event-1' },
        'event-2',
      ),
    ).toBe('swapped');
    expect(
      resolveLockedJudgementStatus(
        { originalProposedEventId: 'event-1' },
        'event-1',
      ),
    ).toBe('confirmed');
  });

  it('upserts member judgements and tracks current confirm', () => {
    const first = upsertMemberJudgement([], {
      userId: 'a',
      action: 'confirmed',
      eventId: 'event-1',
      at: new Date('2026-07-24T12:00:00.000Z'),
    });
    const second = upsertMemberJudgement(first, {
      userId: 'a',
      action: 'confirmed',
      eventId: 'event-1',
      at: new Date('2026-07-24T12:05:00.000Z'),
    });
    expect(second).toHaveLength(1);
    expect(memberConfirmedCurrentProposal(second, 'a', 'event-1')).toBe(true);
  });

  it('resolveEffectiveConsensusEndsAt picks the earlier deadline', () => {
    expect(
      resolveEffectiveConsensusEndsAt(
        '2026-07-24T15:00:00.000Z',
        '2026-07-24T14:00:00.000Z',
      ),
    ).toBe('2026-07-24T14:00:00.000Z');
  });
});
