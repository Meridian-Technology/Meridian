const {
  PUBLIC_RICH_LOCATION_FIELDS,
  projectPublicRichLocation,
} = require('../../events/services/richLocationProjectionService');

function richLocation(overrides = {}) {
  return {
    mode: 'physical',
    originalInput: 'Raw source address with private notes',
    venueName: 'The Great Hall',
    formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
    addressComponents: [{ longText: 'Brooklyn', types: ['locality'] }],
    neighborhood: 'Downtown Brooklyn',
    city: 'Brooklyn',
    region: 'New York',
    postalCode: '11201',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
    googlePlaceId: 'ChIJ-private-place-id',
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: ['Private search alias'],
    normalizedSearchText: 'private search material',
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    resolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
    publicDisplayLabel: 'The Great Hall · Downtown Brooklyn',
    approximateLabel: 'Downtown Brooklyn',
    revealPolicy: 'public',
    ...overrides,
  };
}

describe('Just Go public-safe rich-location projection', () => {
  it('projects explicitly public physical fields and no provider or audit data', () => {
    expect(projectPublicRichLocation(richLocation())).toEqual({
      mode: 'physical',
      publicDisplayLabel: 'The Great Hall · Downtown Brooklyn',
      venueName: 'The Great Hall',
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      approximateLabel: 'Downtown Brooklyn',
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
      region: 'New York',
      postalCode: '11201',
      countryCode: 'US',
      resolutionStatus: 'resolved',
      revealPolicy: 'public',
    });
  });

  it('removes all precise and provider fields from registration-gated locations', () => {
    const projected = projectPublicRichLocation(richLocation({
      mode: 'registration_gated',
      revealPolicy: 'registered_only',
      publicDisplayLabel: 'The Great Hall · address after registration',
    }));

    expect(projected).toEqual({
      mode: 'registration_gated',
      publicDisplayLabel: 'The Great Hall · address after registration',
      venueName: 'The Great Hall',
      approximateLabel: 'Downtown Brooklyn',
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
      region: 'New York',
      countryCode: 'US',
      resolutionStatus: 'resolved',
      revealPolicy: 'registered_only',
    });
    expect(projected).not.toHaveProperty('formattedAddress');
    expect(projected).not.toHaveProperty('postalCode');
    expect(JSON.stringify(projected)).not.toMatch(
      /addressComponents|coordinates|googlePlaceId|ChIJ|provider|placeTypes|originalInput|aliases|normalizedSearchText|resolutionConfidence|resolvedAt|reviewedAt/,
    );
  });

  it.each([
    ['approximate', {
      approximateLabel: 'Near Prospect Park',
      publicDisplayLabel: 'Near Prospect Park',
      resolutionStatus: 'not_applicable',
    }],
    ['online', {
      publicDisplayLabel: 'Online',
      resolutionStatus: 'not_applicable',
    }],
    ['tbd', {
      publicDisplayLabel: 'Location TBD',
      resolutionStatus: 'not_applicable',
    }],
  ])('supports a public-safe %s projection', (mode, overrides) => {
    const projected = projectPublicRichLocation(richLocation({ mode, ...overrides }));
    expect(projected).toMatchObject({ mode, ...overrides, revealPolicy: 'public' });
    expect(projected).not.toHaveProperty('formattedAddress');
    expect(projected).not.toHaveProperty('postalCode');
    expect(projected).not.toHaveProperty('coordinates');
    expect(projected).not.toHaveProperty('googlePlaceId');
  });

  it('does not trust mode-invalid broad geography on online or TBD source data', () => {
    for (const mode of ['online', 'tbd']) {
      expect(projectPublicRichLocation(richLocation({
        mode,
        publicDisplayLabel: mode === 'online' ? 'Online' : 'Location TBD',
        resolutionStatus: 'not_applicable',
      }))).toEqual({
        mode,
        publicDisplayLabel: mode === 'online' ? 'Online' : 'Location TBD',
        resolutionStatus: 'not_applicable',
        revealPolicy: 'public',
      });
    }
  });

  it('fails closed for absent, malformed, unknown, or policy-inconsistent locations', () => {
    expect(projectPublicRichLocation()).toBeUndefined();
    expect(projectPublicRichLocation([])).toBeUndefined();
    expect(projectPublicRichLocation({ mode: 'secret' })).toBeUndefined();
    expect(projectPublicRichLocation(richLocation({ publicDisplayLabel: '' }))).toBeUndefined();
    expect(projectPublicRichLocation(richLocation({ revealPolicy: 'registered_only' })))
      .toBeUndefined();
    expect(projectPublicRichLocation(richLocation({
      mode: 'registration_gated', revealPolicy: 'public',
    }))).toBeUndefined();
  });

  it('uses an explicit allowlist that excludes every restricted field', () => {
    expect(PUBLIC_RICH_LOCATION_FIELDS).toEqual([
      'mode',
      'publicDisplayLabel',
      'venueName',
      'formattedAddress',
      'approximateLabel',
      'neighborhood',
      'city',
      'region',
      'postalCode',
      'countryCode',
      'resolutionStatus',
      'revealPolicy',
    ]);
    expect(PUBLIC_RICH_LOCATION_FIELDS).not.toEqual(expect.arrayContaining([
      'originalInput',
      'addressComponents',
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
    ]));
  });
});
