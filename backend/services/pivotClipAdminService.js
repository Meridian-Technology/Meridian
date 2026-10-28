/**
 * Admin side of the Just Go App Clip (Content → App Clip): the city's clip
 * settings, its pinned card list with each card's state, a preview of what
 * the clip serves right now, and a cross-week search for cards to pin.
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey, upsertStoredTenantRow } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { resolvePivotCoverImageUrl } = require('../utilities/pivotMovieMetadata');
const {
  PIVOT_CLIP_CARD_LIMIT_MAX,
  PIVOT_CLIP_CURATED_MAX,
  mergePivotClipConfig,
  validatePivotClipConfig,
} = require('../utilities/pivotClipConfig');
const {
  PUBLISHED_CATALOG_BASE_QUERY,
  getUpcomingEventTimeFilter,
  isUpcomingPivotEvent,
  resolveDisplayHost,
} = require('./pivotFeedService');
const { buildPivotClipDrop } = require('./pivotClipDropService');

const ADMIN_EVENT_FIELDS = 'name location start_time end_time image customFields.pivot';
const SEARCH_LIMIT_DEFAULT = 25;
const SEARCH_LIMIT_MAX = 50;
const SEARCH_QUERY_MAX = 120;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveClipTenant(req, tenantKeyRaw) {
  const tenantKey = String(tenantKeyRaw || '').trim().toLowerCase();
  const tenant = tenantKey ? await getTenantByKey(req, tenantKey) : null;
  if (!tenant || !isPivotTenant(tenant)) {
    return { error: 'City not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  }
  return { tenant };
}

async function tenantEventModel(tenant) {
  const db = await connectToDatabase(tenant.tenantKey);
  return getModels({ db, school: tenant.tenantKey }, 'Event').Event;
}

/** `state`: live, ended, unpublished, or missing (deleted or never existed). */
function serializeAdminClipEvent(event, state) {
  const pivot = event.customFields?.pivot || {};
  const coverImageUrl = resolvePivotCoverImageUrl(event);
  return {
    id: String(event._id),
    name: event.name || '',
    hostName: resolveDisplayHost(pivot)?.name || pivot.host?.name || '',
    startTime: event.start_time || null,
    endTime: event.end_time || null,
    location: event.location || '',
    ...(coverImageUrl ? { coverImageUrl } : {}),
    batchWeek: pivot.batchWeek || null,
    clipDrop: pivot.clipDrop === true,
    featured: pivot.featured === true,
    state,
  };
}

async function describeCuratedEvents(Event, ids, now) {
  if (!ids.length) return [];
  const [found, published] = await Promise.all([
    Event.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .select(ADMIN_EVENT_FIELDS)
      .lean(),
    Event.find({ ...PUBLISHED_CATALOG_BASE_QUERY, _id: { $in: ids } })
      .select('_id')
      .lean(),
  ]);
  const byId = new Map(found.map((event) => [String(event._id), event]));
  const publishedIds = new Set(published.map((event) => String(event._id)));

  return ids.map((id) => {
    const event = byId.get(id);
    if (!event) return { id, name: '', state: 'missing' };
    let state = 'live';
    if (!publishedIds.has(id)) state = 'unpublished';
    else if (!isUpcomingPivotEvent(event, now)) state = 'ended';
    return serializeAdminClipEvent(event, state);
  });
}

function summarizePreview(drop) {
  const data = drop?.data;
  if (!data) return null;
  return {
    segment: data.segment,
    batchWeek: data.batchWeek,
    liveWeek: data.liveWeek,
    fallback: data.fallback,
    dropAt: data.dropAt,
    nextDropAt: data.nextDropAt || null,
    events: (data.events || []).map((card) => ({
      id: card.id,
      name: card.name,
      hostName: card.hostName,
      startTime: card.startTime,
      ...(card.coverImageUrl ? { coverImageUrl: card.coverImageUrl } : {}),
    })),
  };
}

async function getTenantClipAdmin(req, options = {}) {
  const resolved = await resolveClipTenant(req, options.tenantKey);
  if (resolved.error) return resolved;
  const { tenant } = resolved;
  const now = options.now || new Date();
  const config = mergePivotClipConfig(tenant.pivotClipConfig);

  const Event = await tenantEventModel(tenant);
  const curated = await describeCuratedEvents(Event, config.curatedEventIds, now);

  let preview = null;
  let previewError = null;
  try {
    preview = summarizePreview(await buildPivotClipDrop(req, tenant, { now }));
  } catch (err) {
    previewError = err?.message || 'Unable to build the clip preview.';
  }

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityStatus: tenant.status,
      config,
      limits: {
        cardLimitMax: PIVOT_CLIP_CARD_LIMIT_MAX,
        curatedMax: PIVOT_CLIP_CURATED_MAX,
      },
      curated,
      preview,
      ...(previewError ? { previewError } : {}),
    },
  };
}

async function updateTenantClipConfig(req, options = {}) {
  const resolved = await resolveClipTenant(req, options.tenantKey);
  if (resolved.error) return resolved;

  const validation = validatePivotClipConfig(options.config);
  if (validation.error) {
    return { error: validation.error, status: 400, code: 'INVALID_CLIP_CONFIG' };
  }

  const updatedBy = req.user?.globalUserId || req.user?.userId || null;
  await upsertStoredTenantRow(
    req,
    { ...resolved.tenant, pivotClipConfig: validation.config },
    updatedBy,
  );
  return getTenantClipAdmin(req, { tenantKey: resolved.tenant.tenantKey, now: options.now });
}

/** Published cards from any batch week, for pinning. Upcoming only unless `includePast`. */
async function searchClipCandidateEvents(req, options = {}) {
  const resolved = await resolveClipTenant(req, options.tenantKey);
  if (resolved.error) return resolved;
  const now = options.now || new Date();

  const q = String(options.q || '').trim().slice(0, SEARCH_QUERY_MAX);
  const requestedLimit = Number.parseInt(options.limit, 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, SEARCH_LIMIT_MAX)
    : SEARCH_LIMIT_DEFAULT;
  const includePast = options.includePast === true || options.includePast === 'true';

  const query = {
    ...PUBLISHED_CATALOG_BASE_QUERY,
    ...(q ? { name: { $regex: new RegExp(escapeRegex(q), 'i') } } : {}),
    ...(includePast ? {} : getUpcomingEventTimeFilter(now)),
  };

  const Event = await tenantEventModel(resolved.tenant);
  const events = await Event.find(query)
    .select(ADMIN_EVENT_FIELDS)
    // Upcoming: soonest first. With past events: newest first.
    .sort({ start_time: includePast ? -1 : 1 })
    .limit(limit)
    .lean();

  return {
    data: {
      events: events.map((event) =>
        serializeAdminClipEvent(event, isUpcomingPivotEvent(event, now) ? 'live' : 'ended')),
    },
  };
}

module.exports = {
  describeCuratedEvents,
  tenantEventModel,
  getTenantClipAdmin,
  updateTenantClipConfig,
  searchClipCandidateEvents,
};
