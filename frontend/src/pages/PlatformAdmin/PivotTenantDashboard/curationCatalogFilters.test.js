import { eventMatchesCatalogSearch, eventMatchesFilter } from './curationCatalogFilters';
import {
  locationReviewBlock,
  locationReviewHref,
  releaseOutcomeNotification,
} from './curationPublishFeedback';

describe('eventMatchesFilter', () => {
  it('groups draft and staged as unpublished', () => {
    expect(eventMatchesFilter({ ingestStatus: 'draft' }, 'unpublished')).toBe(true);
    expect(eventMatchesFilter({ ingestStatus: 'staged' }, 'unpublished')).toBe(true);
    expect(eventMatchesFilter({ ingestStatus: 'published' }, 'unpublished')).toBe(false);
  });
});

describe('eventMatchesCatalogSearch', () => {
  const event = {
    name: 'Rollin with the Homos',
    organizerName: 'Nicki Jizz',
    location: 'Brooklyn Basin, Oakland',
    source: 'partiful',
    tags: ['dance', 'nightlife'],
  };

  it('matches name, host, location, source, and tags', () => {
    expect(eventMatchesCatalogSearch(event, 'homos')).toBe(true);
    expect(eventMatchesCatalogSearch(event, 'oakland')).toBe(true);
    expect(eventMatchesCatalogSearch(event, 'nicki')).toBe(true);
    expect(eventMatchesCatalogSearch(event, 'partiful')).toBe(true);
    expect(eventMatchesCatalogSearch(event, 'nightlife')).toBe(true);
    expect(eventMatchesCatalogSearch(event, 'jazz brunch')).toBe(false);
  });

  it('treats blank query as a match', () => {
    expect(eventMatchesCatalogSearch(event, '  ')).toBe(true);
  });
});

describe('locationReviewBlock', () => {
  it('explains out-of-scope review', () => {
    expect(locationReviewBlock({
      locationReview: { status: 'needs_review', reason: 'out_of_scope' },
    })).toMatchObject({
      reason: 'out_of_scope',
      title: 'The suggested place is outside the city boundary',
    });
  });

  it('returns null when review is clear', () => {
    expect(locationReviewBlock({ locationReview: { status: 'approved' } })).toBeNull();
    expect(locationReviewBlock({})).toBeNull();
  });
});

describe('releaseOutcomeNotification', () => {
  it('does not celebrate a zero-count success', () => {
    expect(releaseOutcomeNotification({
      releasedCount: 0,
      skippedCount: 1,
      skipped: [{
        name: 'Rollin with the Homos',
        title: 'The suggested place is outside the city boundary',
      }],
    }, '2026-W38')).toMatchObject({
      title: 'Nothing published',
      type: 'warning',
    });
  });

  it('names a mixed release', () => {
    const note = releaseOutcomeNotification({
      releasedCount: 4,
      skippedCount: 1,
      skipped: [{ title: 'Location needs a human decision' }],
    }, '2026-W38');
    expect(note.title).toBe('Partially published');
    expect(note.message).toMatch(/4 event/);
  });
});

describe('locationReviewHref', () => {
  it('deep-links the location migration tab', () => {
    expect(locationReviewHref('sf', '2026-W38'))
      .toBe('/platform-admin/pivot/sf?page=7&batchWeek=2026-W38');
  });
});
