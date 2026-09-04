/**
 * Public Just Go marketing deck: featured cards from the live week,
 * ranked as if the deck opened at that week's drop instant. Internal-only
 * `customFields.pivot.featured` — never returned on the public payload.
 * If this week has no featured segment, fall back to last week's.
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  isPivotTenant,
  resolvePivotLiveBatchWeek,
  resolvePivotDropInstant,
} = require('../utilities/pivotDropSchedule');
const { mergePivotDeckConfig } = require('../utilities/pivotDeckConfig');
const { resolvePivotCoverImageUrl } = require('../utilities/pivotMovieMetadata');
const {
  buildPublishedCatalogQuery,
  isUpcomingPivotEvent,
  resolveDisplayHost,
  selectDropDeckEvents,
} = require('./pivotFeedService');
const { projectEventRichLocation } = require('./justGoRichLocationProjectionService');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');

const LANDING_DROP_LIMIT = 4;
const LANDING_EVENT_FIELDS = 'name location richLocation start_time image customFields.pivot';

function serializeLandingDropEvent(event, options = {}) {
  const host = resolveDisplayHost(event.customFields?.pivot);
  const tags = Array.isArray(event.customFields?.pivot?.tags)
    ? event.customFields.pivot.tags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];
  const coverImageUrl = resolvePivotCoverImageUrl(event);
  const tag = tags[0] ? tags[0].trim() : '';
  const richLocation = projectEventRichLocation(event, undefined, {
    readsEnabled: options.readsEnabled,
  });

  return {
    id: String(event._id),
    name: event.name || '',
    hostName: host?.name || '',
    startTime: event.start_time,
    location: event.location || '',
    ...(richLocation ? { richLocation } : {}),
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(tag ? { tag } : {}),
  };
}

function buildFeaturedLandingQuery(batchWeek, dropAt) {
  return {
    ...buildPublishedCatalogQuery(batchWeek, dropAt),
    'customFields.pivot.featured': true,
  };
}

function rankLandingEvents(events, dropAt, deckConfig) {
  const validEvents = events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, dropAt),
  );

  return selectDropDeckEvents(
    validEvents,
    new Map(),
    new Set(),
    new Set(),
    {},
    deckConfig,
  );
}

async function loadFeaturedWeek(Event, tenant, batchWeek, now, deckConfig) {
  const { dropAt } = resolvePivotDropInstant(tenant, batchWeek, now);
  const events = await Event.find(buildFeaturedLandingQuery(batchWeek, dropAt))
    .select(LANDING_EVENT_FIELDS)
    .sort({ start_time: 1 })
    .lean();

  return {
    batchWeek,
    dropAt,
    segmentCount: events.length,
    ranked: rankLandingEvents(events, dropAt, deckConfig),
  };
}

async function getPivotLandingDrop(req, options = {}) {
  const tenantKey = String(options.tenantKey || '').trim().toLowerCase();
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'City not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  }
  if (!isPivotTenant(tenant)) {
    return {
      error: 'This city is not available on just go yet.',
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    };
  }
  if (tenant.status !== 'active') {
    return {
      error: 'This city is not open yet.',
      status: 403,
      code: 'TENANT_NOT_ACTIVE',
    };
  }

  const now = options.now || new Date();
  const liveWeek = resolvePivotLiveBatchWeek(tenant, now);
  const deckConfig = mergePivotDeckConfig(tenant.pivotDeckConfig);

  const db = await connectToDatabase(tenant.tenantKey);
  const scopedReq = { db, school: tenant.tenantKey };
  const { Event } = getModels(scopedReq, 'Event');

  const current = await loadFeaturedWeek(Event, tenant, liveWeek, now, deckConfig);
  let loaded = current;
  let fallback = false;

  if (current.segmentCount === 0) {
    const previousWeek = shiftIsoWeek(liveWeek, -1);
    if (previousWeek) {
      const previous = await loadFeaturedWeek(Event, tenant, previousWeek, now, deckConfig);
      if (previous.segmentCount > 0) {
        loaded = previous;
        fallback = true;
      }
    }
  }

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      batchWeek: loaded.batchWeek,
      liveWeek,
      fallback,
      dropAt: loaded.dropAt.toISOString(),
      events: loaded.ranked.slice(0, LANDING_DROP_LIMIT).map((event) =>
        serializeLandingDropEvent(event, {
          readsEnabled: isRichLocationCapabilityEnabled(tenant, 'reads'),
        })),
    },
  };
}

module.exports = {
  getPivotLandingDrop,
  serializeLandingDropEvent,
  buildFeaturedLandingQuery,
  LANDING_DROP_LIMIT,
  LANDING_EVENT_FIELDS,
};
