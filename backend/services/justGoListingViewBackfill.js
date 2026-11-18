/**
 * Replays `justgo_public_event_view` analytics events into `EventAnalytics`
 * views, for the creator Insights tab. Until the public page posted to
 * /api/public/events/:id/view, those analytics events were the only record of
 * listing views. See migrations/backfillJustGoListingViews.js.
 *
 * Once the page records views itself, every view also still sends the
 * analytics event, so replaying those would count it twice. Each listing's
 * replay therefore stops at its `firstLiveViewAt`, and resumes after its
 * `viewsBackfilledThrough`, which a finished run advances. Both are compared
 * with the server's `received_at`, not the device clock. `sourceEventId`
 * still guards against a repeat within an interrupted run.
 *
 * Events are replayed oldest first, so the first view per visitor is the
 * unique one, keyed the same way the live endpoint keys the web visitor id.
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
    afterLiveViews: 0,
    alreadyBackfilled: 0,
    afterCutoff: 0,
    recorded: 0,
    alreadyRecorded: 0,
    byTenant: {},
  };
}

const time = (value) => (value ? new Date(value).getTime() : null);

/**
 * @param {{
 *   resolveTenant: (eventId: string) => Promise<string|null>,
 *   eventAnalyticsFor: (tenantKey: string) => Promise<import('mongoose').Model>,
 *   dryRun?: boolean,
 *   env?: string|null,
 *   before?: Date|null,
 * }} options
 * @returns {{ replay: (AnalyticsEvent: import('mongoose').Model) => Promise<void>,
 *   finish: () => Promise<void>, counts: ReturnType<typeof emptyBackfillCounts> }}
 *   Call `replay` for each database's analytics events, then `finish` once.
 */
function createListingViewBackfill(options) {
  const {
    resolveTenant, eventAnalyticsFor, dryRun = false, env = 'prod', before = null,
  } = options;
  const counts = emptyBackfillCounts();
  const listings = new Map();

  async function listingState(eventId, tenantKey) {
    if (listings.has(eventId)) return listings.get(eventId);
    const EventAnalytics = await eventAnalyticsFor(tenantKey);
    const doc = await EventAnalytics.findOne({ eventId })
      .select('firstLiveViewAt viewsBackfilledThrough')
      .lean();
    const state = {
      EventAnalytics,
      firstLiveViewAt: time(doc?.firstLiveViewAt),
      backfilledThrough: time(doc?.viewsBackfilledThrough),
      replayedThrough: null,
    };
    listings.set(eventId, state);
    return state;
  }

  async function replay(AnalyticsEvent) {
    const filter = { event: VIEW_EVENT };
    if (env) filter.env = env;
    const cursor = AnalyticsEvent.find(filter)
      .select('event_id anonymous_id ts received_at properties')
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

      const state = await listingState(eventId, tenantKey);
      const receivedAt = time(doc.received_at || doc.ts);
      if (state.firstLiveViewAt !== null && receivedAt >= state.firstLiveViewAt) {
        counts.afterLiveViews += 1;
        continue;
      }
      if (state.backfilledThrough !== null && receivedAt <= state.backfilledThrough) {
        counts.alreadyBackfilled += 1;
        continue;
      }
      if (before && receivedAt >= before.getTime()) {
        counts.afterCutoff += 1;
        continue;
      }

      counts.byTenant[tenantKey] = (counts.byTenant[tenantKey] || 0) + 1;
      state.replayedThrough = Math.max(state.replayedThrough ?? receivedAt, receivedAt);
      if (dryRun) continue;

      const result = await recordEventView(state.EventAnalytics, eventId, {
        visitorKey: analyticsHash(doc.anonymous_id),
        timestamp: doc.ts,
        source: BACKFILL_SOURCE,
        sourceEventId: doc.event_id,
        live: false,
      });
      if (result.recorded) counts.recorded += 1;
      else counts.alreadyRecorded += 1;
    }
  }

  /** Advances each listing's marker, only after every database was replayed. */
  async function finish() {
    if (dryRun) return;
    for (const [eventId, state] of listings) {
      if (state.replayedThrough === null) continue;
      await state.EventAnalytics.updateOne(
        { eventId },
        { $max: { viewsBackfilledThrough: new Date(state.replayedThrough) } },
        // Not in the Events-Backend schema yet, so strict mode would drop it.
        { strict: false },
      );
    }
  }

  return { replay, finish, counts };
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
  createListingViewBackfill,
  createTenantResolver,
};
