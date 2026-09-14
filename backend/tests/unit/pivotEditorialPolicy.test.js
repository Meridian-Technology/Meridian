const {
  normalizeRankingOverride,
  editorialAdjustmentForEvent,
} = require('../../utilities/pivotEditorialPolicy');

function event(tier, audience = 'everyone', tags = ['music']) {
  return {
    customFields: {
      pivot: {
        tags,
        rankingOverride: { tier, audience },
      },
    },
  };
}

describe('pivotEditorialPolicy', () => {
  it('clears standard and null overrides', () => {
    expect(normalizeRankingOverride(null)).toEqual({ value: null });
    expect(normalizeRankingOverride({ tier: 'standard' })).toEqual({ value: null });
  });

  it('normalizes a promotion with audit metadata', () => {
    const result = normalizeRankingOverride(
      { tier: 'strong_promote', audience: 'matching_interests', note: ' Launch anchor ' },
      { actor: 'ops@example.com', now: new Date('2026-09-14T00:00:00.000Z') },
    );
    expect(result.value).toEqual({
      tier: 'strong_promote',
      audience: 'matching_interests',
      note: 'Launch anchor',
      updatedBy: 'ops@example.com',
      updatedAt: '2026-09-14T00:00:00.000Z',
    });
  });

  it('rejects interest targeting for non-promotion tiers', () => {
    expect(
      normalizeRankingOverride({ tier: 'demote', audience: 'matching_interests' }),
    ).toMatchObject({ code: 'INVALID_EDITORIAL_AUDIENCE' });
  });

  it('applies a matching-interest promotion exactly once', () => {
    const promoted = event('promote', 'matching_interests', ['music', 'comedy']);
    expect(editorialAdjustmentForEvent(promoted, new Set(['music', 'comedy']))).toMatchObject({
      adjustment: 0.7,
      matched: true,
    });
    expect(editorialAdjustmentForEvent(promoted, new Set(['sports']))).toMatchObject({
      adjustment: 0,
      matched: false,
    });
  });

  it('uses fixed universal adjustments', () => {
    expect(editorialAdjustmentForEvent(event('demote')).adjustment).toBe(-0.7);
    expect(editorialAdjustmentForEvent(event('strong_promote')).adjustment).toBe(1.5);
    expect(editorialAdjustmentForEvent(event('must_show')).adjustment).toBe(0);
  });
});
