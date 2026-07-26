const {
  buildDecideQueueOrder,
  crewNeedsUserAction,
  isJudgementWindowOpen,
} = require('../../utilities/pivotCrewDecideQueue');

describe('pivotCrewDecideQueue', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('isJudgementWindowOpen respects endsAt timestamp', () => {
    const endsAt = '2026-07-25T12:00:00.000Z';
    expect(isJudgementWindowOpen(endsAt, new Date('2026-07-24T12:00:00.000Z'))).toBe(true);
    expect(isJudgementWindowOpen(endsAt, new Date('2026-07-26T12:00:00.000Z'))).toBe(false);
  });

  it('crewNeedsUserAction is true for open proposed crews', () => {
    expect(
      crewNeedsUserAction(
        {
          quorumMet: true,
          judgementStatus: 'proposed',
          judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
    expect(
      crewNeedsUserAction(
        {
          quorumMet: true,
          judgementStatus: 'confirmed',
          judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
    expect(
      crewNeedsUserAction(
        {
          quorumMet: true,
          judgementStatus: 'deciding',
          judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
          viewerHasConfirmedCurrent: true,
        },
        now,
      ),
    ).toBe(false);
  });

  it('buildDecideQueueOrder preserves crew week order and includes deciding', () => {
    const crews = [
      {
        crewId: 'crew-1',
        quorumMet: true,
        judgementStatus: 'proposed',
        judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
      },
      {
        crewId: 'crew-2',
        quorumMet: true,
        judgementStatus: 'deciding',
        judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
      },
      {
        crewId: 'crew-3',
        quorumMet: true,
        judgementStatus: 'split',
        judgementWindowEndsAt: '2026-07-25T12:00:00.000Z',
      },
    ];

    expect(buildDecideQueueOrder(crews, now)).toEqual(['crew-1', 'crew-2', 'crew-3']);
  });
});
