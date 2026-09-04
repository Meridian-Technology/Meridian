const {
  projectPublicRichLocation,
} = require('../events/services/richLocationProjectionService');
const {
  collectPublicRichLocationSearchTerms,
} = require('./justGoRichLocationSearch');

const MODES = new Set([
  'physical',
  'registration_gated',
  'approximate',
  'online',
  'tbd',
]);

const PHYSICAL_MODES = new Set(['physical', 'registration_gated']);
const PROVIDERS = new Set(['google', 'manual']);
const PRECISE_FIELDS = Object.freeze([
  'formattedAddress',
  'addressComponents',
  'postalCode',
  'coordinates',
  'googlePlaceId',
  'provider',
  'placeTypes',
]);

const REASONS = Object.freeze({
  LEGACY: 'legacy_compatible',
  PUBLISHABLE: 'mode_publishable',
  INVALID: 'invalid_rich_location',
  UNRESOLVED_PHYSICAL: 'physical_resolution_required',
});

function hasValue(value) {
  return value !== undefined
    && value !== null
    && value !== ''
    && (!Array.isArray(value) || value.length > 0);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isValidDate(value) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function isValidPoint(point) {
  const coordinates = point?.coordinates;
  return point?.type === 'Point'
    && Array.isArray(coordinates)
    && coordinates.length === 2
    && coordinates.every(Number.isFinite)
    && coordinates[0] >= -180
    && coordinates[0] <= 180
    && coordinates[1] >= -90
    && coordinates[1] <= 90;
}

function invalid(mode, fields = []) {
  return {
    publishable: false,
    mode,
    reason: REASONS.INVALID,
    invalidFields: [...new Set(fields)],
  };
}

function unresolvedPhysical(mode, resolutionStatus) {
  return {
    publishable: false,
    mode,
    reason: REASONS.UNRESOLVED_PHYSICAL,
    resolutionStatus: resolutionStatus || null,
  };
}

function publishable(mode, reason = REASONS.PUBLISHABLE) {
  return { publishable: true, mode, reason };
}

function richLocationFrom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  if (Object.prototype.hasOwnProperty.call(input, 'richLocation')) {
    return input.richLocation;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'mode')) return input;
  return undefined;
}

/**
 * Shared publication policy for Just Go location modes.
 *
 * A missing rich location is a legacy-compatible event; callers continue to
 * enforce the required legacy `location` string separately. Once richLocation
 * is present, it must satisfy its mode rules. In particular, physical and
 * registration-gated locations cannot publish until canonical resolution has
 * completed.
 */
function evaluateJustGoLocationPolicy(input) {
  const location = richLocationFrom(input);
  if (location === undefined || location === null) {
    return publishable('legacy', REASONS.LEGACY);
  }
  if (typeof location !== 'object' || Array.isArray(location)) {
    return invalid(null, ['richLocation']);
  }

  const mode = typeof location.mode === 'string' ? location.mode.trim() : '';
  if (!MODES.has(mode)) return invalid(mode || null, ['mode']);

  const commonInvalid = [];
  if (!isNonEmptyString(location.originalInput)) commonInvalid.push('originalInput');
  if (!isNonEmptyString(location.publicDisplayLabel)) commonInvalid.push('publicDisplayLabel');

  const expectedReveal = mode === 'registration_gated' ? 'registered_only' : 'public';
  if (location.revealPolicy !== expectedReveal) commonInvalid.push('revealPolicy');

  if (PHYSICAL_MODES.has(mode)) {
    if (location.resolutionStatus !== 'resolved') {
      return unresolvedPhysical(mode, location.resolutionStatus);
    }

    if (!isNonEmptyString(location.formattedAddress)) commonInvalid.push('formattedAddress');
    if (!isValidPoint(location.coordinates)) commonInvalid.push('coordinates');
    if (!PROVIDERS.has(location.provider)) commonInvalid.push('provider');
    if (!Number.isFinite(location.resolutionConfidence)
      || location.resolutionConfidence < 0
      || location.resolutionConfidence > 1) {
      commonInvalid.push('resolutionConfidence');
    }
    if (!isValidDate(location.resolvedAt)) commonInvalid.push('resolvedAt');
    if (location.provider === 'google' && !isNonEmptyString(location.googlePlaceId)) {
      commonInvalid.push('googlePlaceId');
    }
    if (location.provider !== 'google' && hasValue(location.googlePlaceId)) {
      commonInvalid.push('googlePlaceId');
    }
    return commonInvalid.length ? invalid(mode, commonInvalid) : publishable(mode);
  }

  if (location.resolutionStatus !== 'not_applicable') {
    commonInvalid.push('resolutionStatus');
  }
  for (const field of PRECISE_FIELDS) {
    if (hasValue(location[field])) commonInvalid.push(field);
  }
  if (hasValue(location.resolutionConfidence)) commonInvalid.push('resolutionConfidence');
  if (hasValue(location.resolvedAt)) commonInvalid.push('resolvedAt');

  if (mode === 'approximate') {
    if (!isNonEmptyString(location.approximateLabel)) commonInvalid.push('approximateLabel');
    if (![location.neighborhood, location.city, location.region, location.countryCode]
      .some(isNonEmptyString)) {
      commonInvalid.push('city');
    }
  }

  return commonInvalid.length ? invalid(mode, commonInvalid) : publishable(mode);
}

