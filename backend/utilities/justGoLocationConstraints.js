function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCountryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function normalizePoint(value) {
  const latitude = finiteNumber(value?.latitude ?? value?.lat);
  const longitude = finiteNumber(value?.longitude ?? value?.lng);
  if (latitude === null || latitude < -90 || latitude > 90
    || longitude === null || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function normalizeBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const south = finiteNumber(value.south);
  const west = finiteNumber(value.west);
  const north = finiteNumber(value.north);
  const east = finiteNumber(value.east);
  if (south === null || west === null || north === null || east === null
    || south < -90 || north > 90 || south > north
    || west < -180 || west > 180 || east < -180 || east > 180) {
    return null;
  }
  return { south, west, north, east };
}

function normalizeGoogleGeometryBounds(geometry) {
  const box = geometry?.bounds || geometry?.viewport;
  if (!box) return null;
  const northEast = normalizePoint(box.northeast || box.high);
  const southWest = normalizePoint(box.southwest || box.low);
  if (!northEast || !southWest) return null;
  return normalizeBounds({
    north: northEast.latitude,
    east: northEast.longitude,
    south: southWest.latitude,
    west: southWest.longitude,
  });
}

function distanceKm(first, second) {
  const radians = (degrees) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude))
      * Math.cos(radians(second.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radiusKmFromBounds(bounds, center) {
  if (!bounds) return null;
  const origin = center || {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
  if (!normalizePoint(origin)) return null;
  const radius = Math.max(
    distanceKm(origin, { latitude: bounds.north, longitude: bounds.east }),
    distanceKm(origin, { latitude: bounds.north, longitude: bounds.west }),
    distanceKm(origin, { latitude: bounds.south, longitude: bounds.east }),
    distanceKm(origin, { latitude: bounds.south, longitude: bounds.west }),
  );
  return Math.min(500, Math.max(0.1, Math.round(radius * 10) / 10));
}

function normalizeJustGoLocationConstraints(value) {
  if (!value || typeof value !== 'object') return undefined;
  const countryCode = normalizeCountryCode(value.countryCode);
  const bounds = normalizeBounds(value.bounds);
  const center = normalizePoint(value.center);
  const radiusKm = finiteNumber(value.radiusKm);
  const normalizedRadius = radiusKm !== null && radiusKm > 0 && radiusKm <= 500
    ? radiusKm
    : null;

  if (!countryCode && !bounds && !(center && normalizedRadius)) return undefined;
  return {
    ...(countryCode ? { countryCode } : {}),
    ...(bounds ? { bounds } : {}),
    ...(center && normalizedRadius ? { center, radiusKm: normalizedRadius } : {}),
  };
}

function validateJustGoLocationConstraints(value) {
  const normalized = normalizeJustGoLocationConstraints(value);
  if (!normalized?.countryCode) {
    return { error: 'richLocationConstraints.countryCode must be a two-letter country code.' };
  }
  if (!normalized.bounds && !(normalized.center && normalized.radiusKm)) {
    return {
      error: 'richLocationConstraints requires valid bounds or center and radiusKm.',
    };
  }
  return { constraints: normalized };
}

module.exports = {
  normalizeCountryCode,
  normalizePoint,
  normalizeBounds,
  normalizeGoogleGeometryBounds,
  radiusKmFromBounds,
  normalizeJustGoLocationConstraints,
  validateJustGoLocationConstraints,
};
