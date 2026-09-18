const {
  MAX_PROMPT_HINTS,
  MAX_PROMPT_HINT_BYTES,
  mergeExtractionHints,
  deriveExtractionHintsFromCatalogEdit,
  normalizeIngestFieldLocks,
} = require('../../utilities/pivotExtractionHints');

describe('pivotExtractionHints', () => {
  it('merges, normalizes, deduplicates, and bounds prompt hints', () => {
    const hints = mergeExtractionHints(
      ['  Read the event title from the card.  '],
      ['read the event title from the card.', 'Extract dates from the detail page.'],
    );

    expect(hints).toEqual([
      'Read the event title from the card.',
      'Extract dates from the detail page.',
    ]);
    expect(mergeExtractionHints([], Array(MAX_PROMPT_HINTS + 4).fill('x').map((v, i) => `${v}${i}`)))
      .toHaveLength(MAX_PROMPT_HINTS);
    expect(Buffer.byteLength(JSON.stringify(hints), 'utf8')).toBeLessThanOrEqual(MAX_PROMPT_HINT_BYTES);
  });

  it('derives hints only for corrected catalog fields', () => {
    const hints = deriveExtractionHintsFromCatalogEdit(
      {
        name: 'Same name',
        location: 'Old venue',
        customFields: { pivot: { host: { name: 'Old host' } } },
      },
      {
        name: 'Same name',
        location: 'Correct venue',
        hostName: 'Correct host',
      },
    );

    expect(hints).toHaveLength(2);
    expect(hints.join(' ')).toContain('Correct venue');
    expect(hints.join(' ')).toContain('Correct host');
    expect(hints.join(' ')).not.toContain('Same name');
  });

  it('keeps only the supported, auditable field locks', () => {
    const lockedAt = new Date('2026-09-17T12:00:00.000Z');
    expect(normalizeIngestFieldLocks({
      location: { lockedBy: 'ops@meridian.app' },
      unsupported: { lockedBy: 'ignored@meridian.app' },
    }, { now: lockedAt })).toEqual({
      location: { lockedAt, lockedBy: 'ops@meridian.app' },
    });
  });
});
