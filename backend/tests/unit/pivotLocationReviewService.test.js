jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/pivotIngestPublishService', () => ({ resolvePivotTenant: jest.fn() }));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  buildReviewMutation,
  forgetLocationMemory,
  listLocationReviewCandidates,
  resolveReviewPlace,
  reviewExplanation,
  reviewLocationCandidate,
  searchReviewPlaces,
} = require('../../services/pivotLocationReviewService');

const CONSTRAINED_TENANT = {
  tenantKey: 'nyc',
  richLocationConstraints: {
    countryCode: 'US',
    bounds: { north: 40.92, south: 40.49, east: -73.7, west: -74.26 },
  },
};

// Event.find serves both the paged review list and the unpaged waiting scan.
function eventFind(pageEvents, waitingEvents = pageEvents) {
  return jest.fn(() => ({
    select: () => ({
      sort: () => ({ limit: () => ({ lean: jest.fn().mockResolvedValue(pageEvents) }) }),
      limit: () => ({ lean: jest.fn().mockResolvedValue(waitingEvents) }),
    }),
    lean: jest.fn().mockResolvedValue(waitingEvents),
  }));
}

function memoryDoc(overrides = {}) {
  return {
    _id: '650000000000000000000001', tenantKey: 'nyc',
    matchKey: 'never rewrite this source text', sourceText: 'Never rewrite this source text',
    action: 'select_match', useCount: 2, richLocation: { mode: 'tbd',
      publicDisplayLabel: 'Location TBD', resolutionStatus: 'not_applicable',
      revealPolicy: 'public' },
    ...overrides,
  };
}

function physical(overrides = {}) {
  return {
    mode: 'physical', originalInput: 'Raw source venue', venueName: 'Canonical Venue',
    formattedAddress: '123 Main St, New York, NY 10001, USA',
    coordinates: { type: 'Point', coordinates: [-73.99, 40.75] },
    googlePlaceId: 'ChIJ-review', provider: 'google', resolutionStatus: 'resolved',
    resolutionConfidence: 0.99, resolvedAt: '2026-09-01T00:00:00.000Z',
    publicDisplayLabel: 'Canonical Venue · Midtown', revealPolicy: 'public', ...overrides,
  };
}

function event() {
  return {
    _id: 'event-1', name: 'Show', location: 'Legacy source location',
    richLocation: physical({ resolutionStatus: 'unresolved', formattedAddress: undefined,
      coordinates: undefined, googlePlaceId: undefined, provider: undefined,
      resolutionConfidence: undefined, resolvedAt: undefined }),
    customFields: { pivot: {
      rawLocationText: 'Never rewrite this source text', ingestStatus: 'staged',
      locationReview: { status: 'needs_review',
        candidateMatches: [{ id: 'candidate-1', label: 'Canonical Venue' }] },
    } },
  };
}

