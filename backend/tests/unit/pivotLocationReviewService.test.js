jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/pivotIngestPublishService', () => ({ resolvePivotTenant: jest.fn() }));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  buildReviewMutation,
  listLocationReviewCandidates,
  reviewExplanation,
  reviewLocationCandidate,
} = require('../../services/pivotLocationReviewService');

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
    const lean = jest.fn().mockResolvedValue([event()]);
    const find = jest.fn(() => ({ select: () => ({ sort: () => ({ limit: () => ({ lean }) }) }) }));
    getModels.mockReturnValue({ Event: { find } });
    const result = await listLocationReviewCandidates({}, { tenantKey: 'nyc' });
    expect(result.data.candidates[0]).toMatchObject({ eventId: 'event-1',
      rawLocationText: 'Never rewrite this source text', candidateMatches: [{ id: 'candidate-1' }] });
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
