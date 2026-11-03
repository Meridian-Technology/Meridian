import {
  bulkGoogleLocationEvents,
  googleMatchReviewRequest,
  locationReviewCandidate,
  locationReviewConfidencePercent,
  locationReviewGoogleMatch,
} from './curationPublishFeedback';

const GOOGLE_MATCH = {
  mode: 'physical',
  venueName: 'Fox Oakland',
  formattedAddress: '1807 Telegraph Ave, Oakland, CA',
  googlePlaceId: 'ChIJ-fox',
  coordinates: { type: 'Point', coordinates: [-122.27, 37.81] },
  resolutionConfidence: 0.75,
  originalInput: 'The Fox',
};

function waiting(overrides = {}) {
  return {
    _id: 'evt-1',
    rawLocationText: 'The Fox, Oakland',
    locationReview: {
      status: 'needs_review',
      reason: 'confidence_below_auto_apply',
      candidateMatches: [GOOGLE_MATCH],
      ...overrides,
    },
  };
}

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

describe('location review at a glance', () => {
  it('reports the review confidence, falling back to the top match', () => {
    expect(locationReviewConfidencePercent(waiting({ confidence: 0.764 }))).toBe(76);
    expect(locationReviewConfidencePercent(waiting())).toBe(75);
    expect(locationReviewConfidencePercent(waiting({ candidateMatches: [] }))).toBeNull();
    expect(locationReviewConfidencePercent({ locationReview: { status: 'approved', confidence: 1 } }))
      .toBeNull();
  });

  it('only offers resolved Google matches', () => {
    expect(locationReviewGoogleMatch(waiting())).toBe(GOOGLE_MATCH);
    expect(locationReviewGoogleMatch(waiting({
      candidateMatches: [{ venueName: 'No place id', formattedAddress: 'x' }],
    }))).toBeNull();
  });

  it('skips out-of-city and unmatched events in bulk', () => {
    const ok = waiting();
    const outside = { ...waiting({ reason: 'out_of_scope' }), _id: 'evt-2' };
    const unmatched = { ...waiting({ reason: 'unmatched_physical', candidateMatches: [] }), _id: 'evt-3' };
    const done = { _id: 'evt-4', locationReview: { status: 'approved' } };
    expect(bulkGoogleLocationEvents([ok, outside, unmatched, done])).toEqual([ok]);
  });

  it('accepts the top match with the event source text and remembers it', () => {
    expect(googleMatchReviewRequest(waiting())).toEqual({
      action: 'select_match',
      richLocation: { ...GOOGLE_MATCH, originalInput: 'The Fox, Oakland', revealPolicy: 'public' },
      candidateSource: 'provider_candidate',
      remember: true,
    });
    expect(googleMatchReviewRequest({ locationReview: { status: 'approved' } })).toBeNull();
  });
});
