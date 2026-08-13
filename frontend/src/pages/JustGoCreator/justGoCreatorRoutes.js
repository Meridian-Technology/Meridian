/**
 * Locked Just Go Creator Console routes (Phase 1 Task 0.2).
 * Amend the phase-1 plan before changing these paths.
 */

export const JUSTGO_CREATOR_ROUTES = Object.freeze({
  /** Public — the console's own sign-in, outside the auth gate and the shell. */
  login: '/justgo/creator/login',
  home: '/justgo/creator',
  newListing: '/justgo/creator/new',
  eventWorkspace: '/justgo/creator/events/:eventId',
});

/** City-scoped creator API prefix (creator JWT). Ops stays on `/admin/pivot/*`. */
export const JUSTGO_CREATOR_API_PREFIX = '/pivot/creator';

/** Ops curation surface (existing) — Host-created filter lands in Task 3.1. */
export const JUSTGO_OPS_CURATION_ROUTE = '/platform-admin/pivot/:tenantKey';

export function justGoCreatorEventPath(eventId) {
  return `/justgo/creator/events/${eventId}`;
}
