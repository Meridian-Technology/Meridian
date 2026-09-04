import {
  formatJustGoPublicLocation,
  projectJustGoPublicLandingEvent,
} from './justGoPublicLocation';

const rich = (mode, publicDisplayLabel, extra = {}) => ({
  mode,
  publicDisplayLabel,
  resolutionStatus:
    mode === 'physical' || mode === 'registration_gated'
      ? 'resolved'
      : 'not_applicable',
  revealPolicy:
    mode === 'registration_gated' ? 'registered_only' : 'public',
  ...extra,
});

describe('public Just Go location presentation', () => {
  it.each([
    ['physical', 'Public Hall'],
    ['approximate', 'Downtown Brooklyn'],
    ['online', 'Online event'],
    ['tbd', 'Location to be announced'],
    ['registration_gated', 'Private venue in Williamsburg'],
  ])('uses the approved label for %s mode', (mode, label) => {
    expect(
      formatJustGoPublicLocation({
        location: 'legacy source',
        richLocation: rich(mode, label),
      }),
    ).toBe(label);
  });

  it('never exposes registered-only precision on landing or sharing cards', () => {
    const projected = projectJustGoPublicLandingEvent({
      id: 'secret',
      name: 'Secret show',
      location: 'DO NOT USE: legacy private address',
      richLocation: rich(
        'registration_gated',
        'Private venue in Williamsburg',
        {
          formattedAddress: '123 Secret St',
          addressComponents: [{longText: '123 Secret St'}],
          coordinates: {type: 'Point', coordinates: [-73.96, 40.72]},
          googlePlaceId: 'secret-place-id',
          aliases: ['private alias'],
        },
      ),
    });

    expect(projected.location).toBe('Private venue in Williamsburg');
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('123 Secret St');
    expect(serialized).not.toContain('secret-place-id');
    expect(serialized).not.toContain('private alias');
    expect(serialized).not.toContain('40.72');
  });

  it('uses unchanged legacy fallback when rich reads are disabled', () => {
    const legacy = '  Original legacy venue  ';
    expect(formatJustGoPublicLocation({location: legacy})).toBe(legacy);
  });

  it('distinguishes unresolved physical from intentional TBD', () => {
    expect(
      formatJustGoPublicLocation({
        location: 'unresolved source',
        richLocation: rich('physical', 'Candidate venue', {
          resolutionStatus: 'unresolved',
        }),
      }),
    ).toBe('Location being confirmed');
    expect(
      formatJustGoPublicLocation({
        location: 'TBD',
        richLocation: rich('tbd', 'Location to be announced'),
      }),
    ).toBe('Location to be announced');
  });

  it('falls back to legacy for malformed reveal policies', () => {
    expect(
      formatJustGoPublicLocation({
        location: 'Legacy safe label',
        richLocation: rich('registration_gated', 'Secret venue', {
          revealPolicy: 'public',
        }),
      }),
    ).toBe('Legacy safe label');
  });
});
