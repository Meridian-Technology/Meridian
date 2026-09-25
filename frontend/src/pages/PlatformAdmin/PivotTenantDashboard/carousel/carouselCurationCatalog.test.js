import { candidateToCatalogEvent, editorialPin, filterCurationCandidates } from './carouselCurationCatalog';

function candidate(name, extras = {}) {
  return {
    ref: { sourceTenantKey: 'sf', eventId: extras.id || name },
    snapshot: {
      name,
      host: extras.host || 'nadine',
      location: extras.location || 'warehouse',
      startTime: extras.startTime || '2026-09-20T20:00:00.000Z',
      tags: extras.tags || [],
      featured: extras.featured === true,
      rankingOverride: extras.rankingOverride || null,
      image: extras.image || 'https://cdn.example/a.jpg',
    },
  };
}

describe('carousel catalog filter list', () => {
  test('maps a candidate into the curation row shape', () => {
    const event = candidateToCatalogEvent(candidate('Lanterns', {
      featured: true,
      rankingOverride: { tier: 'promote', audience: 'everyone' },
    }));
    expect(event).toMatchObject({
      name: 'Lanterns',
      organizerName: 'nadine',
      featured: true,
      rankingOverride: { tier: 'promote', audience: 'everyone' },
    });
  });

  test('featured outranks promote, and the filter is local like the curation panel', () => {
    const rows = [
      candidate('Tonight'),
      candidate('Older featured', { featured: true }),
      candidate('Promoted jazz', { rankingOverride: { tier: 'promote' } }),
    ];
    expect(editorialPin(rows[1])).toBeGreaterThan(editorialPin(rows[2]));
    expect(filterCurationCandidates(rows, 'jazz').map((row) => row.snapshot.name)).toEqual([
      'Promoted jazz',
    ]);
    expect(filterCurationCandidates(rows, '').map((row) => row.snapshot.name)).toHaveLength(3);
  });
});
