const PUBLIC_MODES = new Set([
  'physical',
  'registration_gated',
  'approximate',
  'online',
  'tbd',
]);

const UNRESOLVED_STATUSES = new Set([
  'pending',
  'unresolved',
  'review_required',
]);

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * Public landing/share label. The backend projection is authoritative, and
 * this second client allowlist prevents a malformed response from rendering
 * gated address, coordinate, Place ID, provider, alias, or audit data.
 */
export function formatJustGoPublicLocation(event) {
  const legacy =
    typeof event?.location === 'string' && event.location.trim()
      ? event.location
      : '';
  const rich = event?.richLocation;
  if (!rich || typeof rich !== 'object' || Array.isArray(rich)) return legacy;

  const mode = text(rich.mode);
  if (!PUBLIC_MODES.has(mode)) return legacy;
  const expectedReveal =
    mode === 'registration_gated' ? 'registered_only' : 'public';
  if (rich.revealPolicy !== expectedReveal) return legacy;

  if (
    (mode === 'physical' || mode === 'registration_gated') &&
    UNRESOLVED_STATUSES.has(rich.resolutionStatus)
  ) {
    return 'Location being confirmed';
  }

  return text(rich.publicDisplayLabel) || legacy;
}

/** Keep only card fields plus the already-resolved public label. */
export function projectJustGoPublicLandingEvent(event) {
  return {
    id: event?.id,
    name: event?.name,
    hostName: event?.hostName,
    startTime: event?.startTime,
    coverImageUrl: event?.coverImageUrl,
    tag: event?.tag,
    location: formatJustGoPublicLocation(event),
  };
}
