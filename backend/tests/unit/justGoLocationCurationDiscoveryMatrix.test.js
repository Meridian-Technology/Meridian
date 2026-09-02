jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  assessJustGoLocationReview,
  justGoLocationIndexFields,
} = require('../../utilities/justGoLocationPolicy');
const {
  projectAuthorizedRichLocation,
  projectEventRichLocation,
} = require('../../services/justGoRichLocationProjectionService');

const EVENT_ID = '507f191e810c19729de860eb';
const USER_ID = '507f191e810c19729de860ea';
const PRECISE_ADDRESS = '123 Secret St, Brooklyn, NY 11201, USA';
const PLACE_ID = 'ChIJ-matrix-private';

function resolved(mode = 'physical', overrides = {}) {
  return {
    mode,
    originalInput: 'Raw provider source',
    venueName: 'The Great Hall',
    formattedAddress: PRECISE_ADDRESS,
    addressComponents: [{ longText: 'Brooklyn', types: ['locality'] }],
    neighborhood: 'Downtown Brooklyn',
    city: 'Brooklyn',
    region: 'New York',
    postalCode: '11201',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
    googlePlaceId: PLACE_ID,
    provider: 'google',
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    resolvedAt: '2026-09-01T00:00:00.000Z',
    publicDisplayLabel: 'The Great Hall · Downtown Brooklyn',
    approximateLabel: 'Downtown Brooklyn',
    revealPolicy: mode === 'registration_gated' ? 'registered_only' : 'public',
    ...overrides,
  };
}

function categorical(mode, overrides = {}) {
  return {
    mode,
    originalInput: `Raw ${mode} source`,
    resolutionStatus: 'not_applicable',
    publicDisplayLabel: mode === 'tbd' ? 'Location to be announced' : 'Online event',
    revealPolicy: 'public',
    ...overrides,
  };
}

const CASES = [
  {
    name: 'resolved physical',
    richLocation: resolved(),
    publishable: true,
    reviewStatus: 'not_required',
    discoverEligible: true,
    indexed: ['The Great Hall · Downtown Brooklyn', 'The Great Hall', PRECISE_ADDRESS,
      'Downtown Brooklyn', 'Brooklyn', 'New York', 'US'],
    publicPrecision: true,
    registeredPrecision: true,
  },
  {
    name: 'valid approximate',
    richLocation: categorical('approximate', {
      publicDisplayLabel: 'Downtown Brooklyn area',
      approximateLabel: 'Downtown Brooklyn',
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
    }),
    publishable: true,
    reviewStatus: 'not_required',
    discoverEligible: true,
    indexed: ['Downtown Brooklyn area', 'Downtown Brooklyn', 'Brooklyn'],
    publicPrecision: false,
    registeredPrecision: false,
  },
  {
    name: 'intentional TBD',
    richLocation: categorical('tbd'),
    publishable: true,
    reviewStatus: 'not_required',
    discoverEligible: true,
    indexed: ['Location to be announced', 'tbd'],
    publicPrecision: false,
    registeredPrecision: false,
  },
  {
    name: 'online',
    richLocation: categorical('online'),
    publishable: true,
    reviewStatus: 'not_required',
    discoverEligible: true,
    indexed: ['Online event', 'online'],
    publicPrecision: false,
    registeredPrecision: false,
  },
  {
    name: 'registration gated',
    richLocation: resolved('registration_gated'),
    publishable: true,
    reviewStatus: 'not_required',
    discoverEligible: true,
    indexed: ['The Great Hall · Downtown Brooklyn', 'The Great Hall', 'Downtown Brooklyn',
      'Brooklyn', 'New York', 'US', 'registration required'],
    publicPrecision: false,
    registeredPrecision: true,
  },
  {
    name: 'unresolved required physical',
    richLocation: resolved('physical', {
      formattedAddress: undefined,
      addressComponents: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      resolutionStatus: 'unresolved',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      publicDisplayLabel: 'Venue match pending',
    }),
    publishable: false,
    reviewStatus: 'needs_review',
    discoverEligible: false,
    indexed: [],
    publicPrecision: false,
    registeredPrecision: false,
  },
];

function hasPrecision(value) {
  return Boolean(value?.formattedAddress || value?.coordinates || value?.googlePlaceId);
}

describe('Just Go curation and discovery rich-location matrix', () => {
  beforeEach(() => {
    getModels.mockReturnValue({
      PivotEventIntent: { exists: jest.fn().mockResolvedValue({ _id: 'intent-1' }) },
    });
  });

  test.each(CASES)(
    '$name: publication, review, discovery, indexing, public and registered output',
    async (row) => {
      const event = {
        _id: EVENT_ID,
        location: 'Unchanged legacy location',
        richLocation: row.richLocation,
      };
      const policy = assessJustGoLocationReview(event);
      const publicOutput = projectEventRichLocation(event);
      const registeredOutput = await projectAuthorizedRichLocation(
        { user: { userId: USER_ID }, db: {} },
        event,
      );
      const indexedFields = justGoLocationIndexFields(event);

      expect(policy.publishable).toBe(row.publishable);
      expect(policy.reviewRequired ? 'needs_review' : 'not_required').toBe(row.reviewStatus);
      expect(policy.discoverEligible).toBe(row.discoverEligible);
      expect(indexedFields).toEqual(expect.arrayContaining(row.indexed));
      expect(indexedFields).toHaveLength(row.indexed.length);
      expect(hasPrecision(publicOutput)).toBe(row.publicPrecision);
      expect(hasPrecision(registeredOutput)).toBe(row.registeredPrecision);
      expect(event.location).toBe('Unchanged legacy location');

      if (row.richLocation.mode === 'registration_gated') {
        expect(JSON.stringify(publicOutput)).not.toContain(PRECISE_ADDRESS);
        expect(JSON.stringify(publicOutput)).not.toContain(PLACE_ID);
        expect(JSON.stringify(indexedFields)).not.toContain(PRECISE_ADDRESS);
        expect(JSON.stringify(indexedFields)).not.toContain(PLACE_ID);
        expect(registeredOutput).toMatchObject({
          formattedAddress: PRECISE_ADDRESS,
          googlePlaceId: PLACE_ID,
        });
      }
    },
  );

  test('keeps legacy-only events compatible across curation and discovery', () => {
    const event = { location: 'Legacy venue string' };
    expect(assessJustGoLocationReview(event)).toMatchObject({
      publishable: true,
      reviewRequired: false,
      discoverEligible: true,
      mode: 'legacy',
    });
    expect(justGoLocationIndexFields(event)).toEqual(['Legacy venue string']);
    expect(projectEventRichLocation(event)).toBeUndefined();
  });
});
