const { calculateSourceScore, sourceAdjustment } = require('../../services/pivotSourceScoreService');

function event(week, ingestStatus, featured = false) {
  return { customFields: { pivot: { batchWeek: week, ingestStatus, featured } } };
}

describe('source scores', () => {
  const weeks = ['2026-W30', '2026-W29', '2026-W28'];

  it('uses publish and editorial rates without letting raw volume dominate', () => {
    const consistent = weeks.flatMap((week) => [event(week, 'published', true), event(week, 'published')]);
    const noisy = weeks.flatMap((week) => [event(week, 'published'), ...Array.from({ length: 6 }, () => event(week, 'staged'))]);
    const good = calculateSourceScore(consistent, weeks);
    const bad = calculateSourceScore(noisy, weeks);
    expect(good.quality).toBeGreaterThan(bad.quality);
    expect(good.reputation).toBeGreaterThan(bad.reputation);
    expect(good.batchCount).toBe(3);
    expect(bad.sampleSize).toBe(21);
    expect(good.breakdown).toMatchObject({
      eligibleCount: 6,
      publishedCount: 6,
      featuredCount: 3,
      publishRate: 1,
      featuredRate: 0.5,
    });
    expect(good.breakdown.history[0]).toMatchObject({ batchWeek: '2026-W30', eligible: 2,
      published: 2, featured: 1 });
  });

  it('ignores draft and unreleased weeks and yields no score without evidence', () => {
    expect(calculateSourceScore([event('2026-W30', 'draft'), event('2026-W31', 'published')], weeks))
      .toMatchObject({ quality: null, reputation: null, sampleSize: 0 });
    expect(calculateSourceScore([], []))
      .toMatchObject({ quality: null, reputation: null, sampleSize: 0,
        breakdown: { eligibleCount: 0, history: [], windowBatchCount: 0 } });
  });

  it('credits each observed entrypoint once per event', () => {
    const row = event('2026-W30', 'published', true);
    row.customFields.pivot.entrypointId = 'job-a';
    row.customFields.pivot.observedEntrypointIds = ['job-a', 'job-b', 'job-b'];
    const score = calculateSourceScore([row], weeks);
    expect(score.breakdown.entrypoints).toEqual({
      'job-a': { eligible: 1, published: 1, featured: 1 },
      'job-b': { eligible: 1, published: 1, featured: 1 },
    });
    expect(score.sampleSize).toBe(1);
  });

  it('bounds manual adjustments and allows an operator to promote a new source', () => {
    expect(sourceAdjustment({ rankingOverride: { tier: 'promote' } })).toBeCloseTo(0.35);
    expect(sourceAdjustment({ score: { quality: 1, reputation: 1 }, rankingOverride: { tier: 'strong_promote' } }))
      .toBeLessThanOrEqual(0.9);
    expect(sourceAdjustment({ score: { quality: 0, reputation: 0 }, rankingOverride: { tier: 'demote' } }))
      .toBeGreaterThanOrEqual(-0.6);
  });
});
