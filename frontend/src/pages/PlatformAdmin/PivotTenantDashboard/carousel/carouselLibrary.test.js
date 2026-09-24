import { filterIssues, librarySelection } from './carouselLibrary';

describe('carousel library selection', () => {
  const decks = [
    { _id: 'aaa', name: 'Older', updatedAt: '2026-09-01T00:00:00.000Z' },
    { _id: 'bbb', name: 'Newer', updatedAt: '2026-09-20T00:00:00.000Z' },
  ];

  test('no id stays on the library and does not choose the latest issue', () => {
    expect(librarySelection(decks, null)).toEqual({ mode: 'library' });
    expect(librarySelection(decks, '')).toEqual({ mode: 'library' });
  });

  test('a known id opens that issue', () => {
    expect(librarySelection(decks, 'aaa')).toEqual({ mode: 'open', deckId: 'aaa' });
  });

  test('a missing id is an error and does not open another issue', () => {
    expect(librarySelection(decks, 'missing')).toEqual({ mode: 'missing', requestedId: 'missing' });
  });

  test('search, format, and status filters compose', () => {
    const issues = [
      { name: 'Lanterns', format: 'city-picks', status: 'active' },
      { name: 'Jazz night', format: 'sorry-you-missed-it', status: 'archived' },
    ];
    expect(filterIssues(issues, { q: 'jazz', status: 'all' })).toHaveLength(1);
    expect(filterIssues(issues, { format: 'city-picks' })).toHaveLength(1);
    expect(filterIssues(issues, { status: 'archived', q: 'lantern' })).toHaveLength(0);
  });
});
