const {
  requestFromPayload,
  resolveRichLocationWrite,
  preciseLocationInScope,
  pointWithinBounds,
} = require('../../services/justGoRichLocationWriteService');

const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
const NOW = new Date('2026-09-01T12:00:00.000Z');
const TENANT = {
  tenantKey: 'brooklyn',
  tenantType: 'pivot',
  richLocationConstraints: {
    countryCode: 'US',
    bounds: { south: 40.55, west: -74.1, north: 40.75, east: -73.8 },
  },
  richLocationControls: {
    rollout: 'on',
    reads: true,
    writes: true,
    autocomplete: true,
    search: true,
  },
};

function canonical(overrides = {}) {
  return {
    venueName: 'The Great Hall',
    formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
    addressComponents: [{ longText: 'Brooklyn', shortText: 'Brooklyn', types: ['locality'] }],
    city: 'Brooklyn',
    region: 'New York',
    postalCode: '11201',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-73.95, 40.68] },
    googlePlaceId: PLACE_ID,
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: [],
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    resolvedAt: NOW,
    publicDisplayLabel: 'The Great Hall',
    ...overrides,
  };
}

function options(request, overrides = {}) {
  return {
    tenant: TENANT,
    request,
    legacyLocation: 'Original venue text',
    now: NOW,
    googleAdapter: { fetchPlaceDetails: jest.fn().mockResolvedValue(canonical()) },
    ...overrides,
  };
}

