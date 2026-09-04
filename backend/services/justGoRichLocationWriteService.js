const googleLocationService = require('./googleLocationService');
const {
  normalizeCountryCode,
  validateJustGoLocationConstraints,
} = require('../utilities/justGoLocationConstraints');
const {
  isRichLocationCapabilityEnabled,
} = require('../utilities/justGoRichLocationControls');

const MODES = new Set([
  'physical',
  'registration_gated',
  'approximate',
  'online',
  'tbd',
]);

function trimString(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function requestFromPayload(payload = {}) {
  if (payload.richLocation !== undefined) return payload.richLocation;
  const hasTopLevelRequest = [
    'locationMode',
    'googlePlaceId',
    'revealPolicy',
    'publicDisplayLabel',
    'approximateLabel',
  ].some((key) => payload[key] !== undefined);
  if (!hasTopLevelRequest) return undefined;
  return {
    mode: payload.locationMode,
    googlePlaceId: payload.googlePlaceId,
    revealPolicy: payload.revealPolicy,
    publicDisplayLabel: payload.publicDisplayLabel,
    approximateLabel: payload.approximateLabel,
    neighborhood: payload.neighborhood,
    city: payload.city,
    region: payload.region,
    countryCode: payload.countryCode,
  };
}

function coordinatesFromRichLocation(location) {
  const coordinates = location?.coordinates?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates.map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

function longitudeWithinBounds(longitude, west, east) {
  // west > east represents a box crossing the antimeridian.
  return west <= east
    ? longitude >= west && longitude <= east
    : longitude >= west || longitude <= east;
}

function pointWithinBounds(point, bounds) {
  return point.latitude >= bounds.south
    && point.latitude <= bounds.north
    && longitudeWithinBounds(point.longitude, bounds.west, bounds.east);
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

function preciseLocationInScope(location, constraints) {
  const countryCode = normalizeCountryCode(location?.countryCode);
  if (!countryCode || countryCode !== constraints.countryCode) {
    return { ok: false, reason: 'country' };
  }
  const point = coordinatesFromRichLocation(location);
  if (!point) return { ok: false, reason: 'coordinates' };
  if (constraints.bounds && !pointWithinBounds(point, constraints.bounds)) {
    return { ok: false, reason: 'bounds' };
  }
  if (constraints.center && constraints.radiusKm
    && distanceKm(point, constraints.center) > constraints.radiusKm) {
    return { ok: false, reason: 'radius' };
  }
  return { ok: true };
}

function invalid(error, code, status = 400) {
  return { error, code, status };
}

function baseLocation(mode, request, legacyLocation, now) {
  return {
    mode,
    originalInput: trimString(request.originalInput) || trimString(legacyLocation),
    createdAt: now,
    updatedAt: now,
  };
}

async function resolveRichLocationWrite(options = {}) {
  const request = options.request;
  if (request === undefined) return { richLocation: undefined };
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return invalid('richLocation must be an object.', 'RICH_LOCATION_INVALID');
  }
  if (!isRichLocationCapabilityEnabled(options.tenant, 'writes')) {
    return invalid(
      'Rich locations are not enabled for this city.',
      'RICH_LOCATION_WRITES_DISABLED',
      409,
    );
  }

  const mode = trimString(request.mode).toLowerCase().replace(/[\s-]+/g, '_');
  if (!MODES.has(mode)) {
    return invalid('A valid rich location mode is required.', 'RICH_LOCATION_MODE_INVALID');
  }
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const base = baseLocation(mode, request, options.legacyLocation, now);
  if (!base.originalInput) {
    return invalid('Location input is required.', 'RICH_LOCATION_ORIGINAL_INPUT_REQUIRED');
  }

  if (mode === 'physical' || mode === 'registration_gated') {
    const placeId = trimString(request.googlePlaceId);
    if (!placeId) {
      return invalid(
        'Select a Google place before saving a physical location.',
        'RICH_LOCATION_PLACE_ID_REQUIRED',
      );
    }
    const constraintResult = validateJustGoLocationConstraints(
      options.tenant?.richLocationConstraints,
    );
    if (constraintResult.error) {
      return invalid(
        'This city is not configured for precise location writes.',
        'RICH_LOCATION_CITY_CONSTRAINTS_REQUIRED',
        503,
      );
    }

    let canonical;
    try {
      canonical = await (options.googleAdapter || googleLocationService)
        .fetchPlaceDetails(placeId, { languageCode: options.languageCode || 'en' });
    } catch (error) {
      return invalid(
        error?.code === 'GOOGLE_PLACE_NOT_FOUND' || error?.code === 'GOOGLE_PLACE_ID_INVALID'
          ? 'The selected Google place is invalid.'
          : 'The selected place could not be resolved.',
        error?.code || 'RICH_LOCATION_RESOLUTION_FAILED',
        error?.status || 502,
      );
    }
    if (!canonical || canonical.resolutionStatus !== 'resolved') {
      return invalid(
        'Physical locations must resolve before saving.',
        'RICH_LOCATION_UNRESOLVED',
        422,
      );
    }
    const scope = preciseLocationInScope(canonical, constraintResult.constraints);
    if (!scope.ok) {
      return invalid(
        'The selected place is outside this Just Go city.',
        'RICH_LOCATION_OUT_OF_SCOPE',
        422,
      );
    }

    const gated = mode === 'registration_gated';
    const requestedLabel = trimString(request.publicDisplayLabel);
    const safeGatedLabel = trimString(canonical.venueName)
      || trimString(canonical.city)
      || 'Location revealed after registration';
    return {
      richLocation: {
        ...base,
        ...canonical,
        mode,
        originalInput: base.originalInput,
        createdAt: now,
        updatedAt: now,
        publicDisplayLabel: requestedLabel
          || (gated ? safeGatedLabel : canonical.publicDisplayLabel),
        revealPolicy: gated ? 'registered_only' : 'public',
      },
    };
  }

  if (mode === 'approximate') {
    const approximateLabel = trimString(request.approximateLabel || request.publicDisplayLabel);
    const city = trimString(request.city);
    const neighborhood = trimString(request.neighborhood);
    const region = trimString(request.region);
    const countryCode = normalizeCountryCode(request.countryCode);
    if (!approximateLabel || ![city, neighborhood, region, countryCode].some(Boolean)) {
      return invalid(
        'Approximate locations require a public label and geographic area.',
        'RICH_LOCATION_APPROXIMATE_INVALID',
      );
    }
    const expectedCountry = normalizeCountryCode(
      options.tenant?.richLocationConstraints?.countryCode,
    );
    if (countryCode && expectedCountry && countryCode !== expectedCountry) {
      return invalid(
        'The approximate location is outside this Just Go city country.',
        'RICH_LOCATION_OUT_OF_SCOPE',
        422,
      );
    }
    return {
      richLocation: {
        ...base,
        ...(neighborhood ? { neighborhood } : {}),
        ...(city ? { city } : {}),
        ...(region ? { region } : {}),
        ...(countryCode ? { countryCode } : {}),
        approximateLabel,
        publicDisplayLabel: trimString(request.publicDisplayLabel) || approximateLabel,
        resolutionStatus: 'not_applicable',
        revealPolicy: 'public',
      },
    };
  }

  const defaultLabel = mode === 'online' ? 'Online' : 'Location TBD';
  return {
    richLocation: {
      ...base,
      publicDisplayLabel: trimString(request.publicDisplayLabel) || defaultLabel,
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    },
  };
}

module.exports = {
  requestFromPayload,
  resolveRichLocationWrite,
  preciseLocationInScope,
  pointWithinBounds,
  distanceKm,
};
