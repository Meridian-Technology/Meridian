import { eventMatchesCatalogSearch, eventMatchesFilter } from './curationCatalogFilters';
import {
  locationReviewBlock,
  locationReviewHref,
  coverImageBlock,
  eventPublishBlock,
  catalogCopyBlock,
  publishReviewBlock,
  releaseOutcomeNotification,
} from './curationPublishFeedback';

describe('eventMatchesFilter', () => {
  it('matches cover URLs that failed to load', () => {
    const broken = new Set(['dead']);
    expect(eventMatchesFilter(
      { _id: 'dead', image: 'https://cdn.example/missing.jpg' },
      'broken-image',
      { brokenImageIds: broken },
    )).toBe(true);
    expect(eventMatchesFilter(
      { _id: 'ok', image: 'https://cdn.example/ok.jpg' },
      'broken-image',
      { brokenImageIds: broken },
    )).toBe(false);
    expect(eventMatchesFilter(
      { _id: 'dead' },
      'broken-image',
      { brokenImageIds: broken },
    )).toBe(false);
  });

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

describe('coverImageBlock', () => {
  it('blocks missing, invalid, and failed covers', () => {
    expect(coverImageBlock({}).code).toBe('MISSING_IMAGE');
    expect(coverImageBlock({ image: 'nope' }).code).toBe('BROKEN_IMAGE');
    expect(coverImageBlock(
      { _id: '1', image: 'https://cdn.example/a.jpg' },
      { brokenImageIds: new Set(['1']) },
    ).code).toBe('BROKEN_IMAGE');
    expect(coverImageBlock({ _id: '1', image: 'https://cdn.example/a.jpg' })).toBeNull();
  });

  it('combines location and cover publish blocks', () => {
    expect(eventPublishBlock({
      image: 'https://cdn.example/a.jpg',
      locationReview: { status: 'needs_review', reason: 'out_of_scope' },
    }).code).toBeUndefined();
    expect(eventPublishBlock({
      image: 'https://cdn.example/a.jpg',
      locationReview: { status: 'needs_review', reason: 'out_of_scope' },
    }).title).toMatch(/outside the city boundary/);
    expect(eventPublishBlock({ ingestStatus: 'staged' }).code).toBe('MISSING_IMAGE');
  });
});

describe('catalogCopyBlock', () => {
  const ready = {
    image: 'https://cdn.example/a.jpg',
    description: 'A night of records',
    tags: ['dance'],
  };

  it('blocks missing tags and rich data for the P review', () => {
    expect(catalogCopyBlock({ ...ready, tags: [] }).code).toBe('MISSING_TAGS');
    expect(catalogCopyBlock({ ...ready, description: '', needsRichData: true, missingRichData: ['description'] }).code)
      .toBe('MISSING_RICH_DATA');
    expect(catalogCopyBlock({ ...ready, tags: [], description: '' }).title).toMatch(/tags and rich data/);
    expect(catalogCopyBlock(ready)).toBeNull();
  });

  it('keeps cover blocks ahead of catalog copy in publish review', () => {
    expect(publishReviewBlock({ ingestStatus: 'staged', tags: [] }).code).toBe('MISSING_IMAGE');
    expect(publishReviewBlock({
      ...ready,
      tags: [],
    }).code).toBe('MISSING_TAGS');
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
