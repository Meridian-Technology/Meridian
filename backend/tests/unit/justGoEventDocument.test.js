const {
  JUST_GO_EVENT_DOCUMENT_VERSION,
  buildJustGoEventDocument,
} = require('../../utilities/justGoEventDocument');

const PRECISE_ADDRESS = '123 Secret St, Brooklyn, NY 11201, USA';
const PLACE_ID = 'ChIJ-private';

function gatedLocation() {
  return {
    mode: 'registration_gated',
    originalInput: 'Private source notes',
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
    placeTypes: ['event_venue'],
    aliases: ['Private provider alias'],
    normalizedSearchText: 'private normalized search text',
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    publicDisplayLabel: 'The Great Hall · Downtown Brooklyn',
    approximateLabel: 'Downtown Brooklyn',
    revealPolicy: 'registered_only',
  };
}

function event(overrides = {}) {
  return {
    _id: '507f191e810c19729de860eb',
    name: '  Night   Market  ',
    description: ' Food, music, and local art. ',
    location: PRECISE_ADDRESS,
    start_time: '2026-09-12T02:00:00.000Z',
    end_time: new Date('2026-09-12T05:00:00.000Z'),
    type: ' SOCIAL ',
    richLocation: gatedLocation(),
    customFields: {
      pivot: {
        batchWeek: '2026-W37',
        host: { name: '  City Arts  ' },
        tags: ['Food', 'nightlife', 'food'],
        enrichment: {
          vibe: ['Dancey', 'chill'],
          priceBand: 'LOW',
          neighborhood: ' Downtown Brooklyn ',
          audience: 'All ages',
        },
      },
    },
    ...overrides,
  };
}

describe('Just Go event document builder', () => {
  test('builds normalized, versioned metadata and deterministic text', () => {
    const document = buildJustGoEventDocument(event(), { tenantKey: ' NYC ' });

    expect(document).toMatchObject({
      schemaVersion: JUST_GO_EVENT_DOCUMENT_VERSION,
      eventId: '507f191e810c19729de860eb',
      tenantKey: 'nyc',
      metadata: {
        title: 'Night Market',
        description: 'Food, music, and local art.',
        eventType: 'social',
        startTime: '2026-09-12T02:00:00.000Z',
        endTime: '2026-09-12T05:00:00.000Z',
        batchWeek: '2026-W37',
        tags: ['food', 'nightlife'],
        hostName: 'City Arts',
        enrichment: {
          vibe: ['chill', 'dancey'],
          priceBand: 'low',
          neighborhood: 'Downtown Brooklyn',
          audience: 'All ages',
        },
      },
    });
    expect(document.text).toContain('Title: Night Market');
    expect(document.text).toContain('Tags: food, nightlife');
  });

  test('is byte-deterministic across equivalent ordering and formatting', () => {
    const left = buildJustGoEventDocument(event(), { tenantKey: 'NYC' });
    const right = buildJustGoEventDocument(event({
      name: 'Night Market',
      start_time: new Date('2026-09-12T02:00:00.000Z'),
      end_time: '2026-09-12T05:00:00.000Z',
      customFields: {
        pivot: {
          batchWeek: '2026-W37',
          host: { name: 'City Arts' },
          tags: ['nightlife', 'FOOD'],
          enrichment: {
            vibe: ['CHILL', 'dancey', 'chill'],
            priceBand: 'low',
            neighborhood: 'Downtown Brooklyn',
            audience: 'All ages',
          },
        },
      },
    }), { tenantKey: 'nyc' });

    expect(JSON.stringify(right)).toBe(JSON.stringify(left));
  });

  test('uses only the public projection for gated location metadata and text', () => {
    const document = buildJustGoEventDocument(event());
    const serialized = JSON.stringify(document);

    expect(document.metadata.richLocation).toEqual({
      mode: 'registration_gated',
      publicDisplayLabel: 'The Great Hall · Downtown Brooklyn',
      venueName: 'The Great Hall',
      approximateLabel: 'Downtown Brooklyn',
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
      region: 'New York',
      countryCode: 'US',
      resolutionStatus: 'resolved',
      revealPolicy: 'registered_only',
    });
    for (const restricted of [
      PRECISE_ADDRESS,
      PLACE_ID,
      'Private source notes',
      'Private provider alias',
      'private normalized search text',
      'coordinates',
      'addressComponents',
    ]) {
      expect(serialized).not.toContain(restricted);
    }
  });

  test('includes canonical address metadata when the physical location is public', () => {
    const document = buildJustGoEventDocument(event({
      richLocation: {
        ...gatedLocation(),
        mode: 'physical',
        revealPolicy: 'public',
      },
    }));

    expect(document.metadata.richLocation).toMatchObject({
      mode: 'physical',
      formattedAddress: PRECISE_ADDRESS,
      postalCode: '11201',
      revealPolicy: 'public',
    });
    expect(document.text).toContain(PRECISE_ADDRESS);
    expect(JSON.stringify(document)).not.toContain(PLACE_ID);
  });

  test('ignores viewer-specific and ranking fields', () => {
    const baseline = buildJustGoEventDocument(event());
    const personalized = buildJustGoEventDocument(event({
      userIntent: 'registered',
      registrationCount: 999,
      rankInFeed: 1,
      friendsGoingCount: 25,
    }));

    expect(personalized).toEqual(baseline);
  });

  test('fails closed for invalid input and malformed rich locations', () => {
    expect(buildJustGoEventDocument(null)).toBeUndefined();
    expect(buildJustGoEventDocument({ name: 'Missing id' })).toBeUndefined();
    const document = buildJustGoEventDocument(event({
      richLocation: { mode: 'physical', formattedAddress: PRECISE_ADDRESS },
    }));
    expect(document.metadata).not.toHaveProperty('richLocation');
    expect(document.text).not.toContain(PRECISE_ADDRESS);
  });
});
