const {
  resolveIngestRichLocation,
} = require('../../services/pivotIngestRichLocationService');

const NOW = new Date('2026-09-04T12:00:00.000Z');
const TENANT = {
  tenantKey: 'sf',
  tenantType: 'pivot',
  location: 'San Francisco, CA',
  richLocationConstraints: {
    countryCode: 'US',
    bounds: { north: 37.84, south: 37.7, east: -122.34, west: -122.53 },
  },
};

function canonical(overrides = {}) {
  return {
    venueName: 'The Chapel',
    formattedAddress: '777 Valencia St, San Francisco, CA 94110, USA',
    addressComponents: [
      { longText: 'San Francisco', types: ['locality'] },
      { longText: 'United States', shortText: 'US', types: ['country'] },
    ],
    city: 'San Francisco',
    region: 'California',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-122.421, 37.761] },
    googlePlaceId: 'ChIJ_test_chapel',
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: [],
    resolutionStatus: 'resolved',
    resolutionConfidence: 0.9,
    resolvedAt: NOW,
    publicDisplayLabel: 'The Chapel',
    ...overrides,
  };
}

function resolver(overrides = {}) {
  return resolveIngestRichLocation({
    tenant: TENANT,
    location: 'The Chapel',
    now: () => NOW,
    googleAdapter: { geocodeAddress: jest.fn().mockResolvedValue(canonical()) },
    ...overrides,
  });
}

describe('resolveIngestRichLocation', () => {
  it.each([
    ['Online', 'online'],
    ['Venue TBD', 'tbd'],
    ['Mission District area', 'approximate'],
  ])('converts categorical input %s without a provider call', async (location, mode) => {
    const geocodeAddress = jest.fn();
    const result = await resolver({ location, googleAdapter: { geocodeAddress } });

    expect(result).toMatchObject({ outcome: 'applied', richLocation: { mode } });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('resolves a unique in-scope physical place', async () => {
    const beforeProviderCall = jest.fn();
    const result = await resolver({ beforeProviderCall });

    expect(beforeProviderCall).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      outcome: 'applied',
      richLocation: {
        mode: 'physical',
        originalInput: 'The Chapel',
        googlePlaceId: 'ChIJ_test_chapel',
        resolutionStatus: 'resolved',
      },
    });
  });

  it('sends ambiguous provider matches and their candidates to review', async () => {
    const first = canonical();
    Object.defineProperty(first, '_backfillMatchCount', { value: 2 });
    Object.defineProperty(first, '_backfillCandidates', {
      value: [first, canonical({
        venueName: 'The Chapel Annex',
        googlePlaceId: 'ChIJ_test_annex',
      })],
    });

    const result = await resolver({
      googleAdapter: { geocodeAddress: jest.fn().mockResolvedValue(first) },
    });

    expect(result).toMatchObject({
      outcome: 'needs_review',
      richLocation: { mode: 'physical', resolutionStatus: 'unresolved' },
      locationReview: {
        reason: 'ambiguous_provider_matches',
        candidateCount: 2,
      },
    });
    expect(result.locationReview.candidateMatches).toHaveLength(2);
  });

  it('sends out-of-scope and provider failures to review without throwing', async () => {
    const outside = await resolver({
      googleAdapter: {
        geocodeAddress: jest.fn().mockResolvedValue(canonical({
          coordinates: { type: 'Point', coordinates: [-122.27, 37.8] },
        })),
      },
    });
    expect(outside.locationReview.reason).toBe('out_of_scope');

    const failed = await resolver({
      googleAdapter: {
        geocodeAddress: jest.fn().mockRejectedValue(
          Object.assign(new Error('down'), { code: 'GOOGLE_LOCATION_UNAVAILABLE' }),
        ),
      },
    });
    expect(failed).toMatchObject({
      outcome: 'needs_review',
      locationReview: {
        reason: 'provider_terminal_failure',
        providerCode: 'GOOGLE_LOCATION_UNAVAILABLE',
      },
    });
  });

  it('retains legacy behavior until a tenant has valid city constraints', async () => {
    const geocodeAddress = jest.fn();
    const result = await resolver({
      tenant: { tenantKey: 'unconfigured', tenantType: 'pivot' },
      googleAdapter: { geocodeAddress },
    });

    expect(result).toEqual({ outcome: 'skipped', reason: 'constraints_not_configured' });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });
});
