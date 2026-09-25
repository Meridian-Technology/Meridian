import {
  chipsFromCurationQuery,
  removeCurationChip,
  resetCurationQuery,
} from './carouselCurationQuery';

describe('curation filter chips', () => {
  test('reset clears every active filter', () => {
    const dirty = {
      keyword: 'jazz',
      includeTerms: ['live'],
      excludeTerms: ['club'],
      sourceTenantKeys: ['sf'],
      dateFrom: '2026-09-01',
      temporalMode: 'past',
      batchWeek: '2026-W36',
      tags: { values: ['live-music'], match: 'all' },
      host: 'nadine',
      image: 'present',
      previouslyUsedInAccount: 'exclude',
      publication: 'inspect-unreleased',
      sort: 'ingested',
    };
    const reset = resetCurationQuery();
    expect(reset.keyword).toBe('');
    expect(reset.includeTerms).toEqual([]);
    expect(reset.tags.values).toEqual([]);
    expect(reset.publication).toBe('published');
    expect(chipsFromCurationQuery(reset)).toEqual([]);
    expect(chipsFromCurationQuery(dirty).map((chip) => chip.id)).toEqual([
      'keyword',
      'include:0',
      'exclude:0',
      'source:sf',
      'dates',
      'temporal',
      'week',
      'tags',
      'host',
      'image',
      'used',
      'publication',
      'sort',
    ]);
  });

  test('removing a chip does not leave a stale cursor', () => {
    const next = removeCurationChip({
      keyword: 'jazz',
      excludeTerms: ['club'],
      cursor: 'abc',
    }, 'exclude:0');
    expect(next.excludeTerms).toEqual([]);
    expect(next.keyword).toBe('jazz');
    expect(next.cursor).toBeNull();
  });
});
