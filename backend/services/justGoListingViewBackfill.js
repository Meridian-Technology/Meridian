/**
 * Replays `justgo_public_event_view` analytics events into `EventAnalytics`
 * views, for the creator Insights tab. Until the public page posted to
 * /api/public/events/:id/view, those analytics events were the only record of
 * listing views. See migrations/backfillJustGoListingViews.js.
 *
 * Each analytics event becomes one view with `sourceEventId` set to its
 * event_id, so re-running records nothing twice. Events are replayed oldest
 * first, so the first view per visitor is the unique one, keyed the same way
 * the live endpoint keys the web visitor id.
 */

const { analyticsHash } = require('../utilities/analyticsHash');
const { recordEventView } = require('./eventViewService');

const VIEW_EVENT = 'justgo_public_event_view';
const BACKFILL_SOURCE = 'backfill:analytics_events';
const EVENT_ID_PATTERN = /^[0-9a-f]{24}$/;

function emptyBackfillCounts() {
  return {
    scanned: 0,
    invalidEventId: 0,
    unresolved: 0,
    recorded: 0,
    alreadyRecorded: 0,
    byTenant: {},
  };
}

/**
 * @param {import('mongoose').Model} AnalyticsEvent - one database's analytics events
 * @param {{
 *   resolveTenant: (eventId: string) => Promise<string|null>,
 *   eventAnalyticsFor: (tenantKey: string) => Promise<import('mongoose').Model>,
 *   dryRun?: boolean,
 *   env?: string|null,
 *   counts?: ReturnType<typeof emptyBackfillCounts>,
 * }} options
 */
async function backfillListingViews(AnalyticsEvent, options) {
  const { resolveTenant, eventAnalyticsFor, dryRun = false, env = 'prod' } = options;
  const counts = options.counts || emptyBackfillCounts();
  const filter = { event: VIEW_EVENT };
  if (env) filter.env = env;

  const cursor = AnalyticsEvent.find(filter)
    .select('event_id anonymous_id ts properties')
    .sort({ ts: 1 })
    .lean()
    .cursor();

  for await (const doc of cursor) {
    counts.scanned += 1;
    const eventId = String(doc.properties?.event_id || '');
    if (!EVENT_ID_PATTERN.test(eventId)) {
      counts.invalidEventId += 1;
      continue;
    }
    const tenantKey = await resolveTenant(eventId);
    if (!tenantKey) {
      counts.unresolved += 1;
      continue;
    }
    counts.byTenant[tenantKey] = (counts.byTenant[tenantKey] || 0) + 1;
    if (dryRun) continue;

    const EventAnalytics = await eventAnalyticsFor(tenantKey);
    const result = await recordEventView(EventAnalytics, eventId, {
      visitorKey: analyticsHash(doc.anonymous_id),
      timestamp: doc.ts,
      source: BACKFILL_SOURCE,
      sourceEventId: doc.event_id,
    });
    if (result.recorded) counts.recorded += 1;
    else counts.alreadyRecorded += 1;
  }

  return counts;
}

/**
 * Finds the one Just Go city whose database has the event, the same rule the
 * public endpoint uses: no match or more than one match resolves to null.
 *
 * @param {Array<{ tenantKey: string, Event: import('mongoose').Model }>} cities
 */
function createTenantResolver(cities) {
  const cache = new Map();
  return async function resolveTenant(eventId) {
    if (cache.has(eventId)) return cache.get(eventId);
    const matches = [];
    for (const city of cities) {
      if (await city.Event.exists({ _id: eventId })) matches.push(city.tenantKey);
    }
    const tenantKey = matches.length === 1 ? matches[0] : null;
    cache.set(eventId, tenantKey);
    return tenantKey;
  };
}

module.exports = {
  VIEW_EVENT,
  BACKFILL_SOURCE,
  emptyBackfillCounts,
  backfillListingViews,
  createTenantResolver,
};
