const {
  PIVOT_PRICE_BANDS,
  normalizePivotEnrichment,
  hasPivotEnrichmentContent,
  serializePivotEnrichment,
  collectPivotEnrichmentSearchText,
} = require('../../utilities/pivotEnrichment');

describe('pivotEnrichment', () => {
  it('normalizePivotEnrichment trims vibe tags and validates priceBand', () => {
    expect(
      normalizePivotEnrichment({
        vibe: [' Dancey ', 'dancey', 'chill'],
        priceBand: 'LOW',
        neighborhood: ' Williamsburg ',
        audience: '21+',
      }),
    ).toEqual({
      vibe: ['dancey', 'chill'],
      priceBand: 'low',
      neighborhood: 'Williamsburg',
      audience: '21+',
    });
  });

  it('returns null when all enrichment fields are empty', () => {
    expect(normalizePivotEnrichment({ vibe: [], priceBand: '', neighborhood: '' })).toBeNull();
    expect(hasPivotEnrichmentContent({})).toBe(false);
  });

  it('rejects invalid priceBand values', () => {
    expect(normalizePivotEnrichment({ priceBand: 'luxury' })).toEqual({
      error: 'priceBand must be free, low, mid, or high.',
      code: 'INVALID_PRICE_BAND',
    });
  });

  it('serializePivotEnrichment and search text include all strings', () => {
    const pivot = {
      enrichment: {
        vibe: ['live-music'],
        priceBand: 'mid',
        neighborhood: 'downtown',
        audience: 'all ages',
      },
    };

    expect(serializePivotEnrichment(pivot)).toEqual({
      vibe: ['live-music'],
      priceBand: 'mid',
      neighborhood: 'downtown',
      audience: 'all ages',
    });
    expect(collectPivotEnrichmentSearchText(pivot)).toBe(
      'live-music mid downtown all ages',
    );
    expect(PIVOT_PRICE_BANDS).toEqual(['free', 'low', 'mid', 'high']);
  });
});
