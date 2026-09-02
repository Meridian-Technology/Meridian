const { serializePivotFeedEvent } = require('../../services/pivotFeedService');
const { serializeLabEvent } = require('../../services/pivotLabEventsService');
const { serializeCreatorListing } = require('../../services/pivotCreatorListingService');
const { serializeCrewWeekEvent } = require('../../services/pivotCrewWeekStateService');
const { serializeLandingDropEvent } = require('../../services/pivotLandingDropService');

const EVENT_ID = '507f191e810c19729de860eb';
const LEGACY_LOCATION = 'Legacy venue text must not change';
const RESTRICTED_LOCATION_FIELDS = [
  'originalInput',
  'addressComponents',
  'postalCode',
  'coordinates',
  'googlePlaceId',
  'provider',
  'placeTypes',
  'aliases',
  'normalizedSearchText',
  'resolutionConfidence',
  'createdAt',
  'updatedAt',
  'resolvedAt',
  'reviewedAt',
];

function gatedEvent() {
  return {
    _id: EVENT_ID,
    name: 'Secret address supper',
    description: 'Dinner',
    image: null,
    start_time: new Date('2026-09-10T19:00:00.000Z'),
    end_time: new Date('2026-09-10T21:00:00.000Z'),
    location: LEGACY_LOCATION,
    externalLink: null,
    type: 'social',
    registrationCount: 0,
    richLocation: {
      mode: 'registration_gated',
      originalInput: 'Private source address',
      venueName: 'Supper Club',
      formattedAddress: '123 Private St, Brooklyn, NY 11201',
      addressComponents: [{ longText: 'Brooklyn', types: ['locality'] }],
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
      region: 'New York',
      postalCode: '11201',
      countryCode: 'US',
      coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
      googlePlaceId: 'ChIJ-private',
      provider: 'google',
      placeTypes: ['restaurant'],
      resolutionStatus: 'resolved',
      publicDisplayLabel: 'Supper Club · Downtown Brooklyn',
      approximateLabel: 'Downtown Brooklyn',
      revealPolicy: 'registered_only',
    },
    customFields: {
      pivot: {
        ingestStatus: 'published',
        batchWeek: '2026-W37',
        host: { name: 'Dinner People' },
        tags: ['food'],
      },
    },
  };
}

function expectPublicSafeEvent(payload, legacyField = 'location') {
  expect(payload[legacyField]).toBe(LEGACY_LOCATION);
  expect(payload.richLocation).toMatchObject({
    mode: 'registration_gated',
    publicDisplayLabel: 'Supper Club · Downtown Brooklyn',
    city: 'Brooklyn',
    revealPolicy: 'registered_only',
  });
  expect(payload.richLocation).not.toHaveProperty('formattedAddress');
  expect(payload.richLocation).not.toHaveProperty('addressComponents');
  expect(payload.richLocation).not.toHaveProperty('postalCode');
  expect(payload.richLocation).not.toHaveProperty('coordinates');
  expect(payload.richLocation).not.toHaveProperty('googlePlaceId');
}

function expectNoRestrictedLocationData(payload) {
  const serialized = JSON.stringify(payload);
  for (const field of RESTRICTED_LOCATION_FIELDS) {
    expect(serialized).not.toContain(`\"${field}\"`);
  }
  expect(serialized).not.toContain('123 Private St');
  expect(serialized).not.toContain('ChIJ-private');
  expect(serialized).not.toContain('Private source address');
}

describe('Just Go rich-location serializer coverage', () => {
  it('applies public-safe projection to Week Drop, Explore, recap, and intent serializers', () => {
    const payload = serializePivotFeedEvent(gatedEvent(), {
      displayHost: { name: 'Dinner People' },
      userIntent: 'registered',
      socialByTimeSlot: new Map(),
      friendsInterested: [],
      friendsGoing: [],
      friendsInterestedCount: 0,
      friendsGoingCount: 0,
      crewInterestedCount: 0,
      crewRegisteredCount: 0,
    });
    // A string userIntent is display data, not authorization evidence.
    expectPublicSafeEvent(payload);
  });

  it('applies public-safe projection to curation, ops, and creator serializers', () => {
    expectPublicSafeEvent(serializeLabEvent(gatedEvent(), new Map()));
    expectPublicSafeEvent(serializeCreatorListing(gatedEvent(), new Map(), {
      creatorUserId: 'creator-id',
    }));
  });

  it('applies public-safe projection to plans and crew decisions', () => {
    expectPublicSafeEvent(serializeCrewWeekEvent(gatedEvent(), null));
  });

  it('applies public-safe projection to public landing and sharing cards', () => {
    expectPublicSafeEvent(
      serializeLandingDropEvent(gatedEvent(), { readsEnabled: true }),
    );
    const disabled = serializeLandingDropEvent(gatedEvent(), { readsEnabled: false });
    expect(disabled.location).toBe(LEGACY_LOCATION);
    expect(disabled).not.toHaveProperty('richLocation');
  });

  it('prevents every generic serializer from leaking restricted gated fields', () => {
    const source = gatedEvent();
    source.richLocation.aliases = ['secret search alias'];
    source.richLocation.normalizedSearchText = 'secret normalized search text';
    source.richLocation.resolutionConfidence = 1;
    source.richLocation.createdAt = new Date('2026-09-01T00:00:00.000Z');
    source.richLocation.updatedAt = new Date('2026-09-01T00:00:00.000Z');
    source.richLocation.resolvedAt = new Date('2026-09-01T00:00:00.000Z');
    source.richLocation.reviewedAt = new Date('2026-09-01T00:00:00.000Z');

    const payloads = [
      serializePivotFeedEvent(source, {
        displayHost: { name: 'Dinner People' },
        userIntent: 'registered',
        socialByTimeSlot: new Map(),
        friendsInterested: [],
        friendsGoing: [],
        friendsInterestedCount: 0,
        friendsGoingCount: 0,
        crewInterestedCount: 0,
        crewRegisteredCount: 0,
      }),
      serializeLabEvent(source, new Map()),
      serializeCreatorListing(source, new Map(), { creatorUserId: 'creator-id' }),
      serializeCrewWeekEvent(source, null),
      serializeLandingDropEvent(source, { readsEnabled: true }),
    ];

    for (const payload of payloads) {
      expect(payload.location).toBe(LEGACY_LOCATION);
      expectNoRestrictedLocationData(payload);
    }
  });
});
