/**
 * Phone analytics used to be posted to www and stored in the platform database.
 * New events are written to the city database. This module decides where an
 * already-collected mobile event belongs so a one-time migration can move it.
 * Web events stay on the platform database.
 */

const MOBILE_PLATFORMS = Object.freeze(['ios', 'android']);

function normalizeAnalyticsUserId(value) {
  if (value == null || value === '') return null;
  const asString = String(value).trim();
  if (!/^[a-fA-F0-9]{24}$/.test(asString)) return null;
  return asString;
}

function isMobileAnalyticsEvent(event) {
  return MOBILE_PLATFORMS.includes(event?.platform);
}

/**
 * @param {object} event
 * @param {{ tenantKeys: Set<string>, membershipsByUser: Map<string, string[]> }} index
 * @returns {{ tenantKey: string | null, reason: 'tenantKey' | 'membership' | 'ambiguous' | 'unassigned' }}
 */
function resolveMobileAnalyticsTenant(event, index) {
  const tenantKeys = index?.tenantKeys || new Set();
  const membershipsByUser = index?.membershipsByUser || new Map();
  const stamped = String(event?.properties?.tenantKey || '').trim().toLowerCase();
  if (stamped && tenantKeys.has(stamped)) {
    return { tenantKey: stamped, reason: 'tenantKey' };
  }

  const userId = event?.user_id == null ? '' : String(event.user_id);
  const memberships = (userId && membershipsByUser.get(userId)) || [];
  const known = memberships.filter((tenantKey) => tenantKeys.has(tenantKey));
  if (known.length === 1) return { tenantKey: known[0], reason: 'membership' };
  if (known.length > 1) return { tenantKey: null, reason: 'ambiguous' };
  return { tenantKey: null, reason: 'unassigned' };
}

function appForMigratedEvent(event) {
  const name = String(event?.event || '');
  if (name.startsWith('pivot_') || name.startsWith('justgo_')) return 'justgo';
  return event?.app || 'meridian';
}

/** Copy ready to insert into a city analytics_events collection. */
function prepareMigratedAnalyticsEvent(event, tenantKey) {
  const properties = {
    ...(event?.properties && typeof event.properties === 'object' ? event.properties : {}),
    tenantKey,
  };
  const doc = {
    ...event,
    app: appForMigratedEvent(event),
    properties,
  };
  delete doc._id;
  return doc;
}

/**
 * After insertMany({ ordered: false }), duplicate event_ids are already in the
 * city collection and can be removed from the platform collection. Any other
 * write error keeps that event on the platform database.
 */
function eventIdsSafeToRemove(docs, error) {
  const blocked = new Set();
  if (error && !error.writeErrors) {
    return [];
  }
  for (const writeError of error?.writeErrors || []) {
    if (writeError.code === 11000) continue;
    const doc = docs[writeError.index];
    if (doc?.event_id) blocked.add(doc.event_id);
  }
  return docs.map((doc) => doc.event_id).filter((id) => id && !blocked.has(id));
}

module.exports = {
  MOBILE_PLATFORMS,
  normalizeAnalyticsUserId,
  isMobileAnalyticsEvent,
  resolveMobileAnalyticsTenant,
  prepareMigratedAnalyticsEvent,
  eventIdsSafeToRemove,
};
