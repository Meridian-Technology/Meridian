const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  projectPublicRichLocation,
} = require('../events/services/richLocationProjectionService');
const {
  isRichLocationCapabilityEnabled,
} = require('../utilities/justGoRichLocationControls');

const VIEWER_CONTEXT = Symbol('justGoRichLocationViewerContext');

const AUTHORIZED_TEXT_LIMITS = Object.freeze({
  formattedAddress: 1000,
  postalCode: 32,
  googlePlaceId: 500,
  addressComponentLongText: 500,
  addressComponentShortText: 100,
  addressComponentType: 100,
});

function authorizedText(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function projectAddressComponents(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return undefined;
  const components = [];
  for (const component of value) {
    if (!component || typeof component !== 'object' || Array.isArray(component)) continue;
    const longText = authorizedText(
      component.longText,
      AUTHORIZED_TEXT_LIMITS.addressComponentLongText,
    );
    const shortText = authorizedText(
      component.shortText,
      AUTHORIZED_TEXT_LIMITS.addressComponentShortText,
    );
    const types = Array.isArray(component.types)
      ? [...new Set(component.types.map((type) => authorizedText(
        type,
        AUTHORIZED_TEXT_LIMITS.addressComponentType,
      )).filter(Boolean))]
      : [];
    if (!longText || types.length === 0) continue;
    components.push({ longText, ...(shortText ? { shortText } : {}), types });
  }
  return components.length ? components : undefined;
}

function projectCoordinates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const coordinates = value.coordinates;
  if (value.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return undefined;
  }
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return undefined;
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function addAuthorizedPrecision(projection, source) {
  const formattedAddress = authorizedText(
    source.formattedAddress,
    AUTHORIZED_TEXT_LIMITS.formattedAddress,
  );
  const postalCode = authorizedText(source.postalCode, AUTHORIZED_TEXT_LIMITS.postalCode);
  const googlePlaceId = authorizedText(
    source.googlePlaceId,
    AUTHORIZED_TEXT_LIMITS.googlePlaceId,
  );
  const addressComponents = projectAddressComponents(source.addressComponents);
  const coordinates = projectCoordinates(source.coordinates);

  return {
    ...projection,
    ...(formattedAddress ? { formattedAddress } : {}),
    ...(addressComponents ? { addressComponents } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(googlePlaceId ? { googlePlaceId } : {}),
  };
}

async function hasRegisteredIntent(req, eventId, options = {}) {
  const userId = req?.user?.userId;
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(eventId)) {
    return false;
  }

  try {
    const { PivotEventIntent } = getModels(req, 'PivotEventIntent');
    if (!PivotEventIntent || typeof PivotEventIntent.exists !== 'function') return false;
    return Boolean(await PivotEventIntent.exists({
      userId,
      eventId,
      status: 'registered',
    }));
  } catch (error) {
    // Authorization failures must never turn into location disclosure. The optional
    // callback receives only the error; callers must not add location or identity data.
    options.onAuthorizationError?.({ error });
    return false;
  }
}

/**
 * Project an event's rich location for its authenticated viewer.
 *
 * Registration-gated precision is added only after a tenant-scoped intent lookup
 * proves that the authenticated user has a current `registered` intent for this event.
 * Client payload fields and pre-serialized user-intent labels are intentionally ignored.
 */
async function projectAuthorizedRichLocation(req, event, options = {}) {
  const source = event?.richLocation;
  const publicProjection = projectPublicRichLocation(source);
  if (!publicProjection || publicProjection.mode !== 'registration_gated') {
    return publicProjection;
  }

  // Require the database identity carried by the event document. A client-shaped
  // serialized `id` field is not accepted as authorization input.
  const eventId = event?._id;
  if (!await hasRegisteredIntent(req, eventId, options)) return publicProjection;
  return addAuthorizedPrecision(publicProjection, source);
}

function createViewerContext(enabled, registeredEventIds = []) {
  return Object.freeze({
    [VIEWER_CONTEXT]: true,
    enabled: enabled === true,
    registeredEventIds: new Set(registeredEventIds.map(String)),
  });
}

/** Load registration authorization once for a response containing many events. */
async function loadRichLocationViewerContext(req, eventIds, options = {}) {
  const enabled = options.tenant
    ? isRichLocationCapabilityEnabled(options.tenant, 'reads')
    : options.readsEnabled === true;
  const userId = req?.user?.userId;
  const ids = [...new Set((eventIds || []).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!enabled || !mongoose.Types.ObjectId.isValid(userId) || !ids.length) {
    return createViewerContext(enabled);
  }

  try {
    const { PivotEventIntent } = getModels(req, 'PivotEventIntent');
    const rows = await PivotEventIntent.find({
      userId,
      eventId: { $in: ids },
      status: 'registered',
    })
      .select('eventId')
      .lean();
    return createViewerContext(true, rows.map((row) => row.eventId));
  } catch (error) {
    options.onAuthorizationError?.({ error });
    return createViewerContext(enabled);
  }
}

/**
 * Synchronous serializer hook. Only contexts minted by the backend loader can add
 * gated precision; absent or forged context objects receive the public projection.
 */
function projectEventRichLocation(event, viewerContext, options = {}) {
  if (options.readsEnabled === false || viewerContext?.enabled === false) return undefined;
  const source = event?.richLocation;
  const projection = projectPublicRichLocation(source);
  if (!projection) return undefined;
  const eventId = event?._id;
  const authorized = viewerContext?.[VIEWER_CONTEXT] === true
    && projection.mode === 'registration_gated'
    && eventId != null
    && viewerContext.registeredEventIds.has(String(eventId));
  return authorized ? addAuthorizedPrecision(projection, source) : projection;
}

module.exports = {
  projectAuthorizedRichLocation,
  loadRichLocationViewerContext,
  projectEventRichLocation,
};
