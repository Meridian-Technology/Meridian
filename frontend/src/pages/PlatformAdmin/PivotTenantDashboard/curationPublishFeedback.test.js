import { locationReviewCandidate } from './curationPublishFeedback';

describe('locationReviewCandidate', () => {
  it('returns null unless the event still needs a location decision', () => {
    expect(locationReviewCandidate(null)).toBeNull();
    expect(locationReviewCandidate({ _id: '1', locationReview: { status: 'approved' } })).toBeNull();
  });

  it('shapes a curation event like a migration review candidate', () => {
    const match = { mode: 'physical', venueName: 'Fox Oakland' };
    const candidate = locationReviewCandidate({
      _id: 'evt-1',
      name: 'Disco',
      start_time: '2026-09-18T03:00:00.000Z',
      location: 'Fox Theater',
      rawLocationText: 'The Fox, Oakland',
      externalLink: 'https://example.com/disco',
      batchWeek: '2026-W38',
      locationReview: {
        status: 'needs_review',
        reason: 'out_of_scope',
        candidateMatches: [match],
        confidence: 0.72,
      },
    });

    expect(candidate).toMatchObject({
      eventId: 'evt-1',
      startTime: '2026-09-18T03:00:00.000Z',
      legacyLocation: 'Fox Theater',
      rawLocationText: 'The Fox, Oakland',
      sourceUrl: 'https://example.com/disco',
      candidateMatches: [match],
      whyReview: {
        reason: 'out_of_scope',
        title: 'The suggested place is outside the city boundary',
        confidence: 0.72,
        candidateCount: null,
      },
    });
  });
});
