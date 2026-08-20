const { clusterHostNames } = require('../../migrations/clusterPivotHostNames');

describe('clusterPivotHostNames', () => {
  it('groups raw vs normalized names and counts coverage without writing ids', () => {
    const report = clusterHostNames([
      {
        customFields: {
          pivot: {
            host: { name: "Gabe's", profileUrl: 'https://partiful.com/u/gabes' },
            batchWeek: '2026-W28',
            source: 'partiful',
          },
        },
      },
      {
        customFields: {
          pivot: {
            host: { name: 'Gabe\u2019s' },
            batchWeek: '2026-W29',
            source: 'generic-site',
          },
        },
      },
      {
        customFields: {
          pivot: {
            host: { name: 'Alice & Bob', imageUrl: 'https://cdn.example/a.jpg' },
            batchWeek: '2026-W28',
            source: 'luma',
          },
        },
      },
      {
        customFields: { pivot: { host: {}, batchWeek: '2026-W28', source: 'manual' } },
      },
    ]);

    expect(report.scanned).toBe(4);
    expect(report.withHostName).toBe(3);
    expect(report.missingHostName).toBe(1);
    expect(report.uniqueRaw).toBe(3);
    expect(report.uniqueNormalized).toBe(2);
    expect(report.collisions).toBe(1);
    expect(report.withProfileUrl).toBe(1);
    expect(report.withImageUrl).toBe(1);
    expect(report.multiHost).toBe(1);
    expect(report.collisionRows[0].rawNames).toEqual(["Gabe's", 'Gabe’s']);
  });

  it('uses the shared normalizer so LLC variants collide and city suffixes do not', () => {
    const report = clusterHostNames([
      {
        customFields: {
          pivot: {
            host: { name: 'Roof Records' },
            batchWeek: '2026-W28',
            source: 'luma',
          },
        },
      },
      {
        customFields: {
          pivot: {
            host: { name: 'Roof Records, LLC' },
            batchWeek: '2026-W29',
            source: 'generic-site',
          },
        },
      },
      {
        customFields: {
          pivot: {
            host: { name: 'roof records nyc' },
            batchWeek: '2026-W29',
            source: 'generic-site',
          },
        },
      },
    ]);

    expect(report.uniqueRaw).toBe(3);
    expect(report.uniqueNormalized).toBe(2);
    expect(report.collisions).toBe(1);
    expect(report.collisionRows[0].rawNames).toEqual([
      'Roof Records',
      'Roof Records, LLC',
    ]);
  });
});
