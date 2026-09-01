const {
  GoogleLocationError,
  createGoogleLocationAdapter,
  normalizedLocationFromGoogle,
  resolveServerApiKey,
} = require('../../services/googleLocationService');

const SERVER_KEY = 'server-key-do-not-log';
const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

function googlePlace(overrides = {}) {
  return {
    id: PLACE_ID,
    displayName: { text: ' The Great Hall ' },
    formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
    shortFormattedAddress: '123 Main St',
    location: { latitude: 40.7, longitude: -73.9 },
    types: ['event-venue', 'event venue', 'point_of_interest', 'point_of_interest'],
    addressComponents: [
      { longText: 'DUMBO', shortText: 'DUMBO', types: ['neighborhood'] },
      { longText: 'Brooklyn', shortText: 'Brooklyn', types: ['locality'] },
      { longText: 'New York', shortText: 'NY', types: ['administrative_area_level_1'] },
      { longText: '11201', shortText: '11201', types: ['postal_code'] },
      { longText: 'United States', shortText: 'US', types: ['country'] },
    ],
    ...overrides,
  };
}

function adapterOptions(overrides = {}) {
  return {
    env: { GOOGLE_MAPS_SERVER_API_KEY: SERVER_KEY },
    httpClient: { request: jest.fn() },
    telemetry: jest.fn(),
    sleep: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue(Date.parse('2026-09-01T12:00:00.000Z')),
    retryBaseDelayMs: 0,
    ...overrides,
  };
}

