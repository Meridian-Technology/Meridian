import { latestIssue, librarySelection, listPastIssues } from './carouselLibrary';

describe('carousel issue list', () => {
  const decks = [
    { _id: 'aaa', name: 'Older', updatedAt: '2026-09-01T00:00:00.000Z', status: 'active' },
    { _id: 'bbb', name: 'Newer', updatedAt: '2026-09-20T00:00:00.000Z', status: 'active' },
    { _id: 'ccc', name: 'Filed', updatedAt: '2026-09-22T00:00:00.000Z', status: 'archived' },
  ];

  test('opening the page stays on the list and does not open the latest issue', () => {
    expect(librarySelection(decks, null)).toEqual({ mode: 'list' });
    expect(librarySelection(decks, '')).toEqual({ mode: 'list' });
    expect(latestIssue(decks)._id).toBe('bbb');
  });

  test('a known id opens that issue', () => {
    expect(librarySelection(decks, 'aaa')).toEqual({ mode: 'open', deckId: 'aaa' });
  });

  test('a missing id is an error and does not open another issue', () => {
    expect(librarySelection(decks, 'missing')).toEqual({ mode: 'missing', requestedId: 'missing' });
  });

  test('the list is newest first and hides archived issues', () => {
    expect(listPastIssues(decks).map((issue) => issue._id)).toEqual(['bbb', 'aaa']);
  });
});
