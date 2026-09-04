const {
  evaluateJustGoLocationPolicy,
  assessJustGoLocationReview,
  isJustGoLocationPublishable,
  rawJustGoLocationText,
  justGoLocationMatchText,
  JUST_GO_LOCATION_POLICY_REASONS,
} = require('../../utilities/justGoLocationPolicy');

function physical(overrides = {}) {
  return {
    mode: 'physical',
    originalInput: 'Fox Theater',
    formattedAddress: '1807 Telegraph Ave, Oakland, CA 94612, USA',
    coordinates: { type: 'Point', coordinates: [-122.2697, 37.8081] },
    googlePlaceId: 'ChIJ-example',
    provider: 'google',
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    resolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    publicDisplayLabel: 'Fox Theater · Uptown',
    revealPolicy: 'public',
    ...overrides,
  };
}

function nonPhysical(mode, overrides = {}) {
  return {
    mode,
    originalInput: mode,
    resolutionStatus: 'not_applicable',
    publicDisplayLabel: mode === 'tbd' ? 'Location to be announced' : mode,
    revealPolicy: 'public',
    ...overrides,
  };
}

describe('Just Go shared location publication policy', () => {
  test('keeps legacy-only events publishable for compatibility', () => {
    expect(evaluateJustGoLocationPolicy({ location: 'Legacy venue' })).toEqual({
      publishable: true,
      mode: 'legacy',
      reason: JUST_GO_LOCATION_POLICY_REASONS.LEGACY,
    });
  });

  test.each([
    ['physical', physical()],
    ['registration_gated', physical({
      mode: 'registration_gated',
      revealPolicy: 'registered_only',
    })],
    ['approximate', nonPhysical('approximate', {
      approximateLabel: 'Uptown, Oakland',
      neighborhood: 'Uptown',
    })],
    ['online', nonPhysical('online', { publicDisplayLabel: 'Online' })],
    ['tbd', nonPhysical('tbd')],
  ])('publishes valid %s locations', (mode, richLocation) => {
    expect(evaluateJustGoLocationPolicy({ richLocation })).toEqual({
      publishable: true,
      mode,
      reason: JUST_GO_LOCATION_POLICY_REASONS.PUBLISHABLE,
    });
    expect(isJustGoLocationPublishable(richLocation)).toBe(true);
  });

  test.each(['pending', 'unresolved', 'review_required', undefined])(
    'blocks physical resolution status %s',
    (resolutionStatus) => {
      const result = evaluateJustGoLocationPolicy(physical({
        resolutionStatus,
        formattedAddress: undefined,
        coordinates: undefined,
        googlePlaceId: undefined,
        provider: undefined,
        resolutionConfidence: undefined,
        resolvedAt: undefined,
      }));
      expect(result).toMatchObject({
        publishable: false,
        mode: 'physical',
        reason: JUST_GO_LOCATION_POLICY_REASONS.UNRESOLVED_PHYSICAL,
      });
    },
  );

  test('routes unresolved physical candidates to review without making them publishable', () => {
    const result = assessJustGoLocationReview(physical({
      resolutionStatus: 'unresolved',
    }));
    expect(result).toMatchObject({
      publishable: false,
      ingestible: true,
      reviewRequired: true,
      discoverEligible: false,
      reviewReason: JUST_GO_LOCATION_POLICY_REASONS.UNRESOLVED_PHYSICAL,
    });
  });

  test('uses public mode labels for matching while retaining original source text', () => {
    const input = {
      location: 'Secret exact address from source',
      rawLocationText: 'Original scraped venue text',
      richLocation: physical({
        mode: 'registration_gated',
        venueName: 'Private supper club',
        publicDisplayLabel: 'Private venue · SoHo',
        revealPolicy: 'registered_only',
      }),
    };
    expect(rawJustGoLocationText(input)).toBe('Original scraped venue text');
    expect(justGoLocationMatchText(input)).toBe('Private supper club');
  });

  test('distinguishes intentional TBD from unresolved physical data', () => {
    expect(isJustGoLocationPublishable(nonPhysical('tbd'))).toBe(true);
    expect(evaluateJustGoLocationPolicy(nonPhysical('tbd', {
      resolutionStatus: 'unresolved',
    }))).toMatchObject({
      publishable: false,
      reason: JUST_GO_LOCATION_POLICY_REASONS.INVALID,
      invalidFields: expect.arrayContaining(['resolutionStatus']),
    });
  });

  test.each([
    ['approximate without a public area', nonPhysical('approximate', {
      approximateLabel: 'Near the venue',
    }), ['city']],
    ['approximate with precise coordinates', nonPhysical('approximate', {
      approximateLabel: 'Uptown',
      neighborhood: 'Uptown',
      coordinates: { type: 'Point', coordinates: [-122.27, 37.81] },
    }), ['coordinates']],
    ['online with provider metadata', nonPhysical('online', {
      provider: 'google',
    }), ['provider']],
    ['public gated address', physical({
      mode: 'registration_gated',
      revealPolicy: 'public',
    }), ['revealPolicy']],
    ['malformed resolved coordinates', physical({
      coordinates: { type: 'Point', coordinates: [37.81, -122.27] },
    }), ['coordinates']],
  ])('rejects %s', (_label, richLocation, invalidFields) => {
    expect(evaluateJustGoLocationPolicy(richLocation)).toMatchObject({
      publishable: false,
      reason: JUST_GO_LOCATION_POLICY_REASONS.INVALID,
      invalidFields: expect.arrayContaining(invalidFields),
    });
  });
});
