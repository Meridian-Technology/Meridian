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
  normalizeJustGoLocationConstraints,
  validateJustGoLocationConstraints,
};
