/**
 * Just Go Creator Console — create/update host listings as Pivot curation drafts.
 *
 * Provenance: customFields.pivot.source = 'justgo', platformManaged = false.
 * Creators never set ingestStatus to published; ops release via Tenant Curation.
 *
 * Post-publish edits (locked default): content fields OK; ingestStatus / batchWeek
 * locked for creators (ops only).
 *
 * Task 5.2: list/detail also include scraped events whose host.organizerIds match
 * organizers claimed by this grant. Those rows are read-only; justgo stays editable.
 */

const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const {
  resolvePivotTenant,
  resolveCatalogOrgId,
} = require('./pivotIngestPublishService');
const { sanitizeEventPosterImage } = require('./pivotIngestPreviewService');
const { validatePivotEventTags } = require('./pivotTagCatalogService');
const { normalizePivotTimeSlots } = require('../utilities/pivotTimeSlots');
const {
  serializeLabEvent,
  loadIntentStatsByEventId,
} = require('./pivotLabEventsService');
const {
  resolveCreatorPublishConfig,
  computeCreatorBatchWeek,
  resolveCreatorDefaultIngestStatus,
} = require('../utilities/pivotCreatorPublishConfig');
const {
  normalizeIngestStatus,
  PIVOT_FEED_INGEST_STATUS,
} = require('../utilities/pivotIngestStatus');
const {
  CREATOR_DAILY_WINDOW_DAYS,
  buildDailyWindow,
  zeroFillDailySeries,
} = require('../utilities/pivotCreatorDailySeries');
const { logPivot } = require('../utilities/pivotLogger');
const {
  unionHostIdentities,
  identityFromDisplayName,
  displayFieldsFromIdentities,
} = require('../utilities/pivotHostIdentity');
const {
  notifyAdminsOnCreatorListingCreate,
} = require('./pivotCreatorAdminNotifyService');
const { resolveOrganizers } = require('./pivotOrganizerResolveService');
const { activeOrganizerFilter } = require('../schemas/pivotOrganizer');
const {
  requestFromPayload,
  resolveRichLocationWrite,
} = require('./justGoRichLocationWriteService');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');
const { validateJustGoLocationConstraints } = require('../utilities/justGoLocationConstraints');
const googleLocationService = require('./googleLocationService');

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const CREATOR_SOURCE = 'justgo';
const CREATOR_EDITABLE_INGEST = new Set(['draft', 'staged']);
const EMPTY_INTENT_STATS = Object.freeze({
  interested: 0,
  registered: 0,
  passed: 0,
  externalOpens: 0,
  externalOpenUsers: 0,
});
const EMPTY_ANALYTICS_SUMMARY = Object.freeze({
  views: 0,
  uniqueViews: 0,
  anonymousViews: 0,
  uniqueAnonymousViews: 0,
  registrations: 0,
  uniqueRegistrations: 0,
});
const LISTING_SELECT =
  'name description image start_time end_time location richLocation externalLink type visibility status hostingType hostingId customFields.pivot createdAt updatedAt';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function autocompleteLocationRestriction(constraints) {
  const bounds = constraints?.bounds;
  if (!bounds || bounds.west > bounds.east) return undefined;
  return {
    rectangle: {
      low: { latitude: bounds.south, longitude: bounds.west },
      high: { latitude: bounds.north, longitude: bounds.east },
    },
  };
}

async function autocompleteCreatorLocations(req, options = {}) {
  const context = await resolveListingContext(req);
  if (context.error) return context;
  if (!isRichLocationCapabilityEnabled(context.tenant, 'autocomplete')) {
    return {
      error: 'Location autocomplete is not enabled for this city.',
      status: 409,
      code: 'RICH_LOCATION_AUTOCOMPLETE_DISABLED',
    };
  }

  const query = trimString(options.query);
  if (query.length < 2 || query.length > 200) {
    return {
      error: 'Location search must be between 2 and 200 characters.',
      status: 400,
      code: 'RICH_LOCATION_AUTOCOMPLETE_QUERY_INVALID',
    };
  }

  const constraintResult = validateJustGoLocationConstraints(
    context.tenant.richLocationConstraints,
  );
  if (constraintResult.error) {
    return {
      error: 'This city is not configured for location autocomplete.',
      status: 503,
      code: 'RICH_LOCATION_CITY_CONSTRAINTS_REQUIRED',
    };
  }

  const constraints = constraintResult.constraints;
  try {
    const suggestions = await googleLocationService.autocompletePlaces(query, {
      languageCode: 'en',
      regionCode: constraints.countryCode,
      includedRegionCodes: [constraints.countryCode],
      locationRestriction: autocompleteLocationRestriction(constraints),
    });
    return { data: { suggestions } };
  } catch (error) {
    const invalid = error?.code === 'GOOGLE_AUTOCOMPLETE_INPUT_INVALID';
    return {
      error: invalid
        ? 'Location search is invalid.'
        : 'Location suggestions are temporarily unavailable.',
      status: invalid ? 400 : error?.status || 502,
      code: error?.code || 'GOOGLE_LOCATION_FAILED',
    };
  }
}

function parseDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveCreatorUserId(req) {
  return (
    trimString(req.pivotCreator?.globalUserId) ||
    trimString(req.user?.globalUserId) ||
    trimString(req.user?.userId) ||
    null
  );
}

function resolveListingTenantKey(req, options = {}) {
  return (
    trimString(options.tenantKey) ||
    trimString(req.pivotCreator?.tenantKey) ||
    trimString(req.school) ||
    null
  );
}

async function resolveListingContext(req, options = {}) {
  const tenantKey = resolveListingTenantKey(req, options);
  if (!tenantKey || tenantKey === 'www') {
    return {
      error: 'Just Go Creator requires a city tenant.',
      status: 403,
      code: 'CREATOR_TENANT_REQUIRED',
    };
  }

  if (req.pivotCreator?.tenant && req.pivotCreator.tenantKey === tenantKey) {
    return { tenant: req.pivotCreator.tenant, tenantKey };
  }

  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;
  return { tenant: tenantResult.tenant, tenantKey: tenantResult.tenant.tenantKey };
}

async function resolveTenantDb(req, tenantKey) {
  if (req.db && trimString(req.school) === tenantKey) {
    return { db: req.db, school: tenantKey };
  }
  const db = await connectToDatabase(tenantKey);
  return { db, school: tenantKey };
}

function normalizeCreatorTimeSlots(rawSlots) {
  if (!Array.isArray(rawSlots) || !rawSlots.length) {
    return [];
  }
  return normalizePivotTimeSlots(rawSlots).map((slot) => ({
    id: slot.id,
    start_time: slot.start_time,
    ...(slot.end_time ? { end_time: slot.end_time } : {}),
    ...(slot.label ? { label: slot.label } : {}),
  }));
}

/**
 * Validate create/update content payload (not ingest/week — those are stamped separately).
 */