function isJustGoLocationPublishable(input) {
  return evaluateJustGoLocationPolicy(input).publishable;
}

function rawJustGoLocationText(input) {
  if (!input || typeof input !== 'object') return '';
  const values = [
    input.rawLocationText,
    input.richLocation?.originalInput,
    input.location,
  ];
  const value = values.find(isNonEmptyString);
  return value ? value.trim() : '';
}

function justGoLocationMatchText(input) {
  if (!input || typeof input !== 'object') return '';
  const location = richLocationFrom(input);
  if (!location || typeof location !== 'object') {
    return isNonEmptyString(input.location) ? input.location.trim() : '';
  }
  const values = location.mode === 'approximate'
    ? [location.approximateLabel, location.publicDisplayLabel]
    : [location.venueName, location.publicDisplayLabel];
  const value = values.find(isNonEmptyString);
  return value ? value.trim() : rawJustGoLocationText(input);
}

function justGoLocationIndexFields(input) {
  if (!input || typeof input !== 'object') return [];
  const assessment = assessJustGoLocationReview(input);
  if (!assessment.discoverEligible) return [];
  const location = richLocationFrom(input);
  if (!location || typeof location !== 'object') {
    return isNonEmptyString(input.location) ? [input.location.trim()] : [];
  }

  const publicLocation = projectPublicRichLocation(location);
  if (!publicLocation) return [];

  let values;
  if (publicLocation.mode === 'physical') {
    values = [
      ...collectPublicRichLocationSearchTerms(location),
      publicLocation.region,
      publicLocation.countryCode,
    ];
  } else if (publicLocation.mode === 'registration_gated') {
    values = [publicLocation.publicDisplayLabel, publicLocation.venueName,
      publicLocation.approximateLabel, publicLocation.neighborhood, publicLocation.city,
      publicLocation.region, publicLocation.countryCode,
      'registration required'];
  } else if (publicLocation.mode === 'approximate') {
    values = [publicLocation.publicDisplayLabel, publicLocation.approximateLabel,
      publicLocation.neighborhood, publicLocation.city, publicLocation.region,
      publicLocation.countryCode];
  } else {
    values = [publicLocation.publicDisplayLabel, publicLocation.mode];
  }
  return [...new Set(values.filter(isNonEmptyString).map((value) => value.trim()))];
}

function assessJustGoLocationReview(input) {
  const policy = evaluateJustGoLocationPolicy(input);
  const reviewRequired = !policy.publishable
    && policy.reason === REASONS.UNRESOLVED_PHYSICAL;
  return {
    ...policy,
    ingestible: policy.publishable || reviewRequired,
    reviewRequired,
    discoverEligible: policy.publishable,
    reviewReason: reviewRequired ? policy.reason : null,
  };
}

module.exports = {
  evaluateJustGoLocationPolicy,
  assessJustGoLocationReview,
  isJustGoLocationPublishable,
  rawJustGoLocationText,
  justGoLocationMatchText,
  justGoLocationIndexFields,
  JUST_GO_LOCATION_POLICY_REASONS: REASONS,
};
