/**
 * Public Just Go marketing deck: the current live week's drop, ranked as if
 * the deck was opened at that week's drop instant (anonymous, card-only).
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
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

const LANDING_DROP_LIMIT = 4;
const LANDING_EVENT_FIELDS = 'name location start_time image customFields.pivot';

function serializeLandingDropEvent(event) {
  const host = resolveDisplayHost(event.customFields?.pivot);
  const tags = Array.isArray(event.customFields?.pivot?.tags)
    ? event.customFields.pivot.tags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];
  const coverImageUrl = resolvePivotCoverImageUrl(event);
  const tag = tags[0] ? tags[0].trim() : '';

  return {
    id: String(event._id),
    name: event.name || '',
    hostName: host?.name || '',
    startTime: event.start_time,
    location: event.location || '',
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(tag ? { tag } : {}),
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
  const batchWeek = resolvePivotLiveBatchWeek(tenant, now);
  const { dropAt } = resolvePivotDropInstant(tenant, batchWeek, now);

  const db = await connectToDatabase(tenant.tenantKey);
  const scopedReq = { db, school: tenant.tenantKey };
  const { Event } = getModels(scopedReq, 'Event');

  const events = await Event.find(buildPublishedCatalogQuery(batchWeek, dropAt))
    .select(LANDING_EVENT_FIELDS)
    .sort({ start_time: 1 })
    .lean();

  const validEvents = events.filter(
    (event) =>
      resolveDisplayHost(event.customFields?.pivot) &&
      isUpcomingPivotEvent(event, dropAt),
  );

  const ranked = selectDropDeckEvents(
    validEvents,
    new Map(),
    new Set(),
    new Set(),
    {},
    mergePivotDeckConfig(tenant.pivotDeckConfig),
  );

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      batchWeek,
      dropAt: dropAt.toISOString(),
      events: ranked.slice(0, LANDING_DROP_LIMIT).map(serializeLandingDropEvent),
    },
  };
}

module.exports = {
  getPivotLandingDrop,
  serializeLandingDropEvent,
  LANDING_DROP_LIMIT,
  LANDING_EVENT_FIELDS,
};