function validateListingPayload(payload = {}, { partial = false } = {}) {
  const name = firstNonEmpty(payload.name);
  const location = firstNonEmpty(payload.location);
  const description =
    payload.description !== undefined
      ? trimString(payload.description)
      : undefined;
  const hostName = firstNonEmpty(
    payload.hostName,
    payload.host?.name,
    payload.displayHostName,
  );
  const hostImageUrl = firstNonEmpty(
    payload.hostImageUrl,
    payload.host?.imageUrl,
  );
  const hostProfileUrl = firstNonEmpty(
    payload.hostProfileUrl,
    payload.host?.profileUrl,
  );
  const externalLink = firstNonEmpty(
    payload.externalLink,
    payload.ticketUrl,
    payload.sourceUrl,
  );
  const image = sanitizeEventPosterImage(
    firstNonEmpty(payload.image, payload.coverImage),
  );
  const timeSlots = normalizeCreatorTimeSlots(payload.timeSlots);
  const richLocationRequest = requestFromPayload(payload);

  let startTime = parseDateTime(payload.start_time ?? payload.startTime);
  let endTime = parseDateTime(payload.end_time ?? payload.endTime);

  if (timeSlots.length) {
    if (!startTime) startTime = timeSlots[0].start_time;
    if (!endTime) {
      endTime = timeSlots.reduce((latest, slot) => {
        const candidate = slot.end_time || slot.start_time;
        return !latest || candidate > latest ? candidate : latest;
      }, null);
    }
  }

  if (!partial) {
    const missing = [];
    if (!name) missing.push('name');
    if (!location) missing.push('location');
    if (!hostName) missing.push('hostName');
    if (!startTime && !timeSlots.length) missing.push('start_time');
    if (missing.length) {
      return {
        error: `Missing required fields: ${missing.join(', ')}.`,
        status: 400,
        code: 'MISSING_REQUIRED_FIELDS',
      };
    }
  } else {
    if (payload.name !== undefined && !name) {
      return {
        error: 'name cannot be empty.',
        status: 400,
        code: 'INVALID_NAME',
      };
    }
    if (payload.location !== undefined && !location) {
      return {
        error: 'location cannot be empty.',
        status: 400,
        code: 'INVALID_LOCATION',
      };
    }
    if (
      (payload.hostName !== undefined ||
        payload.host !== undefined ||
        payload.displayHostName !== undefined) &&
      !hostName
    ) {
      return {
        error: 'hostName cannot be empty.',
        status: 400,
        code: 'HOST_NAME_REQUIRED',
      };
    }
  }

  if (
    !partial ||
    payload.start_time !== undefined ||
    payload.startTime !== undefined ||
    payload.timeSlots !== undefined
  ) {
    if (
      (payload.start_time !== undefined ||
        payload.startTime !== undefined ||
        payload.timeSlots !== undefined ||
        !partial) &&
      !startTime
    ) {
      return {
        error: 'start_time must be a valid datetime.',
        status: 400,
        code: 'INVALID_START_TIME',
      };
    }
  }

  if (startTime && (!endTime || endTime <= startTime)) {
    endTime = new Date(startTime.getTime() + DEFAULT_DURATION_MS);
  }

  if (
    (payload.end_time !== undefined || payload.endTime !== undefined) &&
    payload.end_time !== null &&
    payload.endTime !== null &&
    !endTime
  ) {
    return {
      error: 'end_time must be a valid datetime.',
      status: 400,
      code: 'INVALID_END_TIME',
    };
  }

  return {
    fields: {
      ...(name !== null && (!partial || payload.name !== undefined)
        ? { name }
        : {}),
      ...(description !== undefined ? { description } : {}),
      ...(location !== null && (!partial || payload.location !== undefined)
        ? { location }
        : {}),
      ...(startTime &&
      (!partial ||
        payload.start_time !== undefined ||
        payload.startTime !== undefined ||
        payload.timeSlots !== undefined)
        ? { startTime }
        : {}),
      ...(endTime &&
      (!partial ||
        payload.end_time !== undefined ||
        payload.endTime !== undefined ||
        payload.start_time !== undefined ||
        payload.startTime !== undefined ||
        payload.timeSlots !== undefined)
        ? { endTime }
        : {}),
      ...(hostName &&
      (!partial ||
        payload.hostName !== undefined ||
        payload.host !== undefined ||
        payload.displayHostName !== undefined)
        ? { hostName }
        : {}),
      ...(payload.hostImageUrl !== undefined ||
      payload.host?.imageUrl !== undefined
        ? { hostImageUrl: hostImageUrl || null }
        : !partial && hostImageUrl
          ? { hostImageUrl }
          : {}),
      ...(payload.hostProfileUrl !== undefined ||
      payload.host?.profileUrl !== undefined
        ? { hostProfileUrl: hostProfileUrl || null }
        : !partial && hostProfileUrl
          ? { hostProfileUrl }
          : {}),
      ...(payload.hostIdentities !== undefined ||
      payload.identities !== undefined ||
      payload.host?.identities !== undefined
        ? {
            hostIdentities: unionHostIdentities(
              payload.hostIdentities,
              payload.identities,
              payload.host?.identities,
            ),
          }
        : !partial
          ? {
              hostIdentities: unionHostIdentities([
                identityFromDisplayName(hostName, 'justgo'),
              ]),
            }
          : {}),
      ...(payload.externalLink !== undefined ||
      payload.ticketUrl !== undefined ||
      payload.sourceUrl !== undefined
        ? { externalLink: externalLink || null }
        : !partial && externalLink
          ? { externalLink }
          : {}),
      ...(payload.image !== undefined || payload.coverImage !== undefined
        ? { image: image || null }
        : !partial && image
          ? { image }
          : {}),
      ...(payload.timeSlots !== undefined || (!partial && timeSlots.length)
        ? { timeSlots }
        : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      ...(richLocationRequest !== undefined ? { richLocationRequest } : {}),
    },
  };
}

/**
 * Reject creator attempts to publish or smuggle ops-only lifecycle fields.
 */
function rejectCreatorLifecycleOverrides(payload = {}) {
  if (payload.ingestStatus === undefined) return null;

  const statusResult = normalizeIngestStatus(payload.ingestStatus);
  if (statusResult.error) return statusResult;

  if (statusResult.ingestStatus === PIVOT_FEED_INGEST_STATUS) {
    return {
      error:
        'Creators cannot publish listings to the live feed. Submit as a draft; Just Go ops release the weekly drop.',
      status: 403,
      code: 'CREATOR_PUBLISH_FORBIDDEN',
    };
  }

  // Creators also cannot self-stage via payload — ingest comes from tenant config on create.
  return {
    error: 'Creators cannot change ingestStatus. Just Go ops control curation status.',
    status: 403,
    code: 'CREATOR_INGEST_STATUS_LOCKED',
  };
}

function isObjectId(value) {
  const id = String(value || '').trim();
  return (
    mongoose.Types.ObjectId.isValid(id) &&
    String(new mongoose.Types.ObjectId(id)) === id
  );
}

function organizerIdQueryValues(ids) {
  const values = [];
  for (const id of ids || []) {
    const asString = String(id || '').trim();
    if (!asString) continue;
    values.push(asString);
    if (isObjectId(asString)) values.push(new mongoose.Types.ObjectId(asString));
  }
  return values;
}

function eventOrganizerIds(event) {
  const ids = event?.customFields?.pivot?.host?.organizerIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '').trim()).filter(Boolean);
}

function isOwnJustGoListing(event, creatorUserId) {
  const pivot = event?.customFields?.pivot || {};
  if (pivot.source !== CREATOR_SOURCE) return false;
  const ownerId = trimString(pivot.createdByUserId);
  if (!creatorUserId) return Boolean(ownerId);
  return ownerId === String(creatorUserId);
}

