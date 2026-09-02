const axios = require('axios');
const { logPivot } = require('../utilities/pivotLogger');

const PLACES_API_BASE_URL = 'https://places.googleapis.com/v1';
const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 150;
const MAX_RETRY_DELAY_MS = 2_000;
const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'addressComponents',
  'location',
  'types',
].join(',');
const AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.place',
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text',
  'suggestions.placePrediction.structuredFormat',
  'suggestions.placePrediction.types',
].join(',');

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETDOWN',
  'ENETUNREACH',
  'ERR_NETWORK',
  'ETIMEDOUT',
]);
const SAFE_GEOCODING_STATUSES = new Set([
  'INVALID_REQUEST',
  'MISSING_STATUS',
  'OK',
  'OVER_DAILY_LIMIT',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'UNKNOWN_ERROR',
  'ZERO_RESULTS',
]);

class GoogleLocationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GoogleLocationError';
    this.code = options.code || 'GOOGLE_LOCATION_FAILED';
    this.status = options.status || 502;
    this.retryable = Boolean(options.retryable);
    this.providerStatus = options.providerStatus;
    this.attempts = options.attempts;
  }
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeToken(value) {
  return trimString(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((result, value) => {
    const normalized = trimString(value);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return result;
    seen.add(key);
    result.push(normalized);
    return result;
  }, []);
}

function normalizeTokens(values) {
  return uniqueStrings((Array.isArray(values) ? values : []).map(normalizeToken));
}

function normalizeAddressComponents(components) {
  if (!Array.isArray(components)) return [];
  return components.map((component) => ({
    longText: trimString(component.longText || component.long_name),
    shortText: trimString(component.shortText || component.short_name) || undefined,
    types: normalizeTokens(component.types),
  })).filter((component) => component.longText && component.types.length);
}

function componentValue(components, preferredTypes, short = false) {
  for (const type of preferredTypes) {
    const component = components.find((entry) => entry.types.includes(type));
    if (component) return short ? component.shortText || component.longText : component.longText;
  }
  return undefined;
}

function normalizeCoordinates(location) {
  const latitude = Number(location?.latitude ?? location?.lat);
  const longitude = Number(location?.longitude ?? location?.lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function normalizedLocationFromGoogle(place, options = {}) {
  if (!place || typeof place !== 'object') return null;

  const components = normalizeAddressComponents(
    place.addressComponents || place.address_components,
  );
  const coordinates = normalizeCoordinates(place.location || place.geometry?.location);
  const formattedAddress = trimString(place.formattedAddress || place.formatted_address);
  const venueName = trimString(
    place.displayName?.text || place.name || componentValue(components, ['premise', 'establishment']),
  );
  const googlePlaceId = trimString(place.id || place.place_id).replace(/^places\//, '');

  // A canonical physical result without an identifier, address, or coordinates
  // is malformed provider data and must never be persisted as resolved.
  if (!googlePlaceId || !formattedAddress || !coordinates) return null;

  const shortAddress = trimString(place.shortFormattedAddress);
  const aliases = uniqueStrings([shortAddress]).filter(
    (value) => value !== formattedAddress && value !== venueName,
  );
  const publicDisplayLabel = venueName || shortAddress || formattedAddress;
  const location = {
    venueName: venueName || undefined,
    formattedAddress,
    addressComponents: components,
    neighborhood: componentValue(components, [
      'neighborhood',
      'sublocality_level_1',
      'sublocality',
    ]),
    city: componentValue(components, ['locality', 'postal_town', 'administrative_area_level_2']),
    region: componentValue(components, ['administrative_area_level_1']),
    postalCode: componentValue(components, ['postal_code']),
    countryCode: componentValue(components, ['country'], true)?.toUpperCase(),
    coordinates,
    googlePlaceId,
    provider: 'google',
    placeTypes: normalizeTokens(place.types),
    aliases,
    resolutionStatus: 'resolved',
    resolutionConfidence: options.confidence ?? 1,
    resolvedAt: options.resolvedAt || new Date(),
    publicDisplayLabel,
  };

  return Object.fromEntries(Object.entries(location).filter(([, value]) => value !== undefined));
}

function normalizeAutocompleteSuggestions(data) {
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return suggestions.reduce((result, suggestion) => {
    const prediction = suggestion?.placePrediction;
    const placeId = trimString(prediction?.placeId || prediction?.place).replace(/^places\//, '');
    const fullText = trimString(prediction?.text?.text);
    const primaryText = trimString(prediction?.structuredFormat?.mainText?.text) || fullText;
    const secondaryText = trimString(prediction?.structuredFormat?.secondaryText?.text);
    if (!placeId || !primaryText) return result;
    result.push({
      placeId,
      primaryText,
      ...(secondaryText ? { secondaryText } : {}),
      fullText: fullText || [primaryText, secondaryText].filter(Boolean).join(', '),
      placeTypes: normalizeTokens(prediction?.types),
    });
    return result;
  }, []);
}

function resolveServerApiKey(env = process.env) {
  // Deliberately do not fall back to web/mobile Maps keys. This credential must
  // be a server-only key restricted by API and backend egress IP in Google Cloud.
  return trimString(env.GOOGLE_MAPS_SERVER_API_KEY);
}

function normalizePositiveInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), minimum), maximum)
    : fallback;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTelemetry(event) {
  logPivot(event.outcome === 'failure' ? 'warn' : 'info', 'google location provider', event);
}

function providerStatusFromError(error) {
  return Number(error?.response?.status) || undefined;
}

function classifyTransportError(error) {
  const providerStatus = providerStatusFromError(error);
  const retryable = RETRYABLE_HTTP_STATUSES.has(providerStatus)
    || (!providerStatus && RETRYABLE_NETWORK_CODES.has(error?.code));

  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return { code: 'GOOGLE_LOCATION_TIMEOUT', status: 504, retryable: true, providerStatus };
  }
  if (providerStatus === 401 || providerStatus === 403) {
    return { code: 'GOOGLE_LOCATION_AUTH_FAILED', status: 503, retryable: false, providerStatus };
  }
  if (providerStatus === 404) {
    return { code: 'GOOGLE_PLACE_NOT_FOUND', status: 404, retryable: false, providerStatus };
  }
  if (providerStatus === 400 || providerStatus === 422) {
    return { code: 'GOOGLE_LOCATION_INVALID_REQUEST', status: 400, retryable: false, providerStatus };
  }
  if (providerStatus === 429) {
    return { code: 'GOOGLE_LOCATION_RATE_LIMITED', status: 503, retryable: true, providerStatus };
  }
  return {
    code: retryable ? 'GOOGLE_LOCATION_UNAVAILABLE' : 'GOOGLE_LOCATION_FAILED',
    status: 502,
    retryable,
    providerStatus,
  };
}

function createGoogleLocationAdapter(options = {}) {
  const httpClient = options.httpClient || axios;
  const env = options.env || process.env;
  const telemetry = options.telemetry || safeTelemetry;
  const sleep = options.sleep || defaultSleep;
  const now = options.now || (() => Date.now());
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs ?? env.GOOGLE_MAPS_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    250,
    30_000,
  );
  const maxAttempts = normalizePositiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 5);
  const retryBaseDelayMs = normalizePositiveInteger(
    options.retryBaseDelayMs,
    DEFAULT_RETRY_BASE_DELAY_MS,
    0,
    MAX_RETRY_DELAY_MS,
  );

  function emit(event) {
    // Only this allowlist reaches telemetry. Never include address input, Place
    // IDs, coordinates, URLs, request headers, provider bodies, or error text.
    const safeEvent = {
      provider: 'google',
      operation: event.operation,
      outcome: event.outcome,
      attempt: event.attempt,
      durationMs: event.durationMs,
      code: event.code,
      providerStatus: typeof event.providerStatus === 'number'
        ? event.providerStatus
        : SAFE_GEOCODING_STATUSES.has(event.providerStatus) ? event.providerStatus : undefined,
    };
    try {
      telemetry(Object.fromEntries(Object.entries(safeEvent).filter(([, value]) => value !== undefined)));
    } catch {
      // Observability must not change location resolution behavior.
    }
  }

  function apiKey() {
    const key = resolveServerApiKey(env);
    if (!key) {
      throw new GoogleLocationError('Google location services are not configured.', {
        code: 'GOOGLE_LOCATION_NOT_CONFIGURED',
        status: 503,
        retryable: false,
      });
    }
    return key;
  }

  async function requestWithRetry(operation, buildRequest, classifyResponse) {
    const key = apiKey();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const startedAt = now();
      try {
        const response = await httpClient.request(buildRequest(key));
        const responseFailure = classifyResponse?.(response);
        if (responseFailure) {
          const providerError = new Error('Google provider returned an unsuccessful status.');
          providerError.googleClassification = responseFailure;
          throw providerError;
        }
        emit({ operation, outcome: 'success', attempt, durationMs: Math.max(0, now() - startedAt) });
        return response;
      } catch (error) {
        const classification = error.googleClassification || classifyTransportError(error);
        const canRetry = classification.retryable && attempt < maxAttempts;
        emit({
          operation,
          outcome: canRetry ? 'retry' : 'failure',
          attempt,
          durationMs: Math.max(0, now() - startedAt),
          code: classification.code,
          providerStatus: classification.providerStatus,
        });
        if (!canRetry) {
          throw new GoogleLocationError('Google location request failed.', {
            ...classification,
            attempts: attempt,
          });
        }
        const delayMs = Math.min(retryBaseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
        await sleep(delayMs);
      }
    }
  }

  async function fetchPlaceDetails(placeId, requestOptions = {}) {
    const normalizedPlaceId = trimString(placeId).replace(/^places\//, '');
    if (!/^[A-Za-z0-9_-]{3,500}$/.test(normalizedPlaceId)) {
      throw new GoogleLocationError('A valid Google Place ID is required.', {
        code: 'GOOGLE_PLACE_ID_INVALID',
        status: 400,
        retryable: false,
      });
    }

    const response = await requestWithRetry(
      'place_details',
      (key) => ({
        method: 'GET',
        url: `${PLACES_API_BASE_URL}/places/${encodeURIComponent(normalizedPlaceId)}`,
        timeout: timeoutMs,
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        },
        params: requestOptions.languageCode
          ? { languageCode: trimString(requestOptions.languageCode) }
          : undefined,
      }),
      (providerResponse) => {
        const mapped = normalizedLocationFromGoogle(providerResponse.data);
        if (mapped && mapped.googlePlaceId === normalizedPlaceId) return null;
        return {
          code: 'GOOGLE_LOCATION_MALFORMED_RESPONSE',
          status: 502,
          retryable: false,
        };
      },
    );

    const location = normalizedLocationFromGoogle(response.data, {
      confidence: 1,
      resolvedAt: new Date(now()),
    });
    return location;
  }

  async function autocompletePlaces(input, requestOptions = {}) {
    const normalizedInput = trimString(input);
    if (normalizedInput.length < 2 || normalizedInput.length > 500) {
      throw new GoogleLocationError('Autocomplete input must be between 2 and 500 characters.', {
        code: 'GOOGLE_AUTOCOMPLETE_INPUT_INVALID',
        status: 400,
        retryable: false,
      });
    }

    const response = await requestWithRetry(
      'place_autocomplete',
      (key) => ({
        method: 'POST',
        url: `${PLACES_API_BASE_URL}/places:autocomplete`,
        timeout: timeoutMs,
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
        },
        data: {
          input: normalizedInput,
          ...(trimString(requestOptions.languageCode)
            ? { languageCode: trimString(requestOptions.languageCode) }
            : {}),
          ...(trimString(requestOptions.regionCode)
            ? { regionCode: trimString(requestOptions.regionCode).toUpperCase() }
            : {}),
          ...(Array.isArray(requestOptions.includedRegionCodes)
            ? { includedRegionCodes: requestOptions.includedRegionCodes }
            : {}),
          ...(requestOptions.locationRestriction
            ? { locationRestriction: requestOptions.locationRestriction }
            : {}),
        },
      }),
      (providerResponse) => (
        Array.isArray(providerResponse.data?.suggestions)
          ? null
          : {
              code: 'GOOGLE_LOCATION_MALFORMED_RESPONSE',
              status: 502,
              retryable: false,
            }
      ),
    );

    return normalizeAutocompleteSuggestions(response.data);
  }

  async function geocodeAddress(address, requestOptions = {}) {
    const normalizedAddress = trimString(address);
    if (!normalizedAddress || normalizedAddress.length > 2000) {
      throw new GoogleLocationError('A valid address is required.', {
        code: 'GOOGLE_GEOCODE_ADDRESS_INVALID',
        status: 400,
        retryable: false,
      });
    }

    const response = await requestWithRetry(
      'geocode',
      (key) => ({
        method: 'GET',
        url: GEOCODING_API_URL,
        timeout: timeoutMs,
        params: {
          address: normalizedAddress,
          key,
          ...(trimString(requestOptions.languageCode)
            ? { language: trimString(requestOptions.languageCode) }
            : {}),
          ...(trimString(requestOptions.regionCode)
            ? { region: trimString(requestOptions.regionCode).toLowerCase() }
            : {}),
        },
      }),
      (providerResponse) => {
        const providerStatus = trimString(providerResponse.data?.status);
        if (providerStatus === 'OK') {
          const firstResult = Array.isArray(providerResponse.data.results)
            ? providerResponse.data.results[0]
            : null;
          return normalizedLocationFromGoogle(firstResult) ? null : {
            code: 'GOOGLE_LOCATION_MALFORMED_RESPONSE',
            status: 502,
            retryable: false,
          };
        }
        if (providerStatus === 'ZERO_RESULTS') {
          return {
            code: 'GOOGLE_GEOCODE_NOT_FOUND',
            status: 404,
            retryable: false,
            providerStatus,
          };
        }
        if (providerStatus === 'REQUEST_DENIED') {
          return {
            code: 'GOOGLE_LOCATION_AUTH_FAILED',
            status: 503,
            retryable: false,
            providerStatus,
          };
        }
        if (providerStatus === 'INVALID_REQUEST') {
          return {
            code: 'GOOGLE_LOCATION_INVALID_REQUEST',
            status: 400,
            retryable: false,
            providerStatus,
          };
        }
        return {
          code: ['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR'].includes(providerStatus)
            ? 'GOOGLE_LOCATION_UNAVAILABLE'
            : 'GOOGLE_GEOCODE_PROVIDER_ERROR',
          status: 502,
          retryable: ['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR'].includes(providerStatus),
          providerStatus: SAFE_GEOCODING_STATUSES.has(providerStatus)
            ? providerStatus
            : 'MISSING_STATUS',
        };
      },
    );

    const firstResult = Array.isArray(response.data.results) ? response.data.results[0] : null;
    const location = normalizedLocationFromGoogle(firstResult, {
      confidence: firstResult?.partial_match ? 0.75 : 0.9,
      resolvedAt: new Date(now()),
    });
    return location;
  }

  return {
    autocompletePlaces,
    fetchPlaceDetails,
    geocodeAddress,
    isConfigured: () => Boolean(resolveServerApiKey(env)),
  };
}

const defaultAdapter = createGoogleLocationAdapter();

module.exports = {
  GoogleLocationError,
  createGoogleLocationAdapter,
  autocompletePlaces: defaultAdapter.autocompletePlaces,
  fetchPlaceDetails: defaultAdapter.fetchPlaceDetails,
  geocodeAddress: defaultAdapter.geocodeAddress,
  isGoogleLocationConfigured: defaultAdapter.isConfigured,
  normalizedLocationFromGoogle,
  normalizeAutocompleteSuggestions,
  normalizeAddressComponents,
  resolveServerApiKey,
  classifyTransportError,
  constants: {
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_ATTEMPTS,
    PLACE_DETAILS_FIELD_MASK,
    AUTOCOMPLETE_FIELD_MASK,
    PLACES_API_BASE_URL,
    GEOCODING_API_URL,
  },
};
