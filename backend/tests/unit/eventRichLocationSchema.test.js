const mongoose = require('mongoose');
const eventSchema = require('../../events/schemas/event');

const richLocationSchema = eventSchema.path('richLocation').schema;
const richLocationTestContainerSchema = new mongoose.Schema({
  richLocation: { type: richLocationSchema, required: true },
});
const RichLocation = mongoose.models.RichLocationSchemaTest
  || mongoose.model('RichLocationSchemaTest', richLocationTestContainerSchema);

function richDocument(overrides = {}) {
  return new RichLocation({ richLocation: {
    mode: 'physical',
    originalInput: 'Fox Theater',
    venueName: 'Fox Theater',
    formattedAddress: '1807 Telegraph Ave, Oakland, CA 94612, USA',
    addressComponents: [{
      longText: 'Oakland',
      shortText: 'Oakland',
      types: ['locality'],
    }],
    neighborhood: 'Uptown',
    city: 'Oakland',
    region: 'California',
    postalCode: '94612',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-122.2697, 37.8081] },
    googlePlaceId: 'ChIJ-example',
    provider: 'google',
    placeTypes: ['concert_hall'],
    aliases: ['The Fox'],
    resolutionStatus: 'resolved',
    resolutionConfidence: 0.99,
    resolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    publicDisplayLabel: 'Fox Theater · Uptown',
    revealPolicy: 'public',
    ...overrides,
  } }).richLocation;
}

async function validationErrors(overrides) {
  const doc = richDocument(overrides);
  try {
    await doc.validate();
    return {};
  } catch (error) {
    return error.errors || {};
  }
}

describe('shared event richLocation schema', () => {
  test.each([
    ['physical', {}],
    ['registration_gated', { revealPolicy: 'registered_only' }],
    ['approximate', {
      formattedAddress: undefined,
      addressComponents: undefined,
      postalCode: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      placeTypes: undefined,
      resolutionStatus: 'not_applicable',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      approximateLabel: 'Uptown, Oakland',
    }],
    ['online', {
      venueName: undefined,
      formattedAddress: undefined,
      addressComponents: undefined,
      neighborhood: undefined,
      city: undefined,
      region: undefined,
      postalCode: undefined,
      countryCode: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      placeTypes: undefined,
      resolutionStatus: 'not_applicable',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      publicDisplayLabel: 'Online',
    }],
    ['tbd', {
      venueName: undefined,
      formattedAddress: undefined,
      addressComponents: undefined,
      neighborhood: undefined,
      city: undefined,
      region: undefined,
      postalCode: undefined,
      countryCode: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      placeTypes: undefined,
      resolutionStatus: 'not_applicable',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      publicDisplayLabel: 'Location to be announced',
    }],
  ])('validates %s mode', async (mode, overrides) => {
    await expect(richDocument({ mode, ...overrides }).validate()).resolves.toBeUndefined();
  });

  test('normalizes canonical strings, provider types, aliases, country and search text', async () => {
    const doc = richDocument({
      originalInput: '  Fox   Theater  ',
      countryCode: 'us',
      placeTypes: ['Concert Hall', 'concert-hall', 'concert_hall'],
      aliases: ['  The   Fox ', 'The Fox'],
      normalizedSearchText: undefined,
    });

    await doc.validate();

    expect(doc.originalInput).toBe('Fox Theater');
    expect(doc.countryCode).toBe('US');
    expect(doc.placeTypes).toEqual(['concert_hall']);
    expect(doc.aliases).toEqual(['The Fox']);
    expect(doc.normalizedSearchText).toContain('fox theater');
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  test.each(['originalInput', 'resolutionStatus', 'publicDisplayLabel', 'revealPolicy'])(
    'requires %s whenever richLocation is present',
    async (field) => {
      const errors = await validationErrors({ [field]: undefined });
      expect(errors[field]).toBeDefined();
    },
  );

  test('requires canonical provider fields for resolved physical locations', async () => {
    for (const field of ['formattedAddress', 'coordinates', 'provider', 'resolutionConfidence', 'resolvedAt']) {
      const errors = await validationErrors({ [field]: undefined });
      expect(errors[field]).toBeDefined();
    }
    expect(await validationErrors({ googlePlaceId: undefined })).toHaveProperty('googlePlaceId');
  });

  test('enforces GeoJSON longitude-latitude ordering and bounds', async () => {
    await expect(richDocument({
      coordinates: { type: 'Point', coordinates: [-122.2697, 37.8081] },
    }).validate()).resolves.toBeUndefined();

    expect((await validationErrors({
      coordinates: { type: 'Point', coordinates: [37.8081, -122.2697] },
    }))['coordinates.coordinates']).toBeDefined();
    expect((await validationErrors({
      coordinates: { type: 'Point', coordinates: [-122.2697] },
    }))['coordinates.coordinates']).toBeDefined();
  });

  test('rejects malformed or inconsistent provider data', async () => {
    expect(await validationErrors({ provider: 'mapbox' })).toHaveProperty('provider');
    expect(await validationErrors({ provider: 'manual' })).toHaveProperty('googlePlaceId');
    expect((await validationErrors({
      addressComponents: [{ longText: 'Oakland', types: [] }],
    }))['addressComponents.0.types']).toBeDefined();
  });

  test('distinguishes intentional TBD from an unresolved physical location', async () => {
    const tbdErrors = await validationErrors({
      mode: 'tbd',
      resolutionStatus: 'unresolved',
      formattedAddress: undefined,
      addressComponents: undefined,
      postalCode: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      placeTypes: undefined,
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      publicDisplayLabel: 'Location to be announced',
    });
    expect(tbdErrors).toHaveProperty('resolutionStatus');

    await expect(richDocument({
      resolutionStatus: 'unresolved',
      formattedAddress: undefined,
      addressComponents: undefined,
      coordinates: undefined,
      googlePlaceId: undefined,
      provider: undefined,
      placeTypes: undefined,
      resolutionConfidence: undefined,
      resolvedAt: undefined,
    }).validate()).resolves.toBeUndefined();
  });

  test('enforces a single mode representation and reveal policy', async () => {
    expect(await validationErrors({
      mode: 'online',
      resolutionStatus: 'not_applicable',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      publicDisplayLabel: 'Online',
    })).toHaveProperty('coordinates');
    expect(await validationErrors({
      mode: 'approximate',
      resolutionStatus: 'not_applicable',
      resolutionConfidence: undefined,
      resolvedAt: undefined,
      approximateLabel: 'Uptown, Oakland',
    })).toHaveProperty('formattedAddress');
    expect(await validationErrors({
      mode: 'registration_gated',
      revealPolicy: 'public',
    })).toHaveProperty('revealPolicy');
    expect(await validationErrors({ revealPolicy: 'registered_only' })).toHaveProperty('revealPolicy');
  });

  test('keeps legacy events compatible and the legacy location string required', () => {
    expect(eventSchema.path('richLocation').isRequired).toBeFalsy();
    expect(eventSchema.path('richLocation').defaultValue).toBeUndefined();
    expect(eventSchema.path('location').isRequired).toBe(true);

    const legacyOnly = new mongoose.Document({ location: 'Legacy venue' }, eventSchema);
    const missingLocation = new mongoose.Document({}, eventSchema);
    expect(legacyOnly.validateSync()?.errors?.richLocation).toBeUndefined();
    expect(missingLocation.validateSync()?.errors?.location).toBeDefined();
  });
});