function isClaimedCatalogEvent(event, claimedOrganizerIds) {
  if (!claimedOrganizerIds?.length) return false;
  const claimed = new Set(claimedOrganizerIds.map((id) => String(id)));
  return eventOrganizerIds(event).some((id) => claimed.has(id));
}

function claimedReadOnlyError() {
  return {
    error: 'Claimed catalog listings are read-only. Just Go ops control their content and ingest status.',
    status: 403,
    code: 'CREATOR_CLAIMED_READ_ONLY',
  };
}

function assertListingOwnership(event, creatorUserId) {
  if (isOwnJustGoListing(event, creatorUserId)) return null;
  return {
    error: 'You can only manage your own Just Go listings.',
    status: 403,
    code: 'CREATOR_NOT_OWNER',
  };
}

function assertJustGoListing(event) {
  const pivot = event?.customFields?.pivot || {};
  if (pivot.source !== CREATOR_SOURCE) {
    return {
      error: 'Event is not a Just Go Creator listing.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }
  return null;
}

function assertListingAccess(event, creatorUserId, claimedOrganizerIds) {
  if (isOwnJustGoListing(event, creatorUserId)) {
    return { access: 'owner' };
  }
  if (isClaimedCatalogEvent(event, claimedOrganizerIds)) {
    return { access: 'claimed' };
  }
  return {
    error: 'You can only manage your own Just Go listings.',
    status: 403,
    code: 'CREATOR_NOT_OWNER',
  };
}

async function loadClaimedOrganizerIds({ db, tenantKey, creatorUserId }) {
  const userId = trimString(creatorUserId);
  if (!db || !tenantKey || !userId) return [];

  const { PivotOrganizer } = getModels({ db, school: tenantKey }, 'PivotOrganizer');
  const query = {
    ...activeOrganizerFilter(tenantKey),
    claimStatus: 'claimed',
    claimedByUserId: isObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId,
  };
  const rows = await PivotOrganizer.find(query).select('_id').lean();
  return rows.map((row) => String(row._id));
}

/**
 * Zero-filled 14-day UTC series behind the creator Insights chart.
 *
 * Two sources, both bucketed by UTC day:
 * - **views** — one `EventAnalytics.viewHistory` entry per page view, counted. Anonymous and
 *   logged-in views are counted together, which is why the total matches `views + anonymousViews`
 *   rather than the `views` counter alone (that one excludes anonymous).
 * - **interested / registered** — `PivotEventIntent.createdAt`, split by the intent's *current*
 *   status. These are **first-touch dates**, not status-transition dates: the schema has no
 *   transition timestamp, and `updatedAt` is bumped by ticket-link taps too, so it cannot stand in
 *   for "the day they got a ticket". Grouping first touch by current status keeps the two series a
 *   partition of the same population the ops intent aggregate counts.
 *
 * Best-effort by design: catalog drafts have no analytics row, and no chart is worth failing the
 * detail read over. Any error yields the zero-filled window.
 */
async function loadDailyStats(
  { PivotEventIntent, EventAnalytics },
  eventId,
  now = new Date(),
) {
  const { startDate, endDate, keys } = buildDailyWindow(CREATOR_DAILY_WINDOW_DAYS, now);

  try {
    const [viewRows, intentRows] = await Promise.all([
      EventAnalytics.aggregate([
        { $match: { eventId } },
        { $unwind: '$viewHistory' },
        { $match: { 'viewHistory.timestamp': { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$viewHistory.timestamp' },
            },
            views: { $sum: 1 },
          },
        },
      ]),
      PivotEventIntent.aggregate([
        {
          $match: {
            eventId,
            status: { $in: ['interested', 'registered'] },
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            interested: {
              $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] },
            },
            registered: {
              $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    return zeroFillDailySeries(keys, { viewRows, intentRows });
  } catch {
    return zeroFillDailySeries(keys);
  }
}

function serializeAnalyticsSummary(analyticsDoc) {
  if (!analyticsDoc) {
    return { ...EMPTY_ANALYTICS_SUMMARY };
  }
  return {
    views: analyticsDoc.views ?? 0,
    uniqueViews: analyticsDoc.uniqueViews ?? 0,
    anonymousViews: analyticsDoc.anonymousViews ?? 0,
    uniqueAnonymousViews: analyticsDoc.uniqueAnonymousViews ?? 0,
    registrations: analyticsDoc.registrations ?? 0,
    uniqueRegistrations: analyticsDoc.uniqueRegistrations ?? 0,
  };
}

function serializeCreatorListing(event, intentStatsByEventId = null, options = {}) {
  const base = serializeLabEvent(event, intentStatsByEventId, options);
  const pivot = event?.customFields?.pivot || {};
  const host = pivot.host || {};
  const creatorUserId = options.creatorUserId;
  const own = isOwnJustGoListing(event, creatorUserId);
  return {
    ...base,
    platformManaged: pivot.platformManaged === true,
    createdByUserId: pivot.createdByUserId
      ? String(pivot.createdByUserId)
      : null,
    creatorSubmittedAt: pivot.creatorSubmittedAt || null,
    readOnly: !own,
    access: own ? 'owner' : 'claimed',
    host: {
      name: host.name || base.organizerName || '',
      ...(host.imageUrl ? { imageUrl: host.imageUrl } : {}),
      ...(host.profileUrl ? { profileUrl: host.profileUrl } : {}),
    },
  };
}

function parseIngestStatusFilter(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { statuses: null };
  }

  const parts = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

  if (!parts.length) {
    return { statuses: null };
  }

  const statuses = [];
  for (const part of parts) {
    const normalized = normalizeIngestStatus(part);
    if (normalized.error) {
      return {
        error: `Invalid ingestStatus filter: ${part}. Use draft, staged, or published.`,
        status: 400,
        code: 'INVALID_INGEST_STATUS',
      };
    }
    if (!statuses.includes(normalized.ingestStatus)) {
      statuses.push(normalized.ingestStatus);
    }
  }

  return { statuses };
}

function applyIngestStatusFilter(query, statuses) {
  if (statuses?.length === 1) {
    query['customFields.pivot.ingestStatus'] = statuses[0];
  } else if (statuses?.length > 1) {
    query['customFields.pivot.ingestStatus'] = { $in: statuses };
  }
  return query;
}

function ownJustGoListingsQuery(creatorUserId, statuses = null) {
  return applyIngestStatusFilter(
    {
      isDeleted: { $ne: true },
      'customFields.pivot.source': CREATOR_SOURCE,
      'customFields.pivot.createdByUserId': String(creatorUserId),
    },
    statuses,
  );
}

function creatorConsoleListingsQuery(creatorUserId, claimedOrganizerIds, statuses = null) {
  const own = ownJustGoListingsQuery(creatorUserId, statuses);
  if (!claimedOrganizerIds?.length) return own;

  const claimed = applyIngestStatusFilter(
    {
      isDeleted: { $ne: true },
      'customFields.pivot.host.organizerIds': {
        $in: organizerIdQueryValues(claimedOrganizerIds),
      },
    },
    statuses,
  );

  return {
    isDeleted: { $ne: true },
    $or: [own, claimed],
  };
}

/**
 * GET list — current creator's host-created events for the city tenant.
 * Optional `ingestStatus` query (single or comma-separated).
 */
async function listListings(req, options = {}) {
  const creatorUserId = resolveCreatorUserId(req);
  if (!creatorUserId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'AUTH_REQUIRED',
    };
  }

  const context = await resolveListingContext(req, options);
  if (context.error) return context;

  const statusFilter = parseIngestStatusFilter(
    options.ingestStatus !== undefined ? options.ingestStatus : options.status,
  );
  if (statusFilter.error) return statusFilter;

  const tenantReq = await resolveTenantDb(req, context.tenantKey);
  const { Event, PivotEventIntent } = getModels(
    tenantReq,
    'Event',
    'PivotEventIntent',
  );

  const claimedOrganizerIds = await loadClaimedOrganizerIds({
    db: tenantReq.db,
    tenantKey: context.tenantKey,
    creatorUserId,
  });

  const events = await Event.find(
    creatorConsoleListingsQuery(
      creatorUserId,
      claimedOrganizerIds,
      statusFilter.statuses,
    ),
  )
    .select(LISTING_SELECT)
    .sort({ start_time: -1, _id: -1 })
    .lean();

  const intentStatsByEventId = await loadIntentStatsByEventId(
    PivotEventIntent,
    events.map((event) => event._id),
  );

  const serializeOptions = {
    creatorUserId,
    claimedOrganizerIds,
    richLocationReadsEnabled: isRichLocationCapabilityEnabled(context.tenant, 'reads'),
  };

  return {
    data: {
      tenantKey: context.tenantKey,
      events: events.map((event) =>
        serializeCreatorListing(event, intentStatsByEventId, serializeOptions),
      ),
      total: events.length,
      claimedOrganizerCount: claimedOrganizerIds.length,
    },
  };
}

/**
 * GET detail — own listing + safe intent / analytics summaries (zeros for drafts).
 */
async function getListing(req, eventId, options = {}) {
  const creatorUserId = resolveCreatorUserId(req);
  if (!creatorUserId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'AUTH_REQUIRED',
    };
  }

  const id = trimString(eventId);
  if (!id) {
    return {
      error: 'eventId is required.',
      status: 400,
      code: 'EVENT_ID_REQUIRED',
    };
  }

  const context = await resolveListingContext(req, options);
  if (context.error) return context;

  const tenantReq = await resolveTenantDb(req, context.tenantKey);
  const { Event, PivotEventIntent, EventAnalytics } = getModels(
    tenantReq,
    'Event',
    'PivotEventIntent',
    'EventAnalytics',
  );

  const existing = await Event.findOne({
    _id: id,
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  })
    .select(LISTING_SELECT)
    .lean();

  if (!existing) {
    return {
      error: 'Listing not found.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const claimedOrganizerIds = await loadClaimedOrganizerIds({
    db: tenantReq.db,
    tenantKey: context.tenantKey,
    creatorUserId,
  });
  const access = assertListingAccess(existing, creatorUserId, claimedOrganizerIds);
  if (access.error) return access;

  let analyticsDoc = null;
  try {
    analyticsDoc = await EventAnalytics.findOne({ eventId: existing._id })
      .select(
        'views uniqueViews anonymousViews uniqueAnonymousViews registrations uniqueRegistrations',
      )
      .lean();
  } catch {
    // Catalog drafts often have no analytics row; never fail the detail read.
    analyticsDoc = null;
  }

  const intentStatsByEventId = await loadIntentStatsByEventId(
    PivotEventIntent,
    [existing._id],
  );

  const intentStats =
    intentStatsByEventId.get(String(existing._id)) || { ...EMPTY_INTENT_STATS };
  const analytics = serializeAnalyticsSummary(analyticsDoc);
  const daily = await loadDailyStats(
    { PivotEventIntent, EventAnalytics },
    existing._id,
    options.now,
  );

  return {
    data: {
      tenantKey: context.tenantKey,
      event: serializeCreatorListing(existing, intentStatsByEventId, {
        creatorUserId,
        claimedOrganizerIds,
        richLocationReadsEnabled: isRichLocationCapabilityEnabled(context.tenant, 'reads'),
      }),
      stats: {
        intents: intentStats,
        analytics,
        daily,
      },
    },
  };
}

function buildCreatorPivotMetadata({
  fields,
  batchWeek,
  ingestStatus,
  createdByUserId,
  creatorSubmittedAt,
  tags,
}) {
  const identities = unionHostIdentities(fields.hostIdentities);
  const display = displayFieldsFromIdentities(identities, {
    imageUrl: fields.hostImageUrl,
    profileUrl: fields.hostProfileUrl,
  });
  const host = {
    name: fields.hostName,
    ...(display.imageUrl ? { imageUrl: display.imageUrl } : {}),
    ...(display.profileUrl ? { profileUrl: display.profileUrl } : {}),
    ...(identities.length ? { identities } : {}),
  };

  return {
    batchWeek,
    source: CREATOR_SOURCE,
    platformManaged: false,
    createdByUserId: String(createdByUserId),
    creatorSubmittedAt:
      creatorSubmittedAt instanceof Date
        ? creatorSubmittedAt.toISOString()
        : creatorSubmittedAt,
    host,
    tags: tags || [],
    ...(fields.timeSlots?.length ? { timeSlots: fields.timeSlots } : {}),
    ingestStatus,
    ...(fields.externalLink ? { sourceUrl: fields.externalLink } : {}),
  };
}

/**
 * Create a host listing → always curation draft|staged from config (never published).
 */
async function createListing(req, payload = {}) {
  const lifecycleBlock = rejectCreatorLifecycleOverrides(payload);
  if (lifecycleBlock) return lifecycleBlock;

  if (payload.batchWeek !== undefined) {
    return {
      error: 'Creators cannot set batchWeek directly; it is derived from the event start.',
      status: 403,
      code: 'CREATOR_BATCH_WEEK_LOCKED',
    };
  }

  const creatorUserId = resolveCreatorUserId(req);
  if (!creatorUserId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'AUTH_REQUIRED',
    };
  }

  const context = await resolveListingContext(req);
  if (context.error) return context;

  const validated = validateListingPayload(payload, { partial: false });
  if (validated.error) return validated;
  const { fields } = validated;

  const locationResult = await resolveRichLocationWrite({
    tenant: context.tenant,
    request: fields.richLocationRequest,
    legacyLocation: fields.location,
  });
  if (locationResult.error) return locationResult;

  const config = resolveCreatorPublishConfig(context.tenant);
  const ingestStatus = resolveCreatorDefaultIngestStatus(config);

  const weekResult = computeCreatorBatchWeek(fields.startTime, config, {
    timeSlots: fields.timeSlots,
  });
  if (weekResult.error) return weekResult;

  const tagsRequired = config.requireTagsToSubmit === true;
  const tagResult = await validatePivotEventTags(req, fields.tags, {
    required: tagsRequired,
  });
  if (tagResult.error) return tagResult;

  const catalogResult = await resolveCatalogOrgId(req, context.tenant);
  const tenantReq = await resolveTenantDb(req, context.tenantKey);
  const { Event } = getModels(tenantReq, 'Event');

  const submittedAt = new Date();
  const pivot = buildCreatorPivotMetadata({
    fields,
    batchWeek: weekResult.batchWeek,
    ingestStatus,
    createdByUserId: creatorUserId,
    creatorSubmittedAt: submittedAt,
    tags: tagResult.tags,
  });

  const eventPayload = {
    name: fields.name,
    description: fields.description || '',
    type: 'social',
    location: fields.location,
    ...(locationResult.richLocation ? { richLocation: locationResult.richLocation } : {}),
    start_time: fields.startTime,
    end_time: fields.endTime,
    status: 'not-applicable',
    visibility: 'public',
    registrationEnabled: true,
    expectedAttendance: 0,
    ...(fields.externalLink ? { externalLink: fields.externalLink } : {}),
    hostingType: 'Org',
    hostingId: catalogResult.orgId,
    isDeleted: false,
    ...(fields.image ? { image: fields.image } : {}),
    customFields: { pivot },
  };

  try {
    const justgoIdentity = {
      provider: 'justgo',
      externalId: String(creatorUserId),
      name: fields.hostName,
    };
    const resolved = await resolveOrganizers({
      db: tenantReq.db,
      tenantKey: context.tenantKey,
      identities: unionHostIdentities(pivot.host?.identities, [justgoIdentity]),
      displayName: fields.hostName,
    });
    if (resolved.organizerIds.length) {
      pivot.host.organizerIds = resolved.organizerIds;
    }
  } catch (err) {
    logPivot('warn', 'creator organizer resolve failed; listing still created', {
      tenantKey: context.tenantKey,
      message: err?.message,
    });
  }

  const created = await Event.create(eventPayload);
  const event =
    typeof created.toObject === 'function' ? created.toObject() : created;

  logPivot('info', 'creator listing submitted', {
    tenantKey: context.tenantKey,
    eventId: String(event._id),
    batchWeek: weekResult.batchWeek,
    batchWeekSource: weekResult.source,
    ingestStatus,
    createdByUserId: creatorUserId,
  });

  // Task 2.3 — best-effort ops notify; never block create.
  void notifyAdminsOnCreatorListingCreate(req, {
    tenant: context.tenant,
    config,
    event,
    batchWeek: weekResult.batchWeek,
    creatorUserId,
  }).catch((err) => {
    logPivot('warn', 'creator listing admin notify failed', {
      tenantKey: context.tenantKey,
      eventId: String(event._id),
      message: err?.message,
    });
  });

  return {
    data: {
      event: serializeCreatorListing(event, null, {
        richLocationReadsEnabled: isRichLocationCapabilityEnabled(context.tenant, 'reads'),
      }),
      created: true,
      ingestStatus,
      batchWeek: weekResult.batchWeek,
      batchWeekSource: weekResult.source,
    },
  };
}

/**
 * Update own listing. Content editable after publish; ingestStatus/batchWeek locked.
 */
async function updateListing(req, eventId, payload = {}) {
  const lifecycleBlock = rejectCreatorLifecycleOverrides(payload);
  if (lifecycleBlock) return lifecycleBlock;

  if (payload.batchWeek !== undefined) {
    return {
      error: 'Creators cannot change batchWeek. Just Go ops assign weeks in curation.',
      status: 403,
      code: 'CREATOR_BATCH_WEEK_LOCKED',
    };
  }

  const creatorUserId = resolveCreatorUserId(req);
  if (!creatorUserId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'AUTH_REQUIRED',
    };
  }

  const id = trimString(eventId);
  if (!id) {
    return {
      error: 'eventId is required.',
      status: 400,
      code: 'EVENT_ID_REQUIRED',
    };
  }

  const context = await resolveListingContext(req);
  if (context.error) return context;

  const validated = validateListingPayload(payload, { partial: true });
  if (validated.error) return validated;
  const { fields } = validated;

  const tenantReq = await resolveTenantDb(req, context.tenantKey);
  const { Event } = getModels(tenantReq, 'Event');

  const existing = await Event.findOne({
    _id: id,
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  }).lean();

  if (!existing) {
    return {
      error: 'Listing not found.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const claimedOrganizerIds = await loadClaimedOrganizerIds({
    db: tenantReq.db,
    tenantKey: context.tenantKey,
    creatorUserId,
  });
  const access = assertListingAccess(existing, creatorUserId, claimedOrganizerIds);
  if (access.error) return access;
  if (access.access === 'claimed') return claimedReadOnlyError();

  const justGoCheck = assertJustGoListing(existing);
  if (justGoCheck) return justGoCheck;

  const ownership = assertListingOwnership(existing, creatorUserId);
  if (ownership) return ownership;

  if (fields.location !== undefined && fields.richLocationRequest === undefined
    && existing.richLocation) {
    return {
      error: 'Select a location mode and Google place when changing this location.',
      status: 400,
      code: 'RICH_LOCATION_SELECTION_REQUIRED',
    };
  }

  const locationResult = await resolveRichLocationWrite({
    tenant: context.tenant,
    request: fields.richLocationRequest,
    legacyLocation: fields.location || existing.location,
  });
  if (locationResult.error) return locationResult;

  const pivot = { ...(existing.customFields?.pivot || {}) };
  const currentStatus = pivot.ingestStatus || 'draft';
  const isPublished = currentStatus === PIVOT_FEED_INGEST_STATUS;

  if (!isPublished && !CREATOR_EDITABLE_INGEST.has(currentStatus)) {
    return {
      error: 'This listing cannot be edited in its current curation state.',
      status: 409,
      code: 'CREATOR_EDIT_LOCKED',
    };
  }

  const config = resolveCreatorPublishConfig(context.tenant);
  const setPayload = {};

  if (fields.name !== undefined) setPayload.name = fields.name;
  if (fields.description !== undefined) setPayload.description = fields.description;
  if (fields.location !== undefined) setPayload.location = fields.location;
  if (locationResult.richLocation) setPayload.richLocation = locationResult.richLocation;
  if (fields.image !== undefined) setPayload.image = fields.image;
  if (fields.startTime !== undefined) setPayload.start_time = fields.startTime;
  if (fields.endTime !== undefined) setPayload.end_time = fields.endTime;
  if (fields.externalLink !== undefined) {
    setPayload.externalLink = fields.externalLink;
    if (fields.externalLink) {
      pivot.sourceUrl = fields.externalLink;
    } else {
      delete pivot.sourceUrl;
    }
  }

  const host = { ...(pivot.host || {}) };
  if (fields.hostName !== undefined) host.name = fields.hostName;
  if (fields.hostImageUrl !== undefined) {
    if (fields.hostImageUrl) host.imageUrl = fields.hostImageUrl;
    else delete host.imageUrl;
  }
  if (fields.hostProfileUrl !== undefined) {
    if (fields.hostProfileUrl) host.profileUrl = fields.hostProfileUrl;
    else delete host.profileUrl;
  }
  if (fields.hostIdentities !== undefined) {
    host.identities = unionHostIdentities(fields.hostIdentities, host.identities);
    if (!host.identities.length) delete host.identities;
  }
  const display = displayFieldsFromIdentities(host.identities, {
    imageUrl: host.imageUrl,
    profileUrl: host.profileUrl,
  });
  if (display.imageUrl && !host.imageUrl) host.imageUrl = display.imageUrl;
  if (display.profileUrl && !host.profileUrl) host.profileUrl = display.profileUrl;
  if (!host.name) {
    return {
      error: 'hostName cannot be empty.',
      status: 400,
      code: 'HOST_NAME_REQUIRED',
    };
  }
  pivot.host = host;

  // Provenance invariants — never let an update strip justgo / flip platformManaged.
  pivot.source = CREATOR_SOURCE;
  pivot.platformManaged = false;
  pivot.createdByUserId = pivot.createdByUserId || String(creatorUserId);

  if (fields.timeSlots !== undefined) {
    if (fields.timeSlots.length) {
      pivot.timeSlots = fields.timeSlots;
    } else {
      delete pivot.timeSlots;
    }
  }

  if (fields.tags !== undefined) {
    const tagsRequired = config.requireTagsToSubmit === true;
    const tagResult = await validatePivotEventTags(req, fields.tags, {
      required: tagsRequired,
    });
    if (tagResult.error) return tagResult;
    pivot.tags = tagResult.tags;
  }

  // Recompute batchWeek from new start only while still in curation (not after publish).
  const nextStart =
    fields.startTime ||
    existing.start_time ||
    (Array.isArray(pivot.timeSlots) && pivot.timeSlots[0]?.start_time) ||
    null;

  if (!isPublished && (fields.startTime !== undefined || fields.timeSlots !== undefined)) {
    const weekResult = computeCreatorBatchWeek(nextStart, config, {
      timeSlots: fields.timeSlots !== undefined ? fields.timeSlots : pivot.timeSlots,
    });
    if (weekResult.error) return weekResult;
    pivot.batchWeek = weekResult.batchWeek;
  }
  // Published: batchWeek + ingestStatus stay as ops left them (locked default).

  setPayload['customFields.pivot'] = pivot;

  const updated = await Event.findByIdAndUpdate(
    id,
    { $set: setPayload },
    { new: true, runValidators: true },
  ).lean();

  logPivot('info', 'creator listing updated', {
    tenantKey: context.tenantKey,
    eventId: id,
    ingestStatus: pivot.ingestStatus,
    batchWeek: pivot.batchWeek,
    createdByUserId: creatorUserId,
    publishedContentEdit: isPublished,
  });

  return {
    data: {
      event: serializeCreatorListing(updated, null, {
        richLocationReadsEnabled: isRichLocationCapabilityEnabled(context.tenant, 'reads'),
      }),
      updated: true,
      ingestStatus: pivot.ingestStatus || null,
      batchWeek: pivot.batchWeek || null,
    },
  };
}

module.exports = {
  autocompleteCreatorLocations,
  createListing,
  updateListing,
  listListings,
  getListing,
  serializeCreatorListing,
  serializeAnalyticsSummary,
  validateListingPayload,
  rejectCreatorLifecycleOverrides,
  assertListingOwnership,
  assertListingAccess,
  parseIngestStatusFilter,
  CREATOR_SOURCE,
  EMPTY_INTENT_STATS,
  EMPTY_ANALYTICS_SUMMARY,
};
