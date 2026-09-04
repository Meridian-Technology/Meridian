const {
  normalizePivotInteractionPayload,
} = require('../../services/pivotInteractionService');
const {
  serializeLandingDropEvent,
} = require('../../services/pivotLandingDropService');
const {
  eventMatchesQuery,
} = require('../../services/pivotExploreService');
const {
  JUST_GO_EVENT_DOCUMENT_EXCLUSIONS,
  buildJustGoEventDocument,
} = require('../../utilities/justGoEventDocument');
const {
  projectPublicEvent,
} = require('../../events/services/publicEventService');

const EVENT_ID = '507f191e810c19729de860eb';
const USER_ID = '507f191e810c19729de860ea';
const PRECISE_ADDRESS = '777 Hidden Street, San Francisco, CA 94107';
const PLACE_ID = 'ChIJ-phase6-private';
const PRIVATE_ALIAS = 'Secret Warehouse';

const RESTRICTED_KEYS = [
  'originalInput',
  'formattedAddress',
  'addressComponents',
  'postalCode',
  'coordinates',
  'googlePlaceId',
  'provider',
  'placeTypes',
  'aliases',
  'normalizedSearchText',
  'resolutionConfidence',
  'resolvedAt',
  'reviewedAt',
];

function gatedLocation() {
  return {
    mode: 'registration_gated',
    originalInput: 'Private source location',
    venueName: 'Private venue',
    formattedAddress: PRECISE_ADDRESS,
    addressComponents: [{ longText: 'San Francisco', types: ['locality'] }],
    neighborhood: 'SoMa',
    city: 'San Francisco',
    region: 'California',
    postalCode: '94107',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-122.4, 37.78] },
    googlePlaceId: PLACE_ID,
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: [PRIVATE_ALIAS],
    normalizedSearchText: 'secret warehouse hidden street',
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    resolvedAt: '2026-09-01T00:00:00.000Z',
    reviewedAt: '2026-09-01T01:00:00.000Z',
    publicDisplayLabel: 'Private venue · SoMa',
    approximateLabel: 'SoMa',
    revealPolicy: 'registered_only',
  };
}

function sourceEvent() {
  return {
    _id: EVENT_ID,
    name: 'Secret Supper',
    description: 'A ticketed dinner.',
    location: 'Legacy location string',
    start_time: '2026-09-10T19:00:00.000Z',
    end_time: '2026-09-10T21:00:00.000Z',
    type: 'social',
    status: 'approved',
    visibility: 'public',
    isDeleted: false,
    registrationEnabled: true,
    registrationCount: 0,
    hostingType: 'Org',
    hostingId: '507f191e810c19729de860ec',
    richLocation: gatedLocation(),
    customFields: {
      pivot: {
        batchWeek: '2026-W37',
        ingestStatus: 'published',
        host: { name: 'Supper Club' },
        tags: ['food'],
      },
    },
  };
}

function expectRestrictedDataAbsent(value) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(PRECISE_ADDRESS);
  expect(serialized).not.toContain(PLACE_ID);
  expect(serialized).not.toContain(PRIVATE_ALIAS);
  for (const key of RESTRICTED_KEYS) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

describe('Phase 6 restricted-location boundaries', () => {
  test('restricted gated fields cannot match Explore search', () => {
    const event = sourceEvent();
    const enabled = { richLocationSearchEnabled: true };

    expect(eventMatchesQuery(event, 'soma', enabled)).toBe(true);
    expect(eventMatchesQuery(event, 'hidden street', enabled)).toBe(false);
    expect(eventMatchesQuery(event, PLACE_ID, enabled)).toBe(false);
    expect(eventMatchesQuery(event, PRIVATE_ALIAS, enabled)).toBe(false);
  });

  test('public landing and sharing serialization contains only gated public fields', () => {
    const payload = serializeLandingDropEvent(sourceEvent(), { readsEnabled: true });
    const publicEvent = projectPublicEvent(sourceEvent(), {
      tenantKey: 'sf',
      tenantType: 'pivot',
      status: 'active',
      pivotDropTimezone: 'America/Los_Angeles',
      richLocationControls: { rollout: 'on', reads: true },
    }, {
      now: new Date('2026-09-01T00:00:00.000Z'),
      technicalHostResolved: true,
      formResolved: true,
    });

    expect(payload.richLocation).toMatchObject({
      mode: 'registration_gated',
      publicDisplayLabel: 'Private venue · SoMa',
      neighborhood: 'SoMa',
      city: 'San Francisco',
    });
    expect(publicEvent.richLocation).toMatchObject({
      mode: 'registration_gated',
      publicDisplayLabel: 'Private venue · SoMa',
      city: 'San Francisco',
    });
    expectRestrictedDataAbsent(payload);
    expectRestrictedDataAbsent(publicEvent);
  });

  test('analytics normalization recursively removes restricted location fields', () => {
    const result = normalizePivotInteractionPayload({
      userId: USER_ID,
      eventId: EVENT_ID,
      batchWeek: '2026-W37',
      surface: 'explore',
      retrieval: 'filter',
      type: 'impression',
      filters: {
        tags: ['food'],
        richLocation: gatedLocation(),
        nested: {
          city: 'San Francisco',
          coordinates: gatedLocation().coordinates,
          googlePlaceId: PLACE_ID,
        },
      },
    });

    expect(result.doc.filters).toEqual({
      tags: ['food'],
      nested: { city: 'San Francisco' },
    });
    expectRestrictedDataAbsent(result.doc);
  });

  test('embedding-ready documents contain only the public projection', () => {
    const document = buildJustGoEventDocument(sourceEvent(), { tenantKey: 'sf' });

    expect(document.metadata.richLocation).toMatchObject({
      mode: 'registration_gated',
      publicDisplayLabel: 'Private venue · SoMa',
      city: 'San Francisco',
    });
    expectRestrictedDataAbsent(document);
  });

  test('records the Phase 6 capability exclusions without implementing them', () => {
    expect(JUST_GO_EVENT_DOCUMENT_EXCLUSIONS).toEqual([
      'embedding_model_calls',
      'vector_storage',
      'retrieval',
      'recommender_changes',
      'proximity_search',
      'map_view',
    ]);
    const document = buildJustGoEventDocument(sourceEvent());
    expect(document).not.toHaveProperty('embedding');
    expect(document).not.toHaveProperty('vector');
    expect(document).not.toHaveProperty('recommendations');
    expect(document.metadata).not.toHaveProperty('coordinates');
  });
});