describe('pivot location review', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  const reviewer = { id: 'admin-1', email: 'ops@example.com' };

  test('selects a match with immutable source and auditable before/after data', () => {
    const source = event();
    const selected = physical();
    const result = buildReviewMutation(source, { action: 'select_match',
      candidateId: 'candidate-1', richLocation: selected, reviewer }, now);
    expect(result.set.richLocation).toEqual(selected);
    expect(result.set['customFields.pivot.rawLocationText']).toBe('Never rewrite this source text');
    expect(result.set['customFields.pivot.locationReview']).toMatchObject({
      status: 'approved', reviewedBy: reviewer, lastDecision: 'select_match',
      candidateMatches: [{ id: 'candidate-1' }],
      decisionHistory: [expect.objectContaining({ before: source.richLocation, after: selected })],
    });
    expect(source.richLocation.resolutionStatus).toBe('unresolved');
  });

  test('rejects a candidate without changing rich or raw source data', () => {
    const rejected = physical();
    const result = buildReviewMutation(event(), { action: 'reject_match',
      candidateId: 'candidate-1', richLocation: rejected, reviewer }, now);
    expect(result.set).not.toHaveProperty('richLocation');
    expect(result.set['customFields.pivot.rawLocationText']).toBe('Never rewrite this source text');
    expect(result.set['customFields.pivot.locationReview']).toMatchObject({
      status: 'needs_review', reason: 'candidate_rejected', lastDecision: 'reject_match',
      decisionHistory: [expect.objectContaining({
        candidateId: 'candidate-1', candidateRepresentation: rejected,
      })],
    });
  });

  test.each([
    ['approximate', { mode: 'approximate', originalInput: 'Somewhere downtown',
      resolutionStatus: 'not_applicable', approximateLabel: 'Downtown Manhattan',
      neighborhood: 'Downtown Manhattan', publicDisplayLabel: 'Downtown Manhattan',
      revealPolicy: 'public' }],
    ['registration_gated', physical({ mode: 'registration_gated',
      publicDisplayLabel: 'Private venue · Midtown', revealPolicy: 'registered_only' })],
  ])('approves a valid %s representation', (_mode, richLocation) => {
    const result = buildReviewMutation(event(), { action: 'approve_representation',
      richLocation, reviewer }, now);
    expect(result.error).toBeUndefined();
    expect(result.set['customFields.pivot.locationReview'].status).toBe('approved');
  });

  test('rejects malformed corrections', () => {
    expect(buildReviewMutation(event(), { action: 'correct_representation',
      richLocation: { mode: 'approximate', publicDisplayLabel: 'Downtown' }, reviewer }, now))
      .toMatchObject({ code: 'LOCATION_REVIEW_INVALID_REPRESENTATION' });
  });

  test('lists review candidates with source and provider candidates', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    getModels.mockReturnValue({ Event: { find: eventFind([event()]) } });
    const result = await listLocationReviewCandidates({}, { tenantKey: 'nyc' });
    expect(result.data.candidates[0]).toMatchObject({ eventId: 'event-1',
      rawLocationText: 'Never rewrite this source text', candidateMatches: [{ id: 'candidate-1' }],
      matchingCount: 0, rememberedLocation: null });
  });

  test('counts other waiting events with the same text and surfaces a remembered match', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    const sibling = { ...event(), _id: 'event-2', customFields: { pivot: {
      ...event().customFields.pivot, rawLocationText: 'NEVER rewrite this source text!' } } };
    const memoryFind = jest.fn(() => ({ lean: jest.fn().mockResolvedValue([memoryDoc()]) }));
    getModels.mockReturnValue({
      Event: { find: eventFind([event()], [event(), sibling]) },
      PivotLocationMemory: { find: memoryFind },
    });
    const result = await listLocationReviewCandidates({}, { tenantKey: 'nyc' });
    expect(result.data.candidates[0]).toMatchObject({
      matchKey: 'never rewrite this source text',
      matchingCount: 1,
      rememberedLocation: { id: '650000000000000000000001', useCount: 2,
        richLocation: { mode: 'tbd' } },
    });
  });

  test('remembers a decision and applies it to other waiting events with the same text', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    const selected = physical();
    const sibling = { ...event(), _id: 'event-2', customFields: { pivot: {
      ...event().customFields.pivot, rawLocationText: 'never rewrite this SOURCE text' } } };
    const unrelated = { ...event(), _id: 'event-3', customFields: { pivot: {
      ...event().customFields.pivot, rawLocationText: 'Somewhere else' } } };
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const findOneAndUpdate = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(memoryDoc()) }));
    getModels.mockReturnValue({
      Event: {
        findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(event()) })),
        findByIdAndUpdate: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({
          ...event(), richLocation: selected }) })),
        find: jest.fn((query) => (query._id
          ? { lean: jest.fn().mockResolvedValue([sibling]) }
          : { select: () => ({ limit: () => ({ lean: jest.fn().mockResolvedValue(
            [event(), sibling, unrelated]) }) }) })),
        updateOne,
      },
      PivotLocationMemory: { findOneAndUpdate },
    });
    const result = await reviewLocationCandidate({ user: { globalUserId: 'admin-1' } }, {
      tenantKey: 'nyc', eventId: 'event-1', action: 'select_match', richLocation: selected,
      candidateSource: 'manual_search', remember: true, applyToMatching: true, now,
    });
    expect(result.data.matching).toEqual({ updated: 1, failed: 0 });
    expect(result.data.memory).toMatchObject({ id: '650000000000000000000001' });
    expect(result.data.decision.candidateSource).toBe('manual_search');
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ tenantKey: 'nyc',
      matchKey: 'never rewrite this source text' });
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'event-2',
      'customFields.pivot.locationReview.status': 'needs_review' });
    expect(update.$set.richLocation).toMatchObject({ googlePlaceId: 'ChIJ-review',
      originalInput: 'never rewrite this SOURCE text' });
    expect(update.$set['customFields.pivot.locationReview'].decisionHistory.at(-1))
      .toMatchObject({ appliedFromEventId: 'event-1', candidateSource: 'matching_text' });
  });

  test('does not remember dismissed matches', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    const findOneAndUpdate = jest.fn();
    getModels.mockReturnValue({
      Event: {
        findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(event()) })),
        findByIdAndUpdate: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(event()) })),
      },
      PivotLocationMemory: { findOneAndUpdate },
    });
    const result = await reviewLocationCandidate({}, { tenantKey: 'nyc', eventId: 'event-1',
      action: 'reject_match', remember: true, applyToMatching: true, now });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ memory: null, matching: { updated: 0 } });
  });

  test('searches Google biased to the city boundary', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: CONSTRAINED_TENANT });
    const autocompletePlaces = jest.fn().mockResolvedValue([{ placeId: 'ChIJ-1',
      primaryText: 'Union Hall' }]);
    const result = await searchReviewPlaces({}, { tenantKey: 'nyc', query: 'union hall',
      googleAdapter: { autocompletePlaces } });
    expect(result.data.suggestions).toHaveLength(1);
    expect(autocompletePlaces).toHaveBeenCalledWith('union hall', expect.objectContaining({
      regionCode: 'US',
      locationBias: { rectangle: { low: { latitude: 40.49, longitude: -74.26 },
        high: { latitude: 40.92, longitude: -73.7 } } },
    }));
    expect(autocompletePlaces.mock.calls[0][1]).not.toHaveProperty('locationRestriction');
  });

  test('requires a city boundary and a real query before searching', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    expect(await searchReviewPlaces({}, { tenantKey: 'nyc', query: 'union' }))
      .toMatchObject({ code: 'RICH_LOCATION_CITY_CONSTRAINTS_REQUIRED' });
    resolvePivotTenant.mockResolvedValue({ tenant: CONSTRAINED_TENANT });
    expect(await searchReviewPlaces({}, { tenantKey: 'nyc', query: 'u' }))
      .toMatchObject({ code: 'LOCATION_SEARCH_QUERY_INVALID', status: 400 });
  });

  test('resolves a typed-in place and flags it when outside the city', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: CONSTRAINED_TENANT });
    const place = physical({ countryCode: 'US', placeTypes: ['bar'] });
    const fetchPlaceDetails = jest.fn().mockResolvedValue(place);
    const result = await resolveReviewPlace({}, { tenantKey: 'nyc', placeId: 'ChIJ-review',
      originalInput: 'Bell House', googleAdapter: { fetchPlaceDetails }, now });
    expect(result.data).toMatchObject({ inScope: true, place: { mode: 'physical',
      originalInput: 'Bell House', googlePlaceId: 'ChIJ-review', revealPolicy: 'public' } });

    fetchPlaceDetails.mockResolvedValue(physical({ countryCode: 'US',
      coordinates: { type: 'Point', coordinates: [-118.24, 34.05] } }));
    const outside = await resolveReviewPlace({}, { tenantKey: 'nyc', placeId: 'ChIJ-la',
      googleAdapter: { fetchPlaceDetails }, now });
    expect(outside.data).toMatchObject({ inScope: false, scopeReason: 'bounds' });

    fetchPlaceDetails.mockRejectedValue({ code: 'GOOGLE_PLACE_NOT_FOUND' });
    expect(await resolveReviewPlace({}, { tenantKey: 'nyc', placeId: 'ChIJ-gone',
      googleAdapter: { fetchPlaceDetails } })).toMatchObject({ status: 404 });
  });

  test('forgets a remembered location', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    const findOneAndDelete = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(memoryDoc()) }));
    getModels.mockReturnValue({ PivotLocationMemory: { findOneAndDelete } });
    expect(await forgetLocationMemory({}, { tenantKey: 'nyc', memoryId: 'bad' }))
      .toMatchObject({ code: 'MEMORY_ID_INVALID' });
    const result = await forgetLocationMemory({}, { tenantKey: 'nyc',
      memoryId: '650000000000000000000001' });
    expect(findOneAndDelete).toHaveBeenCalledWith({ _id: '650000000000000000000001',
      tenantKey: 'nyc' });
    expect(result.data.memory.sourceText).toBe('Never rewrite this source text');
  });

  test('explains ambiguity with confidence and candidate count', () => {
    expect(reviewExplanation({
      reason: 'ambiguous_provider_matches',
      confidence: 0.76,
      candidateCount: 3,
    })).toEqual({
      reason: 'ambiguous_provider_matches',
      title: 'Google found multiple plausible places',
      detail: 'Compare the source location with the suggested listing before choosing it.',
      confidence: 0.76,
      candidateCount: 3,
    });
  });

  test('persists authenticated reviewer metadata', async () => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    connectToDatabase.mockResolvedValue({});
    const selected = physical();
    const findOne = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(event()) }));
    const findByIdAndUpdate = jest.fn(() => ({ lean: jest.fn().mockResolvedValue({
      ...event(), richLocation: selected,
    }) }));
    getModels.mockReturnValue({ Event: { findOne, findByIdAndUpdate } });
    const result = await reviewLocationCandidate({ user: { globalUserId: 'admin-1',
      email: 'ops@example.com' } }, { tenantKey: 'nyc', eventId: 'event-1',
      action: 'select_match', richLocation: selected, now });
    expect(result.data.decision.reviewer).toEqual(reviewer);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('event-1',
      { $set: expect.objectContaining({ richLocation: selected,
        'customFields.pivot.rawLocationText': 'Never rewrite this source text' }) },
      { new: true, runValidators: true });
  });
});
