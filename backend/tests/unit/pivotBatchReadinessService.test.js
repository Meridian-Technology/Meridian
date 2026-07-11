const {
  buildBatchReadiness,
  computeCatalogMetrics,
  WEIGHTS,
} = require('../../services/pivotBatchReadinessService');

function makeEvent({
  ingestStatus = 'staged',
  tags = ['nightlife'],
  hostName = 'Host',
  description = 'A fun night out',
  image = 'https://example.com/img.jpg',
} = {}) {
  return {
    description,
    image,
    customFields: {
      pivot: {
        ingestStatus,
        tags,
        host: hostName ? { name: hostName } : {},
      },
    },
  };
}

describe('pivotBatchReadinessService', () => {
  describe('computeCatalogMetrics', () => {
    it('counts deck coverage and gaps', () => {
      const metrics = computeCatalogMetrics([
        makeEvent({ ingestStatus: 'staged', tags: ['a'] }),
        makeEvent({ ingestStatus: 'published', tags: ['a', 'b'] }),
        makeEvent({ ingestStatus: 'draft', tags: [] }),
        makeEvent({ ingestStatus: 'staged', tags: [], hostName: '' }),
      ]);

      expect(metrics.readyCount).toBe(4);
      expect(metrics.stagedCount).toBe(2);
      expect(metrics.publishedCount).toBe(1);
      expect(metrics.draftCount).toBe(1);
      expect(metrics.deckCount).toBe(3);
      expect(metrics.untaggedCount).toBe(1);
      expect(metrics.missingHostCount).toBe(1);
      expect(metrics.tagCoveragePct).toBeCloseTo(2 / 3);
      expect(metrics.uniqueTags).toBe(2);
    });
  });

  describe('buildBatchReadiness', () => {
    it('scores a strong catalog near 100 and emits no CTAs', () => {
      const events = Array.from({ length: 40 }, (_, i) =>
        makeEvent({
          ingestStatus: i % 5 === 0 ? 'published' : 'staged',
          tags: [`tag-${i % 8}`],
        }),
      );
      const metrics = computeCatalogMetrics(events);
      const result = buildBatchReadiness({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        metrics,
        targetEventCount: 40,
        hoursUntilDrop: 72,
        benchmarks: {
          readyCount: 35,
          tagCoveragePct: 0.8,
          hostCompletenessPct: 0.8,
          diversityRatio: 0.2,
          hoursUntilDrop: null,
        },
        benchmarkWeeksUsed: 3,
      });

      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.formula.version).toBe('v0');
      expect(result.formula.weights).toEqual(WEIGHTS);
      expect(result.components).toHaveLength(5);
      expect(result.ctas).toHaveLength(0);
      expect(result.benchmarkWeeksUsed).toBe(3);
    });

    it('fires CTAs and lowers score for a thin untagged catalog', () => {
      const metrics = computeCatalogMetrics([
        makeEvent({ ingestStatus: 'draft', tags: [], hostName: '' }),
        makeEvent({ ingestStatus: 'staged', tags: [], hostName: '' }),
      ]);
      const result = buildBatchReadiness({
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        metrics,
        targetEventCount: 40,
        hoursUntilDrop: 6,
        benchmarks: {
          readyCount: 36,
          tagCoveragePct: 0.9,
          hostCompletenessPct: 0.95,
          diversityRatio: 0.4,
          hoursUntilDrop: null,
        },
        benchmarkWeeksUsed: 4,
      });

      expect(result.score).toBeLessThan(40);
      expect(result.ctas.map((c) => c.id)).toEqual(
        expect.arrayContaining(['add-events', 'tag-events', 'fix-hosts', 'stage-drafts']),
      );
      const tagCta = result.ctas.find((c) => c.id === 'tag-events');
      expect(tagCta.href).toContain('filter=untagged');
      expect(tagCta.href).toContain('page=1');
      expect(tagCta.href).toContain('batchWeek=2026-W28');

      const eventComponent = result.components.find((c) => c.key === 'eventCount');
      expect(eventComponent.status).toBe('below');
      expect(eventComponent.weight).toBe(0.4);
    });

    it('documents formula weights summing to 1', () => {
      const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1);
    });
  });
});
