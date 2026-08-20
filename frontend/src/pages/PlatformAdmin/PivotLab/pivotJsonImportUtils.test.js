jest.mock('./PivotManualImportModal', () => ({
  applyMovieMetadataToDraft: (movie) => ({
    movie,
    name: movie?.title,
    description: '',
    imageUrl: '',
  }),
}));
jest.mock('./pivotTmdbClient', () => ({
  isFilmImportCandidate: () => false,
}));

import {
  buildCurationJsonExport,
  catalogEventToJsonExport,
  curationJsonExportFilename,
  parsePivotJsonImport,
} from './pivotJsonImportUtils';

describe('catalogEventToJsonExport', () => {
  it('maps a catalog row onto the JSON import schema', () => {
    expect(
      catalogEventToJsonExport({
        _id: 'evt-1',
        name: 'Board Game Night',
        organizerName: 'Brooklyn Board Game Cafe',
        location: '123 Main St',
        start_time: '2026-05-28T19:00:00.000Z',
        end_time: '2026-05-28T22:00:00.000Z',
        description: 'Weekly open play.',
        image: 'https://example.com/poster.jpg',
        source: 'partiful',
        sourceUrl: 'https://partiful.com/e/abc',
        externalLink: 'https://ignored.example',
        tags: ['board-games', 'social'],
        ingestStatus: 'staged',
        intentStats: { interested: 12 },
      }),
    ).toEqual({
      source: 'partiful',
      sourceUrl: 'https://partiful.com/e/abc',
      name: 'Board Game Night',
      hostName: 'Brooklyn Board Game Cafe',
      location: '123 Main St',
      start_time: '2026-05-28T19:00:00.000Z',
      end_time: '2026-05-28T22:00:00.000Z',
      description: 'Weekly open play.',
      image: 'https://example.com/poster.jpg',
      tags: ['board-games', 'social'],
    });
  });

  it('falls back to externalLink and keeps showtimes', () => {
    const exported = catalogEventToJsonExport({
      name: 'Late Show',
      organizerName: 'Roxy',
      location: 'Downtown',
      start_time: '2026-05-29T01:00:00.000Z',
      externalLink: 'https://roxy.example/late',
      tags: ['film-and-tv'],
      timeSlots: [
        { id: 'late', label: 'Late', start_time: '2026-05-29T01:00:00.000Z' },
        { start_time: '' },
      ],
    });
    expect(exported.sourceUrl).toBe('https://roxy.example/late');
    expect(exported.timeSlots).toEqual([
      { id: 'late', label: 'Late', start_time: '2026-05-29T01:00:00.000Z' },
    ]);
  });
});

describe('buildCurationJsonExport', () => {
  it('wraps events so another curation panel can paste/stage them', () => {
    const payload = buildCurationJsonExport({
      events: [
        {
          name: 'Board Game Night',
          organizerName: 'Cafe',
          location: 'Brooklyn',
          start_time: '2026-05-28T19:00:00.000Z',
          tags: ['board-games'],
        },
      ],
      tenantKey: 'ic',
      batchWeek: '2026-W22',
      cityLabel: 'Iowa City',
      exportedAt: '2026-08-13T00:00:00.000Z',
    });

    expect(payload).toMatchObject({
      label: 'Iowa City · 2026-W22',
      tenantKey: 'ic',
      batchWeek: '2026-W22',
      exportedAt: '2026-08-13T00:00:00.000Z',
    });
    expect(payload.events).toHaveLength(1);

    const parsed = parsePivotJsonImport(JSON.stringify(payload));
    expect(parsed.error).toBeUndefined();
    expect(parsed.entries[0].draft.name).toBe('Board Game Night');
    expect(parsed.entries[0].draft.hostName).toBe('Cafe');
  });

  it('round-trips hostIdentities on import and export', () => {
    const identities = [
      { provider: 'partiful', name: 'Cafe', profileUrl: 'https://partiful.com/u/cafe' },
    ];
    const exported = catalogEventToJsonExport({
      name: 'Board Game Night',
      organizerName: 'Cafe',
      location: 'Brooklyn',
      start_time: '2026-05-28T19:00:00.000Z',
      tags: ['board-games'],
      hostIdentities: identities,
    });
    expect(exported.hostIdentities).toEqual(identities);

    const parsed = parsePivotJsonImport(JSON.stringify({ events: [exported] }));
    expect(parsed.entries[0].draft.hostIdentities).toEqual(identities);
  });
});

describe('curationJsonExportFilename', () => {
  it('builds a stable download name', () => {
    expect(curationJsonExportFilename({ tenantKey: 'ic', batchWeek: '2026-W22' })).toBe(
      'pivot-catalog-ic-2026-W22.json',
    );
  });
});
