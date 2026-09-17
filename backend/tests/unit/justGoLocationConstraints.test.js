const {
  normalizeGoogleGeometryBounds,
  radiusKmFromBounds,
} = require('../../utilities/justGoLocationConstraints');

describe('justGoLocationConstraints geometry helpers', () => {
  test('prefers official bounds over viewport', () => {
    expect(normalizeGoogleGeometryBounds({
      bounds: {
        northeast: { lat: 41, lng: -73 },
        southwest: { lat: 40, lng: -75 },
      },
      viewport: {
        northeast: { lat: 42, lng: -72 },
        southwest: { lat: 39, lng: -76 },
      },
    })).toEqual({ north: 41, east: -73, south: 40, west: -75 });
  });

  test('reads Places API viewport high/low corners', () => {
    expect(normalizeGoogleGeometryBounds({
      viewport: {
        high: { latitude: 40.92, longitude: -73.7 },
        low: { latitude: 40.48, longitude: -74.26 },
      },
    })).toEqual({ north: 40.92, east: -73.7, south: 40.48, west: -74.26 });
  });

  test('falls back to viewport and computes a capped covering radius', () => {
    const bounds = normalizeGoogleGeometryBounds({
      viewport: {
        northeast: { latitude: 40.92, longitude: -73.7 },
        southwest: { latitude: 40.48, longitude: -74.26 },
      },
    });
    expect(bounds).toEqual({ north: 40.92, east: -73.7, south: 40.48, west: -74.26 });
    expect(radiusKmFromBounds(bounds, { latitude: 40.71, longitude: -74.01 }))
      .toBeGreaterThan(20);
    expect(radiusKmFromBounds(bounds, { latitude: 40.71, longitude: -74.01 }))
      .toBeLessThanOrEqual(50);
  });
});