describe('justGoRichLocationWriteService', () => {
  it('rejects rich writes for disabled cities before calling Google', async () => {
    const input = options(
      { mode: 'physical', googlePlaceId: PLACE_ID },
      {
        tenant: {
          ...TENANT,
          richLocationControls: { rollout: 'off', writes: true },
        },
      },
    );
    const result = await resolveRichLocationWrite(input);
    expect(result).toEqual({
      error: 'Rich locations are not enabled for this city.',
      code: 'RICH_LOCATION_WRITES_DISABLED',
      status: 409,
    });
    expect(input.googleAdapter.fetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('accepts top-level client selection fields as a request', () => {
    expect(requestFromPayload({
      locationMode: 'physical',
      googlePlaceId: PLACE_ID,
      revealPolicy: 'public',
    })).toEqual({
      mode: 'physical',
      googlePlaceId: PLACE_ID,
      revealPolicy: 'public',
      publicDisplayLabel: undefined,
      approximateLabel: undefined,
      neighborhood: undefined,
      city: undefined,
      region: undefined,
      countryCode: undefined,
    });
  });

  it('fetches canonical backend details for a selected physical place', async () => {
    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID });
    const result = await resolveRichLocationWrite(input);

    expect(input.googleAdapter.fetchPlaceDetails).toHaveBeenCalledWith(PLACE_ID, {
      languageCode: 'en',
    });
    expect(result.richLocation).toMatchObject({
      mode: 'physical',
      originalInput: 'Original venue text',
      googlePlaceId: PLACE_ID,
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      coordinates: { type: 'Point', coordinates: [-73.95, 40.68] },
      revealPolicy: 'public',
      resolutionStatus: 'resolved',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('forces registered-only reveal for gated physical locations', async () => {
    const result = await resolveRichLocationWrite(options({
      mode: 'registration-gated',
      googlePlaceId: PLACE_ID,
      revealPolicy: 'public',
    }));

    expect(result.richLocation).toMatchObject({
      mode: 'registration_gated',
      revealPolicy: 'registered_only',
      publicDisplayLabel: 'The Great Hall',
    });
  });

  it.each([
    [canonical({ countryCode: 'CA' }), 'country'],
    [canonical({ coordinates: { type: 'Point', coordinates: [-75, 40.68] } }), 'bounds'],
    [canonical({ coordinates: undefined }), 'coordinates'],
  ])('recognizes canonical places outside configured scope (%s)', (location, reason) => {
    expect(preciseLocationInScope(location, TENANT.richLocationConstraints)).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects an out-of-country place before saving', async () => {
    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID });
    input.googleAdapter.fetchPlaceDetails.mockResolvedValue(canonical({ countryCode: 'CA' }));

    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_OUT_OF_SCOPE',
      status: 422,
    });
  });

  it('rejects a place outside the city bounds before saving', async () => {
    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID });
    input.googleAdapter.fetchPlaceDetails.mockResolvedValue(canonical({
      coordinates: { type: 'Point', coordinates: [-73.6, 40.68] },
    }));

    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_OUT_OF_SCOPE',
      status: 422,
    });
  });

  it('supports antimeridian-crossing bounds', () => {
    expect(pointWithinBounds(
      { latitude: 10, longitude: 179 },
      { south: 0, west: 170, north: 20, east: -170 },
    )).toBe(true);
    expect(pointWithinBounds(
      { latitude: 10, longitude: 0 },
      { south: 0, west: 170, north: 20, east: -170 },
    )).toBe(false);
  });

  it('enforces a configured center radius', async () => {
    const tenant = {
      ...TENANT,
      richLocationConstraints: {
        countryCode: 'US',
        center: { latitude: 40.68, longitude: -73.95 },
        radiusKm: 5,
      },
    };
    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID }, { tenant });
    input.googleAdapter.fetchPlaceDetails.mockResolvedValue(canonical({
      coordinates: { type: 'Point', coordinates: [-73.7, 40.68] },
    }));

    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_OUT_OF_SCOPE',
    });
  });

  it('fails closed when physical city constraints are absent', async () => {
    const input = options(
      { mode: 'physical', googlePlaceId: PLACE_ID },
      {
        tenant: {
          tenantKey: 'brooklyn',
          tenantType: 'pivot',
          richLocationControls: { rollout: 'on', writes: true },
        },
      },
    );

    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_CITY_CONSTRAINTS_REQUIRED',
      status: 503,
    });
    expect(input.googleAdapter.fetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('rejects missing Place IDs and unresolved provider results', async () => {
    await expect(resolveRichLocationWrite(options({ mode: 'physical' })))
      .resolves.toMatchObject({ code: 'RICH_LOCATION_PLACE_ID_REQUIRED' });

    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID });
    input.googleAdapter.fetchPlaceDetails.mockResolvedValue({ resolutionStatus: 'unresolved' });
    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_UNRESOLVED',
      status: 422,
    });
  });

  it('returns safe provider failures without provider response details', async () => {
    const input = options({ mode: 'physical', googlePlaceId: PLACE_ID });
    input.googleAdapter.fetchPlaceDetails.mockRejectedValue(Object.assign(
      new Error('sensitive provider response'),
      { code: 'GOOGLE_LOCATION_TIMEOUT', status: 504 },
    ));

    const result = await resolveRichLocationWrite(input);
    expect(result).toEqual({
      error: 'The selected place could not be resolved.',
      code: 'GOOGLE_LOCATION_TIMEOUT',
      status: 504,
    });
    expect(JSON.stringify(result)).not.toContain('sensitive provider response');
  });

  it('maps an invalid client-selected Place ID to a safe terminal rejection', async () => {
    const input = options({ mode: 'physical', googlePlaceId: 'bad-id' });
    input.googleAdapter.fetchPlaceDetails.mockRejectedValue(Object.assign(
      new Error('provider included sensitive query input'),
      { code: 'GOOGLE_PLACE_ID_INVALID', status: 400, retryable: false },
    ));

    await expect(resolveRichLocationWrite(input)).resolves.toEqual({
      error: 'The selected Google place is invalid.',
      code: 'GOOGLE_PLACE_ID_INVALID',
      status: 400,
    });
  });

  it('permits valid approximate mode without calling Google', async () => {
    const input = options({
      mode: 'approximate',
      approximateLabel: 'Near Prospect Park',
      neighborhood: 'Park Slope',
      city: 'Brooklyn',
      countryCode: 'us',
    });
    const result = await resolveRichLocationWrite(input);

    expect(result.richLocation).toMatchObject({
      mode: 'approximate',
      approximateLabel: 'Near Prospect Park',
      neighborhood: 'Park Slope',
      city: 'Brooklyn',
      countryCode: 'US',
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    });
    expect(input.googleAdapter.fetchPlaceDetails).not.toHaveBeenCalled();
    expect(result.richLocation).not.toHaveProperty('coordinates');
    expect(result.richLocation).not.toHaveProperty('googlePlaceId');
  });

  it('rejects an approximate location explicitly assigned to another country', async () => {
    const input = options({
      mode: 'approximate',
      approximateLabel: 'Near the waterfront',
      city: 'Toronto',
      countryCode: 'CA',
    });

    await expect(resolveRichLocationWrite(input)).resolves.toMatchObject({
      code: 'RICH_LOCATION_OUT_OF_SCOPE',
      status: 422,
    });
    expect(input.googleAdapter.fetchPlaceDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['online', 'Online'],
    ['tbd', 'Location TBD'],
  ])('permits intentional %s mode without provider fields', async (mode, label) => {
    const input = options({ mode });
    const result = await resolveRichLocationWrite(input);
    expect(result.richLocation).toMatchObject({
      mode,
      publicDisplayLabel: label,
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    });
    expect(input.googleAdapter.fetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('leaves legacy-only writes unchanged', async () => {
    await expect(resolveRichLocationWrite(options(undefined))).resolves.toEqual({
      richLocation: undefined,
    });
  });
});