describe('googleLocationService', () => {
  it('maps Places API fields into the shared rich-location shape', () => {
    const result = normalizedLocationFromGoogle(googlePlace(), {
      resolvedAt: new Date('2026-09-01T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      venueName: 'The Great Hall',
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      neighborhood: 'DUMBO',
      city: 'Brooklyn',
      region: 'New York',
      postalCode: '11201',
      countryCode: 'US',
      coordinates: { type: 'Point', coordinates: [-73.9, 40.7] },
      googlePlaceId: PLACE_ID,
      provider: 'google',
      placeTypes: ['event_venue', 'point_of_interest'],
      aliases: ['123 Main St'],
      resolutionStatus: 'resolved',
      resolutionConfidence: 1,
      publicDisplayLabel: 'The Great Hall',
    });
    expect(result.addressComponents[0]).toEqual({
      longText: 'DUMBO',
      shortText: 'DUMBO',
      types: ['neighborhood'],
    });
  });

  it('maps legacy Geocoding API field names and partial-match confidence', async () => {
    const options = adapterOptions();
    options.httpClient.request.mockResolvedValue({
      data: {
        status: 'OK',
        results: [{
          place_id: PLACE_ID,
          formatted_address: '123 Main St, Brooklyn, NY 11201, USA',
          partial_match: true,
          geometry: { location: { lat: 40.7, lng: -73.9 } },
          address_components: googlePlace().addressComponents.map((component) => ({
            long_name: component.longText,
            short_name: component.shortText,
            types: component.types,
          })),
          types: ['street_address'],
        }],
      },
    });

    const result = await createGoogleLocationAdapter(options).geocodeAddress('123 Main St', {
      languageCode: 'en',
      regionCode: 'US',
    });

    expect(result).toMatchObject({
      city: 'Brooklyn',
      countryCode: 'US',
      coordinates: { type: 'Point', coordinates: [-73.9, 40.7] },
      resolutionConfidence: 0.75,
    });
    expect(options.httpClient.request).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 5000,
      params: expect.objectContaining({
        address: '123 Main St',
        key: SERVER_KEY,
        language: 'en',
        region: 'us',
      }),
    }));
  });

  it('uses only the server credential and sends the Places key in a header', async () => {
    const options = adapterOptions({
      env: {
        GOOGLE_MAPS_SERVER_API_KEY: ` ${SERVER_KEY} `,
        GOOGLE_MAPS_API_KEY: 'browser-key',
      },
    });
    options.httpClient.request.mockResolvedValue({ data: googlePlace() });

    await createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID, { languageCode: 'en' });

    const request = options.httpClient.request.mock.calls[0][0];
    expect(request.url).toBe(`https://places.googleapis.com/v1/places/${PLACE_ID}`);
    expect(request.timeout).toBe(5000);
    expect(request.headers['X-Goog-Api-Key']).toBe(SERVER_KEY);
    expect(request.headers['X-Goog-FieldMask']).toContain('addressComponents');
    expect(request.params).toEqual({ languageCode: 'en' });
    expect(request.url).not.toContain(SERVER_KEY);
  });

  it('does not fall back to browser or OAuth credentials', () => {
    expect(resolveServerApiKey({
      GOOGLE_MAPS_API_KEY: 'browser-key',
      GOOGLE_CLIENT_SECRET: 'oauth-secret',
    })).toBe('');
  });

  it('fails closed when server credentials are missing', async () => {
    const options = adapterOptions({ env: {} });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .rejects.toMatchObject({
        code: 'GOOGLE_LOCATION_NOT_CONFIGURED',
        status: 503,
        retryable: false,
      });
    expect(options.httpClient.request).not.toHaveBeenCalled();
  });

  it('retries transient failures with bounded exponential backoff', async () => {
    const options = adapterOptions({ retryBaseDelayMs: 10 });
    options.httpClient.request
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValueOnce({ data: googlePlace() });

    const result = await createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID);

    expect(result.googlePlaceId).toBe(PLACE_ID);
    expect(options.httpClient.request).toHaveBeenCalledTimes(3);
    expect(options.sleep).toHaveBeenNthCalledWith(1, 10);
    expect(options.sleep).toHaveBeenNthCalledWith(2, 20);
    expect(options.telemetry).toHaveBeenNthCalledWith(1, expect.objectContaining({
      outcome: 'retry',
      code: 'GOOGLE_LOCATION_RATE_LIMITED',
    }));
    expect(options.telemetry).toHaveBeenNthCalledWith(2, expect.objectContaining({
      outcome: 'retry',
      code: 'GOOGLE_LOCATION_TIMEOUT',
    }));
  });

  it('returns a typed retryable error after exhausting bounded retries', async () => {
    const options = adapterOptions({ maxAttempts: 3, retryBaseDelayMs: 5 });
    options.httpClient.request.mockRejectedValue({ response: { status: 503 } });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .rejects.toMatchObject({
        code: 'GOOGLE_LOCATION_UNAVAILABLE',
        status: 502,
        retryable: true,
        providerStatus: 503,
        attempts: 3,
      });
    expect(options.httpClient.request).toHaveBeenCalledTimes(3);
    expect(options.sleep).toHaveBeenNthCalledWith(1, 5);
    expect(options.sleep).toHaveBeenNthCalledWith(2, 10);
    expect(options.telemetry).toHaveBeenLastCalledWith(expect.objectContaining({
      outcome: 'failure',
      attempt: 3,
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
    }));
  });

  it('retries retryable statuses returned inside a Geocoding response', async () => {
    const options = adapterOptions();
    options.httpClient.request
      .mockResolvedValueOnce({ data: { status: 'OVER_QUERY_LIMIT', results: [] } })
      .mockResolvedValueOnce({ data: {
        status: 'OK',
        results: [{
          place_id: PLACE_ID,
          formatted_address: '123 Main St',
          geometry: { location: { lat: 40.7, lng: -73.9 } },
          address_components: [],
          types: ['street_address'],
        }],
      } });

    await expect(createGoogleLocationAdapter(options).geocodeAddress('123 Main St'))
      .resolves.toMatchObject({ googlePlaceId: PLACE_ID });
    expect(options.httpClient.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, 'GOOGLE_LOCATION_INVALID_REQUEST', 400],
    [403, 'GOOGLE_LOCATION_AUTH_FAILED', 503],
    [404, 'GOOGLE_PLACE_NOT_FOUND', 404],
  ])('does not retry terminal HTTP %s errors', async (providerStatus, code, status) => {
    const options = adapterOptions();
    options.httpClient.request.mockRejectedValue({ response: { status: providerStatus } });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .rejects.toMatchObject({ code, status, retryable: false, attempts: 1 });
    expect(options.httpClient.request).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it('rejects malformed provider data instead of marking it resolved', async () => {
    const options = adapterOptions();
    options.httpClient.request.mockResolvedValue({
      data: googlePlace({ location: { latitude: 91, longitude: -73.9 } }),
    });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .rejects.toMatchObject({
        code: 'GOOGLE_LOCATION_MALFORMED_RESPONSE',
        retryable: false,
      });
  });

  it.each(['', 'not a place id', 'https://maps.google.com/place/foo']) (
    'rejects invalid Place IDs before making a request',
    async (placeId) => {
      const options = adapterOptions();
      await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(placeId))
        .rejects.toBeInstanceOf(GoogleLocationError);
      expect(options.httpClient.request).not.toHaveBeenCalled();
    },
  );

  it('rejects a response whose canonical Place ID differs from the selection', async () => {
    const options = adapterOptions();
    options.httpClient.request.mockResolvedValue({
      data: googlePlace({ id: 'ChIJDifferentCanonicalPlace123' }),
    });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .rejects.toMatchObject({
        code: 'GOOGLE_LOCATION_MALFORMED_RESPONSE',
        retryable: false,
        attempts: 1,
      });
  });

  it('emits allowlisted telemetry without addresses, IDs, coordinates, keys, or provider text', async () => {
    const options = adapterOptions();
    options.httpClient.request.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: `Denied ${PLACE_ID} at 123 Main St using ${SERVER_KEY}` } },
      },
      message: `request for ${PLACE_ID} failed`,
    });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID)).rejects.toBeDefined();

    const serialized = JSON.stringify(options.telemetry.mock.calls);
    expect(serialized).not.toContain(PLACE_ID);
    expect(serialized).not.toContain('123 Main St');
    expect(serialized).not.toContain(SERVER_KEY);
    expect(options.telemetry).toHaveBeenCalledWith({
      provider: 'google',
      operation: 'place_details',
      outcome: 'failure',
      attempt: 1,
      durationMs: 0,
      code: 'GOOGLE_LOCATION_AUTH_FAILED',
      providerStatus: 403,
    });
  });

  it('ignores telemetry failures so resolution still succeeds', async () => {
    const options = adapterOptions({ telemetry: jest.fn(() => { throw new Error('down'); }) });
    options.httpClient.request.mockResolvedValue({ data: googlePlace() });

    await expect(createGoogleLocationAdapter(options).fetchPlaceDetails(PLACE_ID))
      .resolves.toMatchObject({ googlePlaceId: PLACE_ID });
  });
});
